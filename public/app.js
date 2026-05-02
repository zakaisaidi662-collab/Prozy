/**
 * KAIBLA - Main Application
 * Handles tabs, navigation, bookmarks, settings, and proxy integration.
 */
"use strict";

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
const state = {
    tabs: [],
    activeTabId: null,
    nextTabId: 1,
    settings: {
        searchEngine: "https://www.google.com/search?q=%s",
        theme: "dark",
        bookmarksBar: "show"
    },
    bookmarks: [],
    history: []
};

// BareMux connection for transport setup
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

// Default shortcuts for the home page
const DEFAULT_SHORTCUTS = [
    { name: "Google", url: "https://www.google.com", icon: "🔍" },
    { name: "YouTube", url: "https://www.youtube.com", icon: "▶️" },
    { name: "Wikipedia", url: "https://www.wikipedia.org", icon: "📚" },
    { name: "Reddit", url: "https://www.reddit.com", icon: "🗨️" },
    { name: "GitHub", url: "https://github.com", icon: "💻" },
    { name: "Twitter", url: "https://x.com", icon: "🐦" }
];

// ═══════════════════════════════════════════════════
// DOM REFERENCES
// ═══════════════════════════════════════════════════
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    tabList: $("#tab-list"),
    btnNewTab: $("#btn-new-tab"),
    btnBack: $("#btn-back"),
    btnForward: $("#btn-forward"),
    btnReload: $("#btn-reload"),
    urlForm: $("#url-form"),
    urlInput: $("#url-input"),
    loadingIndicator: $("#loading-indicator"),
    btnBookmark: $("#btn-bookmark"),
    btnSettings: $("#btn-settings"),
    bookmarksBar: $("#bookmarks-bar"),
    bookmarksList: $("#bookmarks-list"),
    settingsOverlay: $("#settings-overlay"),
    settingsPanel: $("#settings-panel"),
    btnCloseSettings: $("#btn-close-settings"),
    settingSearchEngine: $("#setting-search-engine"),
    settingTheme: $("#setting-theme"),
    settingBookmarksBar: $("#setting-bookmarks-bar"),
    btnClearHistory: $("#btn-clear-history"),
    btnClearBookmarks: $("#btn-clear-bookmarks"),
    btnClearAll: $("#btn-clear-all"),
    viewport: $("#viewport"),
    homePage: $("#home-page"),
    errorPage: $("#error-page"),
    errorMessage: $("#error-message"),
    btnErrorRetry: $("#btn-error-retry"),
    homeSearchForm: $("#home-search-form"),
    homeSearchInput: $("#home-search-input"),
    homeShortcuts: $("#home-shortcuts"),
    homeHistoryList: $("#home-history-list")
};

// ═══════════════════════════════════════════════════
// PERSISTENCE (localStorage)
// ═══════════════════════════════════════════════════
function saveState() {
    const tabData = state.tabs.map(t => ({
        id: t.id, title: t.title, url: t.url, favicon: t.favicon
    }));
    localStorage.setItem("nebula_tabs", JSON.stringify(tabData));
    localStorage.setItem("nebula_activeTab", state.activeTabId);
    localStorage.setItem("nebula_settings", JSON.stringify(state.settings));
    localStorage.setItem("nebula_bookmarks", JSON.stringify(state.bookmarks));
    localStorage.setItem("nebula_history", JSON.stringify(state.history.slice(0, 100)));
}

function loadState() {
    try {
        const s = localStorage.getItem("nebula_settings");
        if (s) Object.assign(state.settings, JSON.parse(s));
        const b = localStorage.getItem("nebula_bookmarks");
        if (b) state.bookmarks = JSON.parse(b);
        const h = localStorage.getItem("nebula_history");
        if (h) state.history = JSON.parse(h);
    } catch (e) { console.warn("Failed to load state:", e); }
}

// ═══════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    state.settings.theme = theme;
}

