let displayState = null;

const displayEls = {
  title: $("#displayTitle"),
  round: $("#displayRound"),
  timer: $("#displayTimer"),
  word: $("#displayWord"),
  category: $("#displayCategory"),
  recent: $("#recentWords"),
  qr: $("#displayQr"),
  join: $("#joinText"),
  momentImage: $("#displayMomentImage"),
  momentPanel: $("#momentPanel"),
  leaderboardPanel: $("#leaderboardPanel"),
  bingoAlert: $("#bingoAlert"),
};
let visibleClaimId = null;
let claimAlertTimer = null;
let displayWordFitFrame = null;

subscribe((state) => {
  displayState = state;
  renderDisplay(state);
});

setInterval(() => {
  if (!displayState) return;
  updateDisplayTimers(displayState);
}, 500);

window.addEventListener("resize", () => {
  if (!displayState) return;
  scheduleDisplayWordFit();
});

function updateDisplayTimers(state) {
  const target = state.status === "countdown" ? state.countdownEndsAt : state.status === "playing" ? state.playEndsAt : state.breakEndsAt;
  const timeText = state.status === "setup" || state.status === "ended" ? "00:00" : formatClock(target - Date.now());
  displayEls.timer.textContent = timeText;
  const breakCountdown = $("#breakCountdown");
  if (breakCountdown) breakCountdown.textContent = state.status === "break" ? timeText : "00:00";
  const pregameCountdown = $("#pregameCountdown");
  if (pregameCountdown) pregameCountdown.textContent = state.status === "countdown" ? timeText : "00:00";
}

function renderDisplay(state) {
  document.body.dataset.displayStatus = state.status;
  displayEls.title.textContent = state.title;
  displayEls.round.textContent = `Round ${state.roundIndex + 1}: ${state.round.name} • ${state.round.pattern} • New word every ${state.autoPullEverySeconds}s`;
  renderQrImage(displayEls.qr, state.joinUrl);
  displayEls.join.textContent = state.joinUrl;
  updateDisplayTimers(state);

  if (state.status === "countdown") {
    displayEls.momentPanel.classList.add("hidden");
    displayEls.leaderboardPanel.classList.remove("hidden");
    renderPregameCountdown(state);
  } else if (state.status === "break" || state.status === "ended") {
    displayEls.momentPanel.classList.add("hidden");
    displayEls.leaderboardPanel.classList.remove("hidden");
    renderLeaderboard(state);
  } else {
    displayEls.momentPanel.classList.remove("hidden");
    displayEls.leaderboardPanel.classList.add("hidden");
    displayEls.word.textContent = state.currentWord?.text || "Scan In";
    displayEls.category.textContent = state.currentWord?.category || "Pop Culture Moments Bingo";
    setMomentImage(displayEls.momentImage, state.currentWord);
    scheduleDisplayWordFit();
  }

  renderClaimAlert(state);

  displayEls.recent.innerHTML = state.called.slice(0, 10)
    .map((word, index) => `<span class="word-chip ${index === 0 ? "current-pull" : ""}">${escapeHtml(word.text)}</span>`)
    .join("");
}

function scheduleDisplayWordFit() {
  if (displayWordFitFrame) cancelAnimationFrame(displayWordFitFrame);
    displayWordFitFrame = requestAnimationFrame(() => {
      displayWordFitFrame = null;
    fitSingleLineText(displayEls.word, 12);
  });
}

function fitSingleLineText(element, minSize) {
  element.style.whiteSpace = "nowrap";
  element.style.fontSize = "";
  const computedSize = parseFloat(getComputedStyle(element).fontSize);
  let size = Math.floor(computedSize);

  while (size > minSize && element.scrollWidth > element.clientWidth) {
    size -= 2;
    element.style.fontSize = `${size}px`;
  }

  if (element.scrollWidth > element.clientWidth) {
    element.style.fontSize = `${minSize}px`;
  }
}

function renderPregameCountdown(state) {
  displayEls.title.textContent = "Bingo Night";
  displayEls.round.textContent = "Opening countdown";
  displayEls.leaderboardPanel.innerHTML = `
    <div class="pregame-panel event-art-panel">
      <p class="brand-kicker">Scan In Now</p>
      <h2>Starts In</h2>
      <strong class="pregame-countdown" id="pregameCountdown">${formatClock(state.countdownEndsAt - Date.now())}</strong>
      <p class="pregame-copy">Round 1 starts automatically when the countdown ends.</p>
    </div>
  `;
}

function renderLeaderboard(state) {
  const rows = state.leaderboard || [];
  const nextRound = state.rounds[state.roundIndex + 1];
  const isEnded = state.status === "ended";
  if (isEnded) displayEls.round.textContent = "Event Complete • Final Scores";
  const nextRoundText = isEnded
    ? "Event complete"
    : nextRound
    ? `Up next: Round ${state.roundIndex + 2} • ${nextRound.name}`
    : "Final leaderboard";
  displayEls.leaderboardPanel.innerHTML = `
    <div class="break-header event-art-panel ${isEnded ? "final-header" : ""}">
      <div>
        <p class="brand-kicker">${isEnded ? "Final Scores" : "10-Minute Break"}</p>
        <h2>${isEnded ? "Final Leaderboard" : "Leaderboard"}</h2>
        <p class="break-next">${escapeHtml(nextRoundText)}</p>
      </div>
      <div class="break-countdown ${isEnded ? "hidden" : ""}">
        <span>Next Round Starts In</span>
        <strong id="breakCountdown">${formatClock(state.breakEndsAt - Date.now())}</strong>
      </div>
    </div>
    ${isEnded && rows.length ? `
      <div class="winner-banner">
        <span>Overall Winner</span>
        <strong>${escapeHtml(rows[0].player)}</strong>
        <em>${rows[0].points} pts</em>
      </div>
    ` : ""}
    ${isEnded && rows.length ? renderPrizeClaim(rows) : ""}
    <div class="leaderboard-list">
      ${rows.length ? rows.slice(0, 8).map((row, index) => `
        <div class="leaderboard-row">
          <span class="leaderboard-rank">${index + 1}</span>
          <span class="leaderboard-name">${escapeHtml(row.player)}</span>
          <span class="leaderboard-score">${row.points} pts</span>
        </div>
      `).join("") : `<div class="leaderboard-empty">No BINGO claims yet.</div>`}
    </div>
  `;
}

function renderPrizeClaim(rows) {
  const winners = rows.slice(0, 2);
  if (!winners.length) return "";
  return `
    <div class="prize-claim">
      <span>Prize Pickup</span>
      <strong>${winners.map((winner, index) => `${index + 1}${index === 0 ? "st" : "nd"} Place: ${escapeHtml(winner.player)}`).join(" • ")}</strong>
      <p>Please claim your prize at the front desk.</p>
    </div>
  `;
}

function renderClaimAlert(state) {
  const claim = state.latestClaim;
  if (!claim || claim.id === visibleClaimId) return;
  visibleClaimId = claim.id;
  displayEls.bingoAlert.innerHTML = `
    <div class="bingo-alert-title">BINGO!</div>
    <div class="bingo-alert-name">${escapeHtml(claim.player)}</div>
    <div class="bingo-alert-points">+${claim.points || 100} points</div>
  `;
  displayEls.bingoAlert.classList.remove("hidden");
  clearTimeout(claimAlertTimer);
  claimAlertTimer = setTimeout(() => {
    displayEls.bingoAlert.classList.add("hidden");
  }, 7000);
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
