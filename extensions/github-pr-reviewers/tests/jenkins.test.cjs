const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const HOST = 'https://ci-jenkins.orbis.dedalus.com';
const BUILD = '/job/orme/job/PR-1/42';
const CONTEXT = 'continuous-integration/jenkins/pr-merge';

function pullRequest(number = 1, { state = 'OPEN', status = 'ERROR', labels = ['WORKFLOWS'], targetUrl = `${HOST}${BUILD}/display/redirect` } = {}) {
    return {
        number,
        state,
        labels: { nodes: labels.map((name) => ({ name })) },
        commits: { nodes: [{ commit: { status: { contexts: [{ context: CONTEXT, state: status, targetUrl }] } } }] }
    };
}

function pipeline(status = 'FAILED') {
    return {
        status,
        stages: [
            { name: 'Unit tests', status: 'UNSTABLE', durationMillis: 1000 },
            {
                name: 'Sonar front',
                status: 'FAILED',
                durationMillis: 2000,
                _links: { self: { href: `${BUILD}/execution/node/10/wfapi/describe` } }
            }
        ]
    };
}

function harness({ prs = [pullRequest()], settings = {}, build = pipeline(), failJenkins = false, stage = null } = {}) {
    const storage = { token: 'test-token', showJenkins: true, ...settings };
    const reviewerState = { user: { login: 'author' }, requested_reviewers: [], assignees: [] };
    const calls = [];
    let listener;
    let active = 0;
    let maxActive = 0;
    const context = vm.createContext({
        URL,
        AbortController,
        setTimeout,
        clearTimeout,
        console,
        chrome: {
            runtime: { onMessage: { addListener(fn) { listener = fn; } } },
            storage: {
                local: {
                    async get(defaults) { return structuredClone({ ...defaults, ...storage }); },
                    async set(values) { Object.assign(storage, structuredClone(values)); }
                }
            }
        },
        async fetch(url, options) {
            calls.push({ url, options });
            if (url.startsWith('https://api.github.com/repos/')) {
                let body;
                if (url.endsWith('/requested_reviewers') && options.method === 'POST') {
                    reviewerState.requested_reviewers = JSON.parse(options.body).reviewers.map((login) => ({ login }));
                    body = reviewerState;
                } else if (url.endsWith('/assignees') && options.method === 'POST') {
                    reviewerState.assignees = JSON.parse(options.body).assignees.map((login) => ({ login }));
                    body = reviewerState;
                } else if (url.endsWith('/reviews?per_page=100')) {
                    body = [];
                } else if (/\/pulls\/\d+$/.test(url)) {
                    body = reviewerState;
                } else {
                    assert.fail(`Unexpected reviewer request: ${url}`);
                }
                return { ok: true, async text() { return JSON.stringify(body); } };
            }
            if (url === 'https://api.github.com/graphql') {
                const body = JSON.parse(options.body);
                const numbers = [...body.query.matchAll(/pr(\d+):/g)].map((match) => Number(match[1]));
                return {
                    ok: true,
                    async json() {
                        return { data: { repository: Object.fromEntries(
                            prs.filter((pr) => numbers.includes(pr.number)).map((pr) => [`pr${pr.number}`, pr])
                        ) } };
                    }
                };
            }
            assert.ok(url.startsWith(`${HOST}/job/`), `Unexpected network call: ${url}`);
            assert.equal(options.headers, undefined, 'GitHub token must never reach Jenkins');
            active++;
            maxActive = Math.max(active, maxActive);
            await new Promise((resolve) => setTimeout(resolve, 2));
            active--;
            if (failJenkins) {
                return { ok: false, status: 503 };
            }
            return {
                ok: true,
                async json() {
                    if (/\/execution\//.test(url)) {
                        return stage || {
                            stageFlowNodes: [{
                                name: 'Shell script',
                                status: 'FAILED',
                                _links: { log: { href: `${BUILD}/execution/node/11/wfapi/log` } }
                            }]
                        };
                    }
                    return structuredClone(build);
                }
            };
        }
    });
    // Stage and log endpoints have different shapes, but remain on the same permitted host.
    const originalFetch = context.fetch;
    context.fetch = async (url, options) => {
        const response = await originalFetch(url, options);
        if (url.endsWith('/wfapi/log') && response.ok) {
            return { ok: true, async json() {
                return { text: '<span style="display: none">duplicate</span>Error &lt;test&gt;<br>failed' };
            } };
        }
        return response;
    };
    context.importScripts = (...files) => {
        files.forEach((file) => vm.runInContext(readFileSync(path.join(ROOT, file), 'utf8'), context));
    };
    vm.runInContext(readFileSync(path.join(ROOT, 'background.js'), 'utf8'), context);
    return {
        calls,
        prs,
        storage,
        get maxActive() { return maxActive; },
        jenkinsCalls() { return calls.filter((call) => call.url.startsWith(HOST)); },
        send(type = 'GET_JENKINS_STATUSES', payload = {}) {
            return new Promise((resolve) => {
                assert.equal(listener({
                    type,
                    payload: { owner: 'dedalus-cis4u', repo: 'orme-prescription', numbers: [1], number: 1, ...payload }
                }, {}, resolve), true);
            });
        }
    };
}

