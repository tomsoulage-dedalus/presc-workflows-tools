const assignButton = document.getElementById('assign');
const messageBox = document.getElementById('message');
const avatarImage = document.getElementById('avatar');

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

function setMessage(text, isError, login) {
    messageBox.textContent = text;
    messageBox.className = isError ? 'error' : '';

    if (login) {
        avatarImage.src = `https://github.com/${encodeURIComponent(login)}.png?size=64`;
        avatarImage.hidden = false;
        return;
    }

    avatarImage.removeAttribute('src');
    avatarImage.hidden = true;
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

async function assign() {
    const tab = await getActiveTab();
    const pullRequest = tab ? parsePullRequestUrl(tab.url || '') : null;

    if (!pullRequest) {
        setMessage('Ouvre une page de Pull Request GitHub.', true);
        return;
    }

    assignButton.disabled = true;
    setMessage('Tirage en cours...', false);

    const response = await sendMessage({ type: 'ASSIGN_RANDOM', payload: pullRequest });
    assignButton.disabled = false;

    if (!response.ok) {
        setMessage(`Echec : ${response.error}`, true);
        return;
    }

    const reviewNote = response.review && response.review.requested ? ' et revue demandee' : '';
    setMessage(`Assigne a @${response.chosen}${reviewNote}.`, false, response.chosen);
    chrome.tabs.reload(tab.id);
}

document.getElementById('options').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
});

assignButton.addEventListener('click', assign);