// ═══════════════════════════════════════════════════
// FAVICON HELPER
// ═══════════════════════════════════════════════════
function getFaviconUrl(url) {
    try {
        const u = new URL(url);
        return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
    } catch { return null; }
}

// ═══════════════════════════════════════════════════
// TAB MANAGEMENT
// ═══════════════════════════════════════════════════
function createTab(url = null, switchTo = true) {
    const id = state.nextTabId++;
    const tab = { id, title: "New Tab", url: url || null, favicon: null, loading: false, iframe: null };

    // Create iframe for this tab
    const iframe = document.createElement("iframe");
    iframe.id = `frame-${id}`;
    iframe.setAttribute("sandbox", "allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads");
    iframe.setAttribute("allow", "fullscreen; autoplay; clipboard-write");
    dom.viewport.appendChild(iframe);
    tab.iframe = iframe;

    // Listen for iframe load events
    iframe.addEventListener("load", () => {
        tab.loading = false;
        renderTabBar();
        updateLoadingIndicator();
    });

    iframe.addEventListener("error", () => {
        tab.loading = false;
        renderTabBar();
        updateLoadingIndicator();
    });

    state.tabs.push(tab);

    if (url) {
        navigateTab(id, url);
    }

    if (switchTo) {
        switchTab(id);
    }

    renderTabBar();
    saveState();
    return id;
}

function closeTab(id) {
    const idx = state.tabs.findIndex(t => t.id === id);
    if (idx === -1) return;

    const tab = state.tabs[idx];
    if (tab.iframe) tab.iframe.remove();
    state.tabs.splice(idx, 1);

    if (state.tabs.length === 0) {
        createTab();
        return;
    }

    if (state.activeTabId === id) {
        const newIdx = Math.min(idx, state.tabs.length - 1);
        switchTab(state.tabs[newIdx].id);
    }

    renderTabBar();
    saveState();
}

function switchTab(id) {
    state.activeTabId = id;
    const tab = getActiveTab();

    // Hide all iframes, show active
    state.tabs.forEach(t => {
        if (t.iframe) t.iframe.classList.toggle("active", t.id === id);
    });

    // Show/hide home page
    const showHome = tab && !tab.url;
    dom.homePage.classList.toggle("active", showHome);
    dom.errorPage.classList.remove("active");

    // Update URL bar
    if (tab) {
        dom.urlInput.value = tab.url || "";
        updateBookmarkButton();
    }

    if (showHome) {
        renderHomePage();
    }

    updateLoadingIndicator();
    renderTabBar();
    saveState();
}

function getActiveTab() {
    return state.tabs.find(t => t.id === state.activeTabId) || null;
}

async function navigateTab(tabId, rawUrl) {
    const tab = state.tabs.find(t => t.id === tabId);
    if (!tab) return;

    const url = search(rawUrl, state.settings.searchEngine);
    tab.url = url;
    tab.loading = true;
    tab.favicon = getFaviconUrl(url);

    try { tab.title = new URL(url).hostname; } catch { tab.title = url; }

    // Update UI immediately
    if (tab.id === state.activeTabId) {
        dom.urlInput.value = url;
        dom.homePage.classList.remove("active");
        dom.errorPage.classList.remove("active");
        updateBookmarkButton();
    }
    renderTabBar();
    updateLoadingIndicator();

    try {
        // Register service worker
        await registerSW();

        // Setup transport
        const wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
        if ((await connection.getTransport()) !== "/epoxy/index.mjs") {
            await connection.setTransport("/epoxy/index.mjs", [{ wisp: wispUrl }]);
        }

        // Navigate iframe through proxy
        const proxyUrl = __uv$config.prefix + __uv$config.encodeUrl(url);
        tab.iframe.src = proxyUrl;

        // Add to history
        addToHistory(url, tab.title, tab.favicon);
    } catch (err) {
        console.error("Navigation error:", err);
        tab.loading = false;
        if (tab.id === state.activeTabId) {
            showError("Failed to load: " + url + "\n" + err.message);
        }
        renderTabBar();
        updateLoadingIndicator();
    }
}