for (const [name, options] of [
    ['closed PR', { state: 'CLOSED' }],
    ['merged PR', { state: 'MERGED' }],
    ['passing build', { status: 'SUCCESS' }],
    ['running build', { status: 'PENDING' }],
    ['missing Jenkins status', { status: null }],
    ['missing team label', { labels: ['OTHER'] }]
]) {
    test(`never calls Jenkins for ${name}, including an explicit diagnostic request`, async () => {
        const app = harness({ prs: [pullRequest(1, options)] });
        const statuses = await app.send();
        assert.equal(statuses.ok, true);
        assert.equal(statuses.data[0].eligible, false);
        const detail = await app.send('GET_JENKINS_DETAIL');
        assert.equal(detail.ok, true);
        assert.equal(detail.data, null);
        assert.equal(app.jenkinsCalls().length, 0);
    });
}

test('disabled feature and excluded repository make no network calls', async () => {
    for (const settings of [
        { showJenkins: false },
        { showJenkins: undefined },
        { showJenkins: 'true' },
        { jenkinsRepositories: [] }
    ]) {
        const app = harness({ settings });
        assert.equal((await app.send()).data.length, 0);
        assert.equal((await app.send('GET_JENKINS_DETAIL')).data, null);
        assert.equal(app.calls.length, 0);
    }
});

test('existing installations without a Jenkins setting remain opted out', async () => {
    const app = harness();
    delete app.storage.showJenkins;
    const result = await app.send('GET_SETTINGS');
    assert.equal(result.settings.showJenkins, false);
    assert.equal((await app.send()).data.length, 0);
    assert.equal((await app.send('GET_JENKINS_DETAIL')).data, null);
    assert.equal(app.calls.length, 0);
});

for (const showJenkins of [false, true]) {
    for (const action of ['ADD_MEMBER', 'ASSIGN_RANDOM']) {
        test(`${action} and the reviewer board work independently with Jenkins ${showJenkins ? 'enabled' : 'disabled'}`, async () => {
            const app = harness({
                failJenkins: true,
                settings: { showJenkins, team: ['alice=Alice'] }
            });
            const board = await app.send('GET_BOARD');
            assert.equal(board.ok, true);
            assert.equal(board.members[0].login, 'alice');
            assert.equal(board.members[0].status, 'idle');

            const result = await app.send(action, { login: 'alice' });
            assert.equal(result.ok, true, result.error);
            assert.equal(result.login, 'alice');
            assert.equal(result.members[0].isReviewer, true);
            assert.equal(result.members[0].isAssignee, true);
            assert.equal(app.jenkinsCalls().length, 0);
            assert.equal(app.calls.some((call) => call.url.includes('/graphql')), false);
        });
    }
}

test('batch fetches only pipeline summaries for eligible failures, not logs or Sonar', async () => {
    const app = harness({
        prs: [pullRequest(), pullRequest(2, { status: 'FAILURE' }), pullRequest(3, { status: 'SUCCESS' })]
    });
    const result = await app.send('GET_JENKINS_STATUSES', { numbers: [1, 2, 3] });
    assert.equal(result.ok, true);
    assert.equal(result.data[0].stage, 'Sonar front', 'hard failure must beat earlier unstable tests');
    assert.equal(result.data[1].stage, 'Sonar front');
    assert.equal(result.data[2].eligible, false);
    assert.equal(app.calls.filter((call) => call.url.includes('api.github.com')).length, 1);
    assert.deepEqual(app.jenkinsCalls().map((call) => call.url), [`${HOST}${BUILD}/wfapi/describe`]);
    assert.equal(app.calls[0].options.headers.Authorization, 'Bearer test-token');
});

