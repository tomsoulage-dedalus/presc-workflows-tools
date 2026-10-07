const PANEL_ID = 'gh-team-reviewers-panel';
const TOAST_ID = 'gh-team-reviewers-toast';
const DISABLED_STATUSES = new Set(['active', 'reviewed', 'author']);

const STATUS_TITLES = {
    idle: 'Ajouter comme reviewer',
    active: 'Deja sur cette PR',
    reviewed: 'A deja relu cette PR',
    author: 'Auteur de la PR',
    unavailable: 'Indisponible / en conges'
};

let currentBoard = null;
let busy = false;

function parsePullRequestUrl() {
    const match = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);

    if (!match) {
        return null;
    }

    return { owner: match[1], repo: match[2], number: match[3] };
}

function sendMessage(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message });
                return;
            }

            resolve(response || { ok: false, error: 'Aucune reponse du service worker.' });
        });
    });
}

function getToast() {
    let toast = document.getElementById(TOAST_ID);

    if (!toast) {
        toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.innerHTML =
            '<img class="gh-tr-toast__avatar" alt="" />' +
            '<div class="gh-tr-toast__body">' +
            '<span class="gh-tr-toast__title"></span>' +
            '<span class="gh-tr-toast__detail"></span>' +
            '</div>';
        document.body.appendChild(toast);
    }

    return toast;
}

function showToast({ title, detail, login, isError }) {
    const toast = getToast();
    const avatar = toast.querySelector('.gh-tr-toast__avatar');

    if (login) {
        avatar.src = `https://github.com/${encodeURIComponent(login)}.png?size=80`;
        avatar.hidden = false;
    } else {
        avatar.removeAttribute('src');
        avatar.hidden = true;
    }

    toast.querySelector('.gh-tr-toast__title').textContent = title;

    const detailNode = toast.querySelector('.gh-tr-toast__detail');
    detailNode.textContent = detail || '';
    detailNode.hidden = !detail;

    toast.className = `gh-tr-toast gh-tr-toast--${isError ? 'error' : 'success'} gh-tr-toast--visible`;

    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('gh-tr-toast--visible'), 5000);
}

function createPanel() {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'gh-tr-panel';
    panel.innerHTML =
        '<div class="gh-tr-panel__header">' +
        '<span class="gh-tr-panel__title">Equipe</span>' +
        '<button type="button" class="gh-tr-panel__refresh" title="Rafraichir">&#8635;</button>' +
        '</div>' +
        '<div class="gh-tr-panel__list"></div>' +
        '<p class="gh-tr-panel__message"></p>';

    panel.querySelector('.gh-tr-panel__refresh').addEventListener('click', () => loadBoard(true));

    return panel;
}

function setPanelMessage(panel, text, isError) {
    const node = panel.querySelector('.gh-tr-panel__message');
    node.textContent = text || '';
    node.hidden = !text;
    node.classList.toggle('gh-tr-panel__message--error', Boolean(isError));
}

function memberBadge(member) {
    if (member.status === 'author') {
        return 'auteur';
    }

    if (member.status === 'reviewed') {
        return 'a relu';
    }

    if (member.isReviewer && member.isAssignee) {
        return 'reviewer + assigne';
    }

    if (member.isReviewer) {
        return 'reviewer';
    }

    if (member.isAssignee) {
        return 'assigne';
    }

    if (member.status === 'unavailable') {
        return 'indisponible';
    }

    return '';
}

function createMemberButton(member) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `gh-tr-member gh-tr-member--${member.status}`;
    button.dataset.login = member.login;
    button.disabled = DISABLED_STATUSES.has(member.status);
    button.title = `@${member.login} - ${STATUS_TITLES[member.status] || ''}`;

    const avatar = document.createElement('img');
    avatar.className = 'gh-tr-member__avatar';
    avatar.alt = '';
    avatar.src = `https://github.com/${encodeURIComponent(member.login)}.png?size=48`;

    const name = document.createElement('span');
    name.className = 'gh-tr-member__name';
    name.textContent = member.label;

    button.appendChild(avatar);
    button.appendChild(name);

    const badgeText = memberBadge(member);

    if (badgeText) {
        const badge = document.createElement('span');
        badge.className = 'gh-tr-member__badge';
        badge.textContent = badgeText;
        button.appendChild(badge);
    }

    button.addEventListener('click', () => onMemberClick(member.login));

    return button;
}

