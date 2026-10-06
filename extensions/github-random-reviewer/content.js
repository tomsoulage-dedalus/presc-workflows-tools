const BUTTON_ID = 'gh-random-assignee-button';
const TOAST_ID = 'gh-random-assignee-toast';
const ROLL_INTERVAL_MS = 80;
const MIN_ROLL_DURATION_MS = 900;

function parsePullRequestUrl() {
    const match = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);

    if (!match) {
        return null;
    }

    return { owner: match[1], repo: match[2], number: match[3] };
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

function delay(duration) {
    return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function getToast() {
    let toast = document.getElementById(TOAST_ID);

    if (!toast) {
        toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.innerHTML =
            '<img class="gh-ra-toast__avatar" alt="" />' +
            '<div class="gh-ra-toast__body">' +
            '<span class="gh-ra-toast__title"></span>' +
            '<span class="gh-ra-toast__detail"></span>' +
            '</div>';
        document.body.appendChild(toast);
    }

    return toast;
}

function showToast({ title, detail, login, isError }) {
    const toast = getToast();
    const avatar = toast.querySelector('.gh-ra-toast__avatar');

    if (login) {
        avatar.src = `https://github.com/${encodeURIComponent(login)}.png?size=80`;
        avatar.hidden = false;
    } else {
        avatar.removeAttribute('src');
        avatar.hidden = true;
    }

    toast.querySelector('.gh-ra-toast__title').textContent = title;

    const detailNode = toast.querySelector('.gh-ra-toast__detail');
    detailNode.textContent = detail || '';
    detailNode.hidden = !detail;

    toast.className = `gh-ra-toast gh-ra-toast--${isError ? 'error' : 'success'} gh-ra-toast--visible`;

    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('gh-ra-toast--visible'), 5000);
}

function startRollAnimation(button, candidates) {
    const label = button.querySelector('.gh-ra-button__label');
    const originalText = label.textContent;
    const names = candidates.length > 0 ? candidates : ['...'];

    button.classList.add('gh-ra-button--rolling');

    let index = Math.floor(Math.random() * names.length);
    label.textContent = `@${names[index]}`;

    const timer = window.setInterval(() => {
        index = (index + 1) % names.length;
        label.textContent = `@${names[index]}`;
    }, ROLL_INTERVAL_MS);

    return (finalLogin) => {
        window.clearInterval(timer);
        button.classList.remove('gh-ra-button--rolling');

        if (finalLogin) {
            label.textContent = `@${finalLogin}`;
            button.classList.add('gh-ra-button--winner');
            return;
        }

        label.textContent = originalText;
    };
}

function formatReviewDetail(review) {
    if (!review) {
        return 'Assigne';
    }

    if (review.requested) {
        return 'Assigne + revue demandee';
    }

    return review.reason ? `Assigne (revue non demandee : ${review.reason})` : 'Assigne';
}

async function onAssignClick(button) {
    const pullRequest = parsePullRequestUrl();

    if (!pullRequest || button.disabled) {
        return;
    }

    button.disabled = true;

    const candidatesResponse = await sendMessage({ type: 'GET_CANDIDATES' });
    const candidates = candidatesResponse.ok ? candidatesResponse.users : [];
    const stopAnimation = startRollAnimation(button, candidates);

    const startedAt = Date.now();
    const response = await sendMessage({ type: 'ASSIGN_RANDOM', payload: pullRequest });
    const remaining = MIN_ROLL_DURATION_MS - (Date.now() - startedAt);

    if (remaining > 0) {
        await delay(remaining);
    }

    if (!response.ok) {
        stopAnimation(null);
        button.disabled = false;
        showToast({ title: 'Echec du tirage', detail: response.error, isError: true });
        return;
    }

    stopAnimation(response.chosen);
    showToast({
        title: `@${response.chosen}`,
        detail: formatReviewDetail(response.review),
        login: response.chosen,
        isError: false
    });

    await delay(1400);
    window.location.reload();
}

function createButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = 'gh-ra-button';
    button.title = 'Assigner cette PR a un utilisateur tire au hasard';
    button.innerHTML =
        '<span class="gh-ra-button__dice">&#127922;</span>' +
        '<span class="gh-ra-button__label">Assigner au hasard</span>';
    button.addEventListener('click', () => onAssignClick(button));
    return button;
}

function findSidebarAnchor() {
    const selectors = [
        '[data-testid="sidebar-section-assignees"]',
        '[data-testid="issue-assignees"]',
        '.js-issue-assignees',
        '#partial-discussion-sidebar .discussion-sidebar-item'
    ];

    for (const selector of selectors) {
        const element = document.querySelector(selector);

        if (element) {
            return element;
        }
    }

    return null;
}

function mountButton() {
    if (!parsePullRequestUrl()) {
        const stale = document.getElementById(BUTTON_ID);

        if (stale) {
            stale.remove();
        }

        return;
    }

    const existing = document.getElementById(BUTTON_ID);

    if (existing && existing.isConnected) {
        return;
    }

    const button = createButton();
    const anchor = findSidebarAnchor();

    if (anchor) {
        const wrapper = document.createElement('div');
        wrapper.className = 'gh-ra-sidebar-slot';
        wrapper.appendChild(button);
        anchor.appendChild(wrapper);
        return;
    }

    button.classList.add('gh-ra-button--floating');
    document.body.appendChild(button);
}

function observePageChanges() {
    const observer = new MutationObserver(() => mountButton());
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('turbo:load', mountButton);
    document.addEventListener('pjax:end', mountButton);
    window.addEventListener('popstate', mountButton);
}

mountButton();
observePageChanges();
