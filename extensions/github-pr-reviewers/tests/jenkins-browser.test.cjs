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
        const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8'));
        const source = manifest.content_scripts.find((entry) => entry.js.includes('jenkins.js')).js
            .map((file) => readFileSync(path.resolve(__dirname, '..', file), 'utf8')).join('\n');
        const styles = ['jenkins.css', 'jira.css']
            .map((file) => readFileSync(path.resolve(__dirname, '..', file), 'utf8')).join('\n');
        const fixture = `<!doctype html><html><head><style>
            body { margin: 0; width: 352px; color: #1f2328; background: white; }
            body[data-theme="dark"] {
                --fgColor-default: #d1d9e0;
                --fgColor-muted: #9198a1;
                --fgColor-danger: #f85149;
                --fgColor-success: #3fb950;
                --bgColor-danger-emphasis: #da3633;
                --bgColor-muted: #151b23;
                --borderColor-default: #3d444d;
                --borderColor-muted: #3d444d;
                color: var(--fgColor-default);
                background: #212830;
            }
            ul { padding: 0; }
            pre { margin: 0; }
            ${styles}
            </style></head><body>
            <ul>${Array.from({ length: 12 }, (_, index) => index + 1).map((number) => `<li><div data-listview-item-title-container>
                ${number <= 2 ? '<a class="gh-pr-jira" href="https://dedalus.atlassian.net/browse/TEST-1">Jira</a>' : ''}
                <a data-testid="listitem-title-link" href="/dedalus-cis4u/orme-prescription/pull/${number}">PR ${number}</a>
            </div></li>`).join('')}</ul>
            <script>
            const route = {
                pathname: '/dedalus-cis4u/orme-prescription/pulls',
                href: 'https://github.com/dedalus-cis4u/orme-prescription/pulls'
            };
            const requests = [];
            const listeners = [];
            let detailError = false;
            let fixError = false;
            let confirmFix = false;
            const confirmations = [];
            window.confirm = (message) => { confirmations.push(message); return confirmFix; };
            const logText = Array.from({ length: 60 }, (_, index) =>
                '13:46:24 [INFO] Build output line ' + index + ' ' + 'long-module-name-'.repeat(12)).join('\\n');
            const status = { number: 1, eligible: true, stage: '[BUILD] build all', buildUrl: 'https://ci-jenkins.orbis.dedalus.com/job/orme/42' };
            const compactStages = [
                ['[TEST] unit tests', 'tests unitaires'],
                ['[DOCKER DEPLOY]: build presc-admin docker image', 'image docker'],
                ['[DOCKER DEPLOY]: start container and check deployment', 'deploiement'],
                ['[deploy] to nexus', 'nexus'],
                ['[post] merge', 'merge'],
                ['Custom pipeline stage', 'Custom pipeline stage'],
                ['[BUILD] build all', 'prettier']
            ];
            const listStatuses = new Map([
                [2, { number: 2, eligible: true, stage: '[analyse] sonar front', buildUrl: status.buildUrl,
                    sonarReports: [{ label: 'Sonar front', url: 'https://sonarqube.orbis.dedalus.com/bdx-dev/dashboard?id=frontend&pullRequest=2' }] }],
                [3, { number: 3, eligible: true, stage: '[analyse] sonar back', buildUrl: status.buildUrl,
                    sonarReports: [{ label: 'Sonar back', url: 'https://sonarqube.orbis.dedalus.com/bdx-dev/dashboard?id=backend&pullRequest=3' }] }],
                [4, { number: 4, eligible: true, stage: '[analyse] sonar front', buildUrl: status.buildUrl,
                    sonarReports: [{ label: 'Sonar front', error: 'Report unavailable' }] }],
                ...compactStages.map(([stage, label], index) => [index + 6, {
                    number: index + 6, eligible: true, stage, buildUrl: status.buildUrl,
                    failureKind: label === 'prettier' ? 'prettier' : undefined
                }])
            ]);
            let settings = { showJenkins: true, jenkinsRepositories: ['dedalus-cis4u/orme-prescription'] };
            window.chrome = {
                runtime: { async sendMessage(message) {
                    requests.push(message);
                    if (message.type === 'GET_SETTINGS') return { ok: true, settings };
                    if (message.type === 'GET_JENKINS_STATUSES') {
                        return { ok: true, data: message.payload.numbers.map(number =>
                            number === 1 ? status : listStatuses.get(number) || { number, eligible: false }) };
                    }
                    if (message.type === 'GET_JENKINS_DETAIL') {
                        if (detailError) return { ok: false, error: 'Jenkins unavailable' };
                        return { ok: true, data: {
                            buildUrl: status.buildUrl,
                            failedStage: { name: 'Unit tests' },
                            stages: Array.from({ length: 20 }, (_, index) => ({
                                name: '[DOCKER DEPLOY] start container and check deployment ' + index,
                                status: index === 0 ? 'FAILED' : index === 1 ? 'SUCCESS' : 'NOT_EXECUTED',
                                durationMillis: 1200
                            })),
                            log: { name: 'Run tests', text: logText }
                        }};
                    }
                    if (message.type === 'FIX_PRETTIER_WITH_COPILOT') {
                        if (fixError) return { ok: false, error: 'Comment permission denied' };
                        return { ok: true, data: {
                            commentUrl: 'https://github.com/dedalus-cis4u/orme-prescription/pull/1#issuecomment-42',
                            alreadyRequested: false
                        } };
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
                const badges = [...document.querySelectorAll('.gh-jenkins-badge')];
                check(badges.length === 11, 'Only failed PRs should receive badges');
                check(badges[0].textContent === 'build' && badges[0].title === 'build', 'Build badges must use the compact label');
                check(badges[0].href === status.buildUrl, 'Non-Sonar failures must still open Jenkins');
                for (const [index, side] of ['front', 'back'].entries()) {
                    const badge = badges[index + 1];
                    check(badge.textContent === 'sonar ' + side && badge.title === 'sonar ' + side, 'Sonar badges must not have an analysis prefix');
                    check(badge.href === listStatuses.get(index + 2).sonarReports[0].url, 'Sonar badges must open their own report, not Jenkins');
                }
                check(badges[3].textContent === 'sonar front' && !badges[3].hasAttribute('href'), 'Unavailable Sonar reports must never fall back to Jenkins');
                compactStages.forEach(([, label], index) => {
                    check(badges[index + 4].textContent === label, 'Known failed stages must use compact names while unknown stages retain their name');
                    check(badges[index + 4].href === status.buildUrl, 'Compact stage badges must preserve the Jenkins destination');
                });
                for (const badge of badges) {
                    const row = badge.closest('[data-listview-item-title-container]');
                    const jira = row.querySelector('.gh-pr-jira');
                    const title = row.querySelector('[data-testid="listitem-title-link"]');
                    check(jira ? jira.nextElementSibling === badge : badge.nextElementSibling === title, 'Failure badges must appear beside Jira or before the PR title');
                }
                for (const theme of ['light', 'dark']) {
                    document.body.dataset.theme = theme;
                    const style = getComputedStyle(badges[0]);
                    check(style.color === 'rgb(255, 255, 255)', 'Failure badges must have white text');
                    check(style.backgroundColor === (theme === 'dark' ? 'rgb(218, 54, 51)' : 'rgb(207, 34, 46)'), 'Failure badges must have a solid red background in both themes');
                }
                check(count('GET_JENKINS_STATUSES') === 1, 'List must be batched');
                check(requests.find(request => request.type === 'GET_JENKINS_STATUSES').payload.includeSonar === true, 'PR list must request conditional Sonar discovery');
                check(count('GET_JENKINS_DETAIL') === 0, 'No automatic details');
                const lateTitle = badges[2].closest('[data-listview-item-title-container]').querySelector('[data-testid="listitem-title-link"]');
                const lateJira = document.createElement('a');
                lateJira.className = 'gh-pr-jira';
                lateJira.textContent = 'Jira';
                lateTitle.before(lateJira);
                for (let index = 0; index < 10; index++) document.body.append(document.createElement('div'));
                await wait();
                check(lateJira.nextElementSibling === badges[2], 'A late Jira shortcut must not leave the badge on the wrong side');
                check(count('GET_JENKINS_STATUSES') === 1, 'DOM mutations must not refetch processed PRs');
                const replacement = document.querySelector('ul').cloneNode(true);
                replacement.querySelector('.gh-jenkins-badge').remove();
                document.querySelector('ul').replaceWith(replacement);
                await wait();
                check(document.querySelectorAll('.gh-jenkins-badge').length === 11, 'Replaced list must be restored from page results');
                check(count('GET_JENKINS_STATUSES') === 1, 'Replacing the list must not refetch');
                status.stage = 'Unit tests';
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
                check(requests.filter(request => request.type === 'GET_JENKINS_STATUSES').at(-1).payload.includeSonar === true, 'PR panel must request conditional Sonar discovery');
                const toggle = document.querySelector('.gh-jenkins-actions button');
                const diagnostic = document.getElementById(toggle.getAttribute('aria-controls'));
                check(toggle.textContent === 'Afficher le diagnostic' && diagnostic.hidden, 'Diagnostic must start collapsed with a clear action');
                check(toggle.getAttribute('aria-expanded') === 'false', 'Collapsed state must be accessible');
                toggle.click();
                await wait();
                check(count('GET_JENKINS_DETAIL') === 1, 'One click should fetch details once');
                const panel = document.querySelector('.gh-jenkins-panel');
                check(panel.querySelector('p').textContent === 'STEP FAILED: Unit tests', 'PR summary must explicitly identify the failed step');
                check(!panel.querySelector('.gh-jenkins-sonar-link'), 'Non-Sonar failures must not show Sonar links');
                check(!panel.querySelector('.gh-jenkins-fix-prettier'), 'Non-Prettier failures must not offer a Copilot formatting action');
                const logo = panel.querySelector('h3 img');
                await logo.decode();
                check(logo.naturalWidth > 0 && logo.src.startsWith('data:image/'), 'Title logo must load without external requests');
                check(logo.closest('a').href === 'https://www.jenkins.io/', 'Logo must link to the Jenkins project attribution');
                check(panel.querySelector('pre').textContent === logText, 'Diagnostic must preserve the returned log');
                for (const theme of ['light', 'dark']) {
                    document.body.dataset.theme = theme;
                    for (const width of [352, 240, 180]) {
                        sidebar.style.width = width + 'px';
                        const stages = panel.querySelector('.gh-jenkins-stages');
                        const log = panel.querySelector('pre');
                        const bounds = panel.getBoundingClientRect();
                        const buildLink = panel.querySelector('.gh-jenkins-header .gh-jenkins-build-link');
                        check(buildLink.textContent === 'Aller vers le build' && buildLink.href === status.buildUrl, 'Build action must be clearly labelled');
                        const titleBounds = panel.querySelector('h3').getBoundingClientRect();
                        const linkBounds = buildLink.getBoundingClientRect();
                        if (width === 352) {
                            check(Math.abs((titleBounds.top + titleBounds.bottom) / 2 - (linkBounds.top + linkBounds.bottom) / 2) <= 1, 'Build link must align beside the Jenkins title');
                            check(linkBounds.left >= titleBounds.right + 7, 'Title and build link must remain spaced');
                        } else if (width === 180) {
                            check(linkBounds.top >= titleBounds.bottom + 7, 'Build link must wrap on narrow sidebars');
                        }
                        check(toggle.getBoundingClientRect().top > linkBounds.bottom, 'Diagnostic toggle must stay below the header');
                        check(panel.scrollWidth <= panel.clientWidth, 'Panel must not overflow at sidebar width ' + width);
                        check(getComputedStyle(stages).listStyleType === 'none', 'Stage bullets must not overflow the sidebar');
                        check(stages.scrollHeight > stages.clientHeight && stages.clientHeight <= 280, 'Long stage lists must scroll within a bounded area');
                        check(log.scrollWidth > log.clientWidth, 'Long log lines must scroll horizontally instead of wrapping');
                        check(log.scrollHeight > log.clientHeight && log.offsetHeight <= 300, 'Long logs must scroll vertically');
                        for (const node of panel.querySelectorAll('h3, .gh-jenkins-build-link, .gh-jenkins-stage, pre')) {
                            const rect = node.getBoundingClientRect();
                            check(rect.left >= bounds.left && rect.right <= bounds.right, 'Stages and logs must remain within the panel');
                        }
                        const failed = panel.querySelector('[data-status="FAILED"] .gh-jenkins-stage-status');
                        const success = panel.querySelector('[data-status="SUCCESS"] .gh-jenkins-stage-status');
                        check(getComputedStyle(failed).color !== getComputedStyle(success).color, 'Failed and successful stages must be visually distinct');
                        check(getComputedStyle(log).color === getComputedStyle(document.body).color, 'Logs must follow the active theme foreground');
                    }
                }
                check(panel.querySelectorAll('button').length === 2, 'Toggle and copy action must both remain available');
                check(toggle.textContent === 'Masquer le diagnostic' && toggle.getAttribute('aria-expanded') === 'true', 'Expanded state must be clearly labelled and accessible');
                const renderedLog = diagnostic.querySelector('pre');
                toggle.click();
                check(diagnostic.hidden && diagnostic.getClientRects().length === 0, 'Closing must hide all diagnostic content');
                check(toggle.textContent === 'Afficher le diagnostic' && toggle.getAttribute('aria-expanded') === 'false', 'Closing must restore the display action');
                toggle.click();
                await wait();
                check(!diagnostic.hidden && diagnostic.querySelector('pre') === renderedLog, 'Reopening must reuse the rendered diagnostic');
                check(count('GET_JENKINS_DETAIL') === 1, 'Reopening must not fetch the diagnostic again');
                check(count('GET_JENKINS_STATUSES') === 2, 'Toggling must not refetch statuses');
                detailError = true;
                route.href += '?retry=1';
                window.dispatchEvent(new Event('popstate'));
                await wait();
                const retryToggle = document.querySelector('.gh-jenkins-actions button');
                const retryDiagnostic = document.getElementById(retryToggle.getAttribute('aria-controls'));
                retryToggle.click();
                await wait();
                check(retryDiagnostic.querySelector('.gh-jenkins-error').textContent === 'Jenkins unavailable', 'Loading errors must remain visible');
                check(!retryToggle.disabled && retryToggle.textContent === 'Masquer le diagnostic', 'Errors must leave the toggle usable');
                retryToggle.click();
                check(retryDiagnostic.hidden, 'Failed diagnostics must still be collapsible');
                detailError = false;
                retryToggle.click();
                await wait();
                check(retryDiagnostic.querySelector('pre') && !retryDiagnostic.querySelector('.gh-jenkins-error'), 'Reopening after an error must retry without stale feedback');
                check(count('GET_JENKINS_DETAIL') === 3, 'Only failed loads must be retried');
                status.sonarReports = [
                    { label: 'Sonar back', url: 'https://sonarqube.orbis.dedalus.com/bdx-dev/dashboard?id=backend&pullRequest=1' },
                    { label: 'Sonar front', url: 'https://sonarqube.orbis.dedalus.com/bdx-dev/dashboard?id=frontend&branch=feature%2Fexample' }
                ];
                route.href += '&sonar=1';
                window.dispatchEvent(new Event('popstate'));
                await wait();
                const sonarLinks = [...document.querySelectorAll('.gh-jenkins-sonar-link')];
                check(sonarLinks.length === 2, 'Both failing Sonar stages must have their own action');
                sonarLinks.forEach((link, index) => {
                    check(link.textContent === 'Aller vers ' + status.sonarReports[index].label, 'Sonar actions must identify front or back');
                    check(link.href === status.sonarReports[index].url && link.target === '_blank', 'Sonar actions must open the exact report in a new tab');
                });
                check(document.querySelector('.gh-jenkins-build-link').href === status.buildUrl, 'Sonar actions must preserve the Jenkins build action');
                check(count('GET_JENKINS_DETAIL') === 3, 'Sonar links must be available without expanding the diagnostic');
                status.sonarReports = [{ label: 'Sonar front', error: 'Report unavailable' }];
                route.href += '&missing=1';
                window.dispatchEvent(new Event('popstate'));
                await wait();
                check(!document.querySelector('.gh-jenkins-sonar-link'), 'Missing reports must not create guessed links');
                check(!document.querySelector('.gh-jenkins-actions .gh-jenkins-error'), 'Missing reports must not take up space in the panel');
                check(!document.querySelector('.gh-jenkins-panel').textContent.includes('Report unavailable'), 'Missing report messages must not be displayed');
                status.failureKind = 'prettier';
                status.stage = '[BUILD] build all';
                status.sonarReports = [];
                route.href += '&prettier=1';
                window.dispatchEvent(new Event('popstate'));
                await wait();
                const fix = document.querySelector('.gh-jenkins-fix-prettier');
                check(fix.textContent === 'Fix Prettier with Copilot', 'Confirmed Prettier failures must offer the fix action');
                check(fix.previousElementSibling.getAttribute('aria-controls'), 'Fix action must sit beside the diagnostic toggle');
                check(count('FIX_PRETTIER_WITH_COPILOT') === 0, 'Rendering must never post a Copilot request');
                fix.click();
                check(count('FIX_PRETTIER_WITH_COPILOT') === 0 && !fix.disabled, 'Cancelling confirmation must not send a request');
                check(confirmations[0].includes('credits'), 'Confirmation must explain that Copilot can consume credits');
                confirmFix = true;
                fixError = true;
                fix.click();
                check(fix.disabled, 'Posting must disable the action');
                await wait();
                check(!fix.disabled && fix.textContent === 'Fix Prettier with Copilot', 'Posting errors must allow a retry');
                check(document.querySelector('.gh-jenkins-actions [role="alert"]').textContent === 'Comment permission denied', 'Posting errors must remain visible');
                fixError = false;
                fix.click();
                fix.click();
                await wait();
                check(count('FIX_PRETTIER_WITH_COPILOT') === 2, 'Double clicks must not send duplicate requests');
                check(fix.disabled && fix.textContent === 'Demande envoyee', 'Success must report a posted request, not claim the agent completed a fix');
                const commentLink = document.querySelector('.gh-jenkins-actions [role="status"] a');
                check(commentLink.href.endsWith('#issuecomment-42'), 'Success must link to the posted comment');
                const fixRequest = requests.filter(request => request.type === 'FIX_PRETTIER_WITH_COPILOT').at(-1);
                check(fixRequest.payload.number === 1 && fixRequest.payload.buildUrl === status.buildUrl, 'Fix requests must identify the displayed build and PR');
                settings = { ...settings, showJenkins: false };
                listeners.forEach(listener => listener({ showJenkins: { newValue: false } }, 'local'));
                await wait();
                check(!document.querySelector('.gh-jenkins-panel'), 'Disabling feature must remove its panel');
                check(count('GET_JENKINS_STATUSES') === 6, 'Settings change must not restart disabled requests');
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
            '--virtual-time-budget=18000', '--dump-dom', `file://${file}`
        ], { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /<body[^>]*data-result="passed"/, result.stdout.slice(-5000));
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});