function renderBoard(board) {
    const panel = document.getElementById(PANEL_ID);

    if (!panel) {
        return;
    }

    const list = panel.querySelector('.gh-tr-panel__list');
    list.textContent = '';

    if (!board || board.members.length === 0) {
        setPanelMessage(panel, "Aucun membre configure. Ouvre les options de l'extension.", false);
        return;
    }

    board.members.forEach((member) => list.appendChild(createMemberButton(member)));

    const actions = [];

    if (board.settings.addReviewer) {
        actions.push('revue');
    }

    if (board.settings.addAssignee) {
        actions.push('assignation');
    }

    setPanelMessage(panel, actions.length > 0 ? `Un clic = ${actions.join(' + ')}.` : '', false);
}

function setPanelBusy(isBusy, login) {
    const panel = document.getElementById(PANEL_ID);

    if (!panel) {
        return;
    }

    panel.classList.toggle('gh-tr-panel--busy', isBusy);

    panel.querySelectorAll('.gh-tr-member').forEach((button) => {
        button.classList.toggle('gh-tr-member--loading', isBusy && button.dataset.login === login);
    });
}

async function loadBoard(force = false) {
    const pullRequest = parsePullRequestUrl();
    const panel = document.getElementById(PANEL_ID);

    if (!pullRequest || !panel) {
        return;
    }

    if (currentBoard && !force) {
        renderBoard(currentBoard);
        return;
    }

    setPanelMessage(panel, 'Chargement...', false);

    const response = await sendMessage({ type: 'GET_BOARD', payload: pullRequest });

    if (!response.ok) {
        currentBoard = null;
        panel.querySelector('.gh-tr-panel__list').textContent = '';
        setPanelMessage(panel, response.error, true);
        return;
    }

    currentBoard = { members: response.members, state: response.state, settings: response.settings };
    renderBoard(currentBoard);
}

async function onMemberClick(login) {
    const pullRequest = parsePullRequestUrl();

    if (!pullRequest || busy) {
        return;
    }

    busy = true;
    setPanelBusy(true, login);

    const response = await sendMessage({ type: 'ADD_MEMBER', payload: { ...pullRequest, login } });

    busy = false;
    setPanelBusy(false, login);

    if (!response.ok) {
        showToast({ title: `Echec pour @${login}`, detail: response.error, login, isError: true });
        return;
    }

    currentBoard = { members: response.members, state: response.state, settings: response.settings };
    renderBoard(currentBoard);

    const detail = response.done.length > 0 ? response.done.join(' + ') : response.skipped.join(' + ') || 'Rien a faire';

    showToast({ title: `@${login}`, detail, login, isError: false });
}

function findSidebarAnchor() {
    const selectors = [
        '[data-testid="sidebar-section-reviewers"]',
        '[data-testid="sidebar-section-assignees"]',
        '[data-testid="issue-assignees"]',
        '.js-issue-sidebar-form',
        '#partial-discussion-sidebar .discussion-sidebar-item'
    ];

    for (const selector of selectors) {
        const element = document.querySelector(selector);

        if (element) {
            return element;
        }
    }

    return null;
}

function mountPanel() {
    if (!parsePullRequestUrl()) {
        removePanel();
        return;
    }

    const anchor = findSidebarAnchor();
    const existing = document.getElementById(PANEL_ID);

    if (existing && existing.isConnected) {
        const isFloating = existing.classList.contains('gh-tr-panel--floating');
        const isWellPlaced = anchor ? anchor.contains(existing) : isFloating;

        if (isWellPlaced) {
            return;
        }

        removePanel();
    }

    const panel = createPanel();

    if (anchor) {
        anchor.appendChild(panel);
    } else {
        panel.classList.add('gh-tr-panel--floating');
        document.body.appendChild(panel);
    }

    loadBoard(currentBoard === null);
}

function removePanel() {
    const stale = document.getElementById(PANEL_ID);

    if (stale) {
        stale.remove();
    }
}

function observePageChanges() {
    let scheduled = false;

    const scheduleMount = () => {
        if (scheduled) {
            return;
        }

        scheduled = true;
        window.requestAnimationFrame(() => {
            scheduled = false;
            mountPanel();
        });
    };

    const onUrlChange = () => {
        currentBoard = null;
        removePanel();
        scheduleMount();
    };

    // documentElement survit au remplacement du body par Turbo, contrairement a document.body.
    new MutationObserver(scheduleMount).observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    ['turbo:load', 'turbo:render', 'turbo:frame-render', 'pjax:end', 'soft-nav:end'].forEach((eventName) =>
        document.addEventListener(eventName, onUrlChange)
    );

    window.addEventListener('popstate', onUrlChange);

    let lastUrl = window.location.href;
    window.setInterval(() => {
        if (window.location.href === lastUrl) {
            return;
        }

        lastUrl = window.location.href;
        onUrlChange();
    }, 500);
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
        return;
    }

    currentBoard = null;
    loadBoard(true);
});

mountPanel();
observePageChanges();
