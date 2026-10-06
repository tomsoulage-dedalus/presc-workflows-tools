const API_ROOT = 'https://api.github.com';

const DEFAULT_SETTINGS = {
    token: '',
    users: ['e-k-n-i-t', 'apzgw', 'tomsoulage-dedalus', 'mohammedsel', 'lucas-merienne'],
    vacationUsers: [],
    excludeSelf: true,
    replaceExisting: false,
    requestReview: true
};

async function getSettings() {
    const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
    return {
        token: (stored.token || '').trim(),
        users: normalizeUsers(stored.users),
        vacationUsers: normalizeUsers(stored.vacationUsers),
        excludeSelf: stored.excludeSelf !== false,
        replaceExisting: stored.replaceExisting === true,
        requestReview: stored.requestReview !== false
    };
}

function normalizeUsers(users) {
    const raw = Array.isArray(users) ? users : String(users || '').split(/[\s,;]+/);
    const cleaned = raw.map((user) => String(user).trim().replace(/^@/, '')).filter(Boolean);
    return [...new Set(cleaned)];
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

function pickRandom(candidates) {
    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index];
}

function buildCandidates(settings, { author = null, currentAssignees = [] } = {}) {
    const excluded = new Set(currentAssignees.map((login) => login.toLowerCase()));

    settings.vacationUsers.forEach((user) => excluded.add(user.toLowerCase()));

    if (settings.excludeSelf && author) {
        excluded.add(author.toLowerCase());
    }

    return settings.users.filter((user) => !excluded.has(user.toLowerCase()));
}

async function assignRandomUser({ owner, repo, number }) {
    const settings = await getSettings();

    if (!settings.token) {
        throw new Error("Aucun token GitHub configure. Ouvre les options de l'extension.");
    }

    if (settings.users.length === 0) {
        throw new Error("Aucun utilisateur configure. Ouvre les options de l'extension.");
    }

    const pullRequest = await githubRequest(settings.token, `/repos/${owner}/${repo}/pulls/${number}`);
    const author = pullRequest.user ? pullRequest.user.login : null;
    const currentAssignees = (pullRequest.assignees || []).map((assignee) => assignee.login);
    const currentReviewers = ((pullRequest.requested_reviewers || [])).map((reviewer) => reviewer.login);

    const candidates = buildCandidates(settings, { author, currentAssignees });

    if (candidates.length === 0) {
        throw new Error('Aucun candidat disponible (auteur, conges et assignes actuels exclus).');
    }

    const chosen = pickRandom(candidates);

    if (settings.replaceExisting && currentAssignees.length > 0) {
        await githubRequest(settings.token, `/repos/${owner}/${repo}/issues/${number}/assignees`, {
            method: 'DELETE',
            body: JSON.stringify({ assignees: currentAssignees })
        });
    }

    const updated = await githubRequest(settings.token, `/repos/${owner}/${repo}/issues/${number}/assignees`, {
        method: 'POST',
        body: JSON.stringify({ assignees: [chosen] })
    });

    const finalAssignees = (updated.assignees || []).map((assignee) => assignee.login);

    if (!finalAssignees.some((login) => login.toLowerCase() === chosen.toLowerCase())) {
        throw new Error(`${chosen} n'a pas pu etre assigne (droits insuffisants sur le depot ?).`);
    }

    const reviewRequest = await requestReviewIfNeeded({
        settings,
        owner,
        repo,
        number,
        chosen,
        author,
        currentReviewers
    });

    return { chosen, assignees: finalAssignees, review: reviewRequest };
}

async function requestReviewIfNeeded({ settings, owner, repo, number, chosen, author, currentReviewers }) {
    if (!settings.requestReview) {
        return { requested: false, reason: 'Demande de revue desactivee.' };
    }

    if (author && author.toLowerCase() === chosen.toLowerCase()) {
        return { requested: false, reason: "L'auteur ne peut pas relire sa propre PR." };
    }

    if (currentReviewers.some((login) => login.toLowerCase() === chosen.toLowerCase())) {
        return { requested: true, reason: 'Revue deja demandee.' };
    }

    try {
        await githubRequest(settings.token, `/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`, {
            method: 'POST',
            body: JSON.stringify({ reviewers: [chosen] })
        });
        return { requested: true };
    } catch (error) {
        return { requested: false, reason: error.message };
    }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'ASSIGN_RANDOM') {
        assignRandomUser(message.payload)
            .then((result) => sendResponse({ ok: true, ...result }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message && message.type === 'GET_CANDIDATES') {
        getSettings()
            .then((settings) => sendResponse({ ok: true, users: buildCandidates(settings) }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message && message.type === 'GET_SETTINGS') {
        getSettings()
            .then((settings) => sendResponse({ ok: true, settings: { ...settings, token: undefined, hasToken: Boolean(settings.token) } }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    return false;
});
