const listNode = document.getElementById('list');
const messageNode = document.getElementById('message');
const randomButton = document.getElementById('random');

const DISABLED_STATUSES = new Set(['active', 'reviewed', 'author']);

const BADGES = {
    author: 'auteur',
    reviewed: 'a relu',
    active: 'deja sur la PR',
    unavailable: 'indispo'
};

let pullRequest = null;
let busy = false;

function parsePullRequestUrl(url) {
    try {
        const parsed = new URL(url);

        if (parsed.hostname !== 'github.com') {
            return null;
        }

        const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);

        if (!match) {
            return null;
        }

        return { owner: match[1], repo: match[2], number: match[3] };
    } catch (error) {
        return null;
    }
}

function setMessage(text, isError) {
    messageNode.textContent = text || '';
    messageNode.className = isError ? 'error' : '';
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

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

function renderBoard(board) {
    listNode.textContent = '';
    randomButton.hidden = !board.settings.showRandom;
    randomButton.disabled = board.candidates.length === 0;

    if (!board.members || board.members.length === 0) {
        setMessage('Aucun membre configure. Ouvre les options.', true);
        return;
    }

    if (!board.settings.showTeam) {
        return;
    }

    board.members.forEach((member) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'member';
        button.disabled = DISABLED_STATUSES.has(member.status);
        button.title = `@${member.login}`;

        const avatar = document.createElement('img');
        avatar.alt = '';
        avatar.src = `https://github.com/${encodeURIComponent(member.login)}.png?size=48`;

        const name = document.createElement('span');
        name.textContent = member.label;

        button.appendChild(avatar);
        button.appendChild(name);

        if (BADGES[member.status]) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = BADGES[member.status];
            button.appendChild(badge);
        }

        button.addEventListener('click', () => add(member.login));
        listNode.appendChild(button);
    });
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

    return response.skipped.join(' + ') || 'rien a faire';
}

async function load() {
    const tab = await getActiveTab();
    pullRequest = tab ? parsePullRequestUrl(tab.url || '') : null;

    if (!pullRequest) {
        setMessage('Ouvre une page de Pull Request GitHub.', true);
        return;
    }

    setMessage('Chargement...', false);

    const response = await sendMessage({ type: 'GET_BOARD', payload: pullRequest });

    if (!response.ok) {
        setMessage(response.error, true);
        return;
    }

    const board = boardFrom(response);
    renderBoard(board);

    if (board.members.length > 0) {
        setMessage(board.settings.showTeam ? "Clique sur un membre pour l'ajouter." : 'Tire un membre au hasard.', false);
    }
}

async function run(message, label) {
    if (!pullRequest || busy) {
        return;
    }

    busy = true;
    setMessage(label, false);

    const response = await sendMessage(message);
    busy = false;

    if (!response.ok) {
        setMessage(`Echec : ${response.error}`, true);
        return;
    }

    renderBoard(boardFrom(response));
    setMessage(`@${response.login} : ${resultDetail(response)}.`, false);
}

function add(login) {
    return run({ type: 'ADD_MEMBER', payload: { ...pullRequest, login } }, `Ajout de @${login}...`);
}

randomButton.addEventListener('click', () => {
    run({ type: 'ASSIGN_RANDOM', payload: pullRequest }, 'Tirage en cours...');
});

document.getElementById('options').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
});

load();
