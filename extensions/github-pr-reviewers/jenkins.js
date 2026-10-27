(() => {
    const OWN = '.gh-jenkins-panel, .gh-jenkins-badge';
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
        const list = element('ul');
        for (const stage of detail.stages) {
            const seconds = Math.round((stage.durationMillis || 0) / 1000);
            list.append(element('li', `${stage.name} : ${stage.status} (${seconds} s)`));
        }
        panel.append(list);
        if (detail.log) {
            panel.append(element('strong', detail.log.name));
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
        panel.append(element('h3', 'Jenkins'));
        panel.append(element('p', status.error || status.stage, status.error ? 'gh-jenkins-error' : null));
        if (status.buildUrl) {
            const link = element('a', 'Ouvrir le build');
            link.href = status.buildUrl;
            link.target = '_blank';
            link.rel = 'noreferrer';
            panel.append(link);
        }
        const button = element('button', 'Charger le diagnostic');
        button.type = 'button';
        button.addEventListener('click', async () => {
            button.disabled = true;
            button.textContent = 'Chargement...';
            const feedback = element('p');
            panel.append(feedback);
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
                renderDetail(panel, data, status.number);
                button.remove();
            } catch (error) {
                feedback.className = 'gh-jenkins-error';
                feedback.textContent = error.message;
                button.disabled = false;
                button.textContent = 'Reessayer';
            }
        });
        panel.append(button);
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
                        anchor: link.closest('[data-listview-item-title-container]') || link.parentElement
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
            } else if (!row.anchor.querySelector('.gh-jenkins-badge')) {
                const badge = element(status.buildUrl ? 'a' : 'span',
                    status.error ? 'Jenkins indisponible' : status.stage, 'gh-jenkins-badge');
                if (status.buildUrl) {
                    badge.href = status.buildUrl;
                    badge.target = '_blank';
                    badge.rel = 'noreferrer';
                }
                badge.title = status.error || status.stage;
                badge.addEventListener('click', (event) => event.stopPropagation());
                row.anchor.append(badge);
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
            const { data } = await send('GET_JENKINS_STATUSES', { ...context, numbers });
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
