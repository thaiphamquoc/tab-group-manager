# Tab Group Manager

> A Chrome extension to categorize and search your tab groups — including closed ones.

**Features:**
- View all active and archived tab groups in one place
- Assign categories and notes to any group
- Search across group titles, categories, notes, and tab titles/URLs
- Restore archived groups (reopens all tabs) with one click
- Manage categories in bulk — rename or delete across all groups
- Keyboard navigation: `↑`/`↓` to move, `Enter` to activate

**Permissions used:** `tabGroups`, `tabs`, `storage` — no network access, all data stays local.

## Known limitation: Chrome's "Save tab groups" feature

Chrome has a built-in **Save tab groups** feature that keeps closed groups as
collapsed pills in the tab strip so you can click them to reopen. These
saved-but-closed groups are **not exposed to the Chrome extension API**, so
this extension cannot detect them.

If you restore an archived group from the extension while a saved pill for
the same group still exists in Chrome's tab strip, Chrome will end up with
**two pills with the same name** — the saved one and a new one created by
the extension.

**To avoid duplicates:**
- If a saved pill for the group is still in your tab strip, click that pill
  in Chrome directly instead of using the extension's restore button.
- Use the extension's restore only for groups that are no longer pinned in
  Chrome's tab strip.

The extension shows a one-time warning before restoring to remind you of
this. You can dismiss it permanently with the "Don't show again" checkbox.

## Installation

No build step required.

1. Clone this repo
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select this folder

## License

[MIT](LICENSE) © 2026 Thai Pham
