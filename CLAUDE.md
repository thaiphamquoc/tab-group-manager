# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This repo contains Chrome extensions built with vanilla JavaScript and Manifest V3. Currently one extension: **Tab Group Manager** (`tab-group-manager/`).

## Loading & Running

No build step — load directly in Chrome:

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `tab-group-manager/`

To debug the service worker: Chrome extensions page → find the extension → click "Service Worker" link to open DevTools for `background.js`.

## Icon Generation

If icons need to be regenerated:

```bash
node tab-group-manager/generate-icons.js
# Then convert SVGs to PNGs (requires rsvg-convert):
rsvg-convert -w 16 tab-group-manager/icons/icon16.svg -o tab-group-manager/icons/icon16.png
rsvg-convert -w 48 tab-group-manager/icons/icon48.svg -o tab-group-manager/icons/icon48.png
rsvg-convert -w 128 tab-group-manager/icons/icon128.svg -o tab-group-manager/icons/icon128.png
```

## Architecture: Tab Group Manager

**Manifest V3** extension with three components:

- **`background.js`** — Service worker. Listens to Chrome `tabGroups` and `tabs` API events, syncs group state to `chrome.storage.local`.
- **`popup.html` / `popup.js` / `popup.css`** — Popup UI rendered when the toolbar icon is clicked. Reads from storage and handles all user interactions.

### Storage Schema

All data lives under a single `chrome.storage.local` key: `tgm_groups` (an object). Keys within that object:

- `active_${groupId}` — active tab groups (Chrome-assigned ID)
- `arch_${groupId}_${timestamp}` — archived groups (closed groups are archived automatically, not deleted)

Each entry is a group snapshot: `{ key, title, color, status, activeId, windowId, tabs[], updatedAt, meta: { category, notes } }`. Archived entries also have `archivedAt`.

### Key Behaviors

- **Auto-archive on close**: when a tab group is removed, `background.js` moves it from `active_*` to `arch_*` storage. Duplicate-title archived entries are updated in place (not duplicated).
- **Metadata inheritance**: if a closed group is reopened with the same title, it inherits the archived group's category/notes.
- **Client-side search**: `popup.js` filters across group titles, categories, notes, and tab titles/URLs in real time. Tab list is shown inline only when a search is active.
- **Keyboard navigation**: arrow keys navigate search results; Enter activates the selected group (or the only result if none selected).
- **Category manager**: rename or delete categories across all groups in bulk (pencil/trash icons in the category manager modal, opened via "Manage" button).

### Permissions

`tabGroups`, `tabs`, `storage` — no remote network access, no server backend.
