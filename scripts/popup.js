// popup.js

// ---------------------------------------------------------
// SUPABASE CONFIGURATION is loaded from config.js
// STORAGE_VERSION tracks crypto migration state
// ---------------------------------------------------------
const STORAGE_VERSION = 2;

// Global state
let AES_KEY = null;
let DOC_ID = null;
let clipboardData = [];
let notepadData = [];
let currentPhrase = "";
let editingNoteIndex = -1; // -1 = new note, >= 0 = editing existing

// DOM Elements
const loadingOverlay = document.getElementById('loading-overlay');
const setupView = document.getElementById('setup-view');
const mainView = document.getElementById('main-view');

const btnMaster = document.getElementById('btn-master');
const btnSlave = document.getElementById('btn-slave');
const slaveSetup = document.getElementById('slave-setup');
const seedInput = document.getElementById('seed-input');
const btnSlaveDone = document.getElementById('btn-slave-done');
const btnSlaveBack = document.getElementById('btn-slave-back');
const slaveError = document.getElementById('slave-error');

const tabClipboard = document.getElementById('tab-clipboard');
const tabNotepad = document.getElementById('tab-notepad');
const contentClipboard = document.getElementById('content-clipboard');
const contentNotepad = document.getElementById('content-notepad');

// Clipboard UI
const btnCaptureClipboard = document.getElementById('btn-capture-clipboard');
const clipboardList = document.getElementById('clipboard-list');

// Notepad UI
const btnNewNote = document.getElementById('btn-new-note');
const noteEditor = document.getElementById('note-editor');
const notepadTextarea = document.getElementById('notepad-textarea');
const charCount = document.getElementById('char-count');
const btnCancelNote = document.getElementById('btn-cancel-note');
const btnSaveNote = document.getElementById('btn-save-note');
const notepadList = document.getElementById('notepad-list');

const syncStatus = document.getElementById('sync-status');

// Settings / Logout UI
const btnRefresh = document.getElementById('btn-refresh');
const btnSettings = document.getElementById('btn-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsSeedDisplay = document.getElementById('settings-seed-display');
const btnCopySeed = document.getElementById('btn-copy-seed');
const btnLogout = document.getElementById('btn-logout');
const btnCloseSettings = document.getElementById('btn-close-settings');

// =========================================================
// INITIALIZATION
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
    loadingOverlay.classList.remove('hidden');

    const data = await chrome.storage.local.get(['seedPhrase', 'storageVersion', 'lang']);
    
    // Initialize Language
    const savedLang = data.lang || 'en';
    const langSelect = document.getElementById('lang-select');
    if (langSelect) langSelect.value = savedLang;
    if (typeof applyLanguage === 'function') applyLanguage(savedLang);
    if (data.seedPhrase) {
        currentPhrase = data.seedPhrase;

        // Check if migration is needed
        if (!data.storageVersion || data.storageVersion < STORAGE_VERSION) {
            await migrateToV2(currentPhrase);
        } else {
            await initializeSession(currentPhrase);
        }

        showMainView();
        await fetchFromSupabase();
    } else {
        showSetupView();
    }

    loadingOverlay.classList.add('hidden');
});

