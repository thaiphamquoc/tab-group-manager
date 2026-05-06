const GROUPS_KEY = "tgm_groups";

// ── State ──────────────────────────────────────────────────────────────────

let allGroups = [];        // [{ key, title, color, status, tabs, meta, ... }]
let searchQuery = "";
let activeStatusFilter = "all"; // "all" | "active" | "archived"
let activeCategoryFilter = "";
let editingGroupKey = null;
let selectedIndex = -1;

// ── Load ───────────────────────────────────────────────────────────────────

async function loadData() {
  const r = await chrome.storage.local.get(GROUPS_KEY);
  const stored = r[GROUPS_KEY] || {};

  // Get live tab counts for active groups
  const tabs = await chrome.tabs.query({});
  const tabCounts = {};
  tabs.forEach((t) => {
    if (t.groupId && t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      tabCounts[t.groupId] = (tabCounts[t.groupId] || 0) + 1;
    }
  });

  allGroups = Object.values(stored)
    .map((g) => ({
      ...g,
      meta: g.meta || { category: "", notes: "" },
      tabCount: g.status === "active" ? (tabCounts[g.activeId] || g.tabs.length) : g.tabs.length,
    }))
    .sort((a, b) => {
      // Active first, then by most recently updated
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

  render();
}

// ── Persist meta ───────────────────────────────────────────────────────────

async function saveMeta(key, meta) {
  const r = await chrome.storage.local.get(GROUPS_KEY);
  const stored = r[GROUPS_KEY] || {};
  if (stored[key]) {
    stored[key].meta = meta;
    await chrome.storage.local.set({ [GROUPS_KEY]: stored });
    const group = allGroups.find((g) => g.key === key);
    if (group) group.meta = meta;
  }
}

// ── Delete archived group ──────────────────────────────────────────────────

async function deleteGroup(key) {
  const r = await chrome.storage.local.get(GROUPS_KEY);
  const stored = r[GROUPS_KEY] || {};
  delete stored[key];
  await chrome.storage.local.set({ [GROUPS_KEY]: stored });
  allGroups = allGroups.filter((g) => g.key !== key);
  render();
}

// ── Restore archived group ─────────────────────────────────────────────────

async function restoreGroup(group) {
  if (!group.tabs || group.tabs.length === 0) {
    alert("No tabs recorded for this group.");
    return;
  }

  // getCurrent() returns the popup window — use getLastFocused to get the
  // actual browser window where tabs should be restored.
  const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });

  // Create all tabs in the target window (inactive so they don't flash one by one)
  const tabIds = [];
  for (const tabInfo of group.tabs) {
    const tab = await chrome.tabs.create({
      url: tabInfo.url || "chrome://newtab",
      windowId: win.id,
      active: false,
    });
    tabIds.push(tab.id);
  }

  // Group the tabs — don't pass windowId here, tabs already belong to win.id
  const newGroupId = await chrome.tabs.group({ tabIds });

  // Set title + color first, then expand in a separate call.
  // Combining collapsed:false with the initial update can be ignored by Chrome
  // for freshly created groups.
  await chrome.tabGroups.update(newGroupId, {
    title: group.title || "",
    color: group.color || "grey",
  });
  await chrome.tabGroups.update(newGroupId, { collapsed: false });

  // Activate the first tab — this makes the group visible and focused
  await chrome.tabs.update(tabIds[0], { active: true });
  await chrome.windows.update(win.id, { focused: true });

  window.close();
}

// ── Filters ────────────────────────────────────────────────────────────────

function filteredGroups() {
  const q = searchQuery.toLowerCase();
  return allGroups.filter((g) => {
    if (activeStatusFilter !== "all" && g.status !== activeStatusFilter) return false;
    if (activeCategoryFilter && g.meta.category !== activeCategoryFilter) return false;

    if (!q) return true;
    const inTitle    = (g.title || "").toLowerCase().includes(q);
    const inCategory = (g.meta.category || "").toLowerCase().includes(q);
    const inNotes    = (g.meta.notes || "").toLowerCase().includes(q);
    const inTabs     = g.tabs.some(
      (t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)
    );
    return inTitle || inCategory || inNotes || inTabs;
  });
}

function allCategories() {
  return [...new Set(allGroups.map((g) => g.meta.category).filter(Boolean))].sort();
}

// ── Render ────────────────────────────────────────────────────────────────

function render() {
  renderStatusFilters();
  renderCategoryFilters();
  renderGroups();
}