test('click loads logs once, strips hidden timestamps, and reuses persistent cache', async () => {
    const app = harness();
    await app.send();
    const result = await app.send('GET_JENKINS_DETAIL');
    assert.equal(result.ok, true);
    assert.equal(result.data.log.text, 'Error <test>\nfailed');
    assert.equal(app.jenkinsCalls().length, 3);
    await app.send('GET_JENKINS_DETAIL');
    assert.equal(app.jenkinsCalls().length, 3);
    const restarted = harness({ settings: app.storage });
    await restarted.send('GET_JENKINS_DETAIL');
    assert.equal(restarted.jenkinsCalls().length, 0);
});

test('revalidates closed PRs and green builds even when a failed build is cached', async () => {
    for (const change of [{ state: 'CLOSED' }, { state: 'MERGED' }, { status: 'SUCCESS' }]) {
        const app = harness();
        await app.send();
        app.prs.splice(0, 1, pullRequest(1, change));
        const result = await app.send('GET_JENKINS_DETAIL');
        assert.equal(result.data, null);
        assert.equal(app.jenkinsCalls().length, 1);
    }
});

test('does not cache running pipelines or load their logs when GitHub status is stale', async () => {
    const app = harness({ build: pipeline('IN_PROGRESS') });
    assert.equal((await app.send()).data[0].eligible, false);
    assert.equal((await app.send('GET_JENKINS_DETAIL')).data, null);
    assert.equal(app.jenkinsCalls().length, 2);
    assert.equal(app.storage.jenkinsBuildCache, undefined);
});

test('does not load logs if Jenkins reports success despite stale GitHub status', async () => {
    const app = harness({ build: pipeline('SUCCESS') });
    assert.equal((await app.send()).data[0].eligible, false);
    assert.equal((await app.send('GET_JENKINS_DETAIL')).data, null);
    assert.equal(app.jenkinsCalls().length, 1);
});

test('deduplicates concurrent requests for the same build', async () => {
    const app = harness();
    await Promise.all([app.send(), app.send(), app.send()]);
    assert.equal(app.jenkinsCalls().length, 1);
});

test('limits automatic Jenkins requests to three concurrent calls', async () => {
    const prs = Array.from({ length: 8 }, (_, index) => pullRequest(index + 1, {
        targetUrl: `${HOST}/job/orme/job/PR-${index + 1}/42`
    }));
    const app = harness({ prs });
    await app.send('GET_JENKINS_STATUSES', { numbers: prs.map((pr) => pr.number) });
    assert.equal(app.jenkinsCalls().length, 8);
    assert.equal(app.maxActive, 3);
    assert.equal(Object.keys(app.storage.jenkinsBuildCache).length, 8, 'concurrent writes must not lose entries');
});

test('bounds persistent cache size', async () => {
    const entries = Array.from({ length: 100 }, (_, index) => [`old:${index}`, { status: 'FAILED' }]);
    const app = harness({ settings: { jenkinsBuildCache: Object.fromEntries(entries) } });
    await app.send();
    assert.equal(Object.keys(app.storage.jenkinsBuildCache).length, 100);
    assert.ok(app.storage.jenkinsBuildCache[`summary:${BUILD}`]);
    assert.equal(app.storage.jenkinsBuildCache['old:0'], undefined);
});

test('surfaces Jenkins failures without caching them', async () => {
    const app = harness({ failJenkins: true });
    assert.match((await app.send()).data[0].error, /503/);
    const result = await app.send('GET_JENKINS_DETAIL');
    assert.equal(result.ok, false);
    assert.match(result.error, /503/);
    assert.equal(app.storage.jenkinsBuildCache, undefined);
});

test('rejects external or non-numbered Jenkins build URLs', async () => {
    for (const targetUrl of ['https://example.com/job/orme/42', `${HOST}/job/orme/lastBuild`]) {
        const app = harness({ prs: [pullRequest(1, { targetUrl })] });
        assert.ok((await app.send()).data[0].error);
        assert.equal((await app.send('GET_JENKINS_DETAIL')).ok, false);
        assert.equal(app.jenkinsCalls().length, 0);
    }
});

test('rejects off-host stage links before fetching them', async () => {
    const build = pipeline();
    build.stages[1]._links.self.href = 'https://example.com/job/orme/42';
    const app = harness({ build });
    const result = await app.send('GET_JENKINS_DETAIL');
    assert.equal(result.ok, false);
    assert.match(result.error, /non autorisee/);
    assert.equal(app.jenkinsCalls().length, 1);
});

