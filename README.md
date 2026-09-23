# ⚡ Mini WhatsApp Bot

A lightweight, high-performance WhatsApp bot powered by [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys). Designed as a lean, minimalist bot focusing exclusively on View-Once media downloading, deleted message recovery, and owner master controls.

---

## 🚀 Features

- 🔓 **View-Once Downloader (`.viewonce`)**:
  - Automatically unlocks and saves View-Once photos, videos, and voice notes.
  - Keeps it completely silent: sends the media directly to your private DM when used in groups.
  - Aliases: `.vv`, `.videwonce`, `.rvo`, `.readviewonce`

- 🛡️ **Anti-Delete Engine (`.antidelet`)**:
  - Catches messages deleted for everyone in real time.
  - Recovers text messages, images, videos, voice notes, stickers, and documents with timestamp and author attribution.
  - Can be toggled on/off at any time with `.antidelet on` or `.antidelet off`.
  - Aliases: `.antidelete`, `.antidel`, `.antirevoke`

- 🤖 **Bot Master Power Switch (`.bot`)**:
  - Allows the bot owner to put the bot to sleep or bring it back online.
  - Commands: `.bot on`, `.bot off`, `.bot` (status).
  - Aliases: `.switch`, `.power`

- 🎬 **Cinema & Movies (`.movie`)**:
  - Search any movie and get instant streaming player links with full controls (play, pause, seek, fullscreen).
  - Multi-audio support: includes **Dual Audio (Hindi Dubbed + English)**.
  - Zero server lag: generates instant lightweight embed links without storing 2GB files on server.
  - Aliases: `.film`, `.movies`, `.cinema`

- 🍙 **Anime Streaming (`.anime`)**:
  - Direct search across AniKoto & Anichi with episode selection.
  - Shows English Sub & English Dub availability and episode count.
  - Quick episode switcher (e.g. `.anime solo leveling 3`).
  - Aliases: `.ani`, `.animelist`, `.watchanime`

- 📺 **TV Series & K-Drama (`.series`)**:
  - Hollywood, Bollywood/Indian web series, K-Dramas, Pakistani, and Turkish shows.
  - Automatically parses Season and Episode (e.g. `.series squid game 2 1`).
  - Aliases: `.tv`, `.show`, `.drama`, `.kdrama`

- 👥 **Group Moderation (`.mute` / `.unmute`)**:
  - `.mute` — Only group admins can send messages.
  - `.unmute` — All group members can send messages.
  - Aliases: `.closegroup`, `.opengroup`, `.mutechat`, `.unmutechat`

- 🔗 **Web Pairing Dashboard**:
  - Built-in web dashboard at `http://localhost:8080`.
  - Enter your phone number and get an instant 8-character WhatsApp pairing code (`XXXX-XXXX`) without needing to scan QR codes.

---

## 📦 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure (Optional)
Copy `.env.example` to `.env` and set your phone number:
```env
BOT_NAME=MiniBot
OWNER_NUMBERS=923116469820
PREFIX=.
PORT=8080
```

### 3. Start the Bot
```bash
npm start
```

### 4. Link WhatsApp
1. Open `http://localhost:8080` in your browser.
2. Enter your phone number with country code (e.g., `923116469820`).
3. Click **Get 8-Digit Pairing Code**.
4. On your phone:
   - Open **WhatsApp** > **Settings** (or 3 dots) > **Linked Devices**.
   - Tap **Link a Device** > **Link with phone number instead**.
   - Type the code shown on the screen.
5. You're connected! 🚀

---

## 📋 Commands Reference

| Command | Aliases | Description | Permission |
| :--- | :--- | :--- | :--- |
| `.movie <name>` | `.film`, `.movies`, `.cinema` | Stream movies with Dual Audio (Hindi/English) & full controls | All Users |
| `.series <name> [s] [ep]` | `.tv`, `.show`, `.drama`, `.kdrama` | Stream TV series & K-Drama with Dual Audio (Hindi/English) | All Users |
| `.anime <name> [ep]` | `.ani`, `.animelist`, `.watchanime` | Stream anime episodes with Sub/Dub & player controls | All Users |
| `.mute` | `.closegroup`, `.mutechat`, `.lockgroup` | Mute group so only admins can send messages | Group Admins / Owner |
| `.unmute` | `.opengroup`, `.unmutechat`, `.unlockgroup` | Unmute group so all members can send messages | Group Admins / Owner |
| `.viewonce` | `.vv`, `.videwonce`, `.rvo` | Reply to any View-Once photo, video, or audio to download | All Users / Silent DM |
| `.antidelet` | `.antidelete`, `.antidel` | Toggle deleted message recovery (`on` / `off`) | All Users |
| `.bot` | `.switch`, `.power` | Master bot switch (`on` / `off` / status) | Owner Only |
| `.menu` | `.help`, `.ping`, `.alive` | Show bot status and list of commands | All Users |

---

## 🧪 Testing

Run integration tests:
```bash
npm test
```