function renderStatusFilters() {
  const active   = allGroups.filter((g) => g.status === "active").length;
  const archived = allGroups.filter((g) => g.status === "archived").length;

  document.getElementById("btn-all").textContent      = `All (${allGroups.length})`;
  document.getElementById("btn-active").textContent   = `Active (${active})`;
  document.getElementById("btn-archived").textContent = `Archived (${archived})`;

  ["btn-all", "btn-active", "btn-archived"].forEach((id) => {
    const val = id.replace("btn-", "");
    document.getElementById(id).classList.toggle("active", activeStatusFilter === val);
  });
}

function renderCategoryFilters() {
  const container = document.getElementById("category-filters");
  container.innerHTML = "";
  container.appendChild(chip("All", ""));
  for (const cat of allCategories()) {
    container.appendChild(chip(cat, cat));
  }
}

function chip(label, value) {
  const btn = document.createElement("button");
  btn.className = "filter-chip" + (activeCategoryFilter === value ? " active" : "");
  btn.textContent = label;
  btn.addEventListener("click", () => {
    activeCategoryFilter = value;
    render();
  });
  return btn;
}

function renderGroups() {
  const list       = document.getElementById("group-list");
  const emptyState = document.getElementById("empty-state");
  const groups     = filteredGroups();

  list.querySelectorAll(".group-card").forEach((el) => el.remove());
  selectedIndex = -1;

  if (groups.length === 0) {
    emptyState.style.display = "flex";
    emptyState.querySelector("p").textContent =
      searchQuery ? "No groups match your search" : "No tab groups found";
    return;
  }

  emptyState.style.display = "none";
  groups.forEach((g) => list.appendChild(groupCard(g)));
}

function getCards() {
  return [...document.getElementById("group-list").querySelectorAll(".group-card")];
}

function applySelection(index) {
  const cards = getCards();
  cards.forEach((c, i) => c.classList.toggle("keyboard-selected", i === index));
  if (cards[index]) {
    cards[index].scrollIntoView({ block: "nearest" });
  }
  selectedIndex = index;
}

function activateSelected() {
  const cards = getCards();
  if (selectedIndex >= 0 && cards[selectedIndex]) {
    cards[selectedIndex].click();
  }
}

// ── Group card ─────────────────────────────────────────────────────────────

function groupCard(group) {
  const card = document.createElement("div");
  card.className = `group-card ${group.status === "archived" ? "archived" : ""}`;

  // Color dot
  const dot = document.createElement("div");
  dot.className = `group-color color-${group.color || "grey"}`;
  card.appendChild(dot);

  // Info
  const info = document.createElement("div");
  info.className = "group-info";

  const titleRow = document.createElement("div");
  titleRow.className = "title-row";

  const title = document.createElement("span");
  title.className = "group-title";
  title.textContent = group.title || "(Unnamed group)";
  titleRow.appendChild(title);

  if (group.status === "archived") {
    const badge = document.createElement("span");
    badge.className = "status-badge archived-badge";
    badge.textContent = "Archived";
    titleRow.appendChild(badge);
  }
  info.appendChild(titleRow);

  const metaRow = document.createElement("div");
  metaRow.className = "group-meta";

  const count = document.createElement("span");
  count.className = "tab-count";
  count.textContent = `${group.tabCount} tab${group.tabCount !== 1 ? "s" : ""}`;
  metaRow.appendChild(count);

  if (group.meta.category) {
    const badge = document.createElement("span");
    badge.className = "category-badge";
    badge.textContent = group.meta.category;
    metaRow.appendChild(badge);
  }
  info.appendChild(metaRow);

  if (group.meta.notes) {
    const notes = document.createElement("div");
    notes.className = "notes-preview";
    notes.textContent = group.meta.notes;
    info.appendChild(notes);
  }

  // Collapsed tab list (shown when searched or expanded)
  if (searchQuery && group.tabs.length > 0) {
    info.appendChild(tabList(group.tabs));
  }

  card.appendChild(info);

  // Actions
  const actions = document.createElement("div");
  actions.className = "group-actions";

  if (group.status === "active") {
    actions.appendChild(iconBtn(editIcon(), "Edit category & notes", () => openModal(group)));
    actions.appendChild(iconBtn(focusIcon(), "Focus this group", () => focusGroup(group.activeId)));
  } else {
    actions.appendChild(iconBtn(editIcon(), "Edit category & notes", () => openModal(group)));
    actions.appendChild(iconBtn(restoreIcon(), "Restore group", () => restoreGroup(group)));
    actions.appendChild(iconBtn(trashIcon(), "Delete from history", () => {
      if (confirm(`Delete "${group.title || "Unnamed"}" from history?`)) {
        deleteGroup(group.key);
      }
    }));
  }

  card.appendChild(actions);

  card.style.cursor = "pointer";
  card.addEventListener("click", (e) => {
    if (e.target.closest(".group-actions")) return;
    if (group.status === "active") {
      focusGroup(group.activeId);
    } else {
      restoreGroup(group);
    }
  });

  return card;
}

