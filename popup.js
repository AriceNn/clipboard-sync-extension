// popup.js

// ---------------------------------------------------------
// SUPABASE CONFIGURATION is loaded from config.js
// ---------------------------------------------------------

// Global state
let AES_KEY = null;
let DOC_ID = null;
let clipboardData = [];
let notepadData = [];

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
const tabsBg = document.querySelector('.tabs-bg');
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
        slaveError.textContent = "Invalid phrase length. Must be 25 words.";
        slaveError.classList.remove('hidden');
        return;
    }
    
    // Check if words are valid
    const words = phrase.split(' ');
    const invalidWord = words.find(w => !WORDLIST.includes(w));
    if (invalidWord) {
        slaveError.textContent = `Invalid word: ${invalidWord}`;
        slaveError.classList.remove('hidden');
        return;
    }

    slaveError.classList.add('hidden');
    await chrome.storage.local.set({ seedPhrase: phrase });
    await initializeSession(phrase);
    showMainView();
    await fetchFromSupabase();
});

// Tab Events
tabClipboard.addEventListener('click', () => {
    tabClipboard.classList.add('active');
    tabNotepad.classList.remove('active');
    tabsBg.style.transform = 'translateX(0)';
    
    contentClipboard.classList.add('active');
    contentClipboard.classList.remove('hidden');
    contentNotepad.classList.add('hidden');
    contentNotepad.classList.remove('active');
});

tabNotepad.addEventListener('click', () => {
    tabNotepad.classList.add('active');
    tabClipboard.classList.remove('active');
    tabsBg.style.transform = 'translateX(100%)';
    
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
            clipboardData.unshift({
                text: text,
                date: new Date().toISOString()
            });
            if (clipboardData.length > 50) clipboardData.length = 50;
            renderClipboard();
            await pushToSupabase();
            showSyncStatus("Clipboard Pushed");
        }
    } catch (e) {
        console.error("Failed to read clipboard:", e);
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
            div.style.backgroundColor = 'rgba(10, 132, 255, 0.2)'; // blue flash
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
});

btnCancelNote.addEventListener('click', () => {
    noteEditor.classList.add('hidden');
    notepadTextarea.value = '';
});

notepadTextarea.addEventListener('input', () => {
    charCount.textContent = `${notepadTextarea.value.length} / 10000`;
});

btnSaveNote.addEventListener('click', async () => {
    const text = notepadTextarea.value.trim();
    if (text) {
        notepadData.unshift({
            text: text,
            date: new Date().toISOString()
        });
        if (notepadData.length > 50) notepadData.length = 50;
        
        noteEditor.classList.add('hidden');
        renderNotepad();
        await pushToSupabase();
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
            div.style.backgroundColor = 'rgba(10, 132, 255, 0.2)'; // blue flash
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
            
            // Decrypt Notepad (now parsing as JSON array)
            if (row.notepad) {
                const decryptedNotepadStr = await decryptData(row.notepad, AES_KEY);
                try {
                    const parsed = JSON.parse(decryptedNotepadStr);
                    if (Array.isArray(parsed)) notepadData = parsed;
                } catch (e) {
                    // Backwards compatibility with old single-string notes
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
