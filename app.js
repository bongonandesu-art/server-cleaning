const APP_VERSION = "v0.3.10";

const DEFAULT_SHOP_BADGE_COLOR = "10";
const SHOP_BADGE_COLORS = {
  "01": { bg: "#8B4513", color: "#fff", border: "transparent", className: "shop-badge-01" },
  "02": { bg: "#FFFF00", color: "#000", border: "#000", className: "shop-badge-02" },
  "03": { bg: "#f59e0b", color: "#1e293b", border: "transparent", className: "shop-badge-03" },
  "04": { bg: "#F5F5DC", color: "#000", border: "#000", className: "shop-badge-04" },
  "05": { bg: "#9ACD32", color: "#000", border: "transparent", className: "shop-badge-05" },
  "06": { bg: "#3b82f6", color: "#fff", border: "transparent", className: "shop-badge-06" },
  "07": { bg: "#008080", color: "#fff", border: "transparent", className: "shop-badge-07" },
  "08": { bg: "#8b5cf6", color: "#fff", border: "transparent", className: "shop-badge-08" },
  "09": { bg: "#ec4899", color: "#fff", border: "transparent", className: "shop-badge-09" },
  "10": { bg: "#6b7280", color: "#fff", border: "transparent", className: "shop-badge-10" }
};

const SHOP_BADGE_NAMES = {
  "01": "サドルブラウン", "02": "イエロー", "03": "アンバー", "04": "ベージュ", "05": "イエローグリーン",
  "06": "ブルー", "07": "ティール/藍緑", "08": "パープル", "09": "ピンク", "10": "グレー"
};

const DEFAULT_ITEMS = {
  beer: [
    { name: "スポンジ通し", days: 7, signal: true },
    { name: "フィルター洗浄", days: 14, signal: true }
  ],
  sour: [
    { name: "カラン洗浄", days: 7, signal: true },
    { name: "フィルター洗浄", days: 14, signal: true }
  ]
};

let appData = null;
let currentMode = "M1";
let setupBackup = null;
let setupInitial = false;
let setupSnapshots = new Map();
let setupNewCards = new Set();
let setupErrors = new Set();

document.addEventListener("DOMContentLoaded", init);

async function init() {
  document.getElementById("menuButton").addEventListener("click", openMenu);

  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("sw.js"); }
    catch (e) { console.warn("Service Worker registration failed:", e); }
  }

  appData = await dbGet("appData");

  if (!appData) {
    appData = createEmptyData();
    setupInitial = true;
    renderSetup(false, true);
    return;
  }

  normalizeData();
  updateHeader();
  currentMode = "M1";
  renderMain();
}

