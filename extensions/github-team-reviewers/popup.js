const listNode = document.getElementById('list');
const messageNode = document.getElementById('message');

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

function renderMembers(members) {
    listNode.textContent = '';

    if (!members || members.length === 0) {
        setMessage("Aucun membre configure. Ouvre les options.", true);
        return;
    }

    members.forEach((member) => {
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

    renderMembers(response.members);
    setMessage('Clique sur un membre pour l\'ajouter.', false);
}

async function add(login) {
    if (!pullRequest || busy) {
        return;
    }

    busy = true;
    setMessage(`Ajout de @${login}...`, false);

    const response = await sendMessage({ type: 'ADD_MEMBER', payload: { ...pullRequest, login } });
    busy = false;

    if (!response.ok) {
        setMessage(`Echec : ${response.error}`, true);
        return;
    }

    renderMembers(response.members);
    const detail = response.done.length > 0 ? response.done.join(' + ') : response.skipped.join(' + ') || 'rien a faire';
    setMessage(`@${login} : ${detail}.`, false);
}

document.getElementById('options').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
});

load();
