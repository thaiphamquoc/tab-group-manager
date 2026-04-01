// Background service worker
// Tracks all tab groups (active + archived) in chrome.storage.local.
// Syncs group state on creation/update, archives on removal.

const GROUPS_KEY = "tgm_groups";

// ── Storage helpers ────────────────────────────────────────────────────────

async function getGroups() {
  const r = await chrome.storage.local.get(GROUPS_KEY);
  return r[GROUPS_KEY] || {};
}

async function saveGroups(groups) {
  await chrome.storage.local.set({ [GROUPS_KEY]: groups });
}

function activeKey(groupId) {
  return `active_${groupId}`;
}

// ── Sync a live group (creates or overwrites active entry) ─────────────────

async function syncGroup(groupId) {
  let group;
  try {
    group = await chrome.tabGroups.get(groupId);
  } catch {
    return; // group no longer exists
  }

  const tabs = await chrome.tabs.query({ groupId });
  const groups = await getGroups();
  const key = activeKey(groupId);

  // If this is a brand-new active entry, check whether an archived entry with
  // the same title already exists (the user reopened a previously closed group
  // natively). Carry over its meta so categories/notes aren't lost.
  let inheritedMeta = groups[key]?.meta;
  if (!inheritedMeta) {
    const title = group.title || "";
    const archivedMatch = Object.values(groups).find(
      (g) => g.status === "archived" && g.title === title
    );
    if (archivedMatch) {
      inheritedMeta = archivedMatch.meta;
      // Remove the stale archived entry — this active group replaces it.
      delete groups[archivedMatch.key];
    }
  }

  groups[key] = {
    key,
    title: group.title || "",
    color: group.color,
    status: "active",
    activeId: groupId,
    windowId: group.windowId,
    tabs: tabs.map((t) => ({
      url: t.url || "",
      title: t.title || t.url || "(no title)",
      favIconUrl: t.favIconUrl || "",
    })),
    updatedAt: Date.now(),
    meta: inheritedMeta || { category: "", notes: "" },
  };

  await saveGroups(groups);
}

// ── Tab group events ───────────────────────────────────────────────────────

chrome.tabGroups.onCreated.addListener((group) => syncGroup(group.id));
chrome.tabGroups.onUpdated.addListener((group) => syncGroup(group.id));

chrome.tabGroups.onRemoved.addListener(async (group) => {
  const groups = await getGroups();
  const key = activeKey(group.id);
  const existing = groups[key];

  if (existing) {
    // Check if an archived entry with the same title already exists.
    // If so, update it in place instead of creating a duplicate.
    const title = existing.title || "";
    const dup = Object.values(groups).find(
      (g) => g.status === "archived" && g.title === title
    );

    if (dup) {
      groups[dup.key] = {
        ...dup,
        color: existing.color,
        tabs: existing.tabs,
        archivedAt: Date.now(),
        updatedAt: Date.now(),
      };
    } else {
      const archKey = `arch_${group.id}_${Date.now()}`;
      groups[archKey] = {
        ...existing,
        key: archKey,
        status: "archived",
        activeId: null,
        archivedAt: Date.now(),
      };
    }

    delete groups[key];
    await saveGroups(groups);
  }
});

// ── Tab events — keep snapshots current ───────────────────────────────────

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    syncGroup(tab.groupId);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const hasRelevantChange =
    "url" in changeInfo || "title" in changeInfo || "groupId" in changeInfo;
  if (!hasRelevantChange) return;

  const groupId = tab.groupId;
  if (groupId && groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    syncGroup(groupId);
  }
});

// ── Startup: sync all currently open groups ────────────────────────────────

async function initialize() {
  const openGroups = await chrome.tabGroups.query({});
  for (const group of openGroups) {
    await syncGroup(group.id);
  }

  // Any stored "active" group that no longer exists → archive it
  const openIds = new Set(openGroups.map((g) => activeKey(g.id)));
  const groups = await getGroups();
  let changed = false;

  for (const [key, group] of Object.entries(groups)) {
    if (group.status === "active" && !openIds.has(key)) {
      const title = group.title || "";
      const dup = Object.values(groups).find(
        (g) => g.status === "archived" && g.title === title
      );
      if (dup) {
        groups[dup.key] = { ...dup, color: group.color, tabs: group.tabs, archivedAt: Date.now() };
      } else {
        const archKey = `arch_${group.activeId}_${Date.now()}`;
        groups[archKey] = { ...group, key: archKey, status: "archived", activeId: null, archivedAt: Date.now() };
      }
      delete groups[key];
      changed = true;
    }
  }

  if (changed) await saveGroups(groups);
}

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
