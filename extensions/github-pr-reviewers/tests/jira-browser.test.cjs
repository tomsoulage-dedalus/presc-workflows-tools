const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('Jira shortcut supports the current PR header, list navigation, legacy headers and settings', {
    skip: !process.env.CHROME_BIN && 'Set CHROME_BIN to run the browser smoke test'
}, () => {
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'github-jira-test-'));
    try {
        const source = readFileSync(path.resolve(__dirname, '../jira.js'), 'utf8');
        const fixture = `<!doctype html><html><body>
            <main id="fixture">
                <h1 data-component="Heading">
                    <span class="markdown-title" data-component="Text">fix(TEST-123): Update prescription handling</span>
                    <span class="sr-only"> - #42</span>
                </h1>
                <a class="markdown-title">TEST-999 Unrelated commit title</a>
            </main>
            <script>
            const route = new URL('https://github.com/example/repository/pull/42');
            const listeners = [];
            let enabled = true;
            window.chrome = {
                runtime: {
                    sendMessage(message, callback) {
                        callback({ ok: true, settings: { showJiraLinks: enabled } });
                    }
                },
                storage: { onChanged: { addListener(listener) { listeners.push(listener); } } }
            };
            const pageWindow = {
                location: route,
                setTimeout: window.setTimeout.bind(window),
                addEventListener: window.addEventListener.bind(window)
            };
            new Function('window', 'ATLASSIAN_LOGO', ${JSON.stringify(source)})(pageWindow, 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>');
            const wait = () => new Promise(resolve => setTimeout(resolve, 400));
            const root = document.getElementById('fixture');
            function check(value, message) { if (!value) throw new Error(message); }
            function checkLink(key) {
                const links = root.querySelectorAll('.gh-pr-jira');
                check(links.length === 1, 'Expected exactly one Jira shortcut');
                check(links[0].href === 'https://dedalus.atlassian.net/browse/' + key, 'Shortcut must use the title issue key');
                check(links[0].target === '_blank', 'Open Jira in a new tab');
                check(links[0].querySelector('img'), 'Reuse the Jira logo');
            }
            (async () => {
                await wait();
                checkLink('TEST-123');
                check(root.querySelector('h1 .markdown-title').textContent.includes('Update prescription handling'), 'Preserve the title');
                root.append(document.createElement('div'));
                await wait();
                checkLink('TEST-123');

                route.pathname = '/example/repository/pulls';
                root.innerHTML = '<div data-listview-item-title-container><a data-testid="listitem-title-link" href="/example/repository/pull/43">fix(TEST-456): Update test data</a></div>';
                await wait();
                checkLink('TEST-456');

                route.pathname = '/example/repository/pull/43';
                root.innerHTML = '<h1 class="gh-header-title"><bdi class="js-issue-title">fix(TEST-789): Update validation</bdi></h1>';
                await wait();
                checkLink('TEST-789');

                root.innerHTML = '<h1 data-component="Heading"><span class="markdown-title">Update documentation</span></h1>';
                await wait();
                check(!root.querySelector('.gh-pr-jira'), 'Do not invent a ticket for a title without an issue key');

                root.innerHTML = '<h1 data-component="Heading"><span class="markdown-title">fix(TEST-321): Update rendering</span></h1>';
                await wait();
                checkLink('TEST-321');
                enabled = false;
                listeners.forEach(listener => listener({ showJiraLinks: { newValue: false } }, 'local'));
                await wait();
                check(!root.querySelector('.gh-pr-jira'), 'Respect the existing disabled option');
                enabled = true;
                listeners.forEach(listener => listener({ showJiraLinks: { newValue: true } }, 'local'));
                await wait();
                checkLink('TEST-321');
                document.body.dataset.result = 'passed';
            })().catch(error => {
                document.body.dataset.result = 'failed';
                document.body.append(document.createTextNode(error.stack));
            });
            </script></body></html>`;
        const file = path.join(temporary, 'fixture.html');
        writeFileSync(file, fixture);
        const result = spawnSync(process.env.CHROME_BIN, [
            '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND',
            `--user-data-dir=${path.join(temporary, 'profile')}`,
            '--virtual-time-budget=6000', '--dump-dom', `file://${file}`
        ], { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /<body data-result="passed">/, result.stdout.slice(-5000));
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});
