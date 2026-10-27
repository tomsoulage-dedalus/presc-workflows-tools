const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function setup(fetch) {
    const elements = new Map();
    const html = readFileSync(path.resolve(__dirname, '../options.html'), 'utf8');

    for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
        elements.set(id, {
            value: '',
            textContent: '',
            className: '',
            disabled: false,
            listeners: {},
            addEventListener(type, listener) {
                this.listeners[type] = listener;
            }
        });
    }

    const writes = [];
    const context = vm.createContext({
        document: { getElementById: (id) => elements.get(id) },
        chrome: {
            storage: {
                local: {
                    get: async (defaults) => defaults,
                    set: async (settings) => writes.push(settings)
                }
            }
        },
        fetch,
        AbortSignal
    });

    vm.runInContext(readFileSync(path.resolve(__dirname, '../defaults.js'), 'utf8'), context);
    vm.runInContext(readFileSync(path.resolve(__dirname, '../options.js'), 'utf8'), context);

    return { elements, writes };
}

test('tests the entered token without saving and displays the authenticated account', async () => {
    let finish;
    const requests = [];
    const { elements, writes } = setup((url, options) => {
        requests.push({ url, options });
        return new Promise((resolve) => { finish = resolve; });
    });
    await Promise.resolve();
    const input = elements.get('token');
    const button = elements.get('testToken');
    input.value = '  sample-token  ';

    const pending = button.listeners.click();
    assert.equal(button.disabled, true);
    assert.equal(input.disabled, true);
    assert.equal(requests[0].url, 'https://api.github.com/user');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer sample-token');
    assert.ok(requests[0].options.signal instanceof AbortSignal);

    finish({ ok: true, json: async () => ({ login: 'test-user' }) });
    await pending;

    assert.match(elements.get('tokenStatus').textContent, /Token valide.*test-user/);
    assert.equal(button.disabled, false);
    assert.equal(input.disabled, false);
    assert.deepEqual(writes, []);
    input.listeners.input();
    assert.equal(elements.get('tokenStatus').textContent, '');
});

test('rejects an empty token without sending a request', async () => {
    const { elements } = setup(() => assert.fail('No request expected'));
    await Promise.resolve();
    elements.get('token').value = '   ';
    await elements.get('testToken').listeners.click();
    assert.match(elements.get('tokenStatus').textContent, /Saisis un token/);
    assert.match(elements.get('tokenStatus').className, /error/);
});

for (const [status, message] of [
    [401, /invalide ou expire/],
    [403, /Acces refuse/],
    [503, /HTTP 503/]
]) {
    test(`reports GitHub HTTP ${status} without claiming the token is valid`, async () => {
        const { elements } = setup(async () => ({ ok: false, status }));
        await Promise.resolve();
        elements.get('token').value = 'sample-token';
        await elements.get('testToken').listeners.click();
        assert.match(elements.get('tokenStatus').textContent, message);
        assert.match(elements.get('tokenStatus').className, /error/);
        assert.equal(elements.get('testToken').disabled, false);
    });
}

for (const [name, fetch, message] of [
    ['network failure', async () => { throw new TypeError('Network unavailable'); }, /erreur reseau/],
    ['timeout', async () => { throw new DOMException('Timed out', 'TimeoutError'); }, /delai.*depasse/],
    ['unexpected response', async () => ({ ok: true, json: async () => ({}) }), /Reponse GitHub inattendue/],
    ['unreadable response', async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } }), /reponse GitHub illisible/]
]) {
    test(`reports ${name} and restores the controls`, async () => {
        const { elements } = setup(fetch);
        await Promise.resolve();
        elements.get('token').value = 'sample-token';
        await elements.get('testToken').listeners.click();
        assert.match(elements.get('tokenStatus').textContent, message);
        assert.match(elements.get('tokenStatus').className, /error/);
        assert.equal(elements.get('testToken').disabled, false);
        assert.equal(elements.get('token').disabled, false);
    });
}
