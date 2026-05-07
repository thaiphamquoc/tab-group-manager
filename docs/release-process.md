# Release Process

## Prerequisites (one-time setup)

- [ ] Google Developer account registered at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) ($5 one-time fee)
- [ ] Publisher contact email verified in Dashboard → Settings
- [ ] GitHub Pages enabled at `github.com/thaiphamquoc/tab-group-manager/settings/pages` (for privacy policy URL)

## 1. Bump the version

In `manifest.json`, increment `version` following semver:
- Patch (`1.0.0` → `1.0.1`): bug fixes
- Minor (`1.0.0` → `1.1.0`): new features, backward compatible
- Major (`1.0.0` → `2.0.0`): breaking changes

## 2. Update icons (if changed)

```bash
sips -z 128 128 source-icon.png --out icons/icon128.png
sips -z 48  48  source-icon.png --out icons/icon48.png
sips -z 16  16  source-icon.png --out icons/icon16.png
```

## 3. Update screenshots (if UI changed)

Requirements: 1280×800 or 640×400, JPEG or 24-bit PNG (no alpha), up to 5.

```bash
python3 << 'EOF'
from PIL import Image
src = Image.open("tgm-screenshot.png").convert("RGBA")
canvas = Image.new("RGB", (1280, 800), (15, 17, 23))
x = (1280 - src.width) // 2
y = (800 - src.height) // 2
canvas.paste(src, (x, y), src.split()[3])
canvas.save("screenshot-1280x800.png", "PNG")
EOF
```

## 4. Package the extension

Run from the project root's parent directory:

```bash
cd /Users/thapham/projects
zip -r tab-group-manager.zip tab-group-manager/ \
  --exclude "tab-group-manager/.git*" \
  --exclude "tab-group-manager/.DS_Store" \
  --exclude "tab-group-manager/~" \
  --exclude "tab-group-manager/CLAUDE.md" \
  --exclude "tab-group-manager/generate-icons.js" \
  --exclude "tab-group-manager/README.md" \
  --exclude "tab-group-manager/docs/*" \
  --exclude "tab-group-manager/tgm-screenshot.png" \
  --exclude "tab-group-manager/screenshot-1280x800.png"
```

## 5. Publish to Chrome Web Store

1. Go to [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click **New Item** (first release) or open the existing item → **Package** → **Upload new package**
3. Upload `tab-group-manager.zip`
4. Fill in / verify the store listing:
   - **Short description** (≤132 chars)
   - **Detailed description**
   - **Screenshots** (upload `screenshot-1280x800.png`)
   - **Privacy policy URL**: `https://thaiphamquoc.github.io/tab-group-manager/privacy-policy`
5. Under **Privacy**, justify each permission:
   - `tabGroups` — monitor group state changes
   - `tabs` — read tab titles/URLs for display and search
   - `storage` — persist group data locally
   - `bookmarks` — save a group as a Chrome bookmark
6. Click **Submit for review**

## 6. Review timeline

- First submission: 1–3 business days
- Subsequent updates: usually faster

## 7. After publish

- Tag the release in git: `git tag v1.x.x && git push origin v1.x.x`
- Update `README.md` with the Chrome Web Store link if not already there
