const HostRunbook = (() => {
  function render(container, state) {
    if (!container || !state) return;
    const health = state.health || {};
    const next = nextAction(state, health);
    container.innerHTML = `
      <div class="host-runner-header">
        <div>
          <p class="brand-kicker">Host Command Center</p>
          <h2>${escapeHostHtml(statusHeadline(state))}</h2>
          <p class="subtitle">${escapeHostHtml(next.detail)}</p>
        </div>
        <button class="${next.kind === "primary" ? "" : "secondary"}" data-host-action="${next.action}" ${next.disabled ? "disabled" : ""}>${escapeHostHtml(next.label)}</button>
      </div>

      <div class="host-health-grid">
        ${healthTile("Supabase Sync", health.storageHealthy ? "Ready" : "Needs attention", health.storageHealthy, storageDetail(state.storage))}
        ${healthTile("Display Screen", health.displayConnected ? "Open" : "Not seen yet", health.displayConnected, seenDetail(health.lastDisplaySeenAt))}
        ${healthTile("Players", `${health.activePlayers || 0} active`, (health.activePlayers || 0) > 0, "Players appear here after they enter cards.")}
        ${healthTile("QR + Deck", health.joinReady && health.deckReady ? "Ready" : "Check setup", health.joinReady && health.deckReady, health.joinReady ? `${state.deck.length} moments left` : "Join link missing")}
        ${healthTile("Current Moment", health.currentMomentReady ? "Ready" : "Waiting", health.currentMomentReady, currentMomentDetail(state))}
      </div>

      <div class="host-runner-body">
        <div class="host-steps">
          <strong>Run the game</strong>
          ${runSteps(state).map((step) => `
            <div class="host-step ${step.state}">
              <span>${escapeHostHtml(step.number)}</span>
              <p>${escapeHostHtml(step.text)}</p>
            </div>
          `).join("")}
        </div>
        <div class="host-notes">
          <strong>Player rules to announce</strong>
          <p>Each player can choose 1-3 cards. Tap each moment when it is called. Line Bingo is 100 points, bonus patterns are 50 points, and blackout is 150 points. Players tap BINGO only when their current round pattern is complete.</p>
        </div>
      </div>
    `;
  }

  function nextAction(state, health) {
    if (state.status === "setup") {
      const ready = health.joinReady && health.deckReady;
      return {
        label: ready ? "Start Countdown" : "Open Display",
        action: ready ? "startCountdown" : "openDisplay",
        kind: "primary",
        detail: ready
          ? "Open the display, confirm the QR code is visible, then start the countdown."
          : "Open the display screen first so the QR code and countdown are visible to players.",
      };
    }
    if (state.status === "countdown") {
      return {
        label: "Keep Countdown Up",
        action: "none",
        disabled: true,
        kind: "secondary",
        detail: "Leave this screen running. Round 1 starts automatically when the countdown reaches zero.",
      };
    }
    if (state.status === "playing") {
      return {
        label: state.currentWord ? "Pull Next Moment" : "Restore Moment",
        action: "pullWord",
        kind: "primary",
        detail: state.currentWord
          ? `Live now: ${state.currentWord.text}. Auto-pull is every ${state.autoPullEverySeconds} seconds.`
          : "The round is live, but no current moment is visible. Pull the next moment to recover.",
      };
    }
    if (state.status === "break") {
      return {
        label: "Start Next Round",
        action: "nextRound",
        kind: "primary",
        detail: "Leaderboard is on display. The next round can start automatically or you can start it now.",
      };
    }
    if (state.status === "ended") {
      return {
        label: "Show Final Display",
        action: "openDisplay",
        kind: "secondary",
        detail: "Final winners are showing over the looping video. Confirm prize pickup names before resetting.",
      };
    }
    return {
      label: "Open Display",
      action: "openDisplay",
      kind: "secondary",
      detail: "Open the display and player page before starting.",
    };
  }

  function statusHeadline(state) {
    if (state.status === "setup") return "Ready To Launch";
    if (state.status === "countdown") return "Countdown Is Live";
    if (state.status === "playing") return `Round ${state.roundIndex + 1} Is Live`;
    if (state.status === "break") return "Break + Leaderboard";
    if (state.status === "ended") return "Final Winners";
    return "Host Console";
  }

  function runSteps(state) {
    const status = state.status;
    return [
      { number: "1", text: "Open the display screen and confirm the QR code says Scan to play.", state: status === "setup" ? "active" : "done" },
      { number: "2", text: "Start the 15-minute countdown and let players enter names and choose up to 3 cards.", state: status === "countdown" ? "active" : stepDone(status, ["playing", "break", "ended"]) },
      { number: "3", text: "Round 1 starts automatically. Watch moments pull every 30 seconds or pull manually if needed.", state: status === "playing" ? "active" : stepDone(status, ["break", "ended"]) },
      { number: "4", text: "During breaks, confirm leaderboard and claims before the next round starts.", state: status === "break" ? "active" : stepDone(status, ["ended"]) },
      { number: "5", text: "At the end, leave the final winner video running and announce prize pickup.", state: status === "ended" ? "active" : "waiting" },
    ];
  }

  function stepDone(status, doneStatuses) {
    return doneStatuses.includes(status) ? "done" : "waiting";
  }

  function healthTile(label, value, ok, detail) {
    return `
      <div class="host-health-tile ${ok ? "ok" : "warn"}">
        <span>${escapeHostHtml(label)}</span>
        <strong>${escapeHostHtml(value)}</strong>
        <em>${escapeHostHtml(detail)}</em>
      </div>
    `;
  }

  function storageDetail(storage) {
    if (!storage?.configured) return "Running without configured Supabase.";
    if (storage.available) return storage.lastSavedAt ? `Saved ${relativeTime(storage.lastSavedAt)}.` : "Connected.";
    return "Supabase was not reachable on the last check.";
  }

  function seenDetail(timestamp) {
    return timestamp ? `Last seen ${relativeTime(timestamp)}.` : "Open /display on the venue screen.";
  }

  function currentMomentDetail(state) {
    if (state.status !== "playing") return statusLabel(state.status);
    return state.currentWord ? state.currentWord.text : "No active moment yet.";
  }

  function relativeTime(timestamp) {
    const seconds = Math.max(0, Math.round((Date.now() - Number(timestamp)) / 1000));
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    return `${minutes}m ago`;
  }

  function escapeHostHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  return { render };
})();
