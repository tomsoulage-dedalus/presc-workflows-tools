const API_ROOT = 'https://api.github.com';

const DEFAULT_SETTINGS = {
    token: '',
    team: ['e-k-n-i-t', 'apzgw', 'tomsoulage-dedalus', 'mohammedsel', 'lucas-merienne'],
    unavailable: ['apzpr'],
    showTeam: true,
    showRandom: true,
    addReviewer: true,
    addAssignee: true,
    hideSelf: true,
    replaceExisting: false
};

function parseTeam(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[\n,;]+/);
    const seen = new Set();
    const members = [];

    raw.forEach((entry) => {
        const text = String(entry || '').trim();

        if (!text) {
            return;
        }

        // Syntaxe acceptee : "login" ou "login=Prenom Nom".
        const [loginPart, ...labelParts] = text.split('=');
        const login = loginPart.trim().replace(/^@/, '');

        if (!login || seen.has(login.toLowerCase())) {
            return;
        }

        seen.add(login.toLowerCase());
        members.push({ login, label: labelParts.join('=').trim() || login });
    });

    return members;
}

function normalizeLogins(value) {
    return parseTeam(value).map((member) => member.login);
}

async function getSettings() {
    const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);

    return {
        token: (stored.token || '').trim(),
        team: parseTeam(stored.team),
        unavailable: normalizeLogins(stored.unavailable),
        showTeam: stored.showTeam !== false,
        showRandom: stored.showRandom !== false,
        addReviewer: stored.addReviewer !== false,
        addAssignee: stored.addAssignee !== false,
        hideSelf: stored.hideSelf !== false,
        replaceExisting: stored.replaceExisting === true
    };
}