// ═══════════════════════════════════════════════════
// RENDER TAB BAR
// ═══════════════════════════════════════════════════
function renderTabBar() {
    dom.tabList.innerHTML = "";
    state.tabs.forEach(tab => {
        const el = document.createElement("div");
        el.className = `tab${tab.id === state.activeTabId ? " active" : ""}`;
        el.dataset.tabId = tab.id;

        let faviconHtml;
        if (tab.loading) {
            faviconHtml = `<div class="tab-loading"><div class="mini-spinner"></div></div>`;
        } else if (tab.favicon) {
            faviconHtml = `<img class="tab-favicon" src="${tab.favicon}" onerror="this.style.display='none'">`;
        } else {
            faviconHtml = `<svg class="tab-favicon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
        }

        el.innerHTML = `
            ${faviconHtml}
            <span class="tab-title">${escapeHtml(tab.title)}</span>
            <button class="tab-close" data-close="${tab.id}" title="Close tab">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>`;

        el.addEventListener("click", (e) => {
            if (e.target.closest(".tab-close")) return;
            switchTab(tab.id);
        });

        const closeBtn = el.querySelector(".tab-close");
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeTab(tab.id);
        });

        dom.tabList.appendChild(el);
    });
}

// ═══════════════════════════════════════════════════
// BOOKMARKS
// ═══════════════════════════════════════════════════
function toggleBookmark() {
    const tab = getActiveTab();
    if (!tab || !tab.url) return;

    const idx = state.bookmarks.findIndex(b => b.url === tab.url);
    if (idx !== -1) {
        state.bookmarks.splice(idx, 1);
    } else {
        state.bookmarks.push({ url: tab.url, title: tab.title, favicon: tab.favicon });
    }
    updateBookmarkButton();
    renderBookmarks();
    saveState();
}

function isBookmarked(url) {
    return state.bookmarks.some(b => b.url === url);
}

function updateBookmarkButton() {
    const tab = getActiveTab();
    const marked = tab && tab.url && isBookmarked(tab.url);
    dom.btnBookmark.classList.toggle("bookmarked", marked);
}

function renderBookmarks() {
    if (state.settings.bookmarksBar === "hide") {
        dom.bookmarksBar.classList.add("hidden");
        return;
    }
    dom.bookmarksBar.classList.remove("hidden");

    if (state.bookmarks.length === 0) {
        dom.bookmarksList.innerHTML = `<span class="bookmarks-empty">No bookmarks yet — click ☆ to add one</span>`;
        return;
    }

    dom.bookmarksList.innerHTML = "";
    state.bookmarks.forEach((bm, i) => {
        const chip = document.createElement("div");
        chip.className = "bookmark-chip";

        const favHtml = bm.favicon
            ? `<img class="bookmark-chip-favicon" src="${bm.favicon}" onerror="this.style.display='none'">`
            : "";

        chip.innerHTML = `${favHtml}<span>${escapeHtml(bm.title || bm.url)}</span><button class="bookmark-chip-remove" data-idx="${i}">×</button>`;

        chip.addEventListener("click", (e) => {
            if (e.target.closest(".bookmark-chip-remove")) return;
            const tab = getActiveTab();
            if (tab) navigateTab(tab.id, bm.url);
        });

        const removeBtn = chip.querySelector(".bookmark-chip-remove");
        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            state.bookmarks.splice(i, 1);
            renderBookmarks();
            updateBookmarkButton();
            saveState();
        });

        dom.bookmarksList.appendChild(chip);
    });
}

// ═══════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════
function addToHistory(url, title, favicon) {
    state.history.unshift({ url, title, favicon, time: Date.now() });
    if (state.history.length > 100) state.history.length = 100;
    saveState();
}

// ═══════════════════════════════════════════════════
// HOME PAGE
// ═══════════════════════════════════════════════════
function renderHomePage() {
    // Shortcuts
    dom.homeShortcuts.innerHTML = "";
    DEFAULT_SHORTCUTS.forEach(sc => {
        const el = document.createElement("div");
        el.className = "shortcut-item";
        el.innerHTML = `<div class="shortcut-icon">${sc.icon}</div><span class="shortcut-label">${sc.name}</span>`;
        el.addEventListener("click", () => {
            const tab = getActiveTab();
            if (tab) navigateTab(tab.id, sc.url);
        });
        dom.homeShortcuts.appendChild(el);
    });

    // Recent history
    dom.homeHistoryList.innerHTML = "";
    const recent = state.history.slice(0, 5);
    if (recent.length === 0) {
        dom.homeHistoryList.innerHTML = `<div class="history-empty">No browsing history yet</div>`;
        return;
    }
    recent.forEach(h => {
        const el = document.createElement("div");
        el.className = "history-item";
        const timeStr = new Date(h.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const favHtml = h.favicon ? `<img class="history-favicon" src="${h.favicon}" onerror="this.style.display='none'">` : `<div class="history-favicon"></div>`;
        el.innerHTML = `${favHtml}<span class="history-title">${escapeHtml(h.title || h.url)}</span><span class="history-url">${escapeHtml(h.url)}</span><span class="history-time">${timeStr}</span>`;
        el.addEventListener("click", () => {
            const tab = getActiveTab();
            if (tab) navigateTab(tab.id, h.url);
        });
        dom.homeHistoryList.appendChild(el);
    });
}

// ═══════════════════════════════════════════════════
// ERROR PAGE
// ═══════════════════════════════════════════════════
function showError(msg) {
    dom.errorMessage.textContent = msg;
    dom.homePage.classList.remove("active");
    dom.errorPage.classList.add("active");
    state.tabs.forEach(t => { if (t.iframe) t.iframe.classList.remove("active"); });
}

// ═══════════════════════════════════════════════════
// LOADING INDICATOR
// ═══════════════════════════════════════════════════
function updateLoadingIndicator() {
    const tab = getActiveTab();
    dom.loadingIndicator.classList.toggle("visible", tab?.loading || false);
}

// ═══════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════
function openSettings() {
    dom.settingsPanel.classList.remove("hidden");
    dom.settingsOverlay.classList.remove("hidden");
    dom.settingSearchEngine.value = state.settings.searchEngine;
    dom.settingTheme.value = state.settings.theme;
    dom.settingBookmarksBar.value = state.settings.bookmarksBar;
}

function closeSettings() {
    dom.settingsPanel.classList.add("hidden");
    dom.settingsOverlay.classList.add("hidden");
}

// ═══════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════
function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
}

// ═══════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════
function initEvents() {
    // New tab
    dom.btnNewTab.addEventListener("click", () => createTab());

    // URL form submit
    dom.urlForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const val = dom.urlInput.value.trim();
        if (!val) return;
        const tab = getActiveTab();
        if (tab) navigateTab(tab.id, val);
        dom.urlInput.blur();
    });

    // Home search
    dom.homeSearchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const val = dom.homeSearchInput.value.trim();
        if (!val) return;
        const tab = getActiveTab();
        if (tab) navigateTab(tab.id, val);
        dom.homeSearchInput.value = "";
    });

    // Navigation buttons
    dom.btnBack.addEventListener("click", () => {
        const tab = getActiveTab();
        if (tab?.iframe?.contentWindow) {
            try { tab.iframe.contentWindow.history.back(); } catch {}
        }
    });

    dom.btnForward.addEventListener("click", () => {
        const tab = getActiveTab();
        if (tab?.iframe?.contentWindow) {
            try { tab.iframe.contentWindow.history.forward(); } catch {}
        }
    });

    dom.btnReload.addEventListener("click", () => {
        const tab = getActiveTab();
        if (tab?.url) navigateTab(tab.id, tab.url);
    });

    // Bookmark
    dom.btnBookmark.addEventListener("click", toggleBookmark);

    // Settings
    dom.btnSettings.addEventListener("click", openSettings);
    dom.btnCloseSettings.addEventListener("click", closeSettings);
    dom.settingsOverlay.addEventListener("click", closeSettings);

    dom.settingSearchEngine.addEventListener("change", (e) => {
        state.settings.searchEngine = e.target.value;
        saveState();
    });

    dom.settingTheme.addEventListener("change", (e) => {
        applyTheme(e.target.value);
        saveState();
    });

    dom.settingBookmarksBar.addEventListener("change", (e) => {
        state.settings.bookmarksBar = e.target.value;
        renderBookmarks();
        saveState();
    });

    dom.btnClearHistory.addEventListener("click", () => {
        if (confirm("Clear all browsing history?")) {
            state.history = [];
            saveState();
            renderHomePage();
        }
    });

    dom.btnClearBookmarks.addEventListener("click", () => {
        if (confirm("Remove all bookmarks?")) {
            state.bookmarks = [];
            renderBookmarks();
            updateBookmarkButton();
            saveState();
        }
    });

    dom.btnClearAll.addEventListener("click", () => {
        if (confirm("Reset everything? This will clear tabs, history, bookmarks, and settings.")) {
            localStorage.clear();
            location.reload();
        }
    });

    // Error retry
    dom.btnErrorRetry.addEventListener("click", () => {
        const tab = getActiveTab();
        if (tab?.url) navigateTab(tab.id, tab.url);
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        // Ctrl+T: New tab
        if (e.ctrlKey && e.key === "t") { e.preventDefault(); createTab(); }
        // Ctrl+W: Close tab
        if (e.ctrlKey && e.key === "w") { e.preventDefault(); if (state.activeTabId) closeTab(state.activeTabId); }
        // Ctrl+L: Focus URL bar
        if (e.ctrlKey && e.key === "l") { e.preventDefault(); dom.urlInput.focus(); dom.urlInput.select(); }
        // Ctrl+D: Bookmark
        if (e.ctrlKey && e.key === "d") { e.preventDefault(); toggleBookmark(); }
        // Ctrl+R or F5: Reload
        if ((e.ctrlKey && e.key === "r") || e.key === "F5") {
            e.preventDefault();
            const tab = getActiveTab();
            if (tab?.url) navigateTab(tab.id, tab.url);
        }
        // Alt+Left: Back
        if (e.altKey && e.key === "ArrowLeft") {
            e.preventDefault();
            dom.btnBack.click();
        }
        // Alt+Right: Forward
        if (e.altKey && e.key === "ArrowRight") {
            e.preventDefault();
            dom.btnForward.click();
        }
        // Escape: close settings
        if (e.key === "Escape") closeSettings();
    });

    // Focus URL bar when clicking it
    dom.urlInput.addEventListener("focus", () => dom.urlInput.select());
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
function init() {
    loadState();
    applyTheme(state.settings.theme);
    renderBookmarks();
    initEvents();

    // Restore tabs from session or create a new one
    const savedTabs = localStorage.getItem("nebula_tabs");
    const savedActive = localStorage.getItem("nebula_activeTab");

    if (savedTabs) {
        try {
            const tabs = JSON.parse(savedTabs);
            if (tabs.length > 0) {
                tabs.forEach(t => {
                    const id = createTab(null, false);
                    const tab = state.tabs.find(x => x.id === id);
                    if (tab) {
                        tab.title = t.title || "New Tab";
                        tab.url = t.url || null;
                        tab.favicon = t.favicon || null;
                    }
                });
                const activeId = parseInt(savedActive);
                const target = state.tabs.find(t => t.id === activeId) || state.tabs[0];
                switchTab(target.id);
                renderTabBar();
                return;
            }
        } catch {}
    }

    createTab();
}

init();

