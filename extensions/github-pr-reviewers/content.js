const PANEL_ID = 'gh-pr-reviewers-panel';
const TOAST_ID = 'gh-pr-reviewers-toast';
const DISABLED_STATUSES = new Set(['active', 'reviewed', 'author']);
const ROLL_INTERVAL_MS = 80;
const MIN_ROLL_DURATION_MS = 900;

const STATUS_TITLES = {
    idle: 'Ajouter a cette PR',
    active: 'Deja sur cette PR',
    reviewed: 'A deja relu cette PR',
    author: 'Auteur de la PR',
    unavailable: 'Indisponible / en conges'
};

let currentBoard = null;
let busy = false;

// Volontairement limite a l'onglet "Conversation" (celui qui porte la sidebar
// Reviewers / Assignees) : pas de panneau sur /files, /commits, /checks...
function parsePullRequestUrl() {
    const match = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/);

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

function delay(duration) {
    return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function getToast() {
    let toast = document.getElementById(TOAST_ID);

    if (!toast) {
        toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.innerHTML =
            '<img class="gh-pr-toast__avatar" alt="" />' +
            '<div class="gh-pr-toast__body">' +
            '<span class="gh-pr-toast__title"></span>' +
            '<span class="gh-pr-toast__detail"></span>' +
            '</div>';
        document.body.appendChild(toast);
    }

    return toast;
}

function showToast({ title, detail, login, isError }) {
    const toast = getToast();
    const avatar = toast.querySelector('.gh-pr-toast__avatar');

    if (login) {
        avatar.src = `https://github.com/${encodeURIComponent(login)}.png?size=80`;
        avatar.hidden = false;
    } else {
        avatar.removeAttribute('src');
        avatar.hidden = true;
    }

    toast.querySelector('.gh-pr-toast__title').textContent = title;

    const detailNode = toast.querySelector('.gh-pr-toast__detail');
    detailNode.textContent = detail || '';
    detailNode.hidden = !detail;

    toast.className = `gh-pr-toast gh-pr-toast--${isError ? 'error' : 'success'} gh-pr-toast--visible`;

    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('gh-pr-toast--visible'), 5000);
}

function createPanel() {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'gh-pr-panel';
    panel.innerHTML =
        '<div class="gh-pr-panel__header">' +
        '<span class="gh-pr-panel__title">Equipe</span>' +
        '<button type="button" class="gh-pr-panel__refresh" title="Rafraichir">&#8635;</button>' +
        '</div>' +
        '<button type="button" class="gh-pr-random" hidden>' +
        '<span class="gh-pr-random__dice">&#127922;</span>' +
        '<span class="gh-pr-random__label">Au hasard</span>' +
        '</button>' +
        '<div class="gh-pr-panel__list"></div>' +
        '<p class="gh-pr-panel__message"></p>';

    panel.querySelector('.gh-pr-panel__refresh').addEventListener('click', () => loadBoard(true));
    panel.querySelector('.gh-pr-random').addEventListener('click', onRandomClick);

    return panel;
}

function setPanelMessage(panel, text, isError) {
    const node = panel.querySelector('.gh-pr-panel__message');
    node.textContent = text || '';
    node.hidden = !text;
    node.classList.toggle('gh-pr-panel__message--error', Boolean(isError));
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
    button.className = `gh-pr-member gh-pr-member--${member.status}`;
    button.dataset.login = member.login;
    button.disabled = DISABLED_STATUSES.has(member.status);
    button.title = `@${member.login} - ${STATUS_TITLES[member.status] || ''}`;

    const avatar = document.createElement('img');
    avatar.className = 'gh-pr-member__avatar';
    avatar.alt = '';
    avatar.src = `https://github.com/${encodeURIComponent(member.login)}.png?size=48`;

    const name = document.createElement('span');
    name.className = 'gh-pr-member__name';
    name.textContent = member.label;

    button.appendChild(avatar);
    button.appendChild(name);

    const badgeText = memberBadge(member);

    if (badgeText) {
        const badge = document.createElement('span');
        badge.className = 'gh-pr-member__badge';
        badge.textContent = badgeText;
        button.appendChild(badge);
    }

    button.addEventListener('click', () => onMemberClick(member.login));

    return button;
}

function actionLabel(board) {
    const actions = [];

    if (board.settings.addReviewer) {
        actions.push('revue');
    }

    if (board.settings.addAssignee) {
        actions.push('assignation');
    }

    return actions.join(' + ');
}

