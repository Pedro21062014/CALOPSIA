# 🦋 Calopsia Browser

<div align="center">
  <h3>Fast · Private · Elegant</h3>
  <p>A modern Chromium-based browser built with Electron</p>

  ![Build](https://github.com/calopsia-browser/calopsia/actions/workflows/build.yml/badge.svg)
  ![Release](https://img.shields.io/github/v/release/calopsia-browser/calopsia)
  ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)
  ![License](https://img.shields.io/badge/license-MIT-green)
</div>

---

## ✨ Features

- 🚀 **Fast** – Powered by Chromium via Electron
- 🔒 **Private** – Built-in Ad & Tracker blocker
- 🌙 **Themes** – Light, Dark, or System
- 📑 **Tabs** – Full multi-tab support
- 🔖 **Bookmarks** – Save and search bookmarks
- 🕐 **History** – Persistent browsing history
- ⬇️ **Downloads** – Integrated download manager
- 🌐 **Search Engines** – Google, DuckDuckGo, Bing, Brave & more
- ⌨️ **Keyboard Shortcuts** – Power-user friendly
- 🖥️ **Cross-platform** – macOS (Intel + Apple Silicon), Linux, Windows

---

## 📥 Download

Go to the [**Releases**](../../releases) page to download the latest version.

| Platform | Format |
|----------|--------|
| 🍎 macOS | `.dmg` (Intel / Apple Silicon) |
| 🐧 Linux | `.AppImage` · `.deb` · `.rpm` |
| 🪟 Windows | `.exe` installer · portable |

---

## 🛠️ Development

### Prerequisites
- Node.js 20+
- npm 9+

### Setup

```bash
git clone https://github.com/calopsia-browser/calopsia.git
cd calopsia
npm install
npm start
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run in development mode |
| `npm run build:mac` | Build for macOS |
| `npm run build:linux` | Build for Linux |
| `npm run build:win` | Build for Windows |
| `npm run build:all` | Build for all platforms |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/⌘ + T` | New tab |
| `Ctrl/⌘ + W` | Close tab |
| `Ctrl/⌘ + L` | Focus address bar |
| `Ctrl/⌘ + R` | Reload |
| `Ctrl/⌘ + D` | Bookmark page |
| `Ctrl/⌘ + Tab` | Next tab |
| `Ctrl/⌘ + Shift + H` | History |
| `Ctrl/⌘ + Shift + B` | Bookmarks |

---

## 🏗️ Architecture

```
calopsia/
├── src/
│   ├── main/          # Electron main process
│   │   └── main.js
│   ├── preload/       # Context bridge
│   │   └── preload.js
│   └── renderer/      # Browser UI
│       ├── index.html
│       ├── styles/
│       │   └── main.css
│       └── scripts/
│           └── browser.js
├── assets/            # Icons & resources
├── .github/
│   └── workflows/
│       ├── build.yml     # CI builds on push
│       └── release.yml   # Publish on tag
└── package.json
```

---

## 📄 License

MIT © Calopsia Browser
