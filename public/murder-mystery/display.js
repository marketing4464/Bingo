const OPE_MYSTERY_BASE = "/murder-mystery";

const displayEls = {
  title: document.querySelector("#displayTitle"),
  act: document.querySelector("#displayAct"),
  objective: document.querySelector("#displayObjective"),
  totals: document.querySelector("#displayTotals"),
  teamProgress: document.querySelector("#displayTeamProgress"),
  progressPage: document.querySelector("#displayProgressPage"),
  join: document.querySelector("#displayJoin")
};

const teamsPerPage = 8;
let progressPage = 0;
let progressPageChangedAt = Date.now();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

async function refreshDisplay() {
  const response = await fetch(`${OPE_MYSTERY_BASE}/api/state`);
  const state = await response.json();
  const act = state.game.acts.find((candidate) => candidate.id === state.currentAct);
  const teams = state.leaderboard;
  const clueTotal = state.game.progressTotals.clues;
  const missionTotal = state.game.progressTotals.missions;
  const activeClueTotal = state.game.stations.filter((station) => station.act <= state.currentAct).length;
  const activeMissionTotal = state.game.missions.length;
  const totalPlayers = teams.reduce((sum, team) => sum + team.players.length, 0);
  const totalClues = teams.reduce((sum, team) => sum + team.unlockedCount, 0);
  const pageCount = Math.max(1, Math.ceil(teams.length / teamsPerPage));
  if (progressPage >= pageCount) progressPage = 0;
  if (pageCount > 1 && Date.now() - progressPageChangedAt >= 12000) {
    progressPage = (progressPage + 1) % pageCount;
    progressPageChangedAt = Date.now();
  }
  const pageStart = progressPage * teamsPerPage;
  const visibleTeams = teams.slice(pageStart, pageStart + teamsPerPage);
  displayEls.title.textContent = state.game.title;
  displayEls.act.textContent = act.title;
  displayEls.objective.textContent = act.liveAction;
  displayEls.join.textContent = `${location.origin}${OPE_MYSTERY_BASE}`;
  displayEls.progressPage.textContent = pageCount > 1 ? `Page ${progressPage + 1} / ${pageCount} | Updates live` : "Updates live";
  displayEls.totals.innerHTML = `
    <div><strong>${teams.length}</strong><span>Teams</span></div>
    <div><strong>${totalPlayers}</strong><span>Players</span></div>
    <div><strong>${totalClues}</strong><span>Clues Found</span></div>`;
  displayEls.teamProgress.innerHTML = teams.length
    ? visibleTeams
        .map((team, index) => {
          const cluePercent = clueTotal ? Math.round((team.unlockedCount / clueTotal) * 100) : 0;
          const missionPercent = missionTotal ? Math.round((team.missionSubmittedCount / missionTotal) * 100) : 0;
          const accusationStatus = team.accusationSubmitted
            ? "Accusation filed"
            : state.currentAct >= 4
              ? "Building accusation"
              : activeClueTotal > 0 && team.unlockedCount >= activeClueTotal
                ? "Caught up"
                : "Investigating";
          return `
            <article class="display-progress-team">
              <div class="display-team-rank">${pageStart + index + 1}</div>
              <div class="display-team-identity">
                <strong>${escapeHtml(team.teamName)}</strong>
                <span>${escapeHtml(team.players.join(" | ") || "Detectives joining")}</span>
              </div>
              <div class="display-progress-metrics">
                <div>
                  <span>Evidence ${Number(team.unlockedCount)} / ${clueTotal}</span>
                  <div class="display-progress-track"><i style="width:${cluePercent}%"></i></div>
                </div>
                <div>
                  <span>Missions ${Number(team.missionSubmittedCount)} / ${missionTotal}</span>
                  <div class="display-progress-track mission"><i style="width:${missionPercent}%"></i></div>
                </div>
              </div>
              <div class="display-team-status">
                <strong>${Number(team.score)} pts</strong>
                <span>${escapeHtml(accusationStatus)}</span>
                <small>${Number(team.missionApprovedCount)} approved | ${activeClueTotal} clues and ${activeMissionTotal} missions open</small>
              </div>
            </article>`;
        })
        .join("")
    : '<p class="display-empty">Waiting for detective teams to accept the invitation.</p>';
}

refreshDisplay();
setInterval(refreshDisplay, 3000);
