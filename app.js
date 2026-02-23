// ---------- PWA: service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (e) {
      console.warn("SW register failed:", e);
    }
  });
}

// ---------- PWA: Install button ----------
let deferredPrompt = null;
const installBtn = document.getElementById("installBtn");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.classList.remove("hidden");
});

installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.add("hidden");
});

// ---------- UI helpers ----------
const netStatus = document.getElementById("netStatus");
function updateOnlineStatus() {
  const online = navigator.onLine;
  netStatus.textContent = online ? "Online" : "Offline";
  netStatus.classList.toggle("online", online);
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
updateOnlineStatus();

// ---------- Elements ----------
const fromLang = document.getElementById("fromLang");
const toLang = document.getElementById("toLang");
const swapBtn = document.getElementById("swapBtn");
const wordInput = document.getElementById("wordInput");

const translateBtn = document.getElementById("translateBtn");
const clearBtn = document.getElementById("clearBtn");
const translationOut = document.getElementById("translationOut");
const sourceOut = document.getElementById("sourceOut");
const errorOut = document.getElementById("errorOut");
const copyBtn = document.getElementById("copyBtn");

// Settings modal
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const googleKey = document.getElementById("googleKey");
const libreEndpoint = document.getElementById("libreEndpoint");

function showError(msg) {
  errorOut.textContent = msg;
  errorOut.classList.remove("hidden");
}
function clearError() {
  errorOut.textContent = "";
  errorOut.classList.add("hidden");
}

function setResult(text, source) {
  translationOut.textContent = text || "—";
  sourceOut.textContent = `Source: ${source || "—"}`;
  copyBtn.disabled = !text;
}

swapBtn.addEventListener("click", () => {
  const a = fromLang.value;
  fromLang.value = toLang.value;
  toLang.value = a;
});

clearBtn.addEventListener("click", () => {
  wordInput.value = "";
  setResult("", "");
  clearError();
});

// ---------- Settings storage ----------
const LS_GOOGLE = "tri_google_key";
const LS_LIBRE = "tri_libre_endpoint";

function loadSettings() {
  googleKey.value = localStorage.getItem(LS_GOOGLE) || "";
  libreEndpoint.value = localStorage.getItem(LS_LIBRE) || "https://libretranslate.de";
}
function saveSettings() {
  localStorage.setItem(LS_GOOGLE, googleKey.value.trim());
  localStorage.setItem(LS_LIBRE, libreEndpoint.value.trim() || "https://libretranslate.de");
}

settingsBtn.addEventListener("click", () => {
  loadSettings();
  settingsModal.classList.remove("hidden");
});
closeSettingsBtn.addEventListener("click", () => {
  settingsModal.classList.add("hidden");
});
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) settingsModal.classList.add("hidden");
});
saveSettingsBtn.addEventListener("click", () => {
  saveSettings();
  settingsModal.classList.add("hidden");
});

// ---------- Translation functions ----------
async function googleTranslate(word, from, to, apiKey) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;
  const body = { q: word, source: from, target: to, format: "text" };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Google Translate failed (${res.status})`);
  }
  const translated = data?.data?.translations?.[0]?.translatedText;
  if (!translated) throw new Error("Google Translate returned no text.");
  return translated;
}

async function libreTranslate(word, from, to, endpoint) {
  const clean = endpoint.replace(/\/+$/, "");
  const url = `${clean}/translate`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: word, source: from, target: to, format: "text" }),
    cache: "no-store"
  });

  if (!res.ok) throw new Error(`LibreTranslate failed (${res.status})`);
  const data = await res.json().catch(() => ({}));
  const translated = data?.translatedText;
  if (!translated) throw new Error("LibreTranslate returned no text.");
  return translated;
}

translateBtn.addEventListener("click", async () => {
  clearError();

  const word = (wordInput.value || "").trim().split(/\s+/)[0] || "";
  if (!word) return showError("Please enter a word.");

  const from = fromLang.value;
  const to = toLang.value;
  if (from === to) return showError("Choose two different languages.");

  setResult("…", "Working");

  const apiKey = (localStorage.getItem(LS_GOOGLE) || "").trim();
  const endpoint = (localStorage.getItem(LS_LIBRE) || "https://libretranslate.de").trim();

  try {
    let translated, source;
    if (apiKey) {
      translated = await googleTranslate(word, from, to, apiKey);
      source = "Google Translate API";
    } else {
      translated = await libreTranslate(word, from, to, endpoint);
      source = `LibreTranslate (${endpoint})`;
    }

    setResult(translated, source);
  } catch (e) {
    setResult("", "");
    showError(e?.message || "Translation failed.");
  }
});

copyBtn.addEventListener("click", async () => {
  const t = translationOut.textContent;
  if (!t || t === "—") return;
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    // ignore
  }
});