const JenkinsTools = (() => {
    const JENKINS_ORIGIN = 'https://ci-jenkins.orbis.dedalus.com';
    const CONTEXT = 'continuous-integration/jenkins/pr-merge';
    const CACHE_KEY = 'jenkinsBuildCache';
    const CACHE_LIMIT = 100;
    const inFlight = new Map();
    let cacheWrites = Promise.resolve();

    async function request(url, { token, body } = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                credentials: 'omit',
                ...(token ? {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                } : {})
            });
            if (!response.ok) {
                throw new Error(`${new URL(url).hostname} : HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            if (controller.signal.aborted) {
                throw new Error(`${new URL(url).hostname} : delai de 15 secondes depasse.`);
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    function jenkinsUrl(path) {
        const url = new URL(path, JENKINS_ORIGIN);
        if (url.origin !== JENKINS_ORIGIN || !url.pathname.startsWith('/job/') || url.username || url.password) {
            throw new Error('URL Jenkins non autorisee.');
        }
        return url.href;
    }

    function buildPath(targetUrl) {
        const url = new URL(jenkinsUrl(targetUrl));
        const path = url.pathname.replace(/\/display\/redirect\/?$/, '').replace(/\/$/, '');
        if (!/\/\d+$/.test(path)) {
            throw new Error('Le statut Jenkins ne pointe pas vers un build numerote.');
        }
        return path;
    }

    async function githubStatuses({ owner, repo, numbers }) {
        if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo) ||
            !Array.isArray(numbers) || numbers.length > 100 ||
            !numbers.every((number) => Number.isSafeInteger(number) && number > 0)) {
            throw new Error('Parametres de pull request invalides.');
        }
        const settings = await getSettings();
        if (!settings.showJenkins ||
            !settings.jenkinsRepositories.some((entry) => entry.toLowerCase() === `${owner}/${repo}`.toLowerCase())) {
            return [];
        }
        requireToken(settings);
        if (!numbers.length) {
            return [];
        }
        const selections = [...new Set(numbers)].map((number) => `
            pr${number}: pullRequest(number: ${number}) {
                number state
                labels(first: 100) { nodes { name } }
                commits(last: 1) { nodes { commit {
                    status { contexts { context state targetUrl } }
                } } }
            }`).join('\n');
        const query = {
            query: `query($owner: String!, $repo: String!) {
                repository(owner: $owner, name: $repo) { ${selections} }
            }`,
            variables: { owner, repo }
        };
        const response = await request('https://api.github.com/graphql', { token: settings.token, body: query });
        if (response.errors?.length) {
            throw new Error(response.errors.map((error) => error.message).join('; '));
        }
        if (!response.data?.repository) {
            throw new Error('Depot GitHub inaccessible.');
        }
        return Object.values(response.data.repository).filter(Boolean).map((pr) => {
            const context = pr.commits.nodes[0]?.commit.status?.contexts.find((item) => item.context === CONTEXT);
            const labels = new Set(pr.labels.nodes.map((label) => label.name));
            const eligible = pr.state === 'OPEN' &&
                settings.jenkinsLabels.every((label) => labels.has(label)) &&
                ['ERROR', 'FAILURE'].includes(context?.state);
            return { number: pr.number, eligible, targetUrl: eligible ? context.targetUrl : null };
        });
    }

    async function cached(key, load, finished) {
        if (inFlight.has(key)) {
            return inFlight.get(key);
        }
        const promise = (async () => {
            const stored = await chrome.storage.local.get({ [CACHE_KEY]: {} });
            if (Object.hasOwn(stored[CACHE_KEY], key)) {
                return stored[CACHE_KEY][key];
            }
            const result = await load();
            if (finished(result)) {
                const save = async () => {
                    const latest = await chrome.storage.local.get({ [CACHE_KEY]: {} });
                    const entries = Object.entries(latest[CACHE_KEY]);
                    entries.push([key, result]);
                    await chrome.storage.local.set({
                        [CACHE_KEY]: Object.fromEntries(entries.slice(-CACHE_LIMIT))
                    });
                };
                cacheWrites = cacheWrites.then(save, save);
                await cacheWrites;
            }
            return result;
        })();
        inFlight.set(key, promise);
        try {
            return await promise;
        } finally {
            inFlight.delete(key);
        }
    }

    function terminal(build) {
        return ['SUCCESS', 'FAILED', 'ABORTED', 'UNSTABLE', 'FAILURE'].includes(build.status);
    }

    async function summary(path) {
        return cached(`summary:${path}`, async () => {
            const build = await request(jenkinsUrl(`${path}/wfapi/describe`));
            const stages = (build.stages || []).map((stage) => ({
                name: stage.name,
                status: stage.status,
                durationMillis: stage.durationMillis,
                describePath: stage._links?.self?.href
            }));
            const failedStage = stages.find((stage) => ['FAILED', 'ABORTED'].includes(stage.status)) ||
                stages.find((stage) => stage.status === 'UNSTABLE') || null;
            return { status: build.status, stages, failedStage, buildUrl: jenkinsUrl(path) };
        }, terminal);
    }

    async function statuses(payload) {
        const statuses = await githubStatuses(payload);
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(3, statuses.length) }, async () => {
            while (cursor < statuses.length) {
                const status = statuses[cursor++];
                if (!status.eligible) {
                    continue;
                }
                try {
                    const path = buildPath(status.targetUrl);
                    const build = await summary(path);
                    if (!terminal(build) || build.status === 'SUCCESS') {
                        status.eligible = false;
                        continue;
                    }
                    status.stage = build.failedStage?.name || 'Build en echec';
                    status.buildUrl = build.buildUrl;
                } catch (error) {
                    status.error = error.message;
                }
            }
        }));
        return statuses;
    }

    function stripHtml(text) {
        return text.replace(/<span style="display: none">[\s\S]*?<\/span>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
            .replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
            .split('\n').slice(-60).join('\n').trim();
    }

    async function detail({ owner, repo, number }) {
        // Re-check on every click: a badge from a previous render is not authority to call Jenkins.
        const [status] = await githubStatuses({ owner, repo, numbers: [number] });
        if (!status?.eligible) {
            return null;
        }
        const path = buildPath(status.targetUrl);
        const build = await summary(path);
        if (!terminal(build) || build.status === 'SUCCESS') {
            return null;
        }
        if (!build.failedStage?.describePath) {
            return { ...build, log: null };
        }
        const log = await cached(`log:${path}`, async () => {
            const stage = await request(jenkinsUrl(build.failedStage.describePath));
            const step = (stage.stageFlowNodes || []).find((node) =>
                ['FAILED', 'ABORTED', 'UNSTABLE'].includes(node.status));
            const href = step?._links?.log?.href;
            if (!href) {
                return null;
            }
            const output = await request(jenkinsUrl(href));
            return { name: step.name, text: stripHtml(output.text || '') };
        }, () => terminal(build));
        return { ...build, log };
    }

    return { statuses, detail };
})();
