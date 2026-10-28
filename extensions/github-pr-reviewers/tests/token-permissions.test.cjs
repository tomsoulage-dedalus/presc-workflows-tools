const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = 'example/private-repository';
const API_ROOT = 'https://api.github.com';
const PRS = `/repos/${REPOSITORY}/pulls?state=all&per_page=1`;
const REVIEWS = `/repos/${REPOSITORY}/pulls/42/reviews?per_page=1`;
const ISSUES = `/repos/${REPOSITORY}/issues?state=all&per_page=1`;

function element() {
    return {
        value: '',
        checked: false,
        disabled: false,
        hidden: false,
        className: '',
        children: [],
        listeners: {},
        set textContent(value) {
            this.text = value;
            this.children = [];
        },
        get textContent() { return this.text || ''; },
        appendChild(child) { this.children.push(child); },
        addEventListener(type, listener) { this.listeners[type] = listener; }
    };
}

function response(data, { status = 200, headers = {} } = {}) {
    return { ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => data };
}

async function setup({ scopes = 'repo', stored = {}, overrides = {} } = {}) {
    const fields = new Map();
    const html = readFileSync(path.join(ROOT, 'options.html'), 'utf8');
    for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
        fields.set(id, element());
    }
    const calls = [];
    const writes = [];
    const routes = {
        '/user': response({ login: 'test-user' }, { headers: scopes === null ? {} : { 'X-OAuth-Scopes': scopes } }),
        [`/repos/${REPOSITORY}`]: response({ private: true, permissions: { push: true } }),
        [PRS]: response([{ number: 42, title: 'Test change' }]),
        [REVIEWS]: response([]),
        [ISSUES]: response([]),
        ...overrides
    };
    const context = vm.createContext({
        Error,
        TypeError,
        SyntaxError,
        AbortSignal,
        document: {
            getElementById: (id) => fields.get(id),
            createElement: () => element()
        },
        window: { setTimeout() {} },
        chrome: { storage: { local: {
            get: async (defaults) => ({ ...defaults, token: 'stored-token', tokenTestRepository: REPOSITORY, ...stored }),
            set: async (settings) => writes.push(structuredClone(settings))
        } } },
        fetch: async (url, options) => {
            calls.push({ url, options });
            assert.equal(new URL(url).origin, API_ROOT);
            assert.equal(options.method, undefined, 'The diagnostic must only perform GET requests');
            const route = routes[url.slice(API_ROOT.length)];
            assert.ok(route, `Unexpected request: ${url}`);
            if (route instanceof Error) {
                throw route;
            }
            return typeof route === 'function' ? route() : route;
        }
    });
    vm.runInContext(readFileSync(path.join(ROOT, 'defaults.js'), 'utf8'), context);
    vm.runInContext(readFileSync(path.join(ROOT, 'options.js'), 'utf8'), context);
    await new Promise(setImmediate);
    return {
        fields,
        calls,
        writes,
        run: () => fields.get('testToken').listeners.click(),
        save: () => fields.get('save').listeners.click(),
        details: () => fields.get('tokenCheckDetails').children.map((item) => item.textContent).join('\n'),
        summary: () => fields.get('tokenCheckSummary')
    };
}

test('checks unsaved credentials, repository access, required scopes and actual read endpoints without writing', async () => {
    const app = await setup();
    app.fields.get('token').value = '  entered-token  ';
    await app.run();
    assert.deepEqual(app.calls.map((call) => call.url.slice(API_ROOT.length)), [
        '/user', `/repos/${REPOSITORY}`, PRS, ISSUES, REVIEWS
    ]);
    assert.ok(app.calls.every((call) => call.options.headers.Authorization === 'Bearer entered-token'));
    assert.ok(app.calls.every((call) => call.options.signal instanceof AbortSignal));
    assert.equal(new Set(app.calls.map((call) => call.options.signal)).size, 1, 'Use one overall timeout');
    assert.match(app.details(), /test-user/);
    assert.equal(app.summary().className, 'success');
    assert.deepEqual(app.writes, []);
});

for (const scopes of [null, '']) {
    test(`never reports full authorization for ${scopes === null ? 'unexposed permissions' : 'an empty scope list'}`, async () => {
        const app = await setup({ scopes });
        await app.run();
        assert.equal(app.summary().className, scopes === null ? 'warning' : 'error');
        if (scopes === null) {
            assert.match(app.details(), /Pull requests: Read and write/);
            assert.match(app.details(), /Issues: Read and write/);
            assert.match(app.summary().textContent, /partielle/);
        } else {
            assert.match(app.details(), /Scope manquant : repo/);
        }
    });
}

test('does not confuse accepted endpoint permissions with permissions granted to a fine-grained token', async () => {
    const app = await setup({
        scopes: null,
        overrides: {
            '/user': response({ login: 'test-user' }, {
                headers: { 'X-Accepted-GitHub-Permissions': 'pull_requests=write,issues=write' }
            })
        }
    });
    await app.run();
    assert.equal(app.summary().className, 'warning');
});