// =========================================================
// MIGRATION: v1 (raw SHA-256) → v2 (PBKDF2 + domain sep.)
// =========================================================
async function migrateToV2(phrase) {
    console.log("Starting migration to v2...");

    // 1. Derive LEGACY keys to read old data
    const legacyKeys = await deriveKeysLegacy(phrase);

    // 2. Derive NEW keys
    const newKeys = await deriveKeys(phrase);

    // 3. Try to fetch existing data with LEGACY document ID
    let legacyClipboard = [];
    let legacyNotepad = [];

    if (typeof VERCEL_API_URL !== 'undefined' && !VERCEL_API_URL.includes('YOUR_VERCEL_APP_URL')) {
        try {
            const url = `${VERCEL_API_URL}?id=eq.${legacyKeys.documentId}&select=*`;
            const res = await fetch(url, {
                headers: { 'x-proxy-secret': PROXY_SECRET }
            });

            if (res.ok) {
                const rows = await res.json();
                if (rows && rows.length > 0) {
                    const row = rows[0];

                    // Decrypt clipboard with LEGACY key
                    if (row.clipboard) {
                        const dec = await decryptData(row.clipboard, legacyKeys.key);
                        try { legacyClipboard = JSON.parse(dec); } catch (e) { /* ignore */ }
                    }
                    // Decrypt notepad with LEGACY key
                    if (row.notepad) {
                        const dec = await decryptData(row.notepad, legacyKeys.key);
                        try {
                            const p = JSON.parse(dec);
                            if (Array.isArray(p)) legacyNotepad = p;
                            else if (dec) legacyNotepad = [{ text: dec, date: new Date().toISOString() }];
                        } catch (e) {
                            if (dec) legacyNotepad = [{ text: dec, date: new Date().toISOString() }];
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Migration fetch error:", e);
        }
    }

    // 4. Set new keys as active
    DOC_ID = newKeys.documentId;
    AES_KEY = newKeys.key;

    // 5. If legacy data exists, re-encrypt with NEW key and push
    if (legacyClipboard.length > 0 || legacyNotepad.length > 0) {
        clipboardData = legacyClipboard;
        notepadData = legacyNotepad;
        await pushToSupabase();
        console.log("Migration: re-encrypted and pushed data to new document ID.");
    }

    // 6. Mark migration complete
    await chrome.storage.local.set({ docId: DOC_ID, storageVersion: STORAGE_VERSION });
    console.log("Migration to v2 complete.");
}

// =========================================================
// SESSION
// =========================================================
async function initializeSession(phrase) {
    const keys = await deriveKeys(phrase);
    DOC_ID = keys.documentId;
    AES_KEY = keys.key;
    await chrome.storage.local.set({ docId: DOC_ID });
}

function showSetupView() {
    setupView.classList.remove('hidden');
    mainView.classList.add('hidden');

    // Reset setup view state
    document.querySelector('.setup-buttons').classList.remove('hidden');
    slaveSetup.classList.add('hidden');
    slaveError.classList.add('hidden');
    seedInput.value = '';
}

function showMainView() {
    setupView.classList.add('hidden');
    mainView.classList.remove('hidden');
}

function showSyncStatus(msgKey = "msg_synced") {
    syncStatus.textContent = getTranslation(msgKey);
    syncStatus.classList.remove('hidden');
    syncStatus.classList.add('visible');
    setTimeout(() => {
        syncStatus.classList.remove('visible');
        setTimeout(() => syncStatus.classList.add('hidden'), 300);
    }, 2000);
}

// =========================================================
// SETUP EVENTS
// =========================================================
btnMaster.addEventListener('click', async () => {
    loadingOverlay.classList.remove('hidden');
    const phrase = generateSeedPhrase();
    currentPhrase = phrase;
    await chrome.storage.local.set({ seedPhrase: phrase, storageVersion: STORAGE_VERSION });
    await initializeSession(phrase);
    showMainView();

    loadingOverlay.classList.add('hidden');
    btnSettings.click();
});

btnSlave.addEventListener('click', () => {
    document.querySelector('.setup-buttons').classList.add('hidden');
    slaveSetup.classList.remove('hidden');
});

btnSlaveBack.addEventListener('click', () => {
    document.querySelector('.setup-buttons').classList.remove('hidden');
    slaveSetup.classList.add('hidden');
    slaveError.classList.add('hidden');
});

btnSlaveDone.addEventListener('click', async () => {
    const phrase = seedInput.value.trim().replace(/\s+/g, ' ');
    if (phrase.split(' ').length !== 25) {
        slaveError.textContent = getTranslation('slave_error_length');
        slaveError.classList.remove('hidden');
        return;
    }

    const words = phrase.split(' ');
    const invalidWord = words.find(w => !WORDLIST.includes(w));
    if (invalidWord) {
        slaveError.textContent = getTranslation('slave_error_word') + invalidWord;
        slaveError.classList.remove('hidden');
        return;
    }

    slaveError.classList.add('hidden');
    loadingOverlay.classList.remove('hidden');

    currentPhrase = phrase;
    await chrome.storage.local.set({ seedPhrase: phrase });

    // Slave devices also need migration check — they might be
    // connecting to a sync group that still has v1 data.
    await migrateToV2(phrase);

    showMainView();
    await fetchFromSupabase();

    loadingOverlay.classList.add('hidden');
});

// =========================================================
// SETTINGS / LOGOUT / REFRESH
// =========================================================
btnRefresh.addEventListener('click', async () => {
    const icon = btnRefresh.querySelector('svg');
    icon.style.animation = 'spin 1s linear infinite';
    await fetchFromSupabase();
    showSyncStatus("msg_refreshed");
    setTimeout(() => {
        icon.style.animation = '';
    }, 500);
});

btnSettings.addEventListener('click', () => {
    settingsSeedDisplay.textContent = currentPhrase;
    settingsOverlay.classList.remove('hidden');
});

btnCloseSettings.addEventListener('click', () => {
    settingsOverlay.classList.add('hidden');
});

const langSelect = document.getElementById('lang-select');
if (langSelect) {
    langSelect.addEventListener('change', async (e) => {
        const lang = e.target.value;
        if (typeof applyLanguage === 'function') applyLanguage(lang);
        await chrome.storage.local.set({ lang: lang });
    });
}

btnCopySeed.addEventListener('click', async () => {
    await navigator.clipboard.writeText(currentPhrase);
    const originalContent = btnCopySeed.innerHTML;
    btnCopySeed.textContent = getTranslation("msg_copied");
    setTimeout(() => { btnCopySeed.innerHTML = originalContent; }, 2000);
});

btnLogout.addEventListener('click', async () => {
    if (confirm("Are you sure you want to log out? Ensure you have your phrase saved, otherwise you will lose access to this sync group!")) {
        await chrome.storage.local.clear();
        settingsOverlay.classList.add('hidden');
        showSetupView();

        clipboardData = [];
        notepadData = [];
        renderClipboard();
        renderNotepad();
        AES_KEY = null;
        DOC_ID = null;
        currentPhrase = "";
    }
});

// =========================================================
// TAB EVENTS
// =========================================================
tabClipboard.addEventListener('click', () => {
    tabClipboard.classList.add('active');
    tabNotepad.classList.remove('active');

    contentClipboard.classList.add('active');
    contentClipboard.classList.remove('hidden');
    contentNotepad.classList.add('hidden');
    contentNotepad.classList.remove('active');
});

tabNotepad.addEventListener('click', () => {
    tabNotepad.classList.add('active');
    tabClipboard.classList.remove('active');

    contentNotepad.classList.add('active');
    contentNotepad.classList.remove('hidden');
    contentClipboard.classList.add('hidden');
    contentClipboard.classList.remove('active');
});

// =========================================================
// CLIPBOARD
// =========================================================
btnCaptureClipboard.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            loadingOverlay.classList.remove('hidden');

            // Fetch latest from server first to prevent data loss
            await fetchFromSupabase();

            // Avoid duplicates
            if (clipboardData.length === 0 || clipboardData[0].text !== text) {
                clipboardData.unshift({
                    text: text,
                    date: new Date().toISOString()
                });
                if (clipboardData.length > 50) clipboardData.length = 50;
            }

            renderClipboard();
            await pushToSupabase();

            loadingOverlay.classList.add('hidden');
            showSyncStatus("Clipboard Pushed");
        }
    } catch (e) {
        console.error("Failed to read clipboard:", e);
        loadingOverlay.classList.add('hidden');
    }
});