function createEmptyData() {
  return {
    version: 2,
    shopName: "",
    shopBadgeColor: DEFAULT_SHOP_BADGE_COLOR,
    servers: [
      createServer("beer", "ビールサーバー1"),
      createServer("sour", "A1")
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function createServer(type, name = "") {
  return {
    id: crypto.randomUUID(),
    type,
    name,
    items: DEFAULT_ITEMS[type].map(item => createItem(item))
  };
}

function createItem(source) {
  return {
    id: crypto.randomUUID(),
    name: source.name || "",
    days: Math.max(1, Number(source.days) || 7),
    signal: source.signal !== false,
    history: Array.isArray(source.history) ? [...source.history] : [],
    lastCleanedAt: source.lastCleanedAt || null
  };
}

function cloneItem(item) {
  return {
    id: item.id,
    name: item.name,
    days: Math.max(1, Number(item.days) || 7),
    signal: item.signal !== false,
    history: Array.isArray(item.history) ? [...item.history] : [],
    lastCleanedAt: item.lastCleanedAt || null
  };
}

function cloneServer(server) {
  return {
    id: server.id,
    type: server.type,
    name: server.name,
    items: server.items.map(cloneItem)
  };
}

function normalizeData() {
  if (!appData || !Array.isArray(appData.servers)) {
    appData = createEmptyData();
    return;
  }
  appData.shopName = appData.shopName || "";
  if (!SHOP_BADGE_COLORS[appData.shopBadgeColor]) appData.shopBadgeColor = DEFAULT_SHOP_BADGE_COLOR;
  appData.servers.forEach(server => {
    server.id = server.id || crypto.randomUUID();
    server.type = server.type === "sour" ? "sour" : "beer";
    server.name = server.name || "";
    server.items = Array.isArray(server.items) ? server.items : [];
    server.items.forEach(item => {
      item.id = item.id || crypto.randomUUID();
      item.name = item.name || "";
      item.days = Math.max(1, Number(item.days) || 7);
      item.signal = item.signal !== false;
      item.history = Array.isArray(item.history) ? item.history : [];
      item.lastCleanedAt = item.lastCleanedAt || null;
    });
  });
}

function updateHeader() {
  const element = document.getElementById("storeNameHeader");
  if (!element) return;
  const color = SHOP_BADGE_COLORS[appData?.shopBadgeColor] ? appData.shopBadgeColor : DEFAULT_SHOP_BADGE_COLOR;
  const text = element.querySelector(".store-name-text");
  if (text) text.textContent = appData?.shopName || "";
  element.className = `store-name ${SHOP_BADGE_COLORS[color].className}`;
  fitShopBadgeText(element);
}

// ============================================================
// 設定画面（保存ボタン即時活性化イベント完全維持）
// ============================================================

function renderSetup(edit, firstTime) {
  setupInitial = firstTime;
  setupBackup = edit ? JSON.parse(JSON.stringify(appData)) : null;
  setupSnapshots = new Map();
  setupNewCards = new Set();
  setupErrors = new Set();

  const app = document.getElementById("app");
  const d = appData;

  app.innerHTML = `
    <section class="setup-wrap">
      <h1>設定</h1>

      ${firstTime ? `
        <p class="setup-intro">
          店名や各サーバーを登録したのち、メインページに進みます。<br>
          左上の三本線を押すと、取説が確認できます。
        </p>
      ` : ""}

      <div class="form-card shop-form-card">
        <h2>店舗</h2>
        <div class="field">
          <label>${firstTime ? "店名" : "登録店名"}</label>
          ${firstTime
            ? `<input id="shopName" type="text" value="${escAttr(d.shopName)}" placeholder="例：○○店">`
            : `<div class="registered-shop-name">${esc(d.shopName)}</div>`
          }
        </div>
        ${firstTime ? shopBadgePickerHtml(d.shopName, d.shopBadgeColor) : `<p class="notice">店名の変更は、メニューの「特別メニュー：店名変更」から行います。</p>`}
      </div>

      <div class="form-card">
        <h2>ビールサーバー</h2>
        <p class="notice">初期状態は1台・2項目です。サーバー名、締切日数、締切日強調は自由に設定できます。</p>
        <div id="beerServers"></div>
        <div class="add-button-wrap">
          <button class="add-button" type="button" onclick="addServer('beer')">＋ ビールサーバーを追加</button>
        </div>
      </div>

      <div class="form-card">
        <h2>サワーサーバー</h2>
        <p class="notice">卓番号・卓名は自由入力し、入力した順番で表示します。</p>
        <div id="sourServers"></div>
        <div class="add-button-wrap">
          <button class="add-button" type="button" onclick="addServer('sour')">＋ サワーサーバーを追加</button>
        </div>
      </div>

      <div class="setup-finish-bar">
        <button type="button" onclick="finishSetup()">設定を完了しメインページに進む</button>
      </div>
    </section>
  `;

  renderServerEditors("beer");
  renderServerEditors("sour");
  bindSetupInputCommitHandlers();
  bindShopBadgePicker();
}

function serverSnapshot(server) {
  return JSON.parse(JSON.stringify(cloneServer(server)));
}

function restoreServerSnapshot(serverId) {
  const snapshot = setupSnapshots.get(serverId);
  if (!snapshot) return false;
  const index = appData.servers.findIndex(s => s.id === serverId);
  if (index < 0) return false;
  appData.servers[index] = JSON.parse(JSON.stringify(snapshot));
  return true;
}

function readServerCard(card) {
  const server = appData.servers.find(x => x.id === card.dataset.serverId);
  if (!server) return null;

  const nameInput = card.querySelector(".server-name-input");
  const newName = nameInput ? nameInput.value.trim() : server.name;
  const rows = [...card.querySelectorAll(".item-config")].slice(0, 3);
  
  const items = rows.map((row) => {
    const select = row.querySelector(".item-select-box");
    const customInput = row.querySelector(".item-custom-input");
    
    let itemName = "";
    if (select && select.value === "custom") {
      itemName = customInput ? customInput.value.trim() : "";
    } else if (select) {
      itemName = select.value;
    } else if (customInput) {
      itemName = customInput.value.trim();
    }

    return {
      name: itemName,
      days: Math.max(1, Math.min(3650, Number(row.querySelector(".item-days-input")?.value) || 7)),
      signal: !!row.querySelector(".item-signal-input")?.checked
    };
  });
  
  return { server, name: newName, items };
}

function syncCardToWorkingData(card) {
  const data = readServerCard(card);
  if (!data) return;

  const { server, name, items } = data;
  const serverRenamed = server.name !== name;
  server.name = name;

  items.forEach((entry, index) => {
    const item = server.items[index];
    if (!item) return;
    if (item.name !== entry.name) {
      item.name = entry.name;
      item.history = [];
      item.lastCleanedAt = null;
    }
    item.days = entry.days;
    item.signal = entry.signal;
  });

  if (serverRenamed) {
    server.items.forEach(item => {
      item.history = [];
      item.lastCleanedAt = null;
    });
  }
}

function bindSetupInputCommitHandlers() {
  document.querySelectorAll(".server-form-card .server-name-input, .server-form-card .item-custom-input, .server-form-card .item-days-input").forEach(input => {
    input.removeEventListener("input", handleInputChange);
    input.addEventListener("input", handleInputChange);
  });
  document.querySelectorAll(".server-form-card .item-select-box, .server-form-card .item-signal-input").forEach(select => {
    select.removeEventListener("change", handleInputChange);
    select.addEventListener("change", handleInputChange);
  });
}

function handleInputChange(e) {
  const card = e.target.closest(".server-form-card");
  if (card) markCardDirtyFromDom(card);
}

function meaningfulCardState(card) {
  const data = readServerCard(card);
  if (!data) return null;
  return {
    name: data.name,
    items: data.items.map(x => ({ name: x.name, days: x.days, signal: x.signal }))
  };
}

function markCardDirtyFromDom(card) {
  if (!card) return;
  syncCardToWorkingData(card);
  const id = card.dataset.serverId;
  const current = meaningfulCardState(card);
  const snapshot = setupSnapshots.get(id);
  
  const isDirty = !snapshot || JSON.stringify(current) !== JSON.stringify({
    name: snapshot.name,
    items: snapshot.items.map(x => ({ name: x.name, days: x.days, signal: x.signal }))
  });
  
  card.classList.toggle("is-dirty", isDirty);
  const saveBtn = card.querySelector(".server-save-button");
  if (saveBtn) saveBtn.disabled = !isDirty;
  if (isDirty) setupErrors.delete(id);
  updateProblemMarker(card);
}

function updateProblemMarker(card) {
  const marker = card.querySelector(".problem-marker");
  if (marker) marker.classList.toggle("visible", setupErrors.has(card.dataset.serverId));
}

function itemNameEditorHtml(item) {
  const defaultOptions = ["スポンジ通し", "フィルター洗浄", "カラン洗浄"];
  const isCustom = item.name && !defaultOptions.includes(item.name);
  const selectedValue = isCustom ? "custom" : (item.name || "スポンジ通し");

  return `
    <div class="item-name-editor">
      <select class="item-select-box" onchange="handleItemSelectChange(this)">
        <option value="スポンジ通し" ${selectedValue === "スポンジ通し" ? "selected" : ""}>スポンジ通し</option>
        <option value="フィルター洗浄" ${selectedValue === "フィルター洗浄" ? "selected" : ""}>フィルター洗浄</option>
        <option value="カラン洗浄" ${selectedValue === "カラン洗浄" ? "selected" : ""}>カラン洗浄</option>
        <option value="custom" ${isCustom ? "selected" : ""}>直接入力（その他）</option>
      </select>
      <input class="item-custom-input" type="text" 
             value="${isCustom ? escAttr(item.name) : ""}" 
             placeholder="項目名を入力" 
             style="display: ${isCustom ? "block" : "none"};">
    </div>
  `;
}

function handleItemSelectChange(selectElem) {
  const container = selectElem.closest(".item-name-editor");
  const inputElem = container.querySelector(".item-custom-input");
  
  if (selectElem.value === "custom") {
    inputElem.style.display = "block";
    inputElem.value = "";
    inputElem.placeholder = "項目名を入力";
    inputElem.focus();
  } else {
    inputElem.style.display = "none";
    inputElem.value = selectElem.value;
  }
  
  markCardDirtyFromDom(selectElem.closest(".server-form-card"));
}

function renderServerEditors(type) {
  const container = document.getElementById(type === "beer" ? "beerServers" : "sourServers");
  if (!container) return;
  container.innerHTML = "";

  const typeServers = appData.servers.filter(server => server.type === type);
  typeServers.forEach((server, serverIndex) => {
    const card = document.createElement("div");
    card.className = "server-form-card";
    card.dataset.serverId = server.id;

    if (!setupNewCards.has(server.id)) setupSnapshots.set(server.id, serverSnapshot(server));

    const itemHtml = server.items.map((item, index) => {
      if (index < 2) return itemConfigHtml(item, `標準項目 ${index + 1}`, false);
      return `
        <div class="optional-item-box">
          <div class="optional-item-head">
            <label>任意項目</label>
            <button class="danger-button item-delete-button" type="button">削除</button>
          </div>
          ${itemConfigHtml(item, "", true)}
        </div>
      `;
    }).join("");

    const placeholder = serverNamePlaceholder(type);
    card.innerHTML = `
      <div class="problem-marker" aria-hidden="true">!</div>
      <div class="server-form-head">
        <div class="field">
          <label>サーバー名</label>
          <input class="server-name-input" type="text" value="${escAttr(server.name)}" placeholder="${escAttr(placeholder)}">
        </div>
        ${serverIndex > 0 ? `<button class="danger-button server-delete" type="button">削除</button>` : ""}
      </div>
      <div class="server-items">
        ${itemHtml}
      </div>
      ${server.items.length < 3 ? `
        <div class="add-button-wrap">
          <button class="add-button optional-add-button" type="button">＋ 項目を追加</button>
        </div>
      ` : ""}
      <div class="server-local-actions">
        <button class="secondary-button server-cancel-button" type="button">キャンセル</button>
        <button class="primary-button server-save-button" type="button" disabled>保存</button>
      </div>
    `;

    container.appendChild(card);

    card.querySelector(".server-delete")?.addEventListener("click", () => deleteServer(server.id, type));
    card.querySelector(".optional-add-button")?.addEventListener("click", () => addOptional(server.id, type));
    card.querySelector(".item-delete-button")?.addEventListener("click", () => deleteOptional(server.id, type));
    card.querySelector(".server-save-button")?.addEventListener("click", () => saveServerCard(server.id, type));
    card.querySelector(".server-cancel-button")?.addEventListener("click", () => cancelServerCard(server.id, type));
  });

  bindSetupInputCommitHandlers();
}

function itemConfigHtml(item, label, optional) {
  return `
    <div class="field item-field">
      ${label ? `<label>${label}</label>` : ""}
      <div class="item-config">
        ${itemNameEditorHtml(item)}
        <input class="item-days-input" type="number" min="1" max="3650" value="${Number(item.days) || 7}" title="締切日数">
        <label class="item-signal-label">
          <input class="item-signal-input" type="checkbox" ${item.signal ? "checked" : ""}> 締切日強調
        </label>
      </div>
    </div>
  `;
}

function addServer(type) {
  discardEmptyNewCards(type);
  const server = createServer(type, "");
  appData.servers.push(server);
  setupNewCards.add(server.id);
  renderServerEditors(type);
  
  const newCard = document.querySelector(`[data-server-id="${CSS.escape(server.id)}"]`);
  if (newCard) {
    markCardDirtyFromDom(newCard);
    newCard.querySelector(".server-name-input")?.focus();
  }
}

function discardEmptyNewCards(type) {
  const ids = appData.servers.filter(s => s.type === type && setupNewCards.has(s.id)).map(s => s.id);
  for (const id of ids) {
    const server = appData.servers.find(s => s.id === id);
    if (!server) continue;
    const hasMeaningful = server.name.trim() || server.items.some((item, index) => index >= 2 && item.name.trim());
    if (!hasMeaningful) {
      appData.servers = appData.servers.filter(s => s.id !== id);
      setupNewCards.delete(id);
      setupSnapshots.delete(id);
      setupErrors.delete(id);
    }
  }
}

function serverNamePlaceholder(type) {
  const count = appData.servers.filter(server => server.type === type).length;
  if (type === "sour") {
    if (count === 2) return "テーブルの並び順に合わせると管理がスムーズです";
    if (count >= 3) return "他のサーバーと重複しない名前を付けてください。";
    return "例：A1";
  }
  if (count === 1) return "例：厨房手前";
  return "他のサーバーと重複しない名前を付けてください。";
}

function addOptional(serverId, type) {
  const server = appData.servers.find(x => x.id === serverId);
  if (!server || server.items.length >= 3) return;
  server.items.push({ id: crypto.randomUUID(), name: "", days: 7, signal: true, history: [], lastCleanedAt: null });
  renderServerEditors(type);
  const card = document.querySelector(`[data-server-id="${CSS.escape(serverId)}"]`);
  if (card) markCardDirtyFromDom(card);
}

function deleteOptional(serverId, type) {
  const server = appData.servers.find(x => x.id === serverId);
  if (!server || server.items.length !== 3) return;
  if (!window.confirm("3つ目の任意項目を削除しますか？\nこの項目の履歴も削除されます。")) return;
  server.items.splice(2, 1);
  renderServerEditors(type);
  const card = document.querySelector(`[data-server-id="${CSS.escape(serverId)}"]`);
  if (card) markCardDirtyFromDom(card);
}

function deleteServer(serverId, type) {
  const count = appData.servers.filter(x => x.type === type).length;
  if (count <= 1) {
    showToast("ビールとサワーは、それぞれ1台以上必要です。");
    return;
  }
  if (!window.confirm("このサーバーを削除しますか？\nこのサーバーに紐づく履歴も削除されます。")) return;
  appData.servers = appData.servers.filter(x => x.id !== serverId);
  setupSnapshots.delete(serverId);
  setupNewCards.delete(serverId);
  setupErrors.delete(serverId);
  renderServerEditors(type);
}

async function saveServerCard(serverId, type) {
  const card = document.querySelector(`[data-server-id="${CSS.escape(serverId)}"]`);
  if (!card) return;
  syncCardToWorkingData(card);

  const data = readServerCard(card);
  if (!data) return;
  let error = "";
  if (!data.name) error = "サーバー名を入力してください。";
  else {
    const names = appData.servers.filter(s => s.id !== serverId).map(s => s.name.trim());
    if (names.includes(data.name)) error = "他のサーバーと重複しない名前を付けてください。";
    const badItem = data.items.findIndex(x => !x.name);
    if (badItem >= 0) {
      error = "項目名を入力してください。";
    } else {
      const itemNames = data.items.map(x => x.name.trim());
      const hasDuplicate = itemNames.some((name, idx) => itemNames.indexOf(name) !== idx);
      if (hasDuplicate) {
        error = "項目が重複しています";
      }
    }
  }

  if (error) {
    setupErrors.add(serverId);
    updateProblemMarker(card);
    alert(error);
    return;
  }

  setupErrors.delete(serverId);
  setupSnapshots.set(serverId, serverSnapshot(data.server));
  setupNewCards.delete(serverId);
  card.classList.remove("is-dirty");
  card.querySelector(".server-save-button").disabled = true;
  updateProblemMarker(card);
}

function cancelServerCard(serverId, type) {
  if (setupNewCards.has(serverId)) {
    appData.servers = appData.servers.filter(s => s.id !== serverId);
    setupNewCards.delete(serverId);
    setupSnapshots.delete(serverId);
    setupErrors.delete(serverId);
  } else {
    restoreServerSnapshot(serverId);
    setupErrors.delete(serverId);
  }
  renderServerEditors(type);
}

function unfinishedSetupCards() {
  const cards = [...document.querySelectorAll(".server-form-card")];
  const pending = [];
  cards.forEach(card => {
    const save = card.querySelector(".server-save-button");
    if (save && !save.disabled) pending.push(card);
  });
  return pending;
}

async function finishSetup() {
  const shopNameInput = document.getElementById("shopName");
  if (shopNameInput && !shopNameInput.value.trim()) {
    alert("店名を入力してください。");
    shopNameInput.focus();
    return;
  }

  for (const type of ["beer", "sour"]) discardEmptyNewCards(type);
  renderServerEditors("beer");
  renderServerEditors("sour");

  const pending = unfinishedSetupCards();
  if (pending.length) {
    pending.forEach(card => {
      setupErrors.add(card.dataset.serverId);
      updateProblemMarker(card);
    });
    alert("保存していないサーバーがあります");
    pending[0].scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const beer = appData.servers.filter(s => s.type === "beer");
  const sour = appData.servers.filter(s => s.type === "sour");
  if (!beer.length || !sour.length) {
    alert("ビールサーバーとサワーサーバーを、それぞれ1台以上登録してください。");
    return;
  }
  if (appData.servers.some(s => !s.name.trim() || s.items.length < 2 || s.items.some(i => !i.name.trim()))) {
    alert("サーバー名と項目名を確認してください。");
    return;
  }

  const shopName = shopNameInput ? shopNameInput.value.trim() : appData.shopName;
  const selectedBadge = document.querySelector(".shop-badge-option.selected")?.dataset.badgeColor || appData.shopBadgeColor || DEFAULT_SHOP_BADGE_COLOR;
  const now = new Date().toISOString();
  appData.shopName = shopName;
  appData.shopBadgeColor = selectedBadge;
  appData.version = 2;
  appData.updatedAt = now;
  await dbSet("appData", appData);
  setupBackup = null;
  setupInitial = false;
  updateHeader();
  renderMain();
  showToast("設定を保存しました。");
}

// ============================================================
// メイン画面
// ============================================================

function renderMain() {
  currentMode = "M1";
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  updateHeader();
  document.getElementById("app").innerHTML = `
    <div class="fixed-controls">
      <nav class="tabs" aria-label="入力方法">
        <button class="tab active" data-mode="M1">M1.締め切り順に入力</button>
        <button class="tab" data-mode="M2">M2.項目順に入力</button>
        <button class="tab" data-mode="M3">M3.サーバー順に入力</button>
      </nav>
      <div class="action-row" id="mainActions"></div>
    </div>
    <section id="content" class="page"></section>
  `;
  document.querySelectorAll(".tab").forEach(button => {
    button.onclick = () => switchMode(button.dataset.mode);
  });
  renderCurrent();
}

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.mode === mode));
  renderCurrent();
}

function setMainActions(kind) {
  const row = document.getElementById("mainActions");
  if (kind === "m2") {
    row.innerHTML = `
      <button class="primary-button" type="button" id="saveButton">保存</button>
      <button class="secondary-button" type="button" id="cancelButton">キャンセル</button>
    `;
    document.getElementById("saveButton").onclick = saveSelected;
    document.getElementById("cancelButton").onclick = () => renderM2();
  } else {
    row.innerHTML = `
      <button class="primary-button" type="button" id="saveButton">保存</button>
      <button class="secondary-button" type="button" id="clearButton">選択クリヤー</button>
    `;
    document.getElementById("saveButton").onclick = saveSelected;
    document.getElementById("clearButton").onclick = clearSelection;
  }
}

function renderCurrent() {
  if (currentMode === "M1") renderM1();
  else if (currentMode === "M2") renderM2();
  else renderM3();
}

function deadlineFor(item) {
  if (!item.lastCleanedAt) return null;
  const base = new Date(item.lastCleanedAt);
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + Number(item.days));
  return base;
}

