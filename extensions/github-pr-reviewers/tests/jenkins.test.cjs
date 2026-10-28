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
                name: 'Build',
                status: 'FAILED',
                durationMillis: 2000,
                _links: { self: { href: `${BUILD}/execution/node/10/wfapi/describe` } }
            }
        ]
    };
}

function prettierFailure(text = '[INFO]   130:1  error  Delete extra whitespace  prettier/prettier') {
    const build = pipeline();
    build.stages[1].name = '[BUILD] build all';
    return { build, logsByPath: { [`${BUILD}/execution/node/11/wfapi/log`]: text } };
}

function harness({
    prs = [pullRequest()], settings = {}, build = pipeline(), failJenkins = false, stage = null,
    stagesByPath = {}, logsByPath = {}, errorPaths = [], comments = [], commentError = ''
} = {}) {
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
                if (/\/issues\/\d+\/comments(?:\?|$)/.test(url)) {
                    if (options.method === 'POST') {
                        if (commentError) {
                            return { ok: false, status: 403, async text() {
                                return JSON.stringify({ message: commentError });
                            } };
                        }
                        body = {
                            id: comments.length + 1,
                            body: JSON.parse(options.body).body,
                            html_url: `https://github.com/dedalus-cis4u/orme-prescription/pull/1#issuecomment-${comments.length + 1}`
                        };
                        comments.push(body);
                    } else {
                        const page = Number(new URL(url).searchParams.get('page'));
                        body = structuredClone(comments.slice((page - 1) * 100, page * 100));
                    }
                } else if (url.endsWith('/requested_reviewers') && options.method === 'POST') {
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
            if (failJenkins || errorPaths.includes(new URL(url).pathname)) {
                return { ok: false, status: 503 };
            }
            return {
                ok: true,
                async json() {
                    if (/\/execution\//.test(url)) {
                        if (Object.hasOwn(stagesByPath, new URL(url).pathname)) {
                            return structuredClone(stagesByPath[new URL(url).pathname]);
                        }
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
                return { text: logsByPath[new URL(url).pathname] ??
                    '<span style="display: none">duplicate</span>Error &lt;test&gt;<br>failed' };
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
        comments,
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

test('enables Jenkins without a saved preference while preserving an explicit opt-out', async () => {
    const app = harness();
    delete app.storage.showJenkins;
    const result = await app.send('GET_SETTINGS');
    assert.equal(result.settings.showJenkins, true);
    assert.equal((await app.send()).data[0].eligible, true);
    assert.equal((await app.send('GET_JENKINS_STATUSES', { repo: 'orme-prescription-api' })).data[0].eligible, true);
    assert.equal(app.jenkinsCalls().length, 1);
    const calls = app.calls.length;
    app.storage.showJenkins = false;
    assert.equal((await app.send('GET_SETTINGS')).settings.showJenkins, false);
    assert.equal((await app.send()).data.length, 0);
    assert.equal((await app.send('GET_JENKINS_DETAIL')).data, null);
    assert.equal(app.calls.length, calls);
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
    const result = await app.send('GET_JENKINS_STATUSES', { numbers: [1, 2, 3], includeSonar: true });
    assert.equal(result.ok, true);
    assert.equal(result.data[0].stage, 'Build', 'hard failure must beat earlier unstable tests');
    assert.equal(result.data[1].stage, 'Build');
    assert.equal(result.data[2].eligible, false);
    assert.equal(app.calls.filter((call) => call.url.includes('api.github.com')).length, 1);
    assert.deepEqual(app.jenkinsCalls().map((call) => call.url), [`${HOST}${BUILD}/wfapi/describe`]);
    assert.equal(app.calls[0].options.headers.Authorization, 'Bearer test-token');
});

test('links each failed Sonar stage to its own report, preserving the analysed PR or branch', async () => {
    const build = pipeline();
    const stagesByPath = {};
    const logsByPath = {};
    const expected = [];
    for (const [index, side] of ['back', 'front'].entries()) {
        const node = 20 + index * 10;
        const describePath = `${BUILD}/execution/node/${node}/wfapi/describe`;
        const scanLog = `${BUILD}/execution/node/${node + 1}/wfapi/log`;
        const waitLog = `${BUILD}/execution/node/${node + 2}/wfapi/log`;
        build.stages.push({
            name: `[analyse] sonar ${side}`, status: 'FAILED',
            _links: { self: { href: describePath } }
        });
        stagesByPath[describePath] = { stageFlowNodes: [
            { name: 'Shell Script', status: 'SUCCESS', _links: { log: { href: scanLog } } },
            { name: 'Wait for SonarQube analysis', status: 'FAILED', _links: { log: { href: waitLog } } }
        ] };
        const url = `https://sonarqube.orbis.dedalus.com/bdx-dev/dashboard?id=project-${side}&` +
            (side === 'front' ? 'pullRequest=1' : 'branch=feature%2Fexample');
        logsByPath[waitLog] = 'Quality gate failed';
        logsByPath[scanLog] = `<a href="${url}">${url.replace('&', '&amp;')}</a>\n` + 'More output\n'.repeat(70);
        expected.push({ label: `Sonar ${side}`, url });
    }
    const app = harness({ build, stagesByPath, logsByPath });
    assert.deepEqual(structuredClone((await app.send()).data[0].sonarReports), []);
    assert.equal(app.jenkinsCalls().length, 1, 'Sonar discovery must be explicitly requested');
    const statuses = await app.send('GET_JENKINS_STATUSES', { includeSonar: true });
    assert.equal(statuses.ok, true);
    assert.equal(statuses.data[0].stage, 'Build', 'Sonar failures must also be detected after an earlier failed stage');
    assert.deepEqual(structuredClone(statuses.data[0].sonarReports), expected);
    assert.equal(app.jenkinsCalls().length, 7, 'Only failing Sonar stages and their scanner steps should be queried');
    assert.equal(app.calls.some((call) => call.url.startsWith('https://sonarqube.')), false);
    await app.send('GET_JENKINS_STATUSES', { includeSonar: true });
    assert.equal(app.jenkinsCalls().length, 7, 'Reports from completed builds should be cached');
    const restarted = harness({ settings: app.storage });
    assert.deepEqual(structuredClone((await restarted.send('GET_JENKINS_STATUSES', { includeSonar: true })).data[0].sonarReports), expected);
    assert.equal(restarted.jenkinsCalls().length, 0);
});

for (const [name, status] of [
    ['[analyse] sonar back', 'SUCCESS'],
    ['[analyse] sonar front', 'NOT_EXECUTED'],
    ['Sonar front', 'IN_PROGRESS'],
    ['Sonar back', 'UNSTABLE'],
    ['Sonar back', 'ABORTED'],
    ['Sonar', 'FAILED']
]) {
    test(`does not look for reports for ${name} with status ${status}`, async () => {
        const build = pipeline();
        build.stages.push({ name, status });
        const app = harness({ build });
        assert.deepEqual(structuredClone((await app.send('GET_JENKINS_STATUSES', { includeSonar: true })).data[0].sonarReports), []);
        assert.equal(app.jenkinsCalls().length, 1);
    });
}

for (const text of [
    'Scanner failed before publishing a report',
    'https://sonarqube.orbis.dedalus.com/bdx-dev/dashboard?id=example',
    'https://example.com/dashboard?id=example&pullRequest=1',
    'https://sonarqube.orbis.dedalus.com.evil.example/dashboard?id=example&pullRequest=1',
    'https://sonarqube.orbis.dedalus.com/bdx-dev/api/ce/task?id=example&pullRequest=1'
]) {
    test(`reports unavailable Sonar links rather than guessing a destination: ${text}`, async () => {
        const build = pipeline();
        build.stages[1].name = '[analyse] sonar front';
        const app = harness({ build, logsByPath: { [`${BUILD}/execution/node/11/wfapi/log`]: text } });
        const result = await app.send('GET_JENKINS_STATUSES', { includeSonar: true });
        assert.equal(result.ok, true);
        assert.equal(result.data[0].buildUrl, `${HOST}${BUILD}`);
        assert.equal(result.data[0].sonarReports[0].url, undefined);
        assert.match(result.data[0].sonarReports[0].error, /Aucun lien de rapport/);
        assert.equal(Object.keys(app.storage.jenkinsBuildCache).some((key) => key.startsWith('sonar:')), false);
    });
}

test('surfaces Sonar discovery errors, retries them, and rejects off-host log URLs', async () => {
    const build = pipeline();
    build.stages[1].name = '[analyse] sonar back';
    const errorPaths = [`${BUILD}/execution/node/10/wfapi/describe`];
    const app = harness({
        build, errorPaths,
        logsByPath: { [`${BUILD}/execution/node/11/wfapi/log`]:
            'https://sonarqube.orbis.dedalus.com/bdx-dev/dashboard?id=example&pullRequest=1' }
    });
    assert.match((await app.send('GET_JENKINS_STATUSES', { includeSonar: true })).data[0].sonarReports[0].error, /503/);
    errorPaths.length = 0;
    assert.ok((await app.send('GET_JENKINS_STATUSES', { includeSonar: true })).data[0].sonarReports[0].url);

    const offHost = harness({ build, stage: { stageFlowNodes: [
        { name: 'Shell Script', _links: { log: { href: 'https://example.com/job/scan/log' } } }
    ] } });
    assert.match((await offHost.send('GET_JENKINS_STATUSES', { includeSonar: true })).data[0].sonarReports[0].error, /non autorisee/);
    assert.equal(offHost.jenkinsCalls().length, 2);
});

test('detects explicit Prettier failures before truncating logs and reuses the diagnostic cache', async () => {
    const app = harness({
        ...prettierFailure(
            '<span class="timestamp"><b>10:26:49</b> </span><span style="display: none">[timestamp]</span>' +
            '[INFO]   130:1  error  Delete extra whitespace  prettier/prettier\n' + 'More output\n'.repeat(70)
        ),
        settings: { jenkinsBuildCache: { [`log:${BUILD}`]: { text: 'Old cached log without classification' } } }
    });
    const result = await app.send();
    assert.equal(result.data[0].failureKind, 'prettier');
    assert.equal(app.jenkinsCalls().length, 3);
    assert.equal(app.calls.some((call) => call.url.includes('/comments')), false, 'Detection must never post or query comments');
    const detail = await app.send('GET_JENKINS_DETAIL');
    assert.equal(detail.data.log.prettier, true);
    assert.doesNotMatch(detail.data.log.text, /prettier\/prettier/, 'Classification must not depend on the displayed 60-line tail');
    await app.send();
    assert.equal(app.jenkinsCalls().length, 3);
    const restarted = harness({ settings: app.storage });
    assert.equal((await restarted.send()).data[0].failureKind, 'prettier');
    assert.equal(restarted.jenkinsCalls().length, 0);
});

for (const text of [
    '[INFO] Prettier 3.0.0\n[ERROR] Compilation failed',
    '[INFO] 130:1 warning Prefer a different format prettier/prettier',
    'Example: 130:1 error Delete whitespace prettier/prettier'
]) {
    test(`does not classify unrelated failures or mere Prettier mentions: ${text}`, async () => {
        const app = harness(prettierFailure(text));
        assert.equal((await app.send()).data[0].failureKind, undefined);
        assert.equal(app.jenkinsCalls().length, 3);
    });
}

test('keeps the build badge when optional log classification fails and retries on refresh', async () => {
    const errorPaths = [`${BUILD}/execution/node/11/wfapi/log`];
    const app = harness({ ...prettierFailure(), errorPaths });
    const result = await app.send();
    assert.equal(result.ok, true);
    assert.equal(result.data[0].stage, '[BUILD] build all');
    assert.equal(result.data[0].error, undefined);
    assert.equal(result.data[0].failureKind, undefined);
    errorPaths.length = 0;
    assert.equal((await app.send()).data[0].failureKind, 'prettier');
});

test('posts one scoped Copilot request per confirmed build, including concurrent clicks and later retries', async () => {
    const app = harness(prettierFailure());
    const payload = { buildUrl: `${HOST}${BUILD}` };
    const results = await Promise.all([
        app.send('FIX_PRETTIER_WITH_COPILOT', payload),
        app.send('FIX_PRETTIER_WITH_COPILOT', payload)
    ]);
    assert.ok(results.every((result) => result.ok), JSON.stringify(results));
    assert.equal(app.comments.length, 1);
    const comment = app.comments[0];
    assert.match(comment.body, /^@copilot Fix only the Prettier formatting errors/);
    assert.ok(comment.body.includes(`${HOST}${BUILD}`));
    assert.match(comment.body, /formatting-only fix to this PR branch/);
    assert.match(comment.body, /Do not change application behavior/);
    assert.equal(results[0].data.commentUrl, comment.html_url);
    assert.equal(app.jenkinsCalls().length, 3);

    app.comments.unshift(...Array.from({ length: 100 }, (_, index) => ({ body: `Existing comment ${index}` })));
    const restarted = harness({ settings: app.storage, comments: app.comments });
    const duplicate = await restarted.send('FIX_PRETTIER_WITH_COPILOT', payload);
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.data.alreadyRequested, true);
    assert.equal(duplicate.data.commentUrl, comment.html_url);
    assert.equal(restarted.calls.filter((call) => call.options.method === 'POST' && call.url.includes('/comments')).length, 0);
    assert.ok(restarted.calls.some((call) => call.url.endsWith('comments?per_page=100&page=2')));
});

test('refuses Copilot requests for stale builds, closed PRs, green builds and unconfirmed Prettier failures', async () => {
    for (const options of [
        { prs: [pullRequest(1, { state: 'CLOSED' })] },
        { prs: [pullRequest(1, { status: 'SUCCESS' })] },
        { settings: { showJenkins: false } },
        { logsByPath: { [`${BUILD}/execution/node/11/wfapi/log`]: 'Compilation failed' } },
        { buildUrl: `${HOST}/job/orme/job/PR-1/41` }
    ]) {
        const app = harness({ ...prettierFailure(), ...options });
        const result = await app.send('FIX_PRETTIER_WITH_COPILOT', { buildUrl: options.buildUrl || `${HOST}${BUILD}` });
        assert.equal(result.ok, false);
        assert.match(result.error, /build a change|Prettier ne peut plus etre confirmee/);
        assert.equal(app.comments.length, 0);
        assert.equal(app.calls.some((call) => call.url.includes('/comments')), false);
    }
});

test('surfaces GitHub comment permission errors without claiming a Copilot request was posted', async () => {
    const app = harness({ ...prettierFailure(), commentError: 'Resource not accessible by personal access token' });
    const result = await app.send('FIX_PRETTIER_WITH_COPILOT', { buildUrl: `${HOST}${BUILD}` });
    assert.equal(result.ok, false);
    assert.match(result.error, /Resource not accessible/);
    assert.equal(app.comments.length, 0);
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
    assert.equal(fields.get('showJenkins').checked, true);
    assert.equal(fields.get('jenkinsRepositories').value, 'dedalus-cis4u/orme-prescription, dedalus-cis4u/orme-prescription-api');
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
    await vm.runInContext('restore()', context);
    assert.equal(fields.get('showJenkins').checked, false);
    assert.equal(storage.token, 'test-token');
    assert.equal(storage.showRandom, false);
});
