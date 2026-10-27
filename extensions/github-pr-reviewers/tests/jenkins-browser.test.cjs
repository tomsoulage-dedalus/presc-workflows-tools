const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('renders badges and click-only diagnostics without DOM observer request loops', {
    skip: !process.env.CHROME_BIN && 'Set CHROME_BIN to run the browser smoke test'
}, () => {
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'github-jenkins-test-'));
    try {
        const source = readFileSync(path.resolve(__dirname, '../jenkins.js'), 'utf8');
        const fixture = `<!doctype html><html><body>
            <ul>${[1, 2, 3].map((number) => `<li><div data-listview-item-title-container>
                <a data-testid="listitem-title-link" href="/dedalus-cis4u/orme-prescription/pull/${number}">PR ${number}</a>
            </div></li>`).join('')}</ul>
            <script>
            const route = {
                pathname: '/dedalus-cis4u/orme-prescription/pulls',
                href: 'https://github.com/dedalus-cis4u/orme-prescription/pulls'
            };
            const requests = [];
            const listeners = [];
            const status = { number: 1, eligible: true, stage: 'Unit tests', buildUrl: 'https://ci-jenkins.orbis.dedalus.com/job/orme/42' };
            let settings = { showJenkins: true, jenkinsRepositories: ['dedalus-cis4u/orme-prescription'] };
            window.chrome = {
                runtime: { async sendMessage(message) {
                    requests.push(message);
                    if (message.type === 'GET_SETTINGS') return { ok: true, settings };
                    if (message.type === 'GET_JENKINS_STATUSES') {
                        return { ok: true, data: message.payload.numbers.map(number =>
                            number === 1 ? status : { number, eligible: false }) };
                    }
                    if (message.type === 'GET_JENKINS_DETAIL') {
                        return { ok: true, data: {
                            buildUrl: status.buildUrl,
                            failedStage: { name: 'Unit tests' },
                            stages: [{ name: 'Unit tests', status: 'FAILED', durationMillis: 1200 }],
                            log: { name: 'Run tests', text: 'Expected true but got false' }
                        }};
                    }
                    throw new Error('Unexpected message: ' + message.type);
                } },
                storage: { onChanged: { addListener(listener) { listeners.push(listener); } } }
            };
            new Function('location', ${JSON.stringify(source)})(route);
            const wait = () => new Promise(resolve => setTimeout(resolve, 800));
            function check(value, message) { if (!value) throw new Error(message); }
            function count(type) { return requests.filter(request => request.type === type).length; }
            (async () => {
                await wait();
                check(document.querySelectorAll('.gh-jenkins-badge').length === 1, 'Only the failed PR should receive a badge');
                check(count('GET_JENKINS_STATUSES') === 1, 'List must be batched');
                check(count('GET_JENKINS_DETAIL') === 0, 'No automatic details');
                for (let index = 0; index < 10; index++) document.body.append(document.createElement('div'));
                await wait();
                check(count('GET_JENKINS_STATUSES') === 1, 'DOM mutations must not refetch processed PRs');
                const replacement = document.querySelector('ul').cloneNode(true);
                replacement.querySelector('.gh-jenkins-badge').remove();
                document.querySelector('ul').replaceWith(replacement);
                await wait();
                check(document.querySelectorAll('.gh-jenkins-badge').length === 1, 'Replaced list must be restored from page results');
                check(count('GET_JENKINS_STATUSES') === 1, 'Replacing the list must not refetch');
                route.pathname = '/dedalus-cis4u/orme-prescription/pull/1';
                route.href = 'https://github.com' + route.pathname;
                const sidebar = document.createElement('aside');
                sidebar.id = 'partial-discussion-sidebar';
                const reviewers = document.createElement('section');
                reviewers.id = 'existing-reviewer-panel';
                sidebar.append(reviewers);
                document.body.replaceChildren(sidebar);
                window.dispatchEvent(new Event('popstate'));
                await wait();
                check(document.querySelectorAll('.gh-jenkins-panel').length === 1, 'PR sidebar should have a Jenkins panel');
                check(document.querySelector('#existing-reviewer-panel'), 'Existing reviewer panel must be preserved');
                check(count('GET_JENKINS_DETAIL') === 0, 'Opening PR must not fetch logs');
                document.querySelector('.gh-jenkins-panel button').click();
                await wait();
                check(count('GET_JENKINS_DETAIL') === 1, 'One click should fetch details once');
                check(document.querySelector('.gh-jenkins-panel pre').textContent === 'Expected true but got false', 'Diagnostic must display the returned log');
                check(document.querySelectorAll('.gh-jenkins-panel button').length === 1, 'Load button must be replaced by copy action');
                settings = { ...settings, showJenkins: false };
                listeners.forEach(listener => listener({ showJenkins: { newValue: false } }, 'local'));
                await wait();
                check(!document.querySelector('.gh-jenkins-panel'), 'Disabling feature must remove its panel');
                check(count('GET_JENKINS_STATUSES') === 2, 'Settings change must not restart disabled requests');
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
            '--virtual-time-budget=12000', '--dump-dom', `file://${file}`
        ], { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /<body data-result="passed">/, result.stdout.slice(-5000));
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});
