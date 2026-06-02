let latestState = null;

const els = {
  roundName: $("#roundName"),
  roundMeta: $("#roundMeta"),
  statusPill: $("#statusPill"),
  currentWord: $("#currentWord"),
  currentCategory: $("#currentCategory"),
  startCountdown: $("#startCountdown"),
  skipCountdown: $("#skipCountdown"),
  startRound: $("#startRound"),
  pullWord: $("#pullWord"),
  startBreak: $("#startBreak"),
  nextRound: $("#nextRound"),
  resetGame: $("#resetGame"),
  timer: $("#timer"),
  calledCount: $("#calledCount"),
  remainingCount: $("#remainingCount"),
  claimCount: $("#claimCount"),
  calledWords: $("#calledWords"),
  qrCode: $("#qrCode"),
  joinLink: $("#joinLink"),
  schedule: $("#schedule"),
  claims: $("#claims"),
  hostMomentImage: $("#hostMomentImage"),
};

subscribe((state) => {
  latestState = state;
  render(state);
});

setInterval(() => {
  if (!latestState) return;
  renderTimer(latestState);
}, 500);

els.startCountdown.addEventListener("click", () => api("/api/start-countdown").catch(alertError));
els.skipCountdown.addEventListener("click", () => api("/api/skip-countdown").catch(alertError));
els.startRound.addEventListener("click", () => api("/api/start-round").catch(alertError));
els.pullWord.addEventListener("click", () => api("/api/pull").catch(alertError));
els.startBreak.addEventListener("click", () => api("/api/start-break").catch(alertError));
els.nextRound.addEventListener("click", () => api("/api/next-round").catch(alertError));
els.resetGame.addEventListener("click", () => {
  if (confirm("Reset the full bingo event back to Round 1?")) api("/api/reset").catch(alertError);
});

function render(state) {
  const roundNumber = state.roundIndex + 1;
  els.roundName.textContent = `Round ${roundNumber}: ${state.round.name}`;
  els.roundMeta.textContent = `${state.round.pattern} • ${state.round.playMinutes} minutes of play • words rotate every ${state.autoPullEverySeconds} seconds`;
  els.statusPill.textContent = statusLabel(state.status);
  els.statusPill.className = `status-pill ${state.status}`;
  els.currentWord.textContent = state.currentWord?.text || (state.status === "countdown" ? "Bingo Starts Soon" : state.status === "break" ? "Break Time" : state.status === "ended" ? "Event Complete" : "Ready?");
  els.currentCategory.textContent = state.currentWord?.category || (state.status === "countdown" ? "Countdown jumps into Round 1 automatically" : state.status === "break" ? "Next round starts automatically" : state.status === "ended" ? "Final leaderboard is on display" : "Start the countdown when players are scanning in");
  const placeholderMoment = state.status === "countdown"
    ? { text: "Bingo Starts Soon", category: "15 Minutes" }
    : state.status === "break"
    ? { text: "Break Time", category: "10 Minutes" }
    : state.status === "ended"
    ? { text: "Event Complete", category: "Final Scores" }
    : state.currentWord;
  setMomentImage(els.hostMomentImage, placeholderMoment);
  els.calledCount.textContent = state.called.length;
  els.remainingCount.textContent = state.deck.length;
  els.claimCount.textContent = state.claims.length;
  renderQrImage(els.qrCode, state.joinUrl);
  els.joinLink.href = state.joinUrl;
  els.joinLink.textContent = state.joinUrl;

  els.startCountdown.disabled = state.status !== "setup";
  els.skipCountdown.disabled = state.status !== "countdown";
  els.startRound.disabled = state.status !== "setup";
  els.pullWord.disabled = state.status !== "playing";
  els.startBreak.disabled = state.status !== "playing";
  els.nextRound.disabled = state.roundIndex >= state.rounds.length - 1 || state.status === "playing" || state.status === "ended";

  els.calledWords.innerHTML = state.called.length
    ? state.called.map((word) => `<span class="word-chip">${escapeHtml(word.text)}</span>`).join("")
    : `<span class="small">No moments pulled yet.</span>`;

  els.schedule.innerHTML = state.rounds
    .map((round, index) => {
      const isActive = index === state.roundIndex;
      const breakText = index < state.rounds.length - 1 ? " + 10 min break" : "";
      return `
        <div class="schedule-row ${isActive ? "active" : ""}">
          <span class="round-number">${index + 1}</span>
          <div>
            <strong>${escapeHtml(round.name)}</strong>
            <div class="small">${escapeHtml(round.pattern)}</div>
          </div>
          <span class="small">${round.playMinutes} min${breakText}</span>
        </div>
      `;
    })
    .join("");

  els.claims.innerHTML = state.claims.length
    ? state.claims.map((claim) => `<div class="claim">${escapeHtml(claim.player)} +${claim.points || 100} pts (${claim.bingoCount || 1} bingo${(claim.bingoCount || 1) === 1 ? "" : "s"}) on Card ${claim.card}</div>`).join("")
    : `<p class="small">Claims will appear here when players tap BINGO.</p>`;

  renderTimer(state);
}

function renderTimer(state) {
  const now = Date.now();
  if (state.status === "playing") {
    els.timer.textContent = formatClock(state.playEndsAt - now);
  } else if (state.status === "countdown") {
    els.timer.textContent = formatClock(state.countdownEndsAt - now);
  } else if (state.status === "break") {
    els.timer.textContent = formatClock(state.breakEndsAt - now);
  } else {
    els.timer.textContent = "00:00";
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

function alertError(error) {
  alert(error.message || error);
}
