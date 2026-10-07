const DEFAULT_SETTINGS = {
    token: '',
    team: ['e-k-n-i-t', 'apzgw', 'tomsoulage-dedalus', 'mohammedsel', 'lucas-merienne'],
    unavailable: [],
    addReviewer: true,
    addAssignee: true,
    hideSelf: true
};

const tokenInput = document.getElementById('token');
const teamInput = document.getElementById('team');
const unavailableInput = document.getElementById('unavailable');
const addReviewerInput = document.getElementById('addReviewer');
const addAssigneeInput = document.getElementById('addAssignee');
const hideSelfInput = document.getElementById('hideSelf');
const statusLabel = document.getElementById('status');

function parseEntries(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[\n,;]+/);
    const seen = new Set();
    const entries = [];

    raw.forEach((item) => {
        const text = String(item || '').trim();

        if (!text) {
            return;
        }

        const [loginPart, ...labelParts] = text.split('=');
        const login = loginPart.trim().replace(/^@/, '');

        if (!login || seen.has(login.toLowerCase())) {
            return;
        }

        seen.add(login.toLowerCase());
        const label = labelParts.join('=').trim();
        entries.push(label ? `${login}=${label}` : login);
    });

    return entries;
}

function entryLogin(entry) {
    return entry.split('=')[0].toLowerCase();
}

function setStatus(text, isError) {
    statusLabel.textContent = text;
    statusLabel.className = isError ? 'error' : '';

    window.setTimeout(() => {
        statusLabel.textContent = '';
        statusLabel.className = '';
    }, 4000);
}

async function restore() {
    const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);

    tokenInput.value = settings.token || '';
    teamInput.value = parseEntries(settings.team).join('\n');
    unavailableInput.value = parseEntries(settings.unavailable).join('\n');
    addReviewerInput.checked = settings.addReviewer !== false;
    addAssigneeInput.checked = settings.addAssignee !== false;
    hideSelfInput.checked = settings.hideSelf !== false;
}

async function save() {
    const team = parseEntries(teamInput.value);
    const unavailable = parseEntries(unavailableInput.value);

    if (!addReviewerInput.checked && !addAssigneeInput.checked) {
        setStatus('Active au moins "revue" ou "assigner", sinon le clic ne fait rien.', true);
        return;
    }

    await chrome.storage.local.set({
        token: tokenInput.value.trim(),
        team,
        unavailable,
        addReviewer: addReviewerInput.checked,
        addAssignee: addAssigneeInput.checked,
        hideSelf: hideSelfInput.checked
    });

    const teamLogins = new Set(team.map(entryLogin));
    const away = unavailable.filter((entry) => teamLogins.has(entryLogin(entry))).length;
    const awayNote = away > 0 ? `, ${away} indisponible(s)` : '';

    setStatus(`Enregistre : ${team.length} membre(s)${awayNote}.`, false);
}

document.getElementById('save').addEventListener('click', save);
restore();
