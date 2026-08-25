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