function renderBoard(board) {
    const panel = document.getElementById(PANEL_ID);

    if (!panel) {
        return;
    }

    const list = panel.querySelector('.gh-pr-panel__list');
    const randomButton = panel.querySelector('.gh-pr-random');
    list.textContent = '';

    if (!board) {
        return;
    }

    randomButton.hidden = !board.settings.showRandom;
    randomButton.disabled = board.candidates.length === 0;
    randomButton.querySelector('.gh-pr-random__label').textContent = 'Au hasard';
    randomButton.classList.remove('gh-pr-random--winner');

    if (board.settings.showTeam) {
        board.members.forEach((member) => list.appendChild(createMemberButton(member)));
    }

    if (board.members.length === 0) {
        setPanelMessage(panel, "Aucun membre configure. Ouvre les options de l'extension.", false);
        return;
    }

    if (!board.settings.showTeam && !board.settings.showRandom) {
        setPanelMessage(panel, 'Liste et tirage desactives dans les options.', false);
        return;
    }

    const actions = actionLabel(board);
    setPanelMessage(panel, actions ? `Un clic = ${actions}.` : '', false);
}

function setPanelBusy(isBusy, login) {
    const panel = document.getElementById(PANEL_ID);

    if (!panel) {
        return;
    }

    panel.classList.toggle('gh-pr-panel--busy', isBusy);

    panel.querySelectorAll('.gh-pr-member').forEach((button) => {
        button.classList.toggle('gh-pr-member--loading', isBusy && button.dataset.login === login);
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
        panel.querySelector('.gh-pr-panel__list').textContent = '';
        setPanelMessage(panel, response.error, true);
        return;
    }

    currentBoard = boardFrom(response);
    renderBoard(currentBoard);
}

function boardFrom(response) {
    return {
        members: response.members,
        state: response.state,
        settings: response.settings,
        candidates: response.candidates || []
    };
}

function resultDetail(response) {
    if (response.done.length > 0) {
        return response.done.join(' + ');
    }

    return response.skipped.join(' + ') || 'Rien a faire';
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

    currentBoard = boardFrom(response);
    renderBoard(currentBoard);
    showToast({ title: `@${login}`, detail: resultDetail(response), login, isError: false });
}

function startRollAnimation(button, candidates) {
    const label = button.querySelector('.gh-pr-random__label');
    const names = candidates.length > 0 ? candidates : ['...'];

    button.classList.add('gh-pr-random--rolling');

    let index = Math.floor(Math.random() * names.length);
    label.textContent = `@${names[index]}`;

    const timer = window.setInterval(() => {
        index = (index + 1) % names.length;
        label.textContent = `@${names[index]}`;
    }, ROLL_INTERVAL_MS);

    return (finalLogin) => {
        window.clearInterval(timer);
        button.classList.remove('gh-pr-random--rolling');

        if (finalLogin) {
            label.textContent = `@${finalLogin}`;
            button.classList.add('gh-pr-random--winner');
            return;
        }

        label.textContent = 'Au hasard';
    };
}

async function onRandomClick() {
    const pullRequest = parsePullRequestUrl();
    const panel = document.getElementById(PANEL_ID);

    if (!pullRequest || !panel || busy) {
        return;
    }

    const button = panel.querySelector('.gh-pr-random');

    busy = true;
    button.disabled = true;

    const stopAnimation = startRollAnimation(button, currentBoard ? currentBoard.candidates : []);
    const startedAt = Date.now();

    const response = await sendMessage({ type: 'ASSIGN_RANDOM', payload: pullRequest });
    const remaining = MIN_ROLL_DURATION_MS - (Date.now() - startedAt);

    if (remaining > 0) {
        await delay(remaining);
    }

    busy = false;

    if (!response.ok) {
        stopAnimation(null);
        button.disabled = false;
        showToast({ title: 'Echec du tirage', detail: response.error, isError: true });
        return;
    }

    stopAnimation(response.login);
    showToast({
        title: `@${response.login}`,
        detail: resultDetail(response),
        login: response.login,
        isError: false
    });

    currentBoard = boardFrom(response);

    // Laisse le resultat du tirage affiche avant de reconstruire la liste.
    await delay(1600);
    renderBoard(currentBoard);
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
        const isFloating = existing.classList.contains('gh-pr-panel--floating');
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
        panel.classList.add('gh-pr-panel--floating');
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
    if (area !== 'local' || busy) {
        return;
    }

    currentBoard = null;
    loadBoard(true);
});

mountPanel();
observePageChanges();
