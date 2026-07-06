// popup.js

// ---------------------------------------------------------
// SUPABASE CONFIGURATION is loaded from config.js
// ---------------------------------------------------------

// Global state
let AES_KEY = null;
let DOC_ID = null;
let clipboardData = [];
let notepadData = [];
let currentPhrase = "";

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
const btnSettings = document.getElementById('btn-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsSeedDisplay = document.getElementById('settings-seed-display');
const btnCopySeed = document.getElementById('btn-copy-seed');
const btnLogout = document.getElementById('btn-logout');
const btnCloseSettings = document.getElementById('btn-close-settings');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    loadingOverlay.classList.remove('hidden');
    
    const data = await chrome.storage.local.get(['seedPhrase']);
    if (data.seedPhrase) {
        currentPhrase = data.seedPhrase;
        await initializeSession(currentPhrase);
        showMainView();
        await fetchFromSupabase();
    } else {
        showSetupView();
    }
    
    loadingOverlay.classList.add('hidden');
});

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

function showSyncStatus(msg = "Synced") {
    syncStatus.textContent = msg;
    syncStatus.classList.remove('hidden');
    syncStatus.classList.add('visible');
    setTimeout(() => {
        syncStatus.classList.remove('visible');
        setTimeout(() => syncStatus.classList.add('hidden'), 300);
    }, 2000);
}

// Setup Events
btnMaster.addEventListener('click', async () => {
    loadingOverlay.classList.remove('hidden');
    // Generate immediately and log in!
    const phrase = generateSeedPhrase();
    currentPhrase = phrase;
    await chrome.storage.local.set({ seedPhrase: phrase });
    await initializeSession(phrase);
    showMainView();
    
    loadingOverlay.classList.add('hidden');
    // Auto-open settings so they see their phrase
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
        slaveError.textContent = "Invalid phrase length. Must be 25 words.";
        slaveError.classList.remove('hidden');
        return;
    }
    
    const words = phrase.split(' ');
    const invalidWord = words.find(w => !WORDLIST.includes(w));
    if (invalidWord) {
        slaveError.textContent = `Invalid word: ${invalidWord}`;
        slaveError.classList.remove('hidden');
        return;
    }

    slaveError.classList.add('hidden');
    loadingOverlay.classList.remove('hidden');
    
    currentPhrase = phrase;
    await chrome.storage.local.set({ seedPhrase: phrase });
    await initializeSession(phrase);
    showMainView();
    await fetchFromSupabase();
    
    loadingOverlay.classList.add('hidden');
});

// Settings / Logout Events
btnSettings.addEventListener('click', () => {
    settingsSeedDisplay.textContent = currentPhrase;
    settingsOverlay.classList.remove('hidden');
});

btnCloseSettings.addEventListener('click', () => {
    settingsOverlay.classList.add('hidden');
});

btnCopySeed.addEventListener('click', async () => {
    await navigator.clipboard.writeText(currentPhrase);
    const originalContent = btnCopySeed.innerHTML;
    btnCopySeed.textContent = "Copied!";
    setTimeout(() => { btnCopySeed.innerHTML = originalContent; }, 2000);
});

btnLogout.addEventListener('click', async () => {
    if (confirm("Are you sure you want to log out? Ensure you have your phrase saved, otherwise you will lose access to this sync group!")) {
        await chrome.storage.local.clear();
        settingsOverlay.classList.add('hidden');
        showSetupView();
        
        // Clear local memory state
        clipboardData = [];
        notepadData = [];
        renderClipboard();
        renderNotepad();
        AES_KEY = null;
        DOC_ID = null;
        currentPhrase = "";
    }
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

// Clipboard Events
btnCaptureClipboard.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            loadingOverlay.classList.remove('hidden');
            
            // Fix race condition: Fetch latest from server first!
            await fetchFromSupabase();
            
            // Check if already on top to avoid duplicates
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
    clipboardList.innerHTML = '';
    clipboardData.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.title = "Click to copy";
        
        const textDiv = document.createElement('div');
        textDiv.className = 'item-text';
        textDiv.textContent = item.text;
        
        const dateDiv = document.createElement('div');
        dateDiv.className = 'item-date';
        dateDiv.textContent = new Date(item.date).toLocaleString([], {
            month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
        });
        
        div.appendChild(textDiv);
        div.appendChild(dateDiv);
        
        div.addEventListener('click', async () => {
            await navigator.clipboard.writeText(item.text);
            div.style.backgroundColor = 'var(--accent)';
            setTimeout(() => { div.style.backgroundColor = ''; }, 300);
        });
        
        clipboardList.appendChild(div);
    });
}

// Notepad Events
btnNewNote.addEventListener('click', () => {
    noteEditor.classList.remove('hidden');
    notepadTextarea.value = '';
    charCount.textContent = '0 / 10000';
    notepadTextarea.focus();
    btnNewNote.classList.add('hidden');
});

btnCancelNote.addEventListener('click', () => {
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
        
        // Fix race condition: Fetch latest from server first!
        await fetchFromSupabase();
        
        notepadData.unshift({
            text: text,
            date: new Date().toISOString()
        });
        if (notepadData.length > 50) notepadData.length = 50;
        
        noteEditor.classList.add('hidden');
        btnNewNote.classList.remove('hidden');
        renderNotepad();
        
        await pushToSupabase();
        
        loadingOverlay.classList.add('hidden');
        showSyncStatus("Note Saved");
    }
});

function renderNotepad() {
    notepadList.innerHTML = '';
    notepadData.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.title = "Click to copy";
        
        const textDiv = document.createElement('div');
        textDiv.className = 'item-text';
        textDiv.textContent = item.text;
        
        const dateDiv = document.createElement('div');
        dateDiv.className = 'item-date';
        dateDiv.textContent = new Date(item.date).toLocaleString([], {
            month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
        });
        
        div.appendChild(textDiv);
        div.appendChild(dateDiv);
        
        div.addEventListener('click', async () => {
            await navigator.clipboard.writeText(item.text);
            div.style.backgroundColor = 'var(--accent)';
            setTimeout(() => { div.style.backgroundColor = ''; }, 300);
        });
        
        notepadList.appendChild(div);
    });
}

// ---------------------------------------------------------
// SUPABASE SYNC LOGIC
// ---------------------------------------------------------
async function fetchFromSupabase() {
    if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR_SUPABASE_URL')) return;
    
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
                const decryptedNotepadStr = await decryptData(row.notepad, AES_KEY);
                try {
                    const parsed = JSON.parse(decryptedNotepadStr);
                    if (Array.isArray(parsed)) notepadData = parsed;
                } catch (e) {
                    notepadData = [{ text: decryptedNotepadStr, date: new Date().toISOString() }];
                }
                renderNotepad();
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
    if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR_SUPABASE_URL')) return;
    
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