async function githubRequest(token, path, options = {}) {
    const response = await fetch(`${API_ROOT}${path}`, {
        ...options,
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;

    if (!response.ok) {
        const message = body && body.message ? body.message : `HTTP ${response.status}`;
        throw new Error(message);
    }

    return body;
}

function requireToken(settings) {
    if (!settings.token) {
        throw new Error("Aucun token GitHub configure. Ouvre les options de l'extension.");
    }
}

async function fetchPullRequestState(settings, { owner, repo, number }) {
    const pullRequest = await githubRequest(settings.token, `/repos/${owner}/${repo}/pulls/${number}`);

    let reviewed = [];

    try {
        const reviews = await githubRequest(
            settings.token,
            `/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`
        );
        reviewed = [...new Set((reviews || []).map((review) => (review.user ? review.user.login : null)).filter(Boolean))];
    } catch (error) {
        reviewed = [];
    }

    return {
        author: pullRequest.user ? pullRequest.user.login : null,
        reviewers: (pullRequest.requested_reviewers || []).map((reviewer) => reviewer.login),
        assignees: (pullRequest.assignees || []).map((assignee) => assignee.login),
        reviewed
    };
}

function buildMembers(settings, state) {
    const lower = (list) => new Set(list.map((login) => login.toLowerCase()));
    const reviewers = lower(state.reviewers);
    const assignees = lower(state.assignees);
    const reviewed = lower(state.reviewed);
    const unavailable = lower(settings.unavailable);
    const author = state.author ? state.author.toLowerCase() : null;

    return settings.team
        .filter((member) => !(settings.hideSelf && author && member.login.toLowerCase() === author))
        .map((member) => {
            const key = member.login.toLowerCase();
            const isAuthor = author === key;
            const isReviewer = reviewers.has(key);
            const isAssignee = assignees.has(key);
            const hasReviewed = reviewed.has(key);
            const isUnavailable = unavailable.has(key);

            let status = 'idle';

            if (isAuthor) {
                status = 'author';
            } else if (hasReviewed) {
                status = 'reviewed';
            } else if (isReviewer || isAssignee) {
                status = 'active';
            } else if (isUnavailable) {
                status = 'unavailable';
            }

            return { ...member, status, isReviewer, isAssignee, hasReviewed, isAuthor, isUnavailable };
        });
}

// Candidats du tirage : membres disponibles, pas encore sur la PR, et pas l'auteur.
function randomCandidates(members) {
    return members.filter((member) => member.status === 'idle');
}

function toBoard(settings, state, members) {
    return {
        members,
        state,
        settings: {
            addReviewer: settings.addReviewer,
            addAssignee: settings.addAssignee,
            showTeam: settings.showTeam,
            showRandom: settings.showRandom
        },
        candidates: randomCandidates(members).map((member) => member.login)
    };
}

async function buildBoard(pullRequest) {
    const settings = await getSettings();
    requireToken(settings);

    const state = await fetchPullRequestState(settings, pullRequest);

    return toBoard(settings, state, buildMembers(settings, state));
}

async function applyMember(settings, { owner, repo, number }, login, state) {
    const key = login.toLowerCase();
    const done = [];
    const skipped = [];

    if (settings.addReviewer) {
        if (state.author && state.author.toLowerCase() === key) {
            skipped.push('auteur de la PR');
        } else if (state.reviewers.some((reviewer) => reviewer.toLowerCase() === key)) {
            skipped.push('revue deja demandee');
        } else if (state.reviewed.some((reviewer) => reviewer.toLowerCase() === key)) {
            skipped.push('a deja relu la PR');
        } else {
            await githubRequest(settings.token, `/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`, {
                method: 'POST',
                body: JSON.stringify({ reviewers: [login] })
            });
            done.push('revue demandee');
        }
    }

    if (settings.addAssignee) {
        if (state.assignees.some((assignee) => assignee.toLowerCase() === key)) {
            skipped.push('deja assigne');
        } else {
            const updated = await githubRequest(settings.token, `/repos/${owner}/${repo}/issues/${number}/assignees`, {
                method: 'POST',
                body: JSON.stringify({ assignees: [login] })
            });

            const finalAssignees = (updated.assignees || []).map((assignee) => assignee.login);

            if (!finalAssignees.some((assignee) => assignee.toLowerCase() === key)) {
                throw new Error(`${login} n'a pas pu etre assigne (droits insuffisants sur le depot ?).`);
            }

            done.push('assigne');
        }
    }

    return { done, skipped };
}

function requireAction(settings) {
    if (!settings.addReviewer && !settings.addAssignee) {
        throw new Error('Reviewer et assignee sont desactives dans les options.');
    }
}

async function refreshBoard(settings, pullRequest) {
    const state = await fetchPullRequestState(settings, pullRequest);
    return toBoard(settings, state, buildMembers(settings, state));
}

async function addMember({ owner, repo, number, login }) {
    const settings = await getSettings();
    requireToken(settings);
    requireAction(settings);

    const pullRequest = { owner, repo, number };
    const state = await fetchPullRequestState(settings, pullRequest);

    if (settings.addReviewer && !settings.addAssignee && state.author && state.author.toLowerCase() === login.toLowerCase()) {
        throw new Error("L'auteur ne peut pas etre reviewer de sa propre PR.");
    }

    const result = await applyMember(settings, pullRequest, login, state);
    const board = await refreshBoard(settings, pullRequest);

    return { login, ...result, ...board };
}

async function assignRandom({ owner, repo, number }) {
    const settings = await getSettings();
    requireToken(settings);
    requireAction(settings);

    if (settings.team.length === 0) {
        throw new Error("Aucun membre configure. Ouvre les options de l'extension.");
    }

    const pullRequest = { owner, repo, number };
    const state = await fetchPullRequestState(settings, pullRequest);
    const candidates = randomCandidates(buildMembers(settings, state));

    if (candidates.length === 0) {
        throw new Error('Aucun candidat disponible (auteur, indisponibles et personnes deja sur la PR exclus).');
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)].login;

    if (settings.replaceExisting && settings.addAssignee && state.assignees.length > 0) {
        await githubRequest(settings.token, `/repos/${owner}/${repo}/issues/${number}/assignees`, {
            method: 'DELETE',
            body: JSON.stringify({ assignees: state.assignees })
        });
        state.assignees = [];
    }

    const result = await applyMember(settings, pullRequest, chosen, state);
    const board = await refreshBoard(settings, pullRequest);

    return { login: chosen, ...result, ...board };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) {
        return false;
    }

    if (message.type === 'GET_BOARD') {
        buildBoard(message.payload)
            .then((board) => sendResponse({ ok: true, ...board }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message.type === 'ADD_MEMBER') {
        addMember(message.payload)
            .then((result) => sendResponse({ ok: true, ...result }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message.type === 'ASSIGN_RANDOM') {
        assignRandom(message.payload)
            .then((result) => sendResponse({ ok: true, ...result }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message.type === 'GET_SETTINGS') {
        getSettings()
            .then((settings) => sendResponse({ ok: true, settings: { ...settings, token: undefined, hasToken: Boolean(settings.token) } }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    return false;
});
