// ═══════════════════════════════════════════
//  LINKVAULT — app.js
// ═══════════════════════════════════════════
const LS_CATS = "linkvault_categories";
const LS_LINKS = "linkvault_links";
const LS_USAGE = "linkvault_usage";
const HOLD_MS = 2000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const RECENT_LIMIT = 6;

const DEFAULT_CATEGORIES = [
  { id: "uncategorized", name: "UNCATEGORIZED", color: "#bbbbbb", permanent: true },
  { id: "data-host", name: "DATA HOST", color: "#8a8a8a" }
];
const DEFAULT_LINKS = [
  { id: "l1", title: "GitHub", url: "https://github.com", subtitle: "", category: "data-host", tags: [] },
];

function loadCategories() {
  const raw = localStorage.getItem(LS_CATS);
  if (raw) return JSON.parse(raw);
  localStorage.setItem(LS_CATS, JSON.stringify(DEFAULT_CATEGORIES));
  return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
}
function loadLinks() {
  const raw = localStorage.getItem(LS_LINKS);
  if (raw) return JSON.parse(raw);
  localStorage.setItem(LS_LINKS, JSON.stringify(DEFAULT_LINKS));
  return JSON.parse(JSON.stringify(DEFAULT_LINKS));
}
function loadUsage() {
  const raw = localStorage.getItem(LS_USAGE);
  return raw ? JSON.parse(raw) : [];
}
function saveCategories() { localStorage.setItem(LS_CATS, JSON.stringify(categories)); }
function saveLinks() { localStorage.setItem(LS_LINKS, JSON.stringify(links)); }
function saveUsage() { localStorage.setItem(LS_USAGE, JSON.stringify(usage)); }

let categories = loadCategories();
let links = loadLinks();
let usage = loadUsage();
let activeLinkId = null;

function logUsage(linkId) { usage.push({ linkId, ts: Date.now() }); saveUsage(); }

function getRecentLinks() {
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const recent = usage.filter(u => u.ts >= cutoff).sort((a, b) => b.ts - a.ts);
  const seen = new Set();
  const orderedIds = [];
  recent.forEach(u => { if (!seen.has(u.linkId)) { seen.add(u.linkId); orderedIds.push(u.linkId); } });
  return orderedIds.slice(0, RECENT_LIMIT).map(id => links.find(l => l.id === id)).filter(Boolean);
}

const categoryList = document.getElementById("categoryList");
const addCatBtn = document.getElementById("addCatBtn");
const recentGrid = document.getElementById("recentGrid");
const linkSections = document.getElementById("linkSections");
const addLinkFab = document.getElementById("addLinkFab");

const addCatPopup = document.getElementById("addCatPopup");
const newCatName = document.getElementById("newCatName");
const newCatColor = document.getElementById("newCatColor");
const newCatSubmit = document.getElementById("newCatSubmit");
const newCatCancel = document.getElementById("newCatCancel");

const linkPopup = document.getElementById("linkPopup");
const editTitle = document.getElementById("editTitle");
const editUrl = document.getElementById("editUrl");
const editCategory = document.getElementById("editCategory");
const editTag = document.getElementById("editTag");
const deleteLinkBtn = document.getElementById("deleteLinkBtn");
const linkPopupClose = document.getElementById("linkPopupClose");
const linkPopupSubmit = document.getElementById("linkPopupSubmit");

function getOrderedCategories() {
  return [...categories].sort((a, b) => (a.permanent ? 1 : 0) - (b.permanent ? 1 : 0));
}

function renderCategoryBar() {
  categoryList.querySelectorAll(".cat-chip").forEach(el => el.remove());
  getOrderedCategories().forEach(cat => {
    const chip = document.createElement("button");
    chip.className = "cat-chip";
    chip.style.background = cat.color;
    chip.textContent = cat.name;
    chip.onclick = () => {
      const target = document.getElementById("section-" + cat.id);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    categoryList.appendChild(chip);
  });
  editCategory.innerHTML = getOrderedCategories().map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  renderAddCategorySelect();
}

function renderRecent() {
  recentGrid.innerHTML = "";
  const recent = getRecentLinks();
  if (recent.length === 0) {
    recentGrid.innerHTML = `<div class="empty-state">Nothing opened yet — links you tap will show up here.</div>`;
    return;
  }
  recent.forEach(link => recentGrid.appendChild(buildCard(link)));
}

function renderSections() {
  linkSections.innerHTML = "";
  getOrderedCategories().forEach(cat => {
    const block = document.createElement("div");
    block.className = "section-block" + (cat.permanent ? " uncategorized-block" : "");
    block.id = "section-" + cat.id;
    block.innerHTML = `<div class="cat-divider"><span>${cat.name.toLowerCase()}</span></div><div class="grid catgrid" data-cat="${cat.id}"></div>`;
    const grid = block.querySelector(".grid");
    const catLinks = links.filter(l => l.category === cat.id);
    if (catLinks.length === 0) {
      grid.innerHTML = `<div class="empty-state">No links yet</div>`;
    } else {
      catLinks.forEach(link => grid.appendChild(buildCard(link)));
    }
    linkSections.appendChild(block);
  });
}

// Reorders `links` so draggedId sits where targetId currently is
// (only meaningful within the same category, since category grids
// filter+preserve this array's relative order when rendering).
function reorderLinks(draggedId, targetId) {
  const fromIndex = links.findIndex(l => l.id === draggedId);
  if (fromIndex === -1) return;
  const [draggedLink] = links.splice(fromIndex, 1);
  const toIndex = links.findIndex(l => l.id === targetId);
  if (toIndex === -1) { links.splice(fromIndex, 0, draggedLink); saveLinks(); return; }
  links.splice(toIndex, 0, draggedLink);
  saveLinks();
}

function buildCard(link) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = link.id;
  card.innerHTML = `<div class="card-title">${link.title}</div>`;

  const DRAG_THRESHOLD = 12;
  let holdTimer = null;
  let firedHold = false;
  let dragging = false;
  let startX = 0, startY = 0;
  let dropTargetEl = null;

  const canReorder = () => !!card.closest(".catgrid");
  const clearDropHighlight = () => { if (dropTargetEl) { dropTargetEl.classList.remove("drop-target"); dropTargetEl = null; } };
  const cancelHold = () => { clearTimeout(holdTimer); card.classList.remove("pressing"); };

  const onMove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging && !firedHold && canReorder() && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      dragging = true;
      clearTimeout(holdTimer);
      card.classList.remove("pressing");
      card.classList.add("dragging");
      card.style.touchAction = "none";
    }
    if (dragging) {
      card.style.transform = `translate(${dx}px, ${dy}px)`;
      card.style.pointerEvents = "none";
      const el = document.elementFromPoint(e.clientX, e.clientY);
      card.style.pointerEvents = "";
      clearDropHighlight();
      const targetCard = el ? el.closest(".card") : null;
      if (targetCard && targetCard !== card && targetCard.closest(".catgrid") === card.closest(".catgrid")) {
        dropTargetEl = targetCard;
        dropTargetEl.classList.add("drop-target");
      }
    }
  };

  const endDrag = () => {
    document.removeEventListener("pointermove", onMove);
    if (dragging) {
      const targetId = dropTargetEl ? dropTargetEl.dataset.id : null;
      clearDropHighlight();
      card.classList.remove("dragging");
      card.style.transform = "";
      card.style.touchAction = "";
      dragging = false;
      if (targetId && targetId !== link.id) reorderLinks(link.id, targetId);
      renderSections();
      renderRecent();
      return true;
    }
    return false;
  };

  card.addEventListener("pointerdown", (e) => {
    firedHold = false;
    dragging = false;
    startX = e.clientX; startY = e.clientY;
    holdTimer = setTimeout(() => {
      firedHold = true;
      card.classList.add("pressing");
      openLinkPopup(link); // hold-still = edit popup, which includes Delete
    }, HOLD_MS);
    document.addEventListener("pointermove", onMove);
  });

  card.addEventListener("pointerup", () => {
    cancelHold();
    const wasDragging = endDrag();
    if (!wasDragging && !firedHold) {
      logUsage(link.id);
      window.open(link.url, "_blank");
      renderRecent();
    }
  });

  card.addEventListener("pointercancel", () => { cancelHold(); endDrag(); });

  return card;
}

addCatBtn.onclick = () => {
  newCatName.value = "";
  newCatColor.value = "#888888";
  addCatPopup.classList.remove("hidden");
};
newCatCancel.onclick = () => addCatPopup.classList.add("hidden");
newCatSubmit.onclick = () => {
  const name = newCatName.value.trim();
  if (!name) return;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
  categories.push({ id, name: name.toUpperCase(), color: newCatColor.value });
  saveCategories();
  addCatPopup.classList.add("hidden");
  renderCategoryBar();
  renderSections();
};

