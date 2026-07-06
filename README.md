# SyncPad & Clipboard

A minimalist, highly secure Chrome extension designed to sync your clipboard history and notes across all your devices seamlessly. 

SyncPad was built with one core philosophy: **Your data belongs only to you.** Unlike other clipboard sync tools, there are no accounts to create, no emails to provide, and absolutely no way for anyone (including the developers) to read your data.

### Features

- **No Sign-up Required:** Forget about creating accounts. SyncPad uses a secure, 25-word recovery phrase (like a crypto wallet) to securely link your devices together.
- **True End-to-End Encryption:** Your notes and clipboard history are encrypted directly on your device (using military-grade AES-GCM) before they ever reach the cloud. They can only be decrypted by the devices that hold your 25-word phrase.
- **Cross-Platform:** Works wherever Google Chrome (or any Chromium-based browser) works. Sync instantly between your Mac, Windows, or Linux machines.
- **Modern & Lightweight:** Designed with a clean, distraction-free aesthetic (inspired by Shadcn UI) that looks beautiful in both light and dark modes.
- **Multi-Language Support:** Currently available in English, Turkish, German, and French.

### Installation (Developer Mode)

Since this extension is not yet published on the Chrome Web Store, you can easily install it locally:

1. Clone or download this repository to your computer.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click the **Load unpacked** button in the top left.
5. Select the `clipboard-sync-extension` folder.
6. The extension is now installed! You can pin it to your toolbar for easy access.

### How to Use

1. **Install the Extension:** Load the extension into your Chrome browser.
2. **Setup the Master Device:** Click "Generate Setup Phrase" on your first computer. This will generate your unique 25-word secret key.
3. **Link Other Devices:** On your second computer (or work laptop), choose "I have a setup phrase" and paste your 25-word key.
4. **Start Syncing:** Anything you copy to the clipboard or write in the notepad will now securely sync between your linked devices in real-time!

---

*Built with privacy and simplicity in mind.*
