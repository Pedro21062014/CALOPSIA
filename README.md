# 🌊 Calopsia Browser

> A fast, modern, Chromium-based browser built with Electron — runs on **macOS**, **Windows** and **Linux**.

![Build](https://github.com/YOUR_USERNAME/calopsia-browser/actions/workflows/build.yml/badge.svg)
![CI](https://github.com/YOUR_USERNAME/calopsia-browser/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-purple)
![Electron](https://img.shields.io/badge/electron-v29-blue)

---

## ✨ Features

| Feature | Details |
|---|---|
| 🗂️ **Multi-tab browsing** | Full tab bar with favicon, loading spinner, close button |
| 🔍 **Smart address bar** | URL + Google search fallback, HTTPS indicator |
| 🔖 **Bookmarks** | Persistent bookmarks with sidebar panel |
| 📜 **History** | Browse history (up to 2 000 entries) |
| 🔧 **Developer Tools** | One-click Chromium DevTools per tab |
| 🔎 **Zoom** | Per-tab zoom in/out/reset |
| 🖱️ **Context Menu** | Open in new tab, copy link, search selection, inspect element |
| 🎛️ **Native controls** | macOS traffic-lights + custom Win/Linux buttons |
| 🛡️ **Ad blocking** | Basic ad/tracker blocker at the network layer |
| 🌙 **Dark UI** | Professional dark theme — no external fonts needed |

---

## 📦 Download

Grab the latest build from [**Releases**](../../releases).

| Platform | File |
|---|---|
| 🍎 macOS Apple Silicon | `Calopsia-*-arm64.dmg` |
| 🍎 macOS Intel | `Calopsia-*-x64.dmg` |
| 🪟 Windows x64 | `Calopsia-*-Setup.exe` |
| 🪟 Windows x86 | `Calopsia-*-ia32-Setup.exe` |
| 🐧 Linux | `Calopsia-*.AppImage` / `.deb` / `.rpm` |

---

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run in dev mode
npm run dev

# Lint
npm run lint

# Build for current platform
npm run build

# Build for a specific platform
npm run build:mac
npm run build:win
npm run build:linux
```

> **Requirements:** Node.js 20+, npm 9+

---

## 🗂️ Project Structure

```
calopsia-browser/
├── src/
│   ├── main/
│   │   ├── main.js        ← Electron main process (tabs, IPC, menus)
│   │   └── preload.js     ← Context bridge (secure IPC API)
│   └── renderer/
│       ├── index.html     ← Browser UI shell
│       ├── error.html     ← Error page
│       ├── styles/
│       │   └── main.css   ← Full UI stylesheet
│       └── scripts/
│           └── renderer.js← UI logic (tabs, omnibox, panels)
├── assets/
│   ├── icons/             ← App icons (replace with your logo)
│   └── entitlements.mac.plist
├── .github/
│   └── workflows/
│       ├── build.yml      ← Release builder (Mac + Win + Linux)
│       └── ci.yml         ← Lint & pack check on every push
└── package.json
```

---

## 🚀 Releasing

1. Add your personal access token as `GH_TOKEN` in **Settings → Secrets → Actions**.
2. Tag a commit: `git tag v1.0.0 && git push origin v1.0.0`
3. The **Build & Release** workflow triggers automatically and publishes a GitHub Release with all binaries.

---

## 🎨 Logo

Drop your logo files into `assets/icons/`:

| File | Usage |
|---|---|
| `icon.icns` | macOS |
| `icon.ico` | Windows |
| `icon.png` | Linux / generic (512×512) |
| `logo.svg` | Displayed in the browser titlebar |

---

## 📄 License

MIT © Calopsia Browser Team
