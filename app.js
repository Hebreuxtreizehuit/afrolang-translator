// app.js (safe version)

// ---------- PWA: service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      // For GitHub Pages, ./sw.js is correct when sw.js is in the same folder as index.html
      await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    } catch (e) {
      console.warn("SW register failed:", e);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // ---------- PWA: Install button ----------
  let deferredPrompt = null;
  const installBtn = document.getElementById("installBtn");

  if (installBtn) {
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
  }

  // ---------- UI helpers ----------
  const netStatus = document.getElementById("netStatus");
  function updateOnlineStatus() {
    if (!netStatus) return;
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
  closeSettingsBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  settingsModal.classList.add("hidden");
});

saveSettingsBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  saveSettings();
  settingsModal.classList.add("hidden");
});

  const googleKey = document.getElementById("googleKey");
  const libreEndpoint = document.getElementById("libreEndpoint");

  // ---------- Helpers ----------
  function showError(msg) {
    if (!errorOut) return;
    errorOut.textContent = msg;
    errorOut.classList.remove("hidden");
  }
  function clearError() {
    if (!errorOut) return;
    errorOut.textContent = "";
    errorOut.classList.add("hidden");
  }

  function setResult(text, source) {
    if (translationOut) translationOut.textContent = text || "—";
    if (sourceOut) sourceOut.textContent = `Source: ${source || "—"}`;
    if (copyBtn) copyBtn.disabled = !text || text === "—";
  }

  // ---------- Swap / Clear ----------
  if (swapBtn && fromLang && toLang) {
    swapBtn.addEventListener("click", () => {
      const a = fromLang.value;
      fromLang.value = toLang.value;
      toLang.value = a;
    });
  }

  if (clearBtn && wordInput) {
    clearBtn.addEventListener("click", () => {
      wordInput.value = "";
      setResult("", "");
      clearError();
    });
  }

  // ---------- Settings storage ----------
  const LS_GOOGLE = "tri_google_key";
  const LS_LIBRE = "tri_libre_endpoint";

  function loadSettings() {
    try {
      if (googleKey) googleKey.value = localStorage.getItem(LS_GOOGLE) || "";
      if (libreEndpoint) libreEndpoint.value = localStorage.getItem(LS_LIBRE) || "https://libretranslate.de";
    } catch (e) {
      console.warn("localStorage blocked:", e);
    }
  }

  function saveSettings() {
    try {
      if (googleKey) localStorage.setItem(LS_GOOGLE, googleKey.value.trim());
      if (libreEndpoint) {
        localStorage.setItem(
          LS_LIBRE,
          libreEndpoint.value.trim() || "https://libretranslate.de"
        );
      }
    } catch (e) {
      console.warn("localStorage blocked:", e);
    }
  }

  function openSettings() {
    loadSettings();
    if (settingsModal) settingsModal.classList.remove("hidden");
  }

  function closeSettings() {
    if (settingsModal) settingsModal.classList.add("hidden");
  }

  if (settingsBtn) settingsBtn.addEventListener("click", openSettings);
  if (closeSettingsBtn) closeSettingsBtn.addEventListener("click", closeSettings);

  // click outside closes
  if (settingsModal) {
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) closeSettings();
    });
  }

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSettings();
  });

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", () => {
      saveSettings();
      closeSettings();
    });
  }

  // ---------- Translation functions ----------
  async function googleTranslate(word, from, to, apiKey) {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;
    const body = { q: word, source: from, target: to, format: "text" };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Google Translate failed (${res.status})`);

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
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `LibreTranslate failed (${res.status})`);

    const translated = data?.translatedText;
    if (!translated) throw new Error("LibreTranslate returned no text.");
    return translated;
  }

  // ---------- Translate click ----------
  if (translateBtn) {
    translateBtn.addEventListener("click", async () => {
      clearError();

      const word = (wordInput?.value || "").trim().split(/\s+/)[0] || "";
      if (!word) return showError("Please enter a word.");

      const from = fromLang?.value || "";
      const to = toLang?.value || "";
      if (!from || !to) return showError("Languages are missing.");
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
  }

  // ---------- Copy ----------
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const t = translationOut?.textContent || "";
      if (!t || t === "—") return;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(t);
        }
      } catch {
        // ignore
      }
    });
  }
});