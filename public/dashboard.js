const state = {
  games: [],
  details: [],
  activeGameId: "",
  selectedGameId: "",
  imageSearchConfigured: false,
};

const els = {
  createGameForm: document.querySelector("#createGameForm"),
  savedGamesList: document.querySelector("#savedGamesList"),
  editorTitle: document.querySelector("#editorTitle"),
  editorMeta: document.querySelector("#editorMeta"),
  editorStatus: document.querySelector("#editorStatus"),
  gameTitle: document.querySelector("#gameTitle"),
  gameTheme: document.querySelector("#gameTheme"),
  saveGame: document.querySelector("#saveGame"),
  generateWords: document.querySelector("#generateWords"),
  recommendAll: document.querySelector("#recommendAll"),
  startLive: document.querySelector("#startLive"),
  deckCount: document.querySelector("#deckCount"),
  approvedCount: document.querySelector("#approvedCount"),
  missingCount: document.querySelector("#missingCount"),
  readyState: document.querySelector("#readyState"),
  manualWord: document.querySelector("#manualWord"),
  manualDescription: document.querySelector("#manualDescription"),
  addWord: document.querySelector("#addWord"),
  deckList: document.querySelector("#deckList"),
  toast: document.querySelector("#dashboardToast"),
};

loadDashboard();

els.createGameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = document.querySelector("#newGameTitle").value.trim();
  const theme = document.querySelector("#newGameTheme").value.trim();
  if (!theme) return showToast("Enter a theme first.");
  await adminAction("/api/admin/games/create", { title, theme });
  document.querySelector("#newGameTitle").value = "";
  document.querySelector("#newGameTheme").value = "";
  showToast("Theme created.");
});

els.saveGame.addEventListener("click", async () => {
  const game = selectedGame();
  if (!game) return;
  syncHeaderFields(game);
  await adminAction("/api/admin/games/save", { game });
  showToast("Game saved.");
});

els.generateWords.addEventListener("click", async () => {
  const game = selectedGame();
  if (!game) return;
  if (!confirm("Replace this deck with a freshly generated themed deck?")) return;
  syncHeaderFields(game);
  await adminAction("/api/admin/games/generate-words", {
    id: game.id,
    title: game.title,
    theme: game.theme,
    count: Math.max(75, game.wordDeck.length || 75),
  });
  showToast("Word deck regenerated.");
});

els.recommendAll.addEventListener("click", async () => {
  const game = selectedGame();
  if (!game) return;
  await adminAction("/api/admin/games/recommend-images", { id: game.id });
  showToast(state.imageSearchConfigured ? "Image recommendations updated." : "Generated placeholder recommendations added.");
});

els.startLive.addEventListener("click", async () => {
  const game = selectedGame();
  if (!game) return;
  syncHeaderFields(game);
  await adminAction("/api/admin/games/save", { game }, { quiet: true });
  await adminAction("/api/admin/games/start-live", { id: game.id });
  showToast("Live game is ready. Open the host dashboard.");
});

els.addWord.addEventListener("click", () => {
  const game = selectedGame();
  if (!game) return;
  const word = els.manualWord.value.trim();
  if (!word) return showToast("Type a word first.");
  game.wordDeck.push({
    id: `${slug(word)}-${Date.now()}`,
    word,
    description: els.manualDescription.value.trim(),
    approvedImageUrl: "",
    imageSourceUrl: "",
    imageStatus: "pending",
    notes: "",
    imageRecommendations: [],
  });
  game.status = "draft";
  els.manualWord.value = "";
  els.manualDescription.value = "";
  render();
});

els.gameTitle.addEventListener("input", () => {
  const game = selectedGame();
  if (game) game.title = els.gameTitle.value;
});

els.gameTheme.addEventListener("input", () => {
  const game = selectedGame();
  if (game) game.theme = els.gameTheme.value;
});

els.savedGamesList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-game-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.gameAction;
  if (action === "select") {
    state.selectedGameId = id;
    render();
    return;
  }
  if (action === "duplicate") {
    await adminAction("/api/admin/games/duplicate", { id });
    showToast("Game duplicated.");
    return;
  }
  if (action === "delete") {
    if (!confirm("Delete this saved game?")) return;
    await adminAction("/api/admin/games/delete", { id });
    showToast("Game deleted.");
  }
});