function renderClipboard() {
    const fragment = document.createDocumentFragment();
    clipboardData.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'list-item';

        const textDiv = document.createElement('div');
        textDiv.className = 'item-text';
        textDiv.textContent = item.text;

        const footer = document.createElement('div');
        footer.className = 'item-footer';

        const dateDiv = document.createElement('div');
        dateDiv.className = 'item-date';
        dateDiv.textContent = new Date(item.date).toLocaleString([], {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const actions = document.createElement('div');
        actions.className = 'item-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'item-action-btn';
        copyBtn.title = 'Copy';
        copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await navigator.clipboard.writeText(item.text);
            copyBtn.innerHTML = '✓';
            setTimeout(() => {
                copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
            }, 1000);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'item-action-btn destructive';
        delBtn.title = 'Delete';
        delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            clipboardData.splice(index, 1);
            renderClipboard();
            await pushToSupabase();
            showSyncStatus('Deleted');
        });

        actions.appendChild(copyBtn);
        actions.appendChild(delBtn);

        footer.appendChild(dateDiv);
        footer.appendChild(actions);

        div.appendChild(textDiv);
        div.appendChild(footer);

        fragment.appendChild(div);
    });
    clipboardList.innerHTML = '';
    clipboardList.appendChild(fragment);
}

// =========================================================
// NOTEPAD
// =========================================================
btnNewNote.addEventListener('click', () => {
    editingNoteIndex = -1;
    noteEditor.classList.remove('hidden');
    notepadTextarea.value = '';
    charCount.textContent = '0 / 10000';
    btnSaveNote.textContent = getTranslation('btn_save_note');
    notepadTextarea.focus();
    btnNewNote.classList.add('hidden');
});

btnCancelNote.addEventListener('click', () => {
    editingNoteIndex = -1;
    noteEditor.classList.add('hidden');
    notepadTextarea.value = '';
    btnNewNote.classList.remove('hidden');
});

notepadTextarea.addEventListener('input', () => {
    charCount.textContent = `${notepadTextarea.value.length} / 10000`;
});

btnSaveNote.addEventListener('click', async () => {
    const text = notepadTextarea.value.trim();
    if (text) {
        loadingOverlay.classList.remove('hidden');

        // Fetch latest from server first to prevent data loss
        await fetchFromSupabase();

        if (editingNoteIndex >= 0 && editingNoteIndex < notepadData.length) {
            // Update existing note
            notepadData[editingNoteIndex].text = text;
            notepadData[editingNoteIndex].date = new Date().toISOString();
        } else {
            // Create new note
            notepadData.unshift({
                text: text,
                date: new Date().toISOString()
            });
            if (notepadData.length > 50) notepadData.length = 50;
        }

        editingNoteIndex = -1;
        noteEditor.classList.add('hidden');
        btnNewNote.classList.remove('hidden');
        renderNotepad();

        await pushToSupabase();

        loadingOverlay.classList.add('hidden');
        showSyncStatus("Note Saved");
    }
});

