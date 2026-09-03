# Assets

Place your icon files here:

- `icon.png`  – 1024×1024 PNG (Linux + fallback)
- `icon.icns` – macOS icon
- `icon.ico`  – Windows icon
- `dmg-background.png` – 540×380 PNG for macOS DMG installer background

You can convert `icon.png` → `icon.icns` and `icon.ico` using tools like:
- [png2icns](https://github.com/nicephil/png2icns)
- [electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder)

```bash
npx electron-icon-builder --input=assets/icon.png --output=assets
```
