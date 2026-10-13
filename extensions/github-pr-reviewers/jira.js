// Prefixe chaque titre de PR d'un logo Jira qui ouvre le ticket, sur la liste
// `/<owner>/<repo>/pulls` comme sur la page `/<owner>/<repo>/pull/<n>`.
// La cle est lue dans le titre lui-meme, ex. `fix(ORBISBUG-46494): ... /fixed`.
//
// Module autonome (IIFE) : il partage le monde isole de content.js sur les pages de PR,
// rien ne doit donc fuiter dans la portee globale.
(() => {
    const JIRA_BASE_URL = 'https://dedalus.atlassian.net';
    const LINK_CLASS = 'gh-pr-jira';
    const ISSUE_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;

    // GitHub sert deux mises en page de PR : on essaie du plus precis au plus generique.
    const PR_TITLE_SELECTORS = [
        'h1[data-component="PH_Title"] .markdown-title',
        'h1[data-component="PH_Title"]',
        'bdi.js-issue-title',
        '.js-issue-title',
        'h1.gh-header-title'
    ];

    let enabled = null;

    function isPullRequestPage() {
        return /^\/[^/]+\/[^/]+\/pull\/\d+(\/|$)/.test(window.location.pathname);
    }

    function isPullsListPage() {
        return /^\/[^/]+\/[^/]+\/pulls(\/|$)/.test(window.location.pathname);
    }

    function issueKey(text) {
        const match = ISSUE_KEY_PATTERN.exec(text || '');
        return match ? match[1] : null;
    }

    function createLink(key) {
        const link = document.createElement('a');
        link.className = LINK_CLASS;
        link.href = `${JIRA_BASE_URL}/browse/${key}`;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.title = `Ouvrir ${key} dans Jira`;
        link.setAttribute('aria-label', link.title);
        // Les lignes de la liste sont cliquables : ouvrir Jira ne doit pas ouvrir la PR.
        link.addEventListener('click', (event) => event.stopPropagation());

        const logo = document.createElement('img');
        logo.className = `${LINK_CLASS}__logo`;
        logo.src = ATLASSIAN_LOGO;
        logo.alt = '';
        logo.setAttribute('aria-hidden', 'true');
        link.appendChild(logo);

        return link;
    }

    function decorate(titleNode, guardRoot) {
        if (!titleNode || !guardRoot || guardRoot.querySelector(`.${LINK_CLASS}`)) {
            return;
        }

        const key = issueKey(titleNode.textContent);

        if (key) {
            titleNode.before(createLink(key));
        }
    }

    function decoratePullsList() {
        document.querySelectorAll('a[data-testid="listitem-title-link"]').forEach((anchor) => {
            const row = anchor.closest('[data-listview-item-title-container]') || anchor.parentElement;
            decorate(anchor, row);
        });
    }

    function decoratePullRequest() {
        const titleNode = PR_TITLE_SELECTORS
            .map((selector) => document.querySelector(selector))
            .find((node) => node && node.textContent.trim());

        decorate(titleNode, titleNode && titleNode.parentElement);
    }

    function removeLinks() {
        document.querySelectorAll(`.${LINK_CLASS}`).forEach((link) => link.remove());
    }

    function annotate() {
        if (!enabled) {
            return;
        }

        if (isPullsListPage()) {
            decoratePullsList();
        } else if (isPullRequestPage()) {
            decoratePullRequest();
        }
    }

    function loadSettings() {
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
            if (chrome.runtime.lastError || !response || !response.ok) {
                return;
            }

            enabled = response.settings.showJiraLinks !== false;

            if (enabled) {
                annotate();
            } else {
                removeLinks();
            }
        });
    }

    // Nos propres insertions declenchent aussi l'observer : on les ignore pour ne pas boucler.
    function causedByUs(record) {
        const nodes = [...record.addedNodes, ...record.removedNodes];

        return nodes.length > 0 && nodes.every((node) => node.nodeType === 1 && node.classList.contains(LINK_CLASS));
    }

    function observePageChanges() {
        let scheduled = null;

        const schedule = () => {
            if (scheduled === null) {
                scheduled = window.setTimeout(() => {
                    scheduled = null;
                    annotate();
                }, 300);
            }
        };

        // documentElement survit au remplacement du body par Turbo, contrairement a document.body.
        new MutationObserver((records) => {
            if (!records.every(causedByUs)) {
                schedule();
            }
        }).observe(document.documentElement, { childList: true, subtree: true });

        window.addEventListener('popstate', schedule);
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.showJiraLinks) {
            loadSettings();
        }
    });

    loadSettings();
    observePageChanges();
})();
