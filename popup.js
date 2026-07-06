// popup.js

// ---------------------------------------------------------
// SUPABASE CONFIGURATION is loaded from config.js
// ---------------------------------------------------------
// Global state
let AES_KEY = null;
let DOC_ID = null;
let clipboardData = [];

// DOM Elements
const setupView = document.getElementById('setup-view');
const mainView = document.getElementById('main-view');

const btnMaster = document.getElementById('btn-master');
const btnSlave = document.getElementById('btn-slave');
const masterSetup = document.getElementById('master-setup');
const slaveSetup = document.getElementById('slave-setup');
const seedDisplay = document.getElementById('seed-display');
const btnMasterDone = document.getElementById('btn-master-done');
const seedInput = document.getElementById('seed-input');
const btnSlaveDone = document.getElementById('btn-slave-done');
const slaveError = document.getElementById('slave-error');

const tabClipboard = document.getElementById('tab-clipboard');
const tabNotepad = document.getElementById('tab-notepad');
const contentClipboard = document.getElementById('content-clipboard');
const contentNotepad = document.getElementById('content-notepad');

const btnCaptureClipboard = document.getElementById('btn-capture-clipboard');
const clipboardList = document.getElementById('clipboard-list');

const notepadTextarea = document.getElementById('notepad-textarea');
const charCount = document.getElementById('char-count');
const btnSyncNotepad = document.getElementById('btn-sync-notepad');
const syncStatus = document.getElementById('sync-status');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const data = await chrome.storage.local.get(['seedPhrase']);
    if (data.seedPhrase) {
        await initializeSession(data.seedPhrase);
        showMainView();
        await fetchFromSupabase();
    } else {
        showSetupView();
    }
});

async function initializeSession(phrase) {
    const keys = await deriveKeys(phrase);
    DOC_ID = keys.documentId;
    AES_KEY = keys.key;
    // Tell background script about the DOC_ID so it can ping
    await chrome.storage.local.set({ docId: DOC_ID });
}

function showSetupView() {
    setupView.classList.remove('hidden');
    mainView.classList.add('hidden');
}

function showMainView() {
    setupView.classList.add('hidden');
    mainView.classList.remove('hidden');
}

// Setup Events
btnMaster.addEventListener('click', () => {
    masterSetup.classList.remove('hidden');
    slaveSetup.classList.add('hidden');
    const phrase = generateSeedPhrase();
    seedDisplay.textContent = phrase;
});

btnSlave.addEventListener('click', () => {
    slaveSetup.classList.remove('hidden');
    masterSetup.classList.add('hidden');
});

btnMasterDone.addEventListener('click', async () => {
    const phrase = seedDisplay.textContent;
    await chrome.storage.local.set({ seedPhrase: phrase });
    await initializeSession(phrase);
    showMainView();
    await fetchFromSupabase();
});

btnSlaveDone.addEventListener('click', async () => {
    const phrase = seedInput.value.trim().replace(/\s+/g, ' ');
    if (phrase.split(' ').length !== 25) {
        slaveError.classList.remove('hidden');
        return;
    }
    slaveError.classList.add('hidden');

    // Check if words are valid
    const words = phrase.split(' ');
    const invalidWord = words.find(w => !WORDLIST.includes(w));
    if (invalidWord) {
        slaveError.textContent = `Invalid word: ${invalidWord}`;
        slaveError.classList.remove('hidden');
        return;
    }

    await chrome.storage.local.set({ seedPhrase: phrase });
    await initializeSession(phrase);
    showMainView();
    await fetchFromSupabase();
});

// Tab Events
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

// Notepad Events
notepadTextarea.addEventListener('input', () => {
    charCount.textContent = `${notepadTextarea.value.length} / 10000`;
});

btnSyncNotepad.addEventListener('click', async () => {
    await pushToSupabase();
    syncStatus.textContent = "Synced successfully!";
    setTimeout(() => { syncStatus.textContent = ""; }, 2000);
});

// Clipboard Events
btnCaptureClipboard.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            // Add to top of list
            clipboardData.unshift({
                text: text,
                date: new Date().toISOString()
            });
            // Keep only last 50 items
            if (clipboardData.length > 50) clipboardData.length = 50;

            renderClipboard();
            await pushToSupabase();
        }
    } catch (e) {
        console.error("Failed to read clipboard:", e);
    }
});

function renderClipboard() {
    clipboardList.innerHTML = '';
    clipboardData.forEach(item => {
        const div = document.createElement('div');
        div.className = 'clipboard-item';
        div.title = "Click to copy";

        const textDiv = document.createElement('div');
        textDiv.className = 'clipboard-text';
        textDiv.textContent = item.text;

        const dateDiv = document.createElement('div');
        dateDiv.className = 'clipboard-date';
        dateDiv.textContent = new Date(item.date).toLocaleString();

        div.appendChild(textDiv);
        div.appendChild(dateDiv);

        div.addEventListener('click', async () => {
            await navigator.clipboard.writeText(item.text);
            div.style.backgroundColor = 'rgba(74, 222, 128, 0.2)'; // success flash
            setTimeout(() => { div.style.backgroundColor = ''; }, 300);
        });

        clipboardList.appendChild(div);
    });
}

// ---------------------------------------------------------
// SUPABASE SYNC LOGIC
// ---------------------------------------------------------
async function fetchFromSupabase() {
    if (SUPABASE_URL.includes('YOUR_SUPABASE_URL')) return; // not configured

    try {
        const url = `${SUPABASE_URL}/rest/v1/sync_data?id=eq.${DOC_ID}&select=*`;
        const res = await fetch(url, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });

        if (!res.ok) throw new Error("Supabase fetch failed");

        const data = await res.json();
        if (data && data.length > 0) {
            const row = data[0];

            // Decrypt Notepad
            if (row.notepad) {
                const decryptedNotepad = await decryptData(row.notepad, AES_KEY);
                notepadTextarea.value = decryptedNotepad;
                charCount.textContent = `${decryptedNotepad.length} / 10000`;
            }

            // Decrypt Clipboard
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
    if (SUPABASE_URL.includes('YOUR_SUPABASE_URL')) return; // not configured

    try {
        const notepadText = notepadTextarea.value;
        const clipboardStr = JSON.stringify(clipboardData);

        const encNotepad = await encryptData(notepadText, AES_KEY);
        const encClipboard = await encryptData(clipboardStr, AES_KEY);

        const payload = {
            id: DOC_ID,
            notepad: encNotepad,
            clipboard: encClipboard,
            updated_at: new Date().toISOString()
        };

        // Upsert
        const url = `${SUPABASE_URL}/rest/v1/sync_data`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error(await res.text());
            throw new Error("Supabase push failed");
        }
    } catch (e) {
        console.error("Push error:", e);
    }
}