els.deckList.addEventListener("input", (event) => {
  const field = event.target.closest("[data-item-field]");
  if (!field) return;
  const game = selectedGame();
  const item = game?.wordDeck.find((candidate) => candidate.id === field.dataset.itemId);
  if (!item) return;
  item[field.dataset.itemField] = field.value;
  if (field.dataset.itemField === "word" && !item.word.trim()) item.imageStatus = "pending";
});

els.deckList.addEventListener("change", async (event) => {
  const fileInput = event.target.closest("[data-custom-file]");
  if (!fileInput?.files?.[0]) return;
  const game = selectedGame();
  const itemId = fileInput.dataset.customFile;
  const file = fileInput.files[0];
  if (!game || !itemId) return;
  const imageUrl = await readFileAsDataUrl(file);
  await adminAction("/api/admin/games/custom-image", {
    id: game.id,
    itemId,
    imageUrl,
    sourceUrl: file.name,
  });
  showToast("Uploaded image approved.");
});


els.deckList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-deck-action]");
  if (!button) return;
  const game = selectedGame();
  if (!game) return;
  const item = game.wordDeck.find((candidate) => candidate.id === button.dataset.itemId);
  if (!item) return;
  const action = button.dataset.deckAction;

  if (action === "remove") {
    game.wordDeck = game.wordDeck.filter((candidate) => candidate.id !== item.id);
    render();
    return;
  }
  if (action === "recommend") {
    await adminAction("/api/admin/games/recommend-images", { id: game.id, itemId: item.id });
    showToast("Recommendations refreshed.");
    return;
  }
  if (action === "approve") {
    await adminAction("/api/admin/games/approve-image", {
      id: game.id,
      itemId: item.id,
      recommendationId: button.dataset.recommendationId,
    });
    showToast("Image approved.");
    return;
  }
  if (action === "deny") {
    await adminAction("/api/admin/games/deny-image", {
      id: game.id,
      itemId: item.id,
      recommendationId: button.dataset.recommendationId,
    });
    showToast("Image denied.");
    return;
  }
  if (action === "custom") {
    const input = document.querySelector(`[data-custom-url="${cssEscape(item.id)}"]`);
    await adminAction("/api/admin/games/custom-image", {
      id: game.id,
      itemId: item.id,
      imageUrl: input?.value || "",
    });
    showToast("Custom image approved.");
  }
});

async function loadDashboard() {
  const response = await fetch("/api/admin/games", { cache: "no-store" });
  const data = await response.json();
  applyPayload(data);
  if (!state.selectedGameId) state.selectedGameId = state.activeGameId || state.details[0]?.id || "";
  render();
}

async function adminAction(path, body, options = {}) {
  setBusy(true);
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "Dashboard action failed.");
    applyPayload(data);
    if (data.game) state.selectedGameId = data.game.id;
    render();
    return data;
  } catch (error) {
    showToast(error.message || "Dashboard action failed.");
    throw error;
  } finally {
    setBusy(false);
  }
}

function applyPayload(data) {
  state.games = data.games || state.games;
  state.details = data.details || state.details;
  state.activeGameId = data.activeGameId || state.activeGameId;
  state.imageSearchConfigured = Boolean(data.imageSearchConfigured);
}

function render() {
  renderSavedGames();
  renderEditor();
}

