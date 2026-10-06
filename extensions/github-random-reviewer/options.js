const DEFAULT_SETTINGS = {
    token: '',
    users: ['e-k-n-i-t', 'apzgw', 'tomsoulage-dedalus', 'mohammedsel', 'lucas-merienne'],
    vacationUsers: [],
    excludeSelf: true,
    replaceExisting: false,
    requestReview: true
};

const tokenInput = document.getElementById('token');
const usersInput = document.getElementById('users');
const vacationUsersInput = document.getElementById('vacationUsers');
const excludeSelfInput = document.getElementById('excludeSelf');
const requestReviewInput = document.getElementById('requestReview');
const replaceExistingInput = document.getElementById('replaceExisting');
const statusLabel = document.getElementById('status');

function parseUsers(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,;]+/);
    const cleaned = raw.map((user) => String(user).trim().replace(/^@/, '')).filter(Boolean);

    return [...new Set(cleaned)];
}

function buildStatus(users, vacationUsers) {
    const vacationSet = new Set(vacationUsers.map((user) => user.toLowerCase()));
    const eligible = users.filter((user) => !vacationSet.has(user.toLowerCase()));

    if (eligible.length === 0) {
        return 'Enregistre, mais aucun candidat eligible (tous en conges ?).';
    }

    const vacationNote = vacationUsers.length > 0 ? `, ${vacationUsers.length} en conges` : '';
    return `Enregistre : ${eligible.length} candidat(s) eligible(s)${vacationNote}.`;
}

async function restore() {
    const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);

    tokenInput.value = settings.token || '';
    usersInput.value = parseUsers(settings.users).join(', ');
    vacationUsersInput.value = parseUsers(settings.vacationUsers).join(', ');
    excludeSelfInput.checked = settings.excludeSelf !== false;
    requestReviewInput.checked = settings.requestReview !== false;
    replaceExistingInput.checked = settings.replaceExisting === true;
}

async function save() {
    const users = parseUsers(usersInput.value);
    const vacationUsers = parseUsers(vacationUsersInput.value);

    await chrome.storage.local.set({
        token: tokenInput.value.trim(),
        users,
        vacationUsers,
        excludeSelf: excludeSelfInput.checked,
        requestReview: requestReviewInput.checked,
        replaceExisting: replaceExistingInput.checked
    });

    statusLabel.textContent = buildStatus(users, vacationUsers);

    window.setTimeout(() => {
        statusLabel.textContent = '';
    }, 4000);
}

document.getElementById('save').addEventListener('click', save);
restore();
