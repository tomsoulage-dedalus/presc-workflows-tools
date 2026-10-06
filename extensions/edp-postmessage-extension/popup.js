async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    throw new Error("Aucun onglet actif trouvé.");
  }
  return tab.id;
}

function buildMessage(type, contentObjOrNull) {
  const content = contentObjOrNull === null ? "" : JSON.stringify(contentObjOrNull);
  return JSON.stringify({ type, content });
}

async function sendPostMessage(type, contentObjOrNull) {
  const message = buildMessage(type, contentObjOrNull);
  const tabId = await getActiveTabId();

  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (msg) => {
      window.postMessage(msg, "*");
    },
    args: [message]
  });

  return message;
}

function showStatus(text, isError) {
  const statusEl = document.getElementById("status");
  statusEl.textContent = text;
  statusEl.classList.toggle("error", !!isError);
}

async function handleAction(type, contentObjOrNull) {
  try {
    const message = await sendPostMessage(type, contentObjOrNull);
    showStatus(`Envoyé : ${message}`, false);
  } catch (error) {
    showStatus(`Erreur : ${error.message}`, true);
  }
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseOptionalDate(value) {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }
  return value.trim();
}

function localIsoNow() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

for (const button of document.querySelectorAll("button[data-now-target]")) {
  button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.nowTarget);
    target.value = localIsoNow();
    // Réutilise le listener de cache branché sur l'input.
    target.dispatchEvent(new Event("input"));
  });
}

document.getElementById("btnAdd").addEventListener("click", () => {
  const productId = parseOptionalNumber(document.getElementById("addProductId").value);
  const type = document.getElementById("addType").value;
  const date = parseOptionalDate(document.getElementById("addDate").value);

  if (productId === null) {
    handleAction("orme.drug.add", null);
    return;
  }

  handleAction("orme.drug.add", { productId, type, date });
});

document.getElementById("btnDelete").addEventListener("click", () => {
  const productId = parseOptionalNumber(document.getElementById("deleteProductId").value);
  const type = document.getElementById("deleteType").value;

  if (productId === null) {
    showStatus("Product ID requis pour delete.", true);
    return;
  }

  handleAction("orme.drug.delete", { productId, type, date: null });
});

document.getElementById("btnStop").addEventListener("click", () => {
  const stopDate = document.getElementById("stopDate").value.trim();
  const rawIds = document.getElementById("stopLineIds").value.trim();

  if (!stopDate || !rawIds) {
    showStatus("Stop date et prescription line IDs requis.", true);
    return;
  }

  const prescriptionLineIds = rawIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .map((id) => Number(id));

  handleAction("orme.prescription_line.stop", { stopDate, prescriptionLineIds });
});

document.getElementById("btnSign").addEventListener("click", () => {
  handleAction("orme.sign", undefined);
});

document.getElementById("btnSignOnBehalf").addEventListener("click", () => {
  handleAction("orme.sign_on_behalf", undefined);
});

document.getElementById("btnSave").addEventListener("click", () => {
  handleAction("orme.save", undefined);
});

document.getElementById("btnCancel").addEventListener("click", () => {
  handleAction("orme.cancel", undefined);
});

// ===================================================================================================
//                          Cache des champs (par onglet, durée de session)
// ===================================================================================================

const CACHED_FIELD_IDS = [
  "addProductId",
  "addType",
  "addDate",
  "deleteProductId",
  "deleteType",
  "stopDate",
  "stopLineIds"
];

async function getCacheKey() {
  const tabId = await getActiveTabId();
  return `form:${tabId}`;
}

async function saveFields() {
  const values = {};
  for (const id of CACHED_FIELD_IDS) {
    values[id] = document.getElementById(id).value;
  }
  const key = await getCacheKey();
  await chrome.storage.session.set({ [key]: values });
}

async function restoreFields() {
  const key = await getCacheKey();
  const stored = await chrome.storage.session.get(key);
  const values = stored[key];
  if (!values) {
    return;
  }
  for (const id of CACHED_FIELD_IDS) {
    if (typeof values[id] === "string") {
      document.getElementById(id).value = values[id];
    }
  }
}

for (const fieldId of CACHED_FIELD_IDS) {
  const fieldEl = document.getElementById(fieldId);
  const persist = () => {
    saveFields().catch(() => {
      // cache best-effort : une erreur ne doit pas bloquer l'usage du popup
    });
  };
  fieldEl.addEventListener("input", persist);
  fieldEl.addEventListener("change", persist);
}

restoreFields().catch(() => {
  // pas de cache exploitable : les champs restent vides
});

// Le cache d'un onglet fermé n'a plus de raison d'être.
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`form:${tabId}`);
});

