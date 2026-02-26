"use strict";

// Helpers
const $ = (id) => document.getElementById(id);

// LocalStorage keys
const LS_GOOGLE = "tri_google_key";
const LS_LIBRE = "tri_libre_endpoint";

document.addEventListener("DOMContentLoaded", () => {
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
  const installBtn = $("installBtn");

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

  // ---------- Online status ----------
  const netStatus = $("netStatus");
  const updateOnlineStatus = () => {
    if (!netStatus) return;
    const online = navigator.onLine;
    netStatus.textContent = online ? "Online" : "Offline";
    netStatus.classList.toggle("online", online);
  };
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  updateOnlineStatus();

  // ---------- Elements ----------
  const fromLang = $("fromLang");
  const toLang = $("toLang");
  const swapBtn = $("swapBtn");
  const wordInput = $("wordInput");
  const translateBtn = $("translateBtn");
  const clearBtn = $("clearBtn");
  const translationOut = $("translationOut");
  const sourceOut = $("sourceOut");
  const errorOut = $("errorOut");
  const copyBtn = $("copyBtn");

  // Settings modal
  const settingsBtn = $("settingsBtn");
  const settingsModal = $("settingsModal");
  const closeSettingsBtn = $("closeSettingsBtn");
  const saveSettingsBtn = $("saveSettingsBtn");
  const googleKey = $("googleKey");
  const libreEndpoint = $("libreEndpoint");

  // ---------- UI helpers ----------
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
    if (copyBtn) copyBtn.disabled = !text;
  }

  // ---------- Swap/Clear ----------
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
      wordInput.focus();
    });
  }

  // ---------- Settings storage ----------
  function loadSettings() {
    if (googleKey) googleKey.value = localStorage.getItem(LS_GOOGLE) || "";
    if (libreEndpoint) libreEndpoint.value = localStorage.getItem(LS_LIBRE) || "https://libretranslate.de";
  }
  function saveSettings() {
    const g = (googleKey?.value || "").trim();
    const le = (libreEndpoint?.value || "").trim() || "https://libretranslate.de";
    localStorage.setItem(LS_GOOGLE, g);
    localStorage.setItem(LS_LIBRE, le);
  }

  function openModal() {
    if (!settingsModal) return;
    loadSettings();
    settingsModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    // Focus first input so user can type immediately
    setTimeout(() => googleKey?.focus(), 0);
  }

  function closeModal() {
    if (!settingsModal) return;
    settingsModal.classList.add("hidden");
    document.body.classList.remove("no-scroll");
    // Return focus to word input
    setTimeout(() => wordInput?.focus(), 0);
  }

  if (settingsBtn) settingsBtn.addEventListener("click", openModal);
  if (closeSettingsBtn) closeSettingsBtn.addEventListener("click", closeModal);

  // Click outside modal card closes it
  if (settingsModal) {
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) closeModal();
    });
  }

  // ESC closes modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && settingsModal && !settingsModal.classList.contains("hidden")) {
      closeModal();
    }
  });

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", () => {
      saveSettings();
      closeModal();
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
    if (!res.ok) {
      throw new Error(data?.error?.message || `Google Translate failed (${res.status})`);
    }

    const translated = data?.data?.translations?.[0]?.translatedText;
    if (!translated) throw new Error("Google Translate returned no text.");
    return translated;
  }

  async function libreTranslate(word, from, to, endpoint) {
    const clean = (endpoint || "").replace(/\/+$/, "");
    const url = `${clean}/translate`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: word, source: from, target: to, format: "text" }),
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`LibreTranslate failed (${res.status})`);
    const data = await res.json().catch(() => ({}));
    const translated = data?.translatedText;
    if (!translated) throw new Error("LibreTranslate returned no text.");
    return translated;
  }

  // ---------- Translate ----------
  if (translateBtn && wordInput && fromLang && toLang) {
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
  }

  // Enter key triggers translate
  if (wordInput && translateBtn) {
    wordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") translateBtn.click();
    });
  }

  // ---------- Copy ----------
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const t = translationOut?.textContent || "";
      if (!t || t === "—") return;
      try {
        await navigator.clipboard.writeText(t);
      } catch {
        // ignore
      }
    });
  }
});