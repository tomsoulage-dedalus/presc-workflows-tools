const tokenInput = document.getElementById('token');
const tokenTestRepositoryInput = document.getElementById('tokenTestRepository');
const testTokenButton = document.getElementById('testToken');
const tokenCheck = document.getElementById('tokenCheck');
const tokenCheckSummary = document.getElementById('tokenCheckSummary');
const tokenCheckDetails = document.getElementById('tokenCheckDetails');
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

function clearTokenCheck() {
    tokenCheck.hidden = true;
    tokenCheckSummary.textContent = '';
    tokenCheckDetails.textContent = '';
}

function tokenCheckError(error) {
    if (error.name === 'TimeoutError') {
        return 'Delai de verification depasse. Reessaie dans quelques instants.';
    }
    if (error instanceof TypeError) {
        return 'Impossible de joindre GitHub. Verifie la connexion reseau.';
    }
    if (error instanceof SyntaxError) {
        return 'Reponse GitHub illisible.';
    }
    return error.message;
}

async function testToken() {
    clearTokenCheck();
    tokenCheck.hidden = false;
    const token = tokenInput.value.trim();
    const repository = tokenTestRepositoryInput.value.trim();
    const addReviewer = addReviewerInput.checked;
    const addAssignee = addAssigneeInput.checked;
    let hasError = false;
    let hasWarning = false;

    function report(state, text) {
        const item = document.createElement('li');
        item.className = state;
        const prefix = { success: 'OK', warning: 'A verifier', error: 'Erreur' };
        item.textContent = `${prefix[state]} - ${text}`;
        tokenCheckDetails.appendChild(item);
        hasError ||= state === 'error';
        hasWarning ||= state === 'warning';
    }

    if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
        repository.split('/').some((part) => part === '.' || part === '..') ||
        (!addReviewer && !addAssignee)) {
        tokenCheckSummary.className = 'error';
        tokenCheckSummary.textContent = !token ? 'Saisis un token GitHub.' :
            !addReviewer && !addAssignee ? 'Active au moins une action : revue ou assignation.' :
                'Saisis un depot au format owner/repo.';
        return;
    }

    const controls = [tokenInput, tokenTestRepositoryInput, testTokenButton,
        addReviewerInput, addAssigneeInput, document.getElementById('reset')];
    controls.forEach((control) => { control.disabled = true; });
    tokenCheckSummary.className = '';
    tokenCheckSummary.textContent = 'Verification en cours...';
    const signal = AbortSignal.timeout(15000);

    async function request(path) {
        const response = await fetch(`https://api.github.com${path}`, {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28'
            },
            signal
        });
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Token invalide ou expire (HTTP 401).');
            }
            if (response.headers.get('X-GitHub-SSO')?.startsWith('required')) {
                throw new Error('Autorise ce token pour le SSO de l\'organisation (HTTP 403).');
            }
            if (response.status === 429 || response.headers.get('X-RateLimit-Remaining') === '0') {
                throw new Error(`Limite de requetes GitHub atteinte (HTTP ${response.status}). Reessaie plus tard.`);
            }
            if (response.status === 404) {
                throw new Error(
                    'Ressource introuvable ou inaccessible (HTTP 404). Verifie le depot, sa selection dans le token, ' +
                    'l\'approbation de l\'organisation et le SSO.'
                );
            }
            if (response.status === 403) {
                throw new Error('Acces refuse (HTTP 403). Verifie les permissions du token et les restrictions de l\'organisation.');
            }
            throw new Error(`Echec de la requete GitHub (HTTP ${response.status}).`);
        }
        return { data: await response.json(), scopes: response.headers.get('X-OAuth-Scopes') };
    }

    async function checkRead(path, label) {
        try {
            const result = await request(path);
            if (!Array.isArray(result.data)) {
                throw new Error('Reponse GitHub inattendue.');
            }
            report('success', label);
            return result.data;
        } catch (error) {
            report('error', `${label} ${tokenCheckError(error)}`);
            return null;
        }
    }

    let step = 'Authentification';
    try {
        const user = await request('/user');
        if (typeof user.data?.login !== 'string' || !user.data.login) {
            throw new Error('Reponse GitHub inattendue : compte introuvable.');
        }
        report('success', `Token valide pour ${user.data.login}.`);

        step = `Acces au depot ${repository}`;
        const repo = await request(`/repos/${repository}`);
        if (typeof repo.data?.private !== 'boolean') {
            throw new Error('Reponse GitHub inattendue pour le depot.');
        }
        report('success', `Depot ${repository} accessible.`);

        if (repo.data.permissions?.push === true) {
            report('success', 'Le compte a le droit push sur le depot (distinct des permissions du token).');
        } else {
            report('warning', 'Droit push du compte non confirme : les actions peuvent etre limitees selon la PR et le role du compte.');
        }

        if (user.scopes !== null) {
            const scopes = user.scopes.split(',').map((scope) => scope.trim());
            const allowed = scopes.includes('repo') || (!repo.data.private && scopes.includes('public_repo'));
            report(allowed ? 'success' : 'error', allowed
                ? `Scopes du token compatibles avec les actions activees : ${scopes.join(', ')}.`
                : `Scope manquant : ${repo.data.private ? 'repo' : 'repo ou public_repo'} requis pour les actions activees.`);
        } else {
            if (addReviewer) {
                report('warning', 'Demande de revue : Pull requests: Read and write requis. Le droit Write ne peut pas etre confirme sans action sur une PR.');
            }
            if (addAssignee) {
                report('warning', 'Assignation : Issues: Read and write requis. Le droit Write ne peut pas etre confirme sans action sur une PR.');
            }
        }

        await Promise.all([
            (async () => {
                const prs = await checkRead(`/repos/${repository}/pulls?state=all&per_page=1`, 'Lecture des PR.');
                if (prs?.length) {
                    if (!Number.isSafeInteger(prs[0].number) || prs[0].number < 1) {
                        report('error', 'Reponse GitHub inattendue : numero de PR invalide.');
                        return;
                    }
                    await checkRead(`/repos/${repository}/pulls/${prs[0].number}/reviews?per_page=1`, 'Lecture des revues.');
                } else if (prs) {
                    report('warning', 'Aucune PR disponible : lecture des revues non testee.');
                }
            })(),
            ...(addAssignee
                ? [checkRead(`/repos/${repository}/issues?state=all&per_page=1`, 'Lecture des issues pour l\'assignation.')]
                : [])
        ]);
    } catch (error) {
        report('error', `${step} : ${tokenCheckError(error)}`);
    } finally {
        controls.forEach((control) => { control.disabled = false; });
        tokenCheckSummary.className = hasError ? 'error' : hasWarning ? 'warning' : 'success';
        tokenCheckSummary.textContent = hasError
            ? 'Verification en echec : consulte les erreurs ci-dessous.'
            : hasWarning
                ? 'Verification partielle : certains droits restent a confirmer. Aucune PR modifiee.'
                : 'Acces et scopes requis confirmes pour ce depot. Aucune ecriture effectuee.';
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
    clearTokenCheck();
    tokenInput.value = settings.token || '';
    tokenTestRepositoryInput.value = settings.tokenTestRepository;
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
        tokenTestRepository: tokenTestRepositoryInput.value.trim(),
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
tokenInput.addEventListener('input', clearTokenCheck);
tokenTestRepositoryInput.addEventListener('input', clearTokenCheck);
addReviewerInput.addEventListener('change', clearTokenCheck);
addAssigneeInput.addEventListener('change', clearTokenCheck);
restore();
