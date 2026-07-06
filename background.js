// background.js

// Import config (use absolute path to avoid Chrome service worker path bugs)
importScripts("/scripts/config.js");

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
    if (VERCEL_API_URL.includes('YOUR_VERCEL_APP_URL')) return; // Not configured

    try {
        const data = await chrome.storage.local.get(['docId']);
        let url = `${VERCEL_API_URL}?limit=1`;

        if (data.docId) {
            url = `${VERCEL_API_URL}?id=eq.${data.docId}&select=id`;
        }

        const res = await fetch(url, {
            headers: { 'x-proxy-secret': PROXY_SECRET }
        });

        if (res.ok) {
            console.log("Ping successful at", new Date().toISOString());
        } else {
            console.error("Ping failed", res.status);
        }
    } catch (e) {
        console.error("Ping error:", e);
    }
}
