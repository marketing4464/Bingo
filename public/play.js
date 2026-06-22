let player = "";
let cards = [];
let currentState = null;
let currentCardRoundIndex = null;
let playerHeartbeatTimer = null;
let attemptedSessionRestore = false;

const PLAYER_STORAGE_KEY = "onParBingoPlayerSession";

const joinPanel = $("#joinPanel");
const gamePanel = $("#gamePanel");
const joinForm = $("#joinForm");
const cardsEl = $("#cards");
const playerRound = $("#playerRound");
const playerMeta = $("#playerMeta");
const playerRecentWords = $("#playerRecentWords");
const toast = $("#toast");

setBingoClientRole("player");

installPullToRefreshGuard();

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const state = currentState || await getState();
    player = $("#playerName").value.trim() || "Player";
    const count = Math.max(1, Math.min(3, Number($("#cardCount").value || 1)));
    const deal = await dealCards(count);
    cards = deal.cards;
    currentCardRoundIndex = deal.roundIndex;
    startPlayerHeartbeat();
    joinPanel.classList.add("hidden");
    gamePanel.classList.remove("hidden");
    renderPlayer(state);
    savePlayerSession();
  } catch (error) {
    showToast(error.message || "Could not deal your cards.");
  }
});

subscribe(async (state) => {
  currentState = state;
  if (!attemptedSessionRestore && gamePanel.classList.contains("hidden")) {
    attemptedSessionRestore = await restorePlayerSession(state);
  }
  if (!gamePanel.classList.contains("hidden")) {
    if (currentCardRoundIndex !== null && state.roundIndex < currentCardRoundIndex) return;
    if (currentCardRoundIndex !== null && state.roundIndex > currentCardRoundIndex) {
      await dealNewRoundCards();
      savePlayerSession();
      showToast(`Round ${state.roundIndex + 1} started. New cards dealt.`);
    }
    renderPlayer(state);
  }
});

async function dealCards(count) {
  const result = await api("/api/deal-cards", { player, count });
  return {
    roundIndex: result.roundIndex,
    cards: result.cards.map((card) => ({
      number: card.number,
      cells: card.cells,
      token: card.token,
      selected: new Set([12]),
      claimedBingos: new Set(),
    })),
  };
}

async function dealNewRoundCards() {
  const count = Math.max(1, Math.min(3, cards.length || Number($("#cardCount").value || 1)));
  const deal = await dealCards(count);
  cards = deal.cards;
  currentCardRoundIndex = deal.roundIndex;
}

function renderPlayer(state) {
  playerRound.textContent = `Round ${state.roundIndex + 1}: ${state.round.name}`;
  playerMeta.textContent = `${statusLabel(state.status)} • ${roundRuleLabel(state.round.pattern)} • Current: ${state.currentWord?.text || "waiting"} • Tap your own squares`;

  cardsEl.innerHTML = cards.map((card) => renderCard(card, state.round.pattern)).join("");
  renderRecentPulls(state);

  $$(".claimButton").forEach((button) => {
    button.addEventListener("click", () => claimBingo(Number(button.dataset.card)));
  });
}

function startPlayerHeartbeat() {
  if (playerHeartbeatTimer) clearInterval(playerHeartbeatTimer);
  playerHeartbeatTimer = startHeartbeat("player", () => ({
    player,
    cards: cards.length,
  }));
}

cardsEl.addEventListener("click", (event) => {
  const cell = event.target.closest(".bingo-cell");
  if (!cell || !cell.dataset.card) return;
  toggleCell(Number(cell.dataset.card), Number(cell.dataset.index));
});

function toggleCell(cardNumber, index) {
  const card = cards.find((candidate) => candidate.number === cardNumber);
  if (!card || index === 12) return;
  if (card.selected.has(index)) {
    card.selected.delete(index);
  } else {
    card.selected.add(index);
  }
  if (currentState) renderPlayer(currentState);
  savePlayerSession();
}