function openNoteEditor(index) {
    editingNoteIndex = index;
    noteEditor.classList.remove('hidden');
    notepadTextarea.value = notepadData[index].text;
    charCount.textContent = `${notepadTextarea.value.length} / 10000`;
    btnSaveNote.textContent = getTranslation('btn_update_note');
    notepadTextarea.focus();
    btnNewNote.classList.add('hidden');
}

function renderNotepad() {
    const fragment = document.createDocumentFragment();
    notepadData.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'list-item';

        const textDiv = document.createElement('div');
        textDiv.className = 'item-text';
        textDiv.textContent = item.text;

        const footer = document.createElement('div');
        footer.className = 'item-footer';

        const dateDiv = document.createElement('div');
        dateDiv.className = 'item-date';
        dateDiv.textContent = new Date(item.date).toLocaleString([], {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const actions = document.createElement('div');
        actions.className = 'item-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'item-action-btn';
        copyBtn.title = 'Copy';
        copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await navigator.clipboard.writeText(item.text);
            copyBtn.innerHTML = '✓';
            setTimeout(() => {
                copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
            }, 1000);
        });

        const editBtn = document.createElement('button');
        editBtn.className = 'item-action-btn';
        editBtn.title = 'Edit';
        editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openNoteEditor(index);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'item-action-btn destructive';
        delBtn.title = 'Delete';
        delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            notepadData.splice(index, 1);
            renderNotepad();
            await pushToSupabase();
            showSyncStatus('Deleted');
        });

        actions.appendChild(copyBtn);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        footer.appendChild(dateDiv);
        footer.appendChild(actions);

        div.appendChild(textDiv);
        div.appendChild(footer);

        fragment.appendChild(div);
    });
    notepadList.innerHTML = '';
    notepadList.appendChild(fragment);
}

// =========================================================
// SUPABASE SYNC
// =========================================================
async function fetchFromSupabase() {
    if (!VERCEL_API_URL || VERCEL_API_URL.includes('YOUR_VERCEL_APP_URL')) return;

    try {
        const url = `${VERCEL_API_URL}?id=eq.${DOC_ID}&select=*`;
        const res = await fetch(url, {
            headers: { 'x-proxy-secret': PROXY_SECRET }
        });

        if (!res.ok) throw new Error("Proxy fetch failed");

        const data = await res.json();
        if (data && data.length > 0) {
            const row = data[0];

            if (row.notepad) {
                const decryptedNotepadStr = await decryptData(row.notepad, AES_KEY);
                try {
                    const parsed = JSON.parse(decryptedNotepadStr);
                    if (Array.isArray(parsed)) notepadData = parsed;
                } catch (e) {
                    if (decryptedNotepadStr) {
                        notepadData = [{ text: decryptedNotepadStr, date: new Date().toISOString() }];
                    }
                }
                renderNotepad();
            }

            if (row.clipboard) {
                const decryptedClipboardStr = await decryptData(row.clipboard, AES_KEY);
                try {
                    clipboardData = JSON.parse(decryptedClipboardStr);
                    renderClipboard();
                } catch (e) {
                    console.error("Failed to parse clipboard data");
                }
            }
        }
    } catch (e) {
        console.error("Fetch error:", e);
    }
}

async function pushToSupabase() {
    if (!VERCEL_API_URL || VERCEL_API_URL.includes('YOUR_VERCEL_APP_URL')) return;

    // Enforce 14-day TTL before pushing
    purgeStaleItems();

    try {
        const notepadStr = JSON.stringify(notepadData);
        const clipboardStr = JSON.stringify(clipboardData);

        const encNotepad = await encryptData(notepadStr, AES_KEY);
        const encClipboard = await encryptData(clipboardStr, AES_KEY);

        const payload = {
            id: DOC_ID,
            notepad: encNotepad,
            clipboard: encClipboard,
            updated_at: new Date().toISOString()
        };

        const res = await fetch(VERCEL_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-proxy-secret': PROXY_SECRET
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error(await res.text());
            throw new Error("Proxy push failed");
        }
    } catch (e) {
        console.error("Push error:", e);
    }
}

// =========================================================
// TTL: Remove items older than 14 days
// =========================================================
function purgeStaleItems() {
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - fourteenDaysMs;

    const filterFn = item => {
        const ts = new Date(item.date).getTime();
        return !isNaN(ts) && ts > cutoff;
    };

    clipboardData = clipboardData.filter(filterFn);
    notepadData = notepadData.filter(filterFn);
}