function renderSavedGames() {
  els.savedGamesList.innerHTML = state.games.map((game) => {
    const progress = game.imageApprovalProgress;
    const selected = game.id === state.selectedGameId;
    const active = game.id === state.activeGameId;
    return `
      <article class="saved-game-row ${selected ? "selected" : ""}">
        <button class="saved-game-main" data-game-action="select" data-id="${escapeHtml(game.id)}">
          <strong>${escapeHtml(game.title)}</strong>
          <span>${escapeHtml(game.theme)} • ${progress.approvedCount}/${progress.totalCount} images</span>
          <em>${escapeHtml(game.status)}${active ? " • active" : ""}</em>
        </button>
        <div class="saved-game-actions">
          <button class="secondary" data-game-action="duplicate" data-id="${escapeHtml(game.id)}">Duplicate</button>
          <button class="warning" data-game-action="delete" data-id="${escapeHtml(game.id)}">Delete</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderEditor() {
  const game = selectedGame();
  const disabled = !game;
  [els.gameTitle, els.gameTheme, els.saveGame, els.generateWords, els.recommendAll, els.startLive, els.addWord].forEach((el) => {
    el.disabled = disabled;
  });
  if (!game) return;

  const progress = gameReady(game);
  els.editorTitle.textContent = game.title;
  els.editorMeta.textContent = `${game.theme} • ${game.wordDeck.length} words • ${state.imageSearchConfigured ? "official image search configured" : "generated placeholders available"}`;
  els.editorStatus.textContent = game.status;
  els.editorStatus.className = `status-pill ${game.status === "live" ? "countdown" : game.status === "approved" ? "ended" : "setup"}`;
  els.gameTitle.value = game.title;
  els.gameTheme.value = game.theme;
  els.deckCount.textContent = game.wordDeck.length;
  els.approvedCount.textContent = progress.approvedCount;
  els.missingCount.textContent = progress.missingCount;
  els.readyState.textContent = progress.ready ? "Yes" : "No";
  els.startLive.disabled = !progress.ready;

  els.deckList.innerHTML = game.wordDeck.map((item, index) => renderDeckItem(item, index)).join("");
}

function renderDeckItem(item, index) {
  const recs = item.imageRecommendations || [];
  const approved = item.imageStatus === "approved" && item.approvedImageUrl;
  return `
    <article class="deck-item ${approved ? "approved" : "pending"}">
      <div class="deck-item-main">
        <span class="deck-index">${index + 1}</span>
        <label>
          Word
          <input data-item-field="word" data-item-id="${escapeHtml(item.id)}" value="${escapeAttr(item.word)}" />
        </label>
        <label>
          Description
          <input data-item-field="description" data-item-id="${escapeHtml(item.id)}" value="${escapeAttr(item.description || "")}" />
        </label>
        <label>
          Notes
          <input data-item-field="notes" data-item-id="${escapeHtml(item.id)}" value="${escapeAttr(item.notes || "")}" />
        </label>
        <span class="image-status ${approved ? "ok" : "warn"}">${approved ? "Approved" : "Needs image"}</span>
      </div>

      <div class="approved-preview">
        ${approved ? `<img src="${escapeAttr(item.approvedImageUrl)}" alt="${escapeAttr(item.word)} approved image" />` : `<div class="empty-image">No approved image</div>`}
        <div class="custom-image-row">
          <input data-custom-url="${escapeAttr(item.id)}" placeholder="Paste custom image URL" />
          <input type="file" accept="image/*" data-custom-file="${escapeAttr(item.id)}" />
          <button class="secondary" data-deck-action="custom" data-item-id="${escapeHtml(item.id)}">Use URL</button>
          <button class="secondary" data-deck-action="recommend" data-item-id="${escapeHtml(item.id)}">Search</button>
          <button class="warning" data-deck-action="remove" data-item-id="${escapeHtml(item.id)}">Remove</button>
        </div>
      </div>

      <div class="recommendation-grid">
        ${recs.length ? recs.map((rec) => renderRecommendation(item, rec)).join("") : `<p class="small">No recommendations yet. Click Search or Recommend Images.</p>`}
      </div>
    </article>
  `;
}

function renderRecommendation(item, rec) {
  return `
    <div class="recommendation ${rec.status}">
      <img src="${escapeAttr(rec.thumbnailUrl || rec.imageUrl)}" alt="${escapeAttr(item.word)} recommendation" loading="lazy" />
      <span>${escapeHtml(rec.sourceName || "Image")}</span>
      <div>
        <button data-deck-action="approve" data-item-id="${escapeHtml(item.id)}" data-recommendation-id="${escapeHtml(rec.id)}">Approve</button>
        <button class="secondary" data-deck-action="deny" data-item-id="${escapeHtml(item.id)}" data-recommendation-id="${escapeHtml(rec.id)}">Deny</button>
      </div>
    </div>
  `;
}

function selectedGame() {
  return state.details.find((game) => game.id === state.selectedGameId) || state.details[0] || null;
}

function syncHeaderFields(game) {
  game.title = els.gameTitle.value.trim() || game.title;
  game.theme = els.gameTheme.value.trim() || game.theme;
}

function gameReady(game) {
  const approvedCount = game.wordDeck.filter((item) => item.imageStatus === "approved" && item.approvedImageUrl).length;
  const totalCount = game.wordDeck.length;
  return {
    approvedCount,
    totalCount,
    missingCount: totalCount - approvedCount,
    ready: totalCount >= 24 && approvedCount === totalCount,
  };
}

function setBusy(isBusy) {
  document.body.classList.toggle("is-busy", isBusy);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add("hidden"), 3200);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function slug(value) {
  return String(value || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 54) || "item";
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