test('public_repo is sufficient only for a public repository', async () => {
    for (const isPrivate of [false, true]) {
        const app = await setup({
            scopes: 'public_repo',
            overrides: {
                [`/repos/${REPOSITORY}`]: response({ private: isPrivate, permissions: { push: true } })
            }
        });
        await app.run();
        assert.equal(app.summary().className, isPrivate ? 'error' : 'success');
    }
});

test('only checks assignation permissions when that action is selected', async () => {
    const app = await setup({ scopes: null, stored: { addAssignee: false } });
    await app.run();
    assert.equal(app.calls.some((call) => call.url.endsWith(ISSUES)), false);
    assert.match(app.details(), /Pull requests: Read and write/);
    assert.doesNotMatch(app.details(), /Issues: Read and write/);
});

test('keeps checking the board read requirements when only assignation is selected', async () => {
    const app = await setup({ scopes: null, stored: { addReviewer: false } });
    await app.run();
    assert.ok(app.calls.some((call) => call.url.endsWith(PRS)));
    assert.ok(app.calls.some((call) => call.url.endsWith(REVIEWS)));
    assert.match(app.details(), /Issues: Read and write/);
    assert.doesNotMatch(app.details(), /Pull requests: Read and write/);
});

for (const [status, headers, pattern] of [
    [401, {}, /invalide ou expire/],
    [403, {}, /Acces refuse/],
    [403, { 'X-GitHub-SSO': 'required; url=https://github.com/orgs/example/sso' }, /SSO/],
    [403, { 'X-RateLimit-Remaining': '0' }, /Limite de requetes/],
    [404, {}, /introuvable ou inaccessible.*selection.*approbation.*SSO/],
    [429, {}, /Limite de requetes/],
    [503, {}, /HTTP 503/]
]) {
    test(`reports repository HTTP ${status} with ${JSON.stringify(headers)}`, async () => {
        const app = await setup({
            overrides: { [`/repos/${REPOSITORY}`]: response({}, { status, headers }) }
        });
        await app.run();
        assert.equal(app.summary().className, 'error');
        assert.match(app.details(), pattern);
        assert.equal(app.calls.length, 2, 'Stop before read checks if the repository is inaccessible');
        assert.equal(app.fields.get('testToken').disabled, false);
    });
}

test('an invalid token stops the diagnostic before any repository requests', async () => {
    const app = await setup({ overrides: { '/user': response({}, { status: 401 }) } });
    await app.run();
    assert.equal(app.calls.length, 1);
    assert.equal(app.summary().className, 'error');
});

test('independent PR and issue read failures remain errors rather than authentication successes', async () => {
    const app = await setup({
        overrides: {
            [PRS]: response({}, { status: 403 }),
            [ISSUES]: response({}, { status: 404 })
        }
    });
    await app.run();
    assert.equal(app.summary().className, 'error');
    assert.equal(app.fields.get('tokenCheckDetails').children.filter((item) => item.className === 'error').length, 2);
    assert.ok(app.calls.some((call) => call.url.endsWith(ISSUES)));
});

test('missing review-read access is detected instead of silently treating the PR as unreviewed', async () => {
    const app = await setup({ overrides: { [REVIEWS]: response({}, { status: 403 }) } });
    await app.run();
    assert.equal(app.summary().className, 'error');
    assert.match(app.details(), /Lecture des revues.*HTTP 403/);
});

test('an empty repository cannot claim that reading reviews was tested', async () => {
    const app = await setup({ overrides: { [PRS]: response([]) } });
    await app.run();
    assert.equal(app.summary().className, 'warning');
    assert.match(app.details(), /Aucune PR disponible/);
});

test('repository role information is not treated as proof of token write permissions', async () => {
    for (const permissions of [{ push: false }, undefined]) {
        const app = await setup({
            overrides: { [`/repos/${REPOSITORY}`]: response({ private: true, permissions }) }
        });
        await app.run();
        assert.equal(app.summary().className, 'warning');
        assert.match(app.details(), /Droit push du compte non confirme/);
    }
});

for (const [name, route, pattern] of [
    ['network failure', new TypeError('Network unavailable'), /connexion reseau/],
    ['timeout', new DOMException('Timed out', 'TimeoutError'), /Delai.*depasse/],
    ['unreadable JSON', { ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } }, /illisible/],
    ['unexpected identity', response({}), /compte introuvable/]
]) {
    test(`reports ${name} and restores the controls`, async () => {
        const app = await setup({ overrides: { '/user': route } });
        await app.run();
        assert.equal(app.summary().className, 'error');
        assert.match(app.details(), pattern);
        for (const id of ['token', 'tokenTestRepository', 'testToken', 'addReviewer', 'addAssignee', 'reset']) {
            assert.equal(app.fields.get(id).disabled, false);
        }
    });
}