function openLinkPopup(link) {
  activeLinkId = link.id;
  editTitle.value = link.title;
  editUrl.value = link.url;
  editCategory.value = link.category;
  editTag.value = "";
  linkPopup.classList.remove("hidden");
}
linkPopupClose.onclick = () => { linkPopup.classList.add("hidden"); renderSections(); renderRecent(); };
deleteLinkBtn.onclick = () => {
  links = links.filter(l => l.id !== activeLinkId);
  saveLinks();
  linkPopup.classList.add("hidden");
  renderSections(); renderRecent();
};
linkPopupSubmit.onclick = () => {
  const link = links.find(l => l.id === activeLinkId);
  if (!link) return;
  link.title = editTitle.value.trim() || link.title;
  link.url = editUrl.value.trim() || link.url;
  link.category = editCategory.value;
  const tag = editTag.value.trim();
  if (tag) { link.tags = link.tags || []; link.tags.push(tag); }
  saveLinks();
  linkPopup.classList.add("hidden");
  renderSections(); renderRecent();
};

// ── View switching (replaces window.location navigation) ──
const indexView = document.getElementById("indexView");
const addView = document.getElementById("addView");
function showIndexView() {
  indexView.classList.add("active");
  addView.classList.remove("active");
  renderCategoryBar(); renderRecent(); renderSections();
}
function showAddView() {
  addView.classList.add("active");
  indexView.classList.remove("active");
  renderAddCategorySelect();
}
addLinkFab.onclick = showAddView;

// ── Add Link page logic ──
const categorySelectAdd = document.getElementById("category");
function renderAddCategorySelect() {
  if (categories.length === 0) {
    categorySelectAdd.innerHTML = `<option value="">No categories yet — add one on the main page first</option>`;
  } else {
    categorySelectAdd.innerHTML = getOrderedCategories().map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  }
}
document.getElementById("backBtn").onclick = showIndexView;
document.getElementById("saveBtn").onclick = () => {
  const title = document.getElementById("title").value.trim();
  const url = document.getElementById("url").value.trim();
  const subtitle = document.getElementById("subtitle").value.trim();
  const category = categorySelectAdd.value;
  const notes = document.getElementById("notes").value.trim();

  if (!title || !url || !category) {
    alert("Link Name, Website URL, and Category are required.");
    return;
  }

  links.push({
    id: "l-" + Date.now().toString(36),
    title, url, subtitle, category, notes,
    tags: []
  });
  saveLinks();

  document.getElementById("title").value = "";
  document.getElementById("url").value = "";
  document.getElementById("subtitle").value = "";
  document.getElementById("notes").value = "";

  showIndexView();
};

// ── Offline icons row: max 5 total, "+" adds a custom one ──
const MAX_ICONS = 5;
const iconRow = document.getElementById("iconRow");
const addIconBtn = document.getElementById("addIconBtn");
addIconBtn.onclick = () => {
  const currentCount = iconRow.querySelectorAll("a.icon-btn").length;
  if (currentCount >= MAX_ICONS) {
    alert("Maksimal 5 icon link.");
    return;
  }
  const name = prompt("Nama link (contoh: Dropbox):");
  if (!name) return;
  const url = prompt("URL link (contoh: https://dropbox.com):");
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.className = "icon-btn";
  a.textContent = "🔗 " + name;
  iconRow.insertBefore(a, addIconBtn);
  if (iconRow.querySelectorAll("a.icon-btn").length >= MAX_ICONS) {
    addIconBtn.style.display = "none";
  }
};

// ── Local storage folder icon ──
// Browser tidak bisa "menembus" ke filesystem HP secara bebas (sandbox
// keamanan). Yang bisa dilakukan: memicu file/folder picker bawaan OS
// lewat <input type="file" webkitdirectory>, lalu membaca nama-nama
// file yang dipilih user. Ini cara paling dekat ke "akses folder lokal"
// yang diizinkan di web.
const localFolderInput = document.getElementById("localFolderInput");
const localFolderResult = document.getElementById("localFolderResult");
localFolderInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) { localFolderResult.textContent = ""; return; }
  const folderName = files[0].webkitRelativePath.split("/")[0];
  localFolderResult.textContent = `Folder "${folderName}" — ${files.length} file terbaca.`;
});

// ── Init ──
renderCategoryBar();
renderRecent();
renderSections();

// ── Register service worker for offline support ──
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
