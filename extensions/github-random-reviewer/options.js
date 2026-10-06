const DEFAULT_SETTINGS = {
    token: '',
    users: ['e-k-n-i-t', 'apzgw', 'tomsoulage-dedalus', 'mohammedsel', 'lucas-merienne'],
    excludeSelf: true,
    replaceExisting: false,
    requestReview: true
};

const tokenInput = document.getElementById('token');
const usersInput = document.getElementById('users');
const excludeSelfInput = document.getElementById('excludeSelf');
const requestReviewInput = document.getElementById('requestReview');
const replaceExistingInput = document.getElementById('replaceExisting');
const statusLabel = document.getElementById('status');

function parseUsers(value) {
    const cleaned = value
        .split(/[\s,;]+/)
        .map((user) => user.trim().replace(/^@/, ''))
        .filter(Boolean);

    return [...new Set(cleaned)];
}

async function restore() {
    const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
    const users = Array.isArray(settings.users) ? settings.users : parseUsers(String(settings.users || ''));

    tokenInput.value = settings.token || '';
    usersInput.value = users.join(', ');
    excludeSelfInput.checked = settings.excludeSelf !== false;
    requestReviewInput.checked = settings.requestReview !== false;
    replaceExistingInput.checked = settings.replaceExisting === true;
}

async function save() {
    const users = parseUsers(usersInput.value);

    await chrome.storage.local.set({
        token: tokenInput.value.trim(),
        users,
        excludeSelf: excludeSelfInput.checked,
        requestReview: requestReviewInput.checked,
        replaceExisting: replaceExistingInput.checked
    });

    statusLabel.textContent = `Enregistre (${users.length} utilisateur(s)).`;
    window.setTimeout(() => {
        statusLabel.textContent = '';
    }, 2500);
}

document.getElementById('save').addEventListener('click', save);
restore();
