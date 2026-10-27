const tokenInput = document.getElementById('token');
const testTokenButton = document.getElementById('testToken');
const tokenStatusLabel = document.getElementById('tokenStatus');
const teamInput = document.getElementById('team');
const unavailableInput = document.getElementById('unavailable');
const showTeamInput = document.getElementById('showTeam');
const showRandomInput = document.getElementById('showRandom');
const addReviewerInput = document.getElementById('addReviewer');
const addAssigneeInput = document.getElementById('addAssignee');
const hideSelfInput = document.getElementById('hideSelf');
const replaceExistingInput = document.getElementById('replaceExisting');
const showJiraLinksInput = document.getElementById('showJiraLinks');
const showJenkinsInput = document.getElementById('showJenkins');
const jenkinsRepositoriesInput = document.getElementById('jenkinsRepositories');
const jenkinsLabelsInput = document.getElementById('jenkinsLabels');
const statusLabel = document.getElementById('status');

function setTokenStatus(text, isError = false) {
    tokenStatusLabel.textContent = text;
    tokenStatusLabel.className = isError ? 'hint error' : 'hint';
}

async function testToken() {
    const token = tokenInput.value.trim();

    if (!token) {
        setTokenStatus('Saisis un token GitHub avant de le tester.', true);
        return;
    }

    testTokenButton.disabled = true;
    tokenInput.disabled = true;
    setTokenStatus('Verification en cours...');

    try {
        const response = await fetch('https://api.github.com/user', {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28'
            },
            signal: AbortSignal.timeout(15000)
        });

        if (response.status === 401) {
            setTokenStatus('Token invalide ou expire.', true);
        } else if (response.status === 403) {
            setTokenStatus('Acces refuse par GitHub (restriction ou limite de requetes).', true);
        } else if (!response.ok) {
            setTokenStatus(`Echec du test GitHub (HTTP ${response.status}).`, true);
        } else {
            const user = await response.json();

            if (typeof user.login !== 'string' || !user.login) {
                setTokenStatus('Reponse GitHub inattendue : compte introuvable.', true);
                return;
            }

            setTokenStatus(`Token valide : connecte en tant que ${user.login}.`);
        }
    } catch (error) {
        setTokenStatus(
            error.name === 'TimeoutError'
                ? 'GitHub ne repond pas : delai du test depasse.'
                : 'Impossible de verifier le token : erreur reseau ou reponse GitHub illisible.',
            true
        );
    } finally {
        testTokenButton.disabled = false;
        tokenInput.disabled = false;
    }
}

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

function fill(settings) {
    tokenInput.value = settings.token || '';
    teamInput.value = parseEntries(settings.team).join('\n');
    unavailableInput.value = parseEntries(settings.unavailable).join('\n');
    showTeamInput.checked = settings.showTeam !== false;
    showRandomInput.checked = settings.showRandom !== false;
    addReviewerInput.checked = settings.addReviewer !== false;
    addAssigneeInput.checked = settings.addAssignee !== false;
    hideSelfInput.checked = settings.hideSelf !== false;
    replaceExistingInput.checked = settings.replaceExisting === true;
    showJiraLinksInput.checked = settings.showJiraLinks !== false;
    showJenkinsInput.checked = settings.showJenkins === true;
    jenkinsRepositoriesInput.value = settings.jenkinsRepositories.join(', ');
    jenkinsLabelsInput.value = settings.jenkinsLabels.join(', ');
}

async function restore() {
    fill(await chrome.storage.local.get(DEFAULT_SETTINGS));
}

function reset() {
    // Le token est conserve : il n'a pas de valeur par defaut utile.
    fill({ ...DEFAULT_SETTINGS, token: tokenInput.value });
    setStatus('Valeurs par defaut chargees. Clique sur Enregistrer pour les appliquer.', false);
}

async function save() {
    const team = parseEntries(teamInput.value);
    const unavailable = parseEntries(unavailableInput.value);
    const jenkinsRepositories = jenkinsRepositoriesInput.value.split(',').map((entry) => entry.trim()).filter(Boolean);
    const jenkinsLabels = jenkinsLabelsInput.value.split(',').map((entry) => entry.trim()).filter(Boolean);

    if (showJenkinsInput.checked && jenkinsRepositories.some((entry) => !/^[\w.-]+\/[\w.-]+$/.test(entry))) {
        setStatus('Depot Jenkins invalide : utiliser owner/repo.', true);
        return;
    }

    if (!addReviewerInput.checked && !addAssigneeInput.checked) {
        setStatus('Active au moins "revue" ou "assigner", sinon le clic ne fait rien.', true);
        return;
    }

    if (!showTeamInput.checked && !showRandomInput.checked) {
        setStatus('Active au moins la liste de l\'equipe ou le tirage au hasard.', true);
        return;
    }

    await chrome.storage.local.set({
        token: tokenInput.value.trim(),
        team,
        unavailable,
        showTeam: showTeamInput.checked,
        showRandom: showRandomInput.checked,
        addReviewer: addReviewerInput.checked,
        addAssignee: addAssigneeInput.checked,
        hideSelf: hideSelfInput.checked,
        replaceExisting: replaceExistingInput.checked,
        showJiraLinks: showJiraLinksInput.checked,
        showJenkins: showJenkinsInput.checked,
        jenkinsRepositories,
        jenkinsLabels
    });

    const teamLogins = new Set(team.map(entryLogin));
    const away = unavailable.filter((entry) => teamLogins.has(entryLogin(entry))).length;
    const awayNote = away > 0 ? `, ${away} indisponible(s)` : '';

    setStatus(`Enregistre : ${team.length} membre(s)${awayNote}.`, false);
}

document.getElementById('save').addEventListener('click', save);
document.getElementById('reset').addEventListener('click', reset);
testTokenButton.addEventListener('click', testToken);
tokenInput.addEventListener('input', () => setTokenStatus(''));
restore();