function renderCard(card, pattern) {
  const bingos = completedBingos(card, pattern);
  const newBingos = bingos.filter((bingo) => !card.claimedBingos.has(bingo.id));
  const winCells = [...new Set(bingos.flatMap((bingo) => bingo.cells))];
  const heads = ["B", "I", "N", "G", "O"].map((letter) => `<div class="bingo-head">${letter}</div>`).join("");
  const cells = card.cells.map((word, index) => {
    const isSelected = card.selected.has(index);
    const isWin = winCells.includes(index);
    return `<div class="bingo-cell ${isSelected ? "selected" : ""} ${word === "FREE" ? "free" : ""} ${isWin ? "win" : ""}" data-card="${card.number}" data-index="${index}">${escapeHtml(word)}</div>`;
  }).join("");
  const hasWin = newBingos.length > 0;
  const totalPoints = newBingos.reduce((sum, bingo) => sum + bingo.points, 0);

  return `
    <article class="bingo-card">
      <div class="card-title">
        <span>${escapeHtml(player)} • Card ${card.number}</span>
        <span>${bingos.length ? `${bingos.length} Bingo${bingos.length === 1 ? "" : "s"}` : "Playing"}</span>
      </div>
      <div class="bingo-grid">${heads}${cells}</div>
      <div class="card-actions">
        <button class="claimButton ${hasWin ? "gold" : "secondary"}" data-card="${card.number}" ${hasWin ? "" : "disabled"}>${hasWin ? `Claim +${totalPoints}` : "No New Bingo"}</button>
      </div>
    </article>
  `;
}

function completedBingos(card, pattern) {
  const calledWords = currentState ? calledSet(currentState) : new Set();
  const marked = Array.from({ length: 25 }, (_, index) => {
    if (!card.selected.has(index)) return false;
    const word = card.cells[index];
    return word === "FREE" || calledWords.has(word);
  });
  const allCells = marked.map((_, index) => index);
  const lines = [
    { id: "row-1", label: "Top Row", cells: [0, 1, 2, 3, 4] },
    { id: "row-2", label: "Second Row", cells: [5, 6, 7, 8, 9] },
    { id: "row-3", label: "Middle Row", cells: [10, 11, 12, 13, 14] },
    { id: "row-4", label: "Fourth Row", cells: [15, 16, 17, 18, 19] },
    { id: "row-5", label: "Bottom Row", cells: [20, 21, 22, 23, 24] },
    { id: "col-1", label: "B Column", cells: [0, 5, 10, 15, 20] },
    { id: "col-2", label: "I Column", cells: [1, 6, 11, 16, 21] },
    { id: "col-3", label: "N Column", cells: [2, 7, 12, 17, 22] },
    { id: "col-4", label: "G Column", cells: [3, 8, 13, 18, 23] },
    { id: "col-5", label: "O Column", cells: [4, 9, 14, 19, 24] },
    { id: "diag-1", label: "Diagonal", cells: [0, 6, 12, 18, 24] },
    { id: "diag-2", label: "Diagonal", cells: [4, 8, 12, 16, 20] },
  ];
  const regularBingos = lines
    .filter((line) => line.cells.every((index) => marked[index]))
    .map((line) => ({ ...line, points: 100 }));
  const bonusBingos = [];

  if (pattern === "Blackout") {
    if (marked.every(Boolean)) {
      return [{ id: "blackout", label: "Blackout Bingo", cells: allCells, points: 100 }];
    }
    return regularBingos;
  }

  if (pattern === "X Pattern") {
    const x = [0, 4, 6, 8, 12, 16, 18, 20, 24];
    if (x.every((index) => marked[index])) {
      return [{ id: "x-pattern", label: "X Bingo", cells: x, points: 100 }];
    }
    return regularBingos;
  }

  if (pattern === "Four Corners") {
    const corners = [0, 4, 20, 24];
    if (corners.every((index) => marked[index])) {
      bonusBingos.push({ id: "four-corners", label: "Four Corners Bonus", cells: corners, points: 50 });
    }
    return [...regularBingos, ...bonusBingos];
  }

  return regularBingos;
}

