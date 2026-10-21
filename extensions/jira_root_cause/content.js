// jira_root_cause — bloc de tags au-dessus de « Étiquettes » (Jira Cloud)
(() => {
  'use strict';

  // ---- Configuration ------------------------------------------------------
  const TAGS = [
    'code',
    'spec_notdefined',
    'spec_ambiguity',
    'regression',
    'design',
    'integration',
    'dependency',
    'not-a-bug',
    'not_reproduced',
  ];
  const MAX_SELECTED = 2;
  const TITLE = 'Root cause';
  const PREFIX = 'rc_'; // préfixe ajouté à l'étiquette Jira
  const RETRIES = 3; // nouvelles tentatives sur 429 / 5xx
  const LABELS_FIELD = '[data-testid="issue.views.issue-base.context.labels"]';
  // -------------------------------------------------------------------------

  const ROOT_CLASS = 'jqt';
  const labelFor = (tag) => PREFIX + tag;
  let state = { key: null, labels: [], busy: false, loading: false };

  /** Clé du ticket affiché : /browse/KEY ou ?selectedIssue=KEY */
  function currentIssueKey() {
    const m = location.pathname.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/i);
    if (m) return m[1].toUpperCase();
    const sel = new URLSearchParams(location.search).get('selectedIssue');
    return sel ? sel.toUpperCase() : null;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function api(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Atlassian-Token': 'no-check',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const retryable = res.status === 429 || res.status >= 500;
      if (res.ok || !retryable || attempt >= RETRIES) {
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}${txt ? ' – ' + txt.slice(0, 120) : ''}`);
        }
        return res.status === 204 ? null : res.json();
      }
      await sleep(600 * 2 ** attempt); // 0,6 s → 1,2 s → 2,4 s
    }
  }

  const fetchLabels = async (key) =>
    (await api('GET', `/rest/api/3/issue/${encodeURIComponent(key)}?fields=labels`)).fields.labels || [];

  const updateLabel = (key, op, label) =>
    api('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}`, {
      update: { labels: [{ [op]: label }] },
    });

  // ---- Rendu --------------------------------------------------------------
  function render(root) {
    const active = TAGS.filter((t) => state.labels.includes(labelFor(t)));
    const full = active.length >= MAX_SELECTED;
    root.classList.toggle(`${ROOT_CLASS}--busy`, state.busy);
    root.querySelector('.jqt__title').textContent = `${TITLE} (${active.length}/${MAX_SELECTED})`;
    for (const btn of root.querySelectorAll('.jqt__tag')) {
      const on = state.labels.includes(labelFor(btn.dataset.tag));
      btn.classList.toggle('jqt__tag--active', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.disabled = state.busy || state.loading || (!on && full);
      btn.title = !on && full ? `Maximum ${MAX_SELECTED}` : '';
    }
  }

  function setMsg(root, text, isError = false) {
    const el = root.querySelector('.jqt__msg');
    el.textContent = text;
    el.classList.toggle('jqt__msg--error', isError);
  }

  function build() {
    const root = document.createElement('div');
    root.className = ROOT_CLASS;
    root.innerHTML = '<div class="jqt__title"></div><div class="jqt__list"></div><div class="jqt__msg"></div>';
    const list = root.querySelector('.jqt__list');
    for (const tag of TAGS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'jqt__tag';
      b.dataset.tag = tag;
      b.textContent = tag;
      b.addEventListener('click', () => onToggle(root, tag));
      list.appendChild(b);
    }
    return root;
  }

  // ---- Actions ------------------------------------------------------------
  async function onToggle(root, tag) {
    if (state.busy || !state.key) return;
    const key = state.key;
    const label = labelFor(tag);
    const wasOn = state.labels.includes(label);
    const prev = state.labels.slice();

    // mise à jour optimiste
    state.labels = wasOn ? prev.filter((l) => l !== label) : [...prev, label];
    state.busy = true;
    setMsg(root, 'Enregistrement…');
    render(root);

    try {
      await updateLabel(key, wasOn ? 'remove' : 'add', label);
      setMsg(root, 'Enregistré — actualisation…');
      refreshJiraView();
    } catch (e) {
      state.labels = prev; // rollback
      setMsg(root, `Échec : ${e.message}`, true);
      console.error('[jira_root_cause]', e);
    } finally {
      state.busy = false;
      render(root);
    }
  }

  /**
   * Jira ne sait pas que les labels ont changé (on passe par l'API REST),
   * donc on recharge pour que le champ « Étiquettes » natif soit à jour.
   */
  function refreshJiraView() {
    setTimeout(() => location.reload(), 250);
  }

  async function load(root, key) {
    state = { key, labels: [], busy: false, loading: true };
    setMsg(root, 'Chargement…');
    render(root);
    try {
      const labels = await fetchLabels(key);
      if (state.key !== key) return; // ticket changé entre-temps
      state.labels = labels;
      setMsg(root, '');
    } catch (e) {
      setMsg(root, `Impossible de lire les étiquettes : ${e.message}`, true);
    } finally {
      if (state.key === key) {
        state.loading = false;
        render(root);
      }
    }
  }

  // ---- Injection (Jira est une SPA : on observe le DOM) -------------------
  function ensureInjected() {
    const key = currentIssueKey();
    const anchor = document.querySelector(LABELS_FIELD);
    let root = document.querySelector(`.${ROOT_CLASS}`);

    if (!key || !anchor) {
      if (root && !anchor) root.remove();
      return;
    }
    if (!root || root.nextElementSibling !== anchor) {
      root?.remove();
      root = build();
      anchor.parentElement.insertBefore(root, anchor);
      load(root, key);
    } else if (root.dataset.key !== key) {
      load(root, key);
    }
    root.dataset.key = key;
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensureInjected();
    });
  };

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  ensureInjected();
})();