function tabList(tabs) {
  const ul = document.createElement("ul");
  ul.className = "tab-list";
  tabs.slice(0, 5).forEach((t) => {
    const li = document.createElement("li");
    if (t.favIconUrl) {
      const img = document.createElement("img");
      img.src = t.favIconUrl;
      img.className = "tab-favicon";
      img.onerror = () => img.remove();
      li.appendChild(img);
    }
    const span = document.createElement("span");
    span.textContent = t.title || t.url;
    li.appendChild(span);
    ul.appendChild(li);
  });
  if (tabs.length > 5) {
    const li = document.createElement("li");
    li.className = "tab-more";
    li.textContent = `+${tabs.length - 5} more`;
    ul.appendChild(li);
  }
  return ul;
}

// ── Focus active group ─────────────────────────────────────────────────────

async function focusGroup(groupId) {
  const tabs = await chrome.tabs.query({ groupId });
  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    window.close();
  }
}

// ── Modal ──────────────────────────────────────────────────────────────────

function openModal(group) {
  editingGroupKey = group.key;
  document.getElementById("modal-group-name").textContent = group.title || "(Unnamed group)";
  document.getElementById("category-input").value = group.meta.category || "";
  document.getElementById("notes-input").value    = group.meta.notes || "";

  const datalist = document.getElementById("category-suggestions");
  datalist.innerHTML = "";
  allCategories().forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    datalist.appendChild(opt);
  });

  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("category-input").focus();
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  editingGroupKey = null;
}

async function saveModal() {
  if (!editingGroupKey) return;
  const meta = {
    category: document.getElementById("category-input").value.trim(),
    notes:    document.getElementById("notes-input").value.trim(),
  };
  await saveMeta(editingGroupKey, meta);
  closeModal();
  render();
}

// ── Icon helpers ───────────────────────────────────────────────────────────

function iconBtn(svgEl, title, onClick, extraClass) {
  const btn = document.createElement("button");
  btn.className = "icon-btn" + (extraClass ? ` ${extraClass}` : "");
  btn.title = title;
  btn.appendChild(svgEl);
  btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return btn;
}

function makeSvg(paths) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.innerHTML = paths;
  return svg;
}

const editIcon    = () => makeSvg(`<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>`);
const pencilIcon  = () => makeSvg(`<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>`);
const focusIcon   = () => makeSvg(`<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>`);
const restoreIcon = () => makeSvg(`<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.7L1 10"/>`);
const trashIcon   = () => makeSvg(`<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>`);

// ── Search & filter events ─────────────────────────────────────────────────

const searchInput = document.getElementById("search");
const clearBtn    = document.getElementById("clear-search");

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  clearBtn.classList.toggle("visible", searchQuery.length > 0);
  renderGroups();
});

searchInput.addEventListener("keydown", (e) => {
  const cards = getCards();
  if (!cards.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    applySelection(Math.min(selectedIndex + 1, cards.length - 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    applySelection(Math.max(selectedIndex - 1, 0));
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (selectedIndex >= 0) {
      activateSelected();
    } else if (cards.length === 1) {
      // Auto-activate the only result on Enter even without arrow navigation
      cards[0].click();
    }
  }
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchQuery = "";
  clearBtn.classList.remove("visible");
  searchInput.focus();
  renderGroups();
});

["btn-all", "btn-active", "btn-archived"].forEach((id) => {
  document.getElementById(id).addEventListener("click", () => {
    activeStatusFilter = id.replace("btn-", "");
    render();
  });
});

// ── Modal events ───────────────────────────────────────────────────────────

document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal-save").addEventListener("click", saveModal);
document.querySelector(".modal-backdrop").addEventListener("click", closeModal);
document.getElementById("modal").addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if (e.key === "Enter" && e.target.id !== "notes-input") saveModal();
});

// ── Export / Import ────────────────────────────────────────────────────────

