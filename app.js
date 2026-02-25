/* Tri-Lang Translator — app.js */

const $ = (id) => document.getElementById(id);

const LS_GOOGLE = "tri_google_key";
const LS_LIBRE  = "tri_libre_endpoint";

function safeSetText(el, text) { if (el) el.textContent = text || ""; }
function show(el) { if (el) el.classList.remove("hidden"); }
function hide(el) { if (el) el.classList.add("hidden"); }

// ────────────────────────────────────────────────
// Register Service Worker
// ────────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .catch(err => console.warn("Service Worker registration failed:", err));
  });
}

// ────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  // ─── Install prompt ───
  let deferredPrompt = null;
  const installBtn = $("installBtn");

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn?.classList.remove("hidden");
  });

  installBtn?.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt = null;
    installBtn.classList.add("hidden");
  });

  // ─── Network status indicator ───
  const netStatus = $("netStatus");
  const updateNetStatus = () => {
    const online = navigator.onLine;
    safeSetText(netStatus, online ? "Online" : "Offline");
    netStatus?.classList.toggle("online", online);
  };
  window.addEventListener("online", updateNetStatus);
  window.addEventListener("offline", updateNetStatus);
  updateNetStatus();

  // ─── Translation UI elements ───
  const fromLang       = $("fromLang");
  const toLang         = $("toLang");
  const swapBtn        = $("swapBtn");
  const wordInput      = $("wordInput");
  const translateBtn   = $("translateBtn");
  const clearBtn       = $("clearBtn");
  const translationOut = $("translationOut");
  const sourceOut      = $("sourceOut");
  const errorOut       = $("errorOut");
  const copyBtn        = $("copyBtn");

  function showError(msg) {
    if (!errorOut) return;
    errorOut.textContent = msg;
    show(errorOut);
  }

  function clearError() {
    if (!errorOut) return;
    errorOut.textContent = "";
    hide(errorOut);
  }

  function setResult(text = "", source = "") {
    safeSetText(translationOut, text);
    safeSetText(sourceOut, source ? `Source: ${source}` : "Source: —");
    if (copyBtn) copyBtn.disabled = !text.trim();
  }

  // Swap languages
  swapBtn?.addEventListener("click", () => {
    [fromLang.value, toLang.value] = [toLang.value, fromLang.value];
  });

  // Clear input & result
  clearBtn?.addEventListener("click", () => {
    if (wordInput) wordInput.value = "";
    setResult();
    clearError();
  });

  // ─── Settings Modal Logic ─────────────────────────────────────
  const settingsBtn      = $("settingsBtn");
  const settingsModal    = $("settingsModal");
  const closeSettingsBtn = $("closeSettingsBtn");
  const saveSettingsBtn  = $("saveSettingsBtn");
  const cancelSettingsBtn = $("cancelSettingsBtn");
  const googleKeyInput   = $("googleKey");
  const libreInput       = $("libreEndpoint");

  function loadSettings() {
    if (!googleKeyInput || !libreInput) return;
    googleKeyInput.value = localStorage.getItem(LS_GOOGLE) || "";
    libreInput.value = localStorage.getItem(LS_LIBRE) || "https://libretranslate.de";
  }

  function saveSettingsAndClose() {
    if (!googleKeyInput || !libreInput) return;
    localStorage.setItem(LS_GOOGLE, googleKeyInput.value.trim());
    localStorage.setItem(LS_LIBRE, libreInput.value.trim() || "https://libretranslate.de");
    hide(settingsModal);
  }

  function closeModal() {
    hide(settingsModal);
  }

  settingsBtn?.addEventListener("click", () => {
    loadSettings();
    show(settingsModal);
  });

  closeSettingsBtn?.addEventListener("click", closeModal);
  cancelSettingsBtn?.addEventListener("click", closeModal);
  saveSettingsBtn?.addEventListener("click", saveSettingsAndClose);

  // Click outside modal to close
  settingsModal?.addEventListener("click", e => {
    if (e.target === settingsModal) closeModal();
  });

  // ESC key closes modal
  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && !settingsModal?.classList.contains("hidden")) {
      closeModal();
    }
  });

  // ─── Translation Handlers ─────────────────────────────────────
  async function googleTranslate(word, from, to, key) {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: word, source: from, target: to, format: "text" })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Google API error ${res.status}`);
    }

    const data = await res.json();
    return data?.data?.translations?.[0]?.translatedText?.trim() || "";
  }

  async function libreTranslate(word, from, to, endpoint) {
    const base = (endpoint || "https://libretranslate.de").replace(/\/+$/, "");
    const res = await fetch(`${base}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: word, source: from, target: to, format: "text" })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `LibreTranslate error ${res.status}`);
    }

    const data = await res.json();
    return String(data?.translatedText ?? "").trim();
  }

  translateBtn?.addEventListener("click", async () => {
    clearError();

    const word = (wordInput?.value || "").trim().split(/\s+/)[0];
    if (!word) return showError("Please enter a word.");

    const from = fromLang?.value;
    const to   = toLang?.value;

    if (!from || !to) return showError("Select both languages.");
    if (from === to) return showError("Choose different languages.");

    setResult("…", "Translating…");

    const googleKey = (localStorage.getItem(LS_GOOGLE) || "").trim();
    const libreUrl  = localStorage.getItem(LS_LIBRE) || "https://libretranslate.de";

    try {
      let result, source;

      if (googleKey) {
        result = await googleTranslate(word, from, to, googleKey);
        source = "Google Translate";
      } else {
        result = await libreTranslate(word, from, to, libreUrl);
        source = "LibreTranslate";
      }

      setResult(result, source);
    } catch (err) {
      setResult("", "");
      showError(err.message || "Translation failed. Check API key / endpoint.");
    }
  });

  // Copy translation to clipboard
  copyBtn?.addEventListener("click", async () => {
    const text = translationOut?.textContent?.trim();
    if (!text || text === "—") return;

    try {
      await navigator.clipboard.writeText(text);
      // You could add visual feedback here (e.g. button text → "Copied!")
    } catch (err) {
      console.warn("Copy failed:", err);
    }
  });

  // Initial UI state
  setResult();
});