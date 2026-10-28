(() => {
    const OWN = '.gh-jenkins-panel, .gh-jenkins-badge';
    const STAGE_LABELS = new Map([
        ['declarative: checkout scm', 'checkout'],
        ['declarative: tool install', 'outils'],
        ['[initialize] collecting repository version', 'version'],
        ['[prepare] merge', 'merge'],
        ['[initialize] clean', 'nettoyage'],
        ['[initialize] analyze new front version', 'version front'],
        ['[prepare] increment front version', 'version front'],
        ['[prepare] update dependencies', 'dependances'],
        ['[build] build all', 'build'],
        ['[test] unit tests', 'tests unitaires'],
        ['[docker deploy] presc-admin deployment check', 'verif. deploiement'],
        ['[docker deploy]: build presc-admin docker image', 'image docker'],
        ['[docker deploy]: start container and check deployment', 'deploiement'],
        ['[deploy] to nexus', 'nexus'],
        ['[post] merge', 'merge'],
        ['declarative: post actions', 'post-build']
    ]);
    let settings = null;
    let pageKey = '';
    let generation = 0;
    let pending = false;
    let scheduled = null;
    const results = new Map();
    const handled = new Set();

    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text) {
            node.textContent = text;
        }
        if (className) {
            node.className = className;
        }
        return node;
    }

    function stageLabel(name = '') {
        const stage = name.trim();
        const sonar = /^(?:\[[^\]]+\]\s*)?sonar\s+(back|front)$/i.exec(stage);
        return sonar ? `sonar ${sonar[1].toLowerCase()}` : STAGE_LABELS.get(stage.toLowerCase()) || stage;
    }

    async function send(type, payload) {
        const response = await chrome.runtime.sendMessage({ type, payload });
        if (!response?.ok) {
            throw new Error(response?.error || "Pas de reponse de l'extension.");
        }
        return response;
    }

    function remove() {
        document.querySelectorAll(OWN).forEach((node) => node.remove());
    }

    function renderDetail(panel, detail, number) {
        const list = element('ul', null, 'gh-jenkins-stages');
        for (const stage of detail.stages) {
            const seconds = Math.round((stage.durationMillis || 0) / 1000);
            const row = element('li', null, 'gh-jenkins-stage');
            row.dataset.status = stage.status;
            const metadata = element('span', null, 'gh-jenkins-stage-meta');
            metadata.append(element('span', stage.status, 'gh-jenkins-stage-status'));
            metadata.append(element('span', `${seconds} s`));
            row.append(element('span', stage.name, 'gh-jenkins-stage-name'), metadata);
            list.append(row);
        }
        panel.append(list);
        if (detail.log) {
            panel.append(element('strong', detail.log.name, 'gh-jenkins-log-title'));
            panel.append(element('pre', detail.log.text || 'Aucune sortie de log.'));
        } else {
            panel.append(element('p', 'Aucun log de step en echec disponible.'));
        }
        const copy = element('button', 'Copier le diagnostic');
        copy.type = 'button';
        copy.addEventListener('click', async () => {
            const prompt = [
                `Investigate the failed Jenkins build for pull request ${number}.`,
                `Build: ${detail.buildUrl}`,
                `Failed stage: ${detail.failedStage?.name || 'Unknown'}`,
                '',
                detail.log?.text || 'No failing step log available.',
                '',
                'Identify the cause before proposing a minimal fix. Do not assume an infrastructure failure is a test failure.'
            ].join('\n');
            try {
                await navigator.clipboard.writeText(prompt);
                copy.textContent = 'Diagnostic copie';
            } catch (error) {
                panel.append(element('p', `Copie impossible : ${error.message}`, 'gh-jenkins-error'));
            }
        });
        panel.append(copy);
    }

    function renderPanel(anchor, status, context) {
        if (anchor.querySelector('.gh-jenkins-panel')) {
            return;
        }
        const panel = element('section', null, 'gh-jenkins-panel');
        const header = element('div', null, 'gh-jenkins-header');
        const heading = element('h3');
        const logoLink = element('a');
        logoLink.href = 'https://www.jenkins.io/';
        logoLink.target = '_blank';
        logoLink.rel = 'noreferrer';
        logoLink.setAttribute('aria-label', 'Jenkins');
        const logo = element('img', null, 'gh-jenkins-logo');
        logo.src = JENKINS_LOGO;
        logo.alt = '';
        logo.width = 24;
        logo.height = 24;
        logo.setAttribute('aria-hidden', 'true');
        logoLink.append(logo);
        heading.append(logoLink, document.createTextNode('Jenkins'));
        header.append(heading);
        if (status.buildUrl) {
            const link = element('a', 'Aller vers le build', 'gh-jenkins-build-link');
            link.href = status.buildUrl;
            link.target = '_blank';
            link.rel = 'noreferrer';
            header.append(link);
        }
        panel.append(header);
        panel.append(element('p', status.error || `STEP FAILED: ${status.stage}`, status.error ? 'gh-jenkins-error' : null));
        const actions = element('div', null, 'gh-jenkins-actions');
        for (const report of status.sonarReports || []) {
            if (report.error) {
                console.warn('Jenkins Sonar report:', report.label, report.error);
            } else {
                const link = element('a', `Aller vers ${report.label}`, 'gh-jenkins-sonar-link');
                link.href = report.url;
                link.target = '_blank';
                link.rel = 'noreferrer';
                actions.append(link);
            }
        }
        const diagnostic = element('div', null, 'gh-jenkins-diagnostic');
        diagnostic.id = `gh-jenkins-diagnostic-${status.number}`;
        diagnostic.hidden = true;
        const button = element('button', 'Afficher le diagnostic');
        button.type = 'button';
        button.setAttribute('aria-controls', diagnostic.id);
        button.setAttribute('aria-expanded', 'false');
        let loaded = false;
        button.addEventListener('click', async () => {
            diagnostic.hidden = !diagnostic.hidden;
            button.setAttribute('aria-expanded', String(!diagnostic.hidden));
            button.textContent = diagnostic.hidden ? 'Afficher le diagnostic' : 'Masquer le diagnostic';
            if (diagnostic.hidden || loaded) {
                return;
            }
            button.disabled = true;
            button.textContent = 'Chargement...';
            const feedback = element('p');
            feedback.setAttribute('role', 'status');
            feedback.textContent = 'Chargement du diagnostic...';
            diagnostic.replaceChildren(feedback);
            try {
                const { data } = await send('GET_JENKINS_DETAIL', { ...context, number: status.number });
                if (!panel.isConnected) {
                    return;
                }
                if (!data) {
                    panel.replaceChildren(element('p', 'Diagnostic ignore : PR hors perimetre ou build plus en echec.'));
                    return;
                }
                feedback.remove();
                renderDetail(diagnostic, data, status.number);
                loaded = true;
            } catch (error) {
                feedback.className = 'gh-jenkins-error';
                feedback.textContent = error.message;
            } finally {
                button.disabled = false;
                button.textContent = 'Masquer le diagnostic';
            }
        });
        const controls = element('div', null, 'gh-jenkins-controls');
        controls.append(button);
        actions.append(controls);
        if (status.failureKind === 'prettier') {
            const fix = element('button', 'Fix Prettier with Copilot', 'gh-jenkins-fix-prettier');
            fix.type = 'button';
            const feedback = element('p');
            feedback.hidden = true;
            fix.addEventListener('click', async () => {
                if (!window.confirm(
                    'Publier un commentaire @copilot pour corriger uniquement le formatage Prettier de cette PR ? ' +
                    'Copilot peut pousser des commits et consommer des credits.'
                )) {
                    return;
                }
                fix.disabled = true;
                fix.textContent = 'Envoi...';
                feedback.hidden = true;
                feedback.replaceChildren();
                try {
                    const { data } = await send('FIX_PRETTIER_WITH_COPILOT', {
                        ...context, number: status.number, buildUrl: status.buildUrl
                    });
                    if (!panel.isConnected) {
                        return;
                    }
                    fix.textContent = data.alreadyRequested ? 'Demande deja envoyee' : 'Demande envoyee';
                    const comment = element('a', 'Voir la demande Copilot');
                    comment.href = data.commentUrl;
                    comment.target = '_blank';
                    comment.rel = 'noreferrer';
                    feedback.className = '';
                    feedback.setAttribute('role', 'status');
                    feedback.append(comment);
                } catch (error) {
                    feedback.className = 'gh-jenkins-error';
                    feedback.setAttribute('role', 'alert');
                    feedback.textContent = error.message;
                    fix.disabled = false;
                    fix.textContent = 'Fix Prettier with Copilot';
                } finally {
                    feedback.hidden = false;
                }
            });
            controls.append(fix);
            actions.append(feedback);
        }
        panel.append(actions, diagnostic);
        anchor.prepend(panel);
    }

    function collect() {
        const rows = new Map();
        const pr = /^\/[^/]+\/[^/]+\/pull\/(\d+)(?:\/|$)/.exec(location.pathname);
        if (pr) {
            const sidebar = document.querySelector('#partial-discussion-sidebar');
            if (sidebar) {
                rows.set(Number(pr[1]), { anchor: sidebar, panel: true });
            }
        } else if (/^\/[^/]+\/[^/]+\/pulls\/?$/.test(location.pathname)) {
            document.querySelectorAll('a[data-testid="listitem-title-link"]').forEach((link) => {
                const match = /\/pull\/(\d+)(?:\/|$)/.exec(link.getAttribute('href') || '');
                if (match) {
                    rows.set(Number(match[1]), {
                        anchor: link.closest('[data-listview-item-title-container]') || link.parentElement,
                        title: link
                    });
                }
            });
        }
        return rows;
    }

    function render(rows, context) {
        for (const [number, row] of rows) {
            const status = results.get(number);
            if (!status?.eligible) {
                continue;
            }
            if (row.panel) {
                renderPanel(row.anchor, status, context);
                continue;
            }
            let badge = row.anchor.querySelector('.gh-jenkins-badge');
            if (!badge) {
                const label = status.failureKind === 'prettier' ? 'prettier' : stageLabel(status.stage);
                const sonar = label === 'sonar front' || label === 'sonar back';
                const url = sonar
                    ? status.sonarReports?.find((report) => report.label.toLowerCase() === label)?.url
                    : status.buildUrl;
                badge = element(url ? 'a' : 'span',
                    status.error ? 'Jenkins indisponible' : label, 'gh-jenkins-badge');
                if (url) {
                    badge.href = url;
                    badge.target = '_blank';
                    badge.rel = 'noreferrer';
                }
                badge.title = status.error || label;
                badge.addEventListener('click', (event) => event.stopPropagation());
            }
            const jira = row.anchor.querySelector('.gh-pr-jira');
            if (jira) {
                if (jira.nextElementSibling !== badge) {
                    jira.after(badge);
                }
            } else if (row.title.previousElementSibling !== badge) {
                row.title.before(badge);
            }
        }
    }

    async function update() {
        if (pageKey !== location.href) {
            pageKey = location.href;
            generation++;
            results.clear();
            handled.clear();
            remove();
        }
        const match = /^\/([^/]+)\/([^/]+)\//.exec(location.pathname);
        if (settings?.showJenkins !== true || !match ||
            !settings.jenkinsRepositories.some((repo) => repo.toLowerCase() === `${match[1]}/${match[2]}`.toLowerCase())) {
            return;
        }
        const context = { owner: match[1], repo: match[2] };
        const rows = collect();
        render(rows, context);
        const numbers = [...rows.keys()].filter((number) => !handled.has(number)).slice(0, 100);
        if (pending || !numbers.length) {
            return;
        }
        pending = true;
        const current = generation;
        const requestedPage = location.href;
        numbers.forEach((number) => handled.add(number));
        try {
            const { data } = await send('GET_JENKINS_STATUSES', { ...context, numbers, includeSonar: true });
            if (current !== generation || requestedPage !== location.href) {
                return;
            }
            data.forEach((status) => results.set(status.number, status));
            render(collect(), context);
        } catch (error) {
            if (current === generation && requestedPage === location.href) {
                numbers.forEach((number) => results.set(number, { number, eligible: true, error: error.message }));
                render(collect(), context);
            }
        } finally {
            pending = false;
            schedule();
        }
    }

    function schedule() {
        if (scheduled === null) {
            scheduled = setTimeout(() => {
                scheduled = null;
                update();
            }, 300);
        }
    }

    async function loadSettings() {
        generation++;
        results.clear();
        handled.clear();
        remove();
        try {
            settings = (await send('GET_SETTINGS')).settings;
            schedule();
        } catch (error) {
            console.error('Jenkins settings:', error);
        }
    }

    new MutationObserver((records) => {
        const external = records.some((record) => {
            if (record.target.nodeType === 1 && record.target.closest(OWN)) {
                return false;
            }
            return [...record.addedNodes, ...record.removedNodes].some((node) =>
                node.nodeType === 1 && !node.matches(OWN));
        });
        if (external) {
            schedule();
        }
    }).observe(document.documentElement, { childList: true, subtree: true });
    ['turbo:load', 'turbo:render', 'pjax:end', 'soft-nav:end'].forEach((name) =>
        document.addEventListener(name, schedule));
    window.addEventListener('popstate', schedule);
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && ['token', 'showJenkins', 'jenkinsRepositories', 'jenkinsLabels'].some((key) => changes[key])) {
            loadSettings();
        }
    });
    loadSettings();
})();