async function exportGroups() {
  const r = await chrome.storage.local.get(GROUPS_KEY);
  const stored = r[GROUPS_KEY] || {};
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    groups: stored,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tab-groups-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importGroups(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    alert("Invalid file: could not parse JSON.");
    return;
  }

  const incoming = payload.groups || payload;
  if (typeof incoming !== "object" || Array.isArray(incoming)) {
    alert("Invalid export file format.");
    return;
  }

  const r = await chrome.storage.local.get(GROUPS_KEY);
  const stored = r[GROUPS_KEY] || {};

  let added = 0, skipped = 0;
  for (const [key, value] of Object.entries(incoming)) {
    if (stored[key]) {
      skipped++;
    } else {
      stored[key] = value;
      added++;
    }
  }

  await chrome.storage.local.set({ [GROUPS_KEY]: stored });
  await loadData();

  const msg = added === 0
    ? `No new groups imported (${skipped} already exist).`
    : `Imported ${added} group${added !== 1 ? "s" : ""}${skipped > 0 ? `, ${skipped} skipped (already exist)` : ""}.`;
  alert(msg);
}

// ── Category manager ───────────────────────────────────────────────────────

function openCategoryManager() {
  renderCategoryManager();
  document.getElementById("cat-modal").classList.remove("hidden");
}

function closeCategoryManager() {
  document.getElementById("cat-modal").classList.add("hidden");
}

function renderCategoryManager() {
  const list = document.getElementById("cat-list");
  const empty = document.getElementById("cat-empty");
  list.innerHTML = "";

  // Build map: category → count of groups using it
  const catCounts = new Map();
  for (const g of allGroups) {
    const cat = g.meta.category;
    if (cat) catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
  }

  const cats = [...catCounts.keys()].sort();

  if (cats.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  for (const cat of cats) {
    const row = document.createElement("div");
    row.className = "cat-row";

    const name = document.createElement("span");
    name.className = "cat-name";
    name.textContent = cat;
    row.appendChild(name);

    const count = document.createElement("span");
    count.className = "cat-count";
    count.textContent = `${catCounts.get(cat)} group${catCounts.get(cat) !== 1 ? "s" : ""}`;
    row.appendChild(count);

    row.appendChild(iconBtn(pencilIcon(), "Rename", () => openRenameCategory(cat)));
    row.appendChild(iconBtn(trashIcon(), "Delete", async () => {
      if (confirm(`Remove category "${cat}" from all groups?`)) {
        await bulkUpdateCategory(cat, "");
        renderCategoryManager();
        render();
      }
    }, "danger"));

    list.appendChild(row);
  }
}

// Rename category flow
let renamingFrom = null;

function openRenameCategory(oldName) {
  renamingFrom = oldName;
  document.getElementById("rename-input").value = oldName;
  document.getElementById("rename-modal").classList.remove("hidden");
  document.getElementById("rename-input").select();
}

function closeRenameCategory() {
  document.getElementById("rename-modal").classList.add("hidden");
  renamingFrom = null;
}

async function saveRenameCategory() {
  const newName = document.getElementById("rename-input").value.trim();
  if (!newName || newName === renamingFrom) { closeRenameCategory(); return; }
  await bulkUpdateCategory(renamingFrom, newName);
  closeRenameCategory();
  renderCategoryManager();
  render();
}

async function bulkUpdateCategory(oldCat, newCat) {
  const r = await chrome.storage.local.get(GROUPS_KEY);
  const stored = r[GROUPS_KEY] || {};
  for (const key of Object.keys(stored)) {
    if (stored[key].meta?.category === oldCat) {
      stored[key].meta.category = newCat;
    }
  }
  await chrome.storage.local.set({ [GROUPS_KEY]: stored });
  // Update in-memory
  for (const g of allGroups) {
    if (g.meta.category === oldCat) g.meta.category = newCat;
  }
}

document.getElementById("export-btn").addEventListener("click", exportGroups);
document.getElementById("import-btn").addEventListener("click", () => {
  document.getElementById("import-file").value = "";
  document.getElementById("import-file").click();
});
document.getElementById("import-file").addEventListener("change", (e) => {
  if (e.target.files[0]) importGroups(e.target.files[0]);
});

document.getElementById("manage-categories-btn").addEventListener("click", openCategoryManager);
document.getElementById("cat-modal-close").addEventListener("click", closeCategoryManager);
document.getElementById("cat-modal-backdrop").addEventListener("click", closeCategoryManager);
document.getElementById("cat-modal").addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCategoryManager();
});

document.getElementById("rename-cancel").addEventListener("click", closeRenameCategory);
document.getElementById("rename-save").addEventListener("click", saveRenameCategory);
document.getElementById("rename-modal-backdrop").addEventListener("click", closeRenameCategory);
document.getElementById("rename-modal").addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeRenameCategory();
  if (e.key === "Enter") saveRenameCategory();
});

// ── Init ───────────────────────────────────────────────────────────────────

loadData().then(() => {
  document.getElementById("search").focus();
});