test('rejects malformed PR parameters before making any network request', async () => {
    const app = harness();
    for (const numbers of [[0], [-1], ['1'], Array(101).fill(1)]) {
        assert.equal((await app.send('GET_JENKINS_STATUSES', { numbers })).ok, false);
    }
    assert.equal(app.calls.length, 0);
});

test('preserves existing reviewer settings and does not expose the PAT to content scripts', async () => {
    const app = harness({ settings: { team: ['alice=Alice'], showRandom: false } });
    const result = await app.send('GET_SETTINGS');
    assert.equal(result.ok, true);
    assert.equal(result.settings.team[0].login, 'alice');
    assert.equal(result.settings.showRandom, false);
    assert.equal(result.settings.showJenkins, true);
    assert.equal(result.settings.token, undefined);
    assert.equal(result.settings.hasToken, true);
});

test('Jenkins cache writes and settings do not trigger reviewer API refreshes', () => {
    let listener;
    let refreshes = 0;
    const context = vm.createContext({
        Set,
        chrome: { storage: { onChanged: { addListener(fn) { listener = fn; } } } },
        window: {
            location: { pathname: '/dedalus-cis4u/orme-prescription/pulls', href: 'https://github.com/dedalus-cis4u/orme-prescription/pulls' },
            addEventListener() {},
            setInterval() {}
        },
        document: {
            getElementById() { return null; },
            documentElement: {},
            addEventListener() {}
        },
        MutationObserver: class { observe() {} },
        refreshed() { refreshes++; }
    });
    vm.runInContext(readFileSync(path.join(ROOT, 'content.js'), 'utf8'), context);
    vm.runInContext('loadBoard = refreshed;', context);
    listener({ jenkinsBuildCache: { newValue: {} } }, 'local');
    listener({ showJenkins: { newValue: false } }, 'local');
    listener({ jenkinsLabels: { newValue: [] } }, 'local');
    assert.equal(refreshes, 0);
    listener({ team: { newValue: ['alice'] } }, 'local');
    assert.equal(refreshes, 1);
});

test('options migrate existing settings and save the Jenkins scope without losing reviewer preferences', async () => {
    const storage = { token: 'test-token', team: ['alice=Alice'], showRandom: false };
    const fields = new Map();
    const context = vm.createContext({
        chrome: { storage: { local: {
            async get(defaults) { return { ...defaults, ...storage }; },
            async set(values) { Object.assign(storage, structuredClone(values)); }
        } } },
        window: { setTimeout() {} },
        document: { getElementById(id) {
            if (!fields.has(id)) {
                fields.set(id, { value: '', checked: false, addEventListener() {} });
            }
            return fields.get(id);
        } }
    });
    vm.runInContext(readFileSync(path.join(ROOT, 'defaults.js'), 'utf8'), context);
    vm.runInContext(readFileSync(path.join(ROOT, 'options.js'), 'utf8'), context);
    await vm.runInContext('restore()', context);
    assert.equal(fields.get('showJenkins').checked, false);
    assert.equal(fields.get('jenkinsRepositories').value, 'dedalus-cis4u/orme-prescription');
    assert.equal(fields.get('team').value, 'alice=Alice');
    fields.get('jenkinsRepositories').value = 'dedalus-cis4u/orme-prescription, example/other';
    fields.get('jenkinsLabels').value = 'WORKFLOWS, READY';
    fields.get('showJenkins').checked = true;
    await vm.runInContext('save()', context);
    assert.deepEqual(storage.jenkinsRepositories, ['dedalus-cis4u/orme-prescription', 'example/other']);
    assert.deepEqual(storage.jenkinsLabels, ['WORKFLOWS', 'READY']);
    assert.deepEqual(storage.team, ['alice=Alice']);
    assert.equal(storage.showRandom, false);
    assert.equal(storage.token, 'test-token');
    assert.equal(storage.showJenkins, true);

    fields.get('jenkinsRepositories').value = 'invalid repository';
    fields.get('team').value = 'bob=Bob';
    await vm.runInContext('save()', context);
    assert.match(fields.get('status').textContent, /Depot Jenkins invalide/);
    assert.deepEqual(storage.team, ['alice=Alice']);

    fields.get('showJenkins').checked = false;
    await vm.runInContext('save()', context);
    assert.deepEqual(storage.team, ['bob=Bob']);
    assert.equal(storage.showJenkins, false);
    assert.equal(storage.token, 'test-token');
    assert.equal(storage.showRandom, false);
});