async function claimBingo(cardNumber) {
  const card = cards.find((candidate) => candidate.number === cardNumber);
  if (!card || !currentState) return;
  const newBingos = completedBingos(card, currentState.round.pattern)
    .filter((bingo) => !card.claimedBingos.has(bingo.id));
  if (!newBingos.length) {
    showToast("No new BINGO to claim on this card yet.");
    return;
  }
  try {
    const claimBingos = newBingos.map((bingo) => ({
      ...bingo,
      words: bingo.cells.map((index) => card.cells[index]),
    }));
    const result = await api("/api/claim", {
      player,
      card: cardNumber,
      cardToken: card.token,
      cells: card.cells,
      selected: [...card.selected],
      bingos: claimBingos,
    });
    result.claim.bingos.forEach((bingo) => card.claimedBingos.add(bingo.id));
    renderPlayer(currentState);
    savePlayerSession();
    showToast(`${result.claim.bingoCount} BINGO${result.claim.bingoCount === 1 ? "" : "S"} sent. +${result.claim.points} points.`);
  } catch (error) {
    showToast(error.message || "Could not send claim.");
  }
}

function renderRecentPulls(state) {
  if (!playerRecentWords) return;
  playerRecentWords.innerHTML = state.called.length
    ? state.called.slice(0, 12).map((word, index) => `
      <span class="word-chip player-word-chip ${index === 0 ? "current-pull" : ""}">
        <span>${index === 0 ? "Now" : `#${index + 1}`}</span>
        <strong>${escapeHtml(word.text)}</strong>
      </span>
    `).join("")
    : `<span class="empty-recent">No moments pulled yet.</span>`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2600);
}

function installPullToRefreshGuard() {
  let touchStartY = 0;
  document.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    touchStartY = event.touches[0].clientY;
  }, { passive: true });

  document.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 1) return;
    if (event.target.closest("input, select, textarea")) return;
    const scrollEl = document.scrollingElement || document.documentElement;
    const isPullingDownAtTop = scrollEl.scrollTop <= 0 && event.touches[0].clientY > touchStartY;
    if (isPullingDownAtTop) {
      event.preventDefault();
    }
  }, { passive: false });
}

function savePlayerSession() {
  if (!player || !cards.length || currentCardRoundIndex === null) return;
  try {
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({
      player,
      roundIndex: currentCardRoundIndex,
      cards: cards.map((card) => ({
        number: card.number,
        cells: card.cells,
        token: card.token,
        selected: [...card.selected],
        claimedBingos: [...card.claimedBingos],
      })),
    }));
  } catch (error) {
    console.warn("Could not save bingo card progress.", error);
  }
}

async function restorePlayerSession(state) {
  const saved = loadPlayerSession();
  if (!saved) return true;
  player = saved.player;
  cards = saved.cards;
  currentCardRoundIndex = saved.roundIndex;
  if (currentCardRoundIndex > state.roundIndex) return false;
  if (currentCardRoundIndex < state.roundIndex) {
    await dealNewRoundCards();
  }
  $("#playerName").value = player;
  $("#cardCount").value = String(Math.max(1, Math.min(3, cards.length)));
  startPlayerHeartbeat();
  joinPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
  savePlayerSession();
  return true;
}

function loadPlayerSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) || "null");
    if (!saved || !saved.player || !Array.isArray(saved.cards) || !saved.cards.length) return null;
    const restoredCards = saved.cards.slice(0, 3).map((card, index) => ({
      number: Number(card.number) || index + 1,
      cells: Array.isArray(card.cells) && card.cells.length === 25 ? card.cells : [],
      token: String(card.token || ""),
      selected: new Set(Array.isArray(card.selected) ? card.selected : [12]),
      claimedBingos: new Set(Array.isArray(card.claimedBingos) ? card.claimedBingos : []),
    })).filter((card) => card.cells.length === 25 && card.token);
    if (!restoredCards.length) return null;
    return {
      player: String(saved.player),
      roundIndex: Number.isInteger(saved.roundIndex) ? saved.roundIndex : 0,
      cards: restoredCards,
    };
  } catch (error) {
    console.warn("Could not restore bingo card progress.", error);
    return null;
  }
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
