# clicord

A terminal-based Discord chat interface. Allows you to use Discord directly from your terminal, stripped of the bloat.

## Images

<img width="1919" height="1016" alt="image" src="https://github.com/user-attachments/assets/7a4ad855-1e10-426a-9021-af5c0d0b9db0" />
<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/76d1f1a9-596e-43fc-b40a-73805812d1eb" />
<img width="1919" height="1015" alt="image" src="https://github.com/user-attachments/assets/45a1e9ff-0812-4e4b-81f6-26ad7f979ab0" />
<img width="1918" height="882" alt="image" src="https://github.com/user-attachments/assets/dcf3d41e-ecc7-4eee-9952-f37b95a95205" />
<img width="1919" height="1078" alt="image" src="https://github.com/user-attachments/assets/78923953-390f-4f86-8d2f-b0ebe176b7cb" />
<img width="1919" height="1001" alt="image" src="https://github.com/user-attachments/assets/cddff206-4e64-4177-8d97-0d2313e40ba3" />

## Features

- 🎨 **Modern terminal interface**: Clean and minimal UI.
- 💬 **Real-time messaging**: Chat with zero lag.
- 🚥 **User Presence Status**: View online (🟢), DND (🔴), idle (🟠), and offline (⚪) statuses for friends directly in your DM list.
- 📦 **Rich Embed Support**: View formatted bot messages and rich embeds right inside your terminal.
- 🔔 **Real-time notifications**: Stay updated on new messages (per-user/channel).
- ⌨️ **Vim-style navigation**: Use `k`, `j` keys or arrow keys to navigate effortlessly.
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

3. Setup your environment variables:
- **Windows**: Run `setup_env.bat` to automatically create the `.env` file. Open the created file and paste your token after the `=` sign.
- **Manual**: Create a `.env` file in the root directory and add your token:
```
DISCORD_USER_TOKEN=your_user_token_here
```

### How to Get Your Discord User Token

- Watch this [tutorial video](https://youtu.be/rcwWex7aqTo) if you don't know how to obtain your user token.

**⚠️ Important Security Notes:**
- **Never share your user token with anyone!**
- Your token grants full access to your entire Discord account.
- If you suspect your token is compromised, change your Discord password immediately to reset it.
- *Disclaimer: Using self-bots may be prohibited under Discord's Terms of Service. Use this application at your own risk.*

## Usage

After running `npm install`, you need to make the command globally available. Run:
```bash
npm link
```
*(On Windows, you might need to run `cmd /c "npm link"` or run PowerShell as Administrator)*

Once linked, you can use the `clicord` command anywhere in your terminal:

### Show Welcome Screen & Quotes:
```bash
clicord
```

### Start Unified Interface (DMs and Servers):
```bash
clicord tui
```

### Start Standalone Interfaces:
```bash
clicord dm         # Direct Messages only
clicord server     # Server browser only
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