function signalFor(item) {
  if (!item.lastCleanedAt) return "white";
  if (!item.signal) return "white";
  const deadline = deadlineFor(item);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((deadline - today) / 86400000);
  if (diff <= 0) return "red";
  if (diff <= 2) return "yellow";
  return "white";
}

function deadlineBadgeHtml(item) {
  const state = signalFor(item) || "white";
  return `<span class="deadline-badge badge-${state}">締切日</span>`;
}

function deadlineText(item) {
  const d = deadlineFor(item);
  if (!d) return "未設定";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function renderM1() {
  setMainActions("normal");
  const content = document.getElementById("content");
  const beer = sortServers(appData.servers.filter(s => s.type === "beer"));
  const sour = sortServers(appData.servers.filter(s => s.type === "sour"));
  content.innerHTML = sectionHtml("ビール", beer) + sectionHtml("サワー", sour);
}

function sectionHtml(title, servers) {
  return `<div class="section-title">${title}</div>${servers.map(serverCardHtml).join("")}`;
}

function serverCardHtml(server) {
  return `
    <article class="server-card ${server.type}">
      <div class="server-card-head"><div class="server-name">${esc(server.name)}</div></div>
      <div class="item-list">
        ${server.items.map(item => itemRowHtml(server, item)).join("")}
      </div>
    </article>
  `;
}

function itemRowHtml(server, item) {
  return `
    <div class="item-row">
      <div class="item-label">
        <label>
          <input type="checkbox" data-server-id="${escAttr(server.id)}" data-item-id="${escAttr(item.id)}">
          <span class="item-name">${esc(item.name)}</span>
        </label>
      </div>
      <div class="deadline-grid">
        <div class="deadline-badge-cell">
          ${deadlineBadgeHtml(item)}
        </div>
        <div class="deadline-date-cell">
          ${deadlineText(item)}
        </div>
      </div>
    </div>
  `;
}

function sortServers(servers) {
  return [...servers].sort((a, b) => priority(a) - priority(b));
}

function priority(server) {
  let best = Number.MAX_SAFE_INTEGER;
  for (const item of server.items) {
    const d = deadlineFor(item);
    if (d) best = Math.min(best, d.getTime());
  }
  return best;
}

function renderM2() {
  setMainActions("m2");
  const content = document.getElementById("content");
  const items = [...new Set(appData.servers.flatMap(server => server.items.map(item => item.name).filter(Boolean)))];

  content.innerHTML = `
    <div class="entry-screen m2-screen">
      <h2 class="entry-title">項目を選ぶ</h2>
      <p class="entry-description">入力する項目を1つ選ぶと、対象となるサーバーが下に表示されます。</p>
      <div class="m2-item-choices">
        ${items.map((name, index) => `
          <label class="choice m2-item-choice">
            <input type="radio" name="m2item" class="m2item" data-name="${escAttr(name)}">
            <span>${esc(name)}</span>
          </label>
        `).join("")}
      </div>
      <div id="m2Servers" class="m2-servers"></div>
    </div>
  `;

  document.querySelectorAll(".m2item").forEach(radio => {
    radio.addEventListener("change", () => renderM2Servers(radio.dataset.name));
  });
}

function renderM2Servers(itemName) {
  const target = document.getElementById("m2Servers");
  if (!target) return;
  const servers = appData.servers
    .filter(server => server.items.some(item => item.name === itemName))
    .sort((a, b) => {
      const typeOrder = { beer: 0, sour: 1 };
      return (typeOrder[a.type] - typeOrder[b.type]) || (appData.servers.indexOf(a) - appData.servers.indexOf(b));
    });

  target.innerHTML = `
    <h3 class="selected-item-title">${esc(itemName)}</h3>
    <p class="entry-description">対象サーバーを選択してください。</p>
    <div class="m2-server-list">
      ${servers.map(server => {
        const item = server.items.find(x => x.name === itemName);
        return `
          <label class="m2-server-tile ${server.type}">
            <input type="checkbox" class="m2server" data-server-id="${escAttr(server.id)}" data-item-id="${escAttr(item.id)}">
            <span class="m2-server-name">${esc(server.name)}</span>
            <div class="deadline-grid">
              <div class="deadline-badge-cell">
                ${deadlineBadgeHtml(item)}
              </div>
              <div class="deadline-date-cell">
                ${deadlineText(item)}
              </div>
            </div>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function renderM3() {
  setMainActions("normal");
  const content = document.getElementById("content");
  const beer = appData.servers.filter(s => s.type === "beer");
  const sour = appData.servers.filter(s => s.type === "sour");
  content.innerHTML = sectionHtml("ビール", beer) + sectionHtml("サワー", sour);
}

async function saveSelected() {
  const checks = [...document.querySelectorAll("input[type=checkbox][data-server-id][data-item-id]:checked")];
  if (!checks.length) {
    alert("保存する項目を選択してください。");
    return;
  }
  const ok = await showConfirm(`${checks.length}件保存しますか？`);
  if (!ok) return;
  const now = new Date().toISOString();
  checks.forEach(check => {
    const server = appData.servers.find(s => s.id === check.dataset.serverId);
    const item = server?.items.find(i => i.id === check.dataset.itemId);
    if (!item) return;
    item.lastCleanedAt = now;
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push(now);
  });
  appData.updatedAt = now;
  await dbSet("appData", appData);
  if (currentMode === "M1") renderM1();
  else if (currentMode === "M2") renderM2();
  else renderM3();
}

function clearSelection() {
  document.querySelectorAll("input[type=checkbox][data-server-id][data-item-id]").forEach(cb => cb.checked = false);
}

function openMenu() {
  if (document.querySelector(".menu-backdrop")) return;
  const backdrop = document.createElement("div");
  backdrop.className = "menu-backdrop";
  backdrop.innerHTML = `
    <aside class="menu-drawer" role="dialog" aria-label="メニュー">
      <h2>メニュー</h2>
      <button class="menu-item" type="button" data-settings>設定</button>
      <button class="menu-item" type="button" data-shop-name>特別メニュー：店名変更</button>
      <button class="menu-item" type="button" data-manual>取扱説明書</button>
      <p class="menu-note">取扱説明書は全体完成後に内容を整えます。</p>
    </aside>
  `;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", e => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("[data-settings]").onclick = () => { backdrop.remove(); renderSetup(true, false); };
  backdrop.querySelector("[data-shop-name]").onclick = () => { backdrop.remove(); openShopNameChange(); };
  backdrop.querySelector("[data-manual]").onclick = () => { backdrop.remove(); showToast("取扱説明書は準備中です。"); };
}

function openShopNameChange() {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal shop-name-change-modal" role="dialog" aria-modal="true">
        <h2>店名変更</h2>
        <p>店名と店舗バッジだけを変更します。登録済みのサーバー・項目・履歴はそのまま残ります。</p>
        <div class="field"><label for="shopNameChangeInput">店名</label><input id="shopNameChangeInput" type="text" value="${escAttr(appData.shopName)}"></div>
        ${shopBadgePickerHtml(appData.shopName, appData.shopBadgeColor)}
        <div class="modal-actions"><button class="secondary-button" type="button" data-cancel>キャンセル</button><button class="primary-button" type="button" data-save>保存</button></div>
      </div>
    </div>
  `;
  bindShopBadgePicker(root);
  root.querySelector("[data-cancel]").onclick = () => root.innerHTML = "";
  root.querySelector("[data-save]").onclick = async () => {
    const value = root.querySelector("#shopNameChangeInput").value.trim();
    if (!value) { alert("店名を入力してください。"); return; }
    const selectedBadge = root.querySelector(".shop-badge-option.selected")?.dataset.badgeColor || appData.shopBadgeColor || DEFAULT_SHOP_BADGE_COLOR;
    appData.shopName = value;
    appData.shopBadgeColor = selectedBadge;
    appData.updatedAt = new Date().toISOString();
    await dbSet("appData", appData);
    root.innerHTML = "";
    updateHeader();
    renderMain();
    showToast("店名を変更しました。");
  };
}


function shopBadgePickerHtml(name, selectedColor) {
  const selected = SHOP_BADGE_COLORS[selectedColor] ? selectedColor : DEFAULT_SHOP_BADGE_COLOR;
  const safeName = name || "店舗名";

  return `
    <div class="shop-badge-picker">
      <div class="field">
        <label>店舗バッジ</label>
        <p class="notice">店名を入力すると、下の10色に反映されます。使用する色を選択してください。</p>
      </div>
      <div class="shop-badge-options">
        ${Object.keys(SHOP_BADGE_COLORS).map(key => `
          <button
            type="button"
            class="shop-badge-option store-name ${selected === key ? "selected" : ""} ${SHOP_BADGE_COLORS[key].className}"
            data-badge-color="${key}"
            aria-label="${SHOP_BADGE_NAMES[key]}"
          >
            <span class="store-name-text">${esc(safeName)}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}


function fitShopBadgeText(scope = document) {
  const texts = [];

  if (scope instanceof Element && scope.matches(".store-name-text")) {
    texts.push(scope);
  } else if (scope instanceof Element || scope === document) {
    texts.push(...scope.querySelectorAll(".store-name-text"));
  }

  texts.forEach(text => {
    const box = text.parentElement;
    if (!box) return;

    text.style.fontSize = "21px";
    text.style.lineHeight = "1.05";

    const maxSize = 21;
    const minSize = 10;
    const step = 0.5;
    const availableWidth = Math.max(1, box.clientWidth - 4);
    const availableHeight = Math.max(1, box.clientHeight - 2);

    let size = maxSize;
    while (size > minSize) {
      text.style.fontSize = `${size}px`;
      text.style.lineHeight = "1.05";

      const fitsWidth = text.scrollWidth <= availableWidth + 1;
      const fitsHeight = text.scrollHeight <= availableHeight + 1;

      if (fitsWidth && fitsHeight) break;
      size -= step;
    }

    text.style.fontSize = `${Math.max(minSize, size)}px`;
  });
}


function bindShopBadgePicker(scope = document) {
  const input = scope.querySelector("#shopName") || scope.querySelector("#shopNameChangeInput");
  const buttons = [...scope.querySelectorAll(".shop-badge-option")];

  if (!buttons.length) return;

  const refresh = () => {
    const value = input ? input.value : appData?.shopName || "";

    buttons.forEach(btn => {
      const text = btn.querySelector(".store-name-text");
      if (text) text.textContent = value || "店舗名";
    });

    requestAnimationFrame(() => fitShopBadgeText(scope));
  };

  buttons.forEach(btn => {
    btn.onclick = () => {
      buttons.forEach(x => x.classList.remove("selected"));
      btn.classList.add("selected");
    };
  });

  if (input) input.addEventListener("input", refresh);
  refresh();
}

function showConfirm(message) {
  return new Promise(resolve => {
    const root = document.getElementById("modalRoot");
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true">
          <h2>保存</h2><p>${esc(message)}</p>
          <div class="modal-actions"><button class="secondary-button" type="button" data-cancel>キャンセル</button><button class="primary-button" type="button" data-ok>OK</button></div>
        </div>
      </div>
    `;
    root.querySelector("[data-cancel]").onclick = () => { root.innerHTML = ""; resolve(false); };
    root.querySelector("[data-ok]").onclick = () => { root.innerHTML = ""; resolve(true); };
  });
}

function showToast(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function escAttr(value) { return esc(value); }