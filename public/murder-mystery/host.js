const OPE_MYSTERY_BASE = "/murder-mystery";

const hostEls = {
  actButtons: document.querySelector("#actButtons"),
  hostActName: document.querySelector("#hostActName"),
  hostPrompt: document.querySelector("#hostPrompt"),
  qrCode: document.querySelector("#qrCode"),
  joinUrl: document.querySelector("#joinUrl"),
  codeGrid: document.querySelector("#codeGrid"),
  teamCount: document.querySelector("#teamCount"),
  teamList: document.querySelector("#teamList"),
  submissionList: document.querySelector("#submissionList"),
  accusationList: document.querySelector("#accusationList"),
  resetForm: document.querySelector("#resetForm"),
  resetConfirm: document.querySelector("#resetConfirm"),
  resetMessage: document.querySelector("#resetMessage")
};

async function api(path, payload) {
  const options = payload
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }
    : {};
  const response = await fetch(`${OPE_MYSTERY_BASE}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function labelFor(options, value) {
  return (options.find(([key]) => key === value) || ["", value])[1];
}

function drawQr() {
  const join = `${location.origin}${OPE_MYSTERY_BASE}`;
  hostEls.joinUrl.textContent = join;
  try {
    const qr = qrcode(0, "M");
    qr.addData(join);
    qr.make();
    hostEls.qrCode.innerHTML = qr.createImgTag(6, 8);
  } catch {
    hostEls.qrCode.textContent = "QR unavailable";
  }
}

function render(state) {
  const act = state.game.acts.find((candidate) => candidate.id === state.currentAct);
  hostEls.hostActName.textContent = act.title;
  hostEls.hostPrompt.innerHTML = `<strong>${escapeHtml(act.hostPrompt)}</strong><p>${escapeHtml(act.liveAction)}</p>`;

  hostEls.actButtons.innerHTML = state.game.acts
    .map((candidate) => `<button data-act="${Number(candidate.id)}" class="${candidate.id === state.currentAct ? "active" : "secondary"}">${Number(candidate.id)}. ${escapeHtml(candidate.title)}</button>`)
    .join("");

  hostEls.codeGrid.innerHTML = state.game.clues
    .map((clue) => {
      const station = state.game.stations.find((candidate) => candidate.clueCode === clue.code);
      const active = clue.act <= state.currentAct;
      return `
      <article>
        <span>${active ? "Active" : `Act ${clue.act}`} | Stop ${Number(station?.stop || 0)}</span>
        <strong>${escapeHtml(station ? station.title : clue.title)}</strong>
        ${station ? `<small class="station-route-line">${escapeHtml(station.routeLabel)} | ${escapeHtml(station.tourAnchor)}</small>` : ""}
        <p>${escapeHtml(station ? station.location : clue.action)}</p>
        ${station ? `<details class="host-station-details"><summary>Placement and safety</summary><p>${escapeHtml(station.placement)}</p><small>${escapeHtml(station.safety)}</small></details>` : ""}
        <div class="mini-actions">
          <a href="${station ? `${OPE_MYSTERY_BASE}/station/${encodeURIComponent(station.id)}` : "#"}" target="_blank">Open Station</a>
        </div>
      </article>
    `;
    })
    .join("");

  hostEls.teamCount.textContent = `${state.teams.length} teams`;
  hostEls.teamList.innerHTML = state.leaderboard
    .map((team) => `
      <article>
        <div><strong>${escapeHtml(team.teamName)}</strong><span>${Number(team.score)} pts</span></div>
        <small>${escapeHtml(team.players.join(", ") || "No players listed")} | ${Number(team.unlockedCount)} clues</small>
        <div class="mini-actions">
          <button data-score="${escapeHtml(team.id)}" data-delta="5">+5</button>
          <button data-score="${escapeHtml(team.id)}" data-delta="-5" class="secondary">-5</button>
        </div>
      </article>
    `)
    .join("");

  hostEls.submissionList.innerHTML = state.submissions
    .map((submission) => `
      <article class="${submission.status}">
        <div><strong>${escapeHtml(submission.teamName)}</strong><span>${escapeHtml(submission.status)} | ${Number(submission.score)} pts</span></div>
        <p>${escapeHtml(submission.missionTitle)}: ${escapeHtml(submission.text)}</p>
        <div class="mini-actions">
          <button data-review="${escapeHtml(submission.id)}" data-status="approved" data-points="10">Approve 10</button>
          <button data-review="${escapeHtml(submission.id)}" data-status="approved" data-points="15">Approve 15</button>
          <button data-review="${escapeHtml(submission.id)}" data-status="approved" data-points="20">Approve 20</button>
          <button data-review="${escapeHtml(submission.id)}" data-status="rejected" data-points="0" class="secondary">Reject</button>
        </div>
      </article>
    `)
    .join("");

  hostEls.accusationList.innerHTML = state.accusations
    .map((accusation) => `
      <article>
        <div><strong>${escapeHtml(accusation.teamName)}</strong><span>${Number(accusation.score)} pts</span></div>
        <p>Culprit: ${escapeHtml(state.game.suspects.find((suspect) => suspect.id === accusation.culprit)?.name || accusation.culprit)}</p>
        <p>Weapon: ${escapeHtml(labelFor(state.game.options.weapons, accusation.weapon))} | Motive: ${escapeHtml(labelFor(state.game.options.motives, accusation.motive))} | Evidence: ${escapeHtml(labelFor(state.game.options.evidence, accusation.evidence))}</p>
        <small>${escapeHtml(accusation.closing || "No closing argument.")}</small>
      </article>
    `)
    .join("");
}

async function refresh() {
  const state = await api("/api/state?host=1");
  render(state);
}

hostEls.actButtons.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-act]");
  if (!button) return;
  await api("/api/host/act", { act: Number(button.dataset.act) });
  refresh();
});

document.body.addEventListener("click", async (event) => {
  const review = event.target.closest("[data-review]");
  const score = event.target.closest("[data-score]");
  if (review) {
    await api("/api/host/submission", {
      submissionId: review.dataset.review,
      status: review.dataset.status,
      score: Number(review.dataset.points)
    });
    refresh();
  }
  if (score) {
    await api("/api/host/score", { teamId: score.dataset.score, delta: Number(score.dataset.delta) });
    refresh();
  }
});

hostEls.resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (hostEls.resetConfirm.value !== "RESET") {
    hostEls.resetMessage.textContent = "Type RESET exactly to clear the live event.";
    return;
  }
  try {
    const state = await api("/api/host/reset", { confirm: "RESET" });
    hostEls.resetConfirm.value = "";
    hostEls.resetMessage.textContent = "Event reset. Returning guest phones can rejoin a new team.";
    render(state);
  } catch (error) {
    hostEls.resetMessage.textContent = error.message;
  }
});

drawQr();
refresh();
setInterval(refresh, 3000);