test('invalid inputs never trigger requests', async () => {
    for (const values of [
        { token: '' },
        { tokenTestRepository: 'https://github.com/example/private-repository' },
        { tokenTestRepository: '../private-repository' },
        { tokenTestRepository: 'example/repo?query=value' },
        { addReviewer: false, addAssignee: false }
    ]) {
        const app = await setup();
        for (const [id, value] of Object.entries(values)) {
            app.fields.get(id)[typeof value === 'boolean' ? 'checked' : 'value'] = value;
        }
        await app.run();
        assert.equal(app.calls.length, 0);
        assert.equal(app.summary().className, 'error');
    }
});

test('changing diagnostic inputs invalidates old results', async () => {
    const app = await setup();
    for (const [id, event] of [
        ['token', 'input'], ['tokenTestRepository', 'input'],
        ['addReviewer', 'change'], ['addAssignee', 'change']
    ]) {
        await app.run();
        app.fields.get(id).listeners[event]();
        assert.equal(app.fields.get('tokenCheck').hidden, true);
        assert.equal(app.details(), '');
    }
});

test('the explicit save persists the diagnostic repository without changing reviewer preferences', async () => {
    const app = await setup({ stored: { team: ['alice=Alice'], showRandom: false, addAssignee: false } });
    app.fields.get('tokenTestRepository').value = '  example/other-repository  ';
    await app.save();
    assert.equal(app.writes.length, 1);
    assert.equal(app.writes[0].tokenTestRepository, 'example/other-repository');
    assert.equal(app.writes[0].token, 'stored-token');
    assert.deepEqual(app.writes[0].team, ['alice=Alice']);
    assert.equal(app.writes[0].showRandom, false);
    assert.equal(app.writes[0].addAssignee, false);
});

test('options diagnostic runs in Chrome without modifying or saving a PR', {
    skip: !process.env.CHROME_BIN && 'Set CHROME_BIN to run the browser smoke test'
}, () => {
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'github-token-test-'));
    try {
        const html = readFileSync(path.join(ROOT, 'options.html'), 'utf8')
            .replace('<script src="defaults.js"></script>', '')
            .replace('<script src="options.js"></script>', '');
        const defaults = readFileSync(path.join(ROOT, 'defaults.js'), 'utf8');
        const options = readFileSync(path.join(ROOT, 'options.js'), 'utf8');
        const fixture = html.replace('</body>', `<script>
            let writes = 0;
            const requests = [];
            window.chrome = { storage: { local: {
                async get(defaults) { return { ...defaults, token: 'sample-token' }; },
                async set() { writes++; }
            } } };
            window.fetch = async (url, options) => {
                requests.push({ url, options });
                if (options.method && options.method !== 'GET') throw new Error('Unexpected mutation');
                let data;
                if (url.endsWith('/user')) data = { login: 'test-user' };
                else if (url.endsWith('/repos/dedalus-cis4u/orme-prescription')) {
                    data = { private: true, permissions: { push: true } };
                } else if (url.includes('/pulls?')) data = [{ number: 42 }];
                else data = [];
                return new Response(JSON.stringify(data), { status: 200 });
            };
            new Function(${JSON.stringify(`${defaults}\n${options}`)})();
            const wait = () => new Promise(resolve => setTimeout(resolve, 50));
            function check(value, message) { if (!value) throw new Error(message); }
            (async () => {
                await wait();
                const button = document.getElementById('testToken');
                button.click();
                for (let attempt = 0; button.disabled && attempt < 40; attempt++) await wait();
                check(!button.disabled, 'Diagnostic should finish within the browser time budget');
                check(document.getElementById('tokenCheckSummary').className === 'warning', 'Fine-grained result must remain partial');
                check(document.getElementById('tokenCheckDetails').textContent.includes('Read and write'), 'Explain unverified write permissions');
                check(requests.length === 5, 'Verify identity, repository and read endpoints');
                check(writes === 0, 'Testing must not save settings');
                const input = document.getElementById('token');
                input.value = 'changed-token';
                input.dispatchEvent(new Event('input'));
                check(document.getElementById('tokenCheck').hidden, 'Clear obsolete diagnostic');
                document.body.dataset.result = 'passed';
            })().catch(error => {
                document.body.dataset.result = 'failed';
                document.body.append(document.createTextNode(error.stack));
            });
            </script></body>`);
        const file = path.join(temporary, 'fixture.html');
        writeFileSync(file, fixture);
        const result = spawnSync(process.env.CHROME_BIN, [
            '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND',
            `--user-data-dir=${path.join(temporary, 'profile')}`,
            '--virtual-time-budget=3000', '--dump-dom', `file://${file}`
        ], { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /<body data-result="passed">/, result.stdout.slice(-5000));
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});
