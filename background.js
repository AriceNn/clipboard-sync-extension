// background.js

// Import config
importScripts('config.js');

chrome.runtime.onInstalled.addListener(() => {
    // 3 days = 3 * 24 * 60 = 4320 minutes
    chrome.alarms.create("supabase-ping", { periodInMinutes: 4320 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "supabase-ping") {
        await pingSupabase();
    }
});

async function pingSupabase() {
    if (SUPABASE_URL.includes('YOUR_SUPABASE_URL')) return; // Not configured

    try {
        const data = await chrome.storage.local.get(['docId']);
        let url = `${SUPABASE_URL}/rest/v1/sync_data?limit=1`;

        // If we have a docId, we can just request our own row to be safe.
        // Otherwise a generic query to keep the project alive.
        if (data.docId) {
            url = `${SUPABASE_URL}/rest/v1/sync_data?id=eq.${data.docId}&select=id`;
        }

        const res = await fetch(url, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });

        if (res.ok) {
            console.log("Supabase ping successful at", new Date().toISOString());
        } else {
            console.error("Supabase ping failed", res.status);
        }
    } catch (e) {
        console.error("Supabase ping error:", e);
    }
}
