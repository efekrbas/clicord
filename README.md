# clicord

A terminal-based Discord chat interface. Allows you to use Discord directly from your terminal, stripped of the bloat.

<img width="642" height="383" alt="image" src="https://github.com/user-attachments/assets/db9932fc-25d8-44bb-bfff-07b5fb20432f" />

## Features

- 🎨 **Modern terminal interface**: Clean and minimal UI.
- 💬 **Real-time messaging**: Chat with zero lag.
- 🔐 **Automatic Login**: Automatically scans and extracts your Discord accounts from installed clients (Stable, Canary, PTB) and gives you a seamless login prompt.
- 🚥 **User Presence Status**: View online (🟢), DND (🔴), idle (🟠), and offline (⚪) statuses for friends directly in your DM list.
- 📦 **Rich Embed Support**: View formatted bot messages and rich embeds right inside your terminal.
- 🔔 **Real-time notifications**: Stay updated on new messages (per-user/channel).
- ⌨️ **Vim-style navigation**: Use `k`, `j` keys or  `up`,`down` arrow keys to navigate effortlessly.
- 🖼️ **Media support**: View images, files, and stickers explicitly.
- 📎 **File upload**: Easily upload files directly from the CLI.
- 📌 **Pin messages**: Keep important messages accessible.
- ❤️ **Reactions**: React to messages seamlessly.
- ✏️ **Message management**: Edit and delete your own messages.
- 💬 **Replies**: Reply directly to specific messages.
- 🎲 **Random Welcome Quotes**: Enjoy a fresh, bloat-free quote every time you start the app.
- 🚀 **Fast and lightweight**: Bye bye Electron. Hello performance.

## Installation

1. Clone or download the project repository.
2. Install the necessary dependencies:
```bash
npm install
```

3. You're ready to go! `clicord` will automatically grab your tokens from your active Discord desktop applications (Stable, Canary, PTB) and prompt you to select an account.

**⚠️ Important Security Notes:**
- **Never share your user token with anyone!**
- Your token grants full access to your entire Discord account.
- If you suspect your token is compromised, change your Discord password immediately to reset it.
- *Disclaimer: Using self-bots may be prohibited under Discord's Terms of Service. Use this application at your own risk.*

**🛡️ Anti-Virus False Positives:**
Some antivirus programs or Windows Defender may flag this project as a virus or malicious software. This is a **false positive**. Because `clicord` automatically scans your local Discord installation files to extract your login token for seamless authentication, security software may mistake this behavior for a token logger or malware. The source code is completely open and transparent, and you are encouraged to review it yourself.

## Usage

After running `npm install`, you need to make the command globally available. Run:
```bash
npm link
```
*(On Windows, you might need to run `cmd /c "npm link"` or run PowerShell as Administrator)*

Once linked, you can use the `clicord` command anywhere in your terminal:

### Start Direct Messages:
```bash
clicord dm
```

### Start Server Browser:
```bash
clicord server
```

### Show Help / Available Commands:
```bash
clicord help
```

## Keyboard Shortcuts

- `Esc`: Exit the application or view
- `Ctrl+D`: Clear the input box
- `j`, `k` or `Up`, `Down`: Navigate between messages or lists
- `Enter`: Send message or select an item

## CLI Commands within Chat

- `/upload <file_path>`: Upload a file to the current channel
- `/view <message_id>`: Open a file/image/sticker in your default web browser
- `/reply <message_id> <message>`: Reply to a specific message
- `/r <message_id> <message>`: Quick reply to a message
- `/edit <message_id> <new_message>`: Edit your own message
- `/delete <message_id>`: Delete your own message
- `/pin <message_id>`: Pin a message to the channel
- `/react <message_id> <emoji>`: Add a reaction to a message
- `/help`: Show all available commands in the chat interface

### File Upload Examples
```bash
# Upload a single file
/upload C:\Users\username\Desktop\image.png

# Upload a file with spaces in the path (use quotes)
/upload "C:\Users\username\My Documents\file.pdf"
```

### Message ID Format
- Message IDs are displayed in **yellow color within blue parentheses**.
- File and Sticker names are displayed in **yellow within blue brackets**.
- **File Example**: `[File: filename.png] (1455312755623067821)` 
- **Sticker Example**: `[Sticker: StickerName] (1455312755623067822)`

## Requirements

- Node.js version 18 or higher
- A valid Discord User Token

## License

This project is licensed under the [MIT License](LICENSE).
