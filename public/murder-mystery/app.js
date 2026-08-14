const OPE_MYSTERY_BASE = "/murder-mystery";

const els = {
  joinPanel: document.querySelector("#joinPanel"),
  introPanel: document.querySelector("#introPanel"),
  introVideo: document.querySelector("#playerIntroVideo"),
  introTeamLine: document.querySelector("#introTeamLine"),
  introPlaybackMessage: document.querySelector("#introPlaybackMessage"),
  continueToCaseFile: document.querySelector("#continueToCaseFile"),
  gamePanel: document.querySelector("#gamePanel"),
  joinForm: document.querySelector("#joinForm"),
  playerName: document.querySelector("#playerName"),
  teamName: document.querySelector("#teamName"),
  currentAct: document.querySelector("#currentAct"),
  teamStatus: document.querySelector("#teamStatus"),
  teamScore: document.querySelector("#teamScore"),
  caseFilePanel: document.querySelector("#caseFilePanel"),
  caseFileCount: document.querySelector("#caseFileCount"),
  caseFileList: document.querySelector("#caseFileList"),
  notesForm: document.querySelector("#notesForm"),
  caseNotes: document.querySelector("#caseNotes"),
  notesStatus: document.querySelector("#notesStatus"),
  notesCount: document.querySelector("#notesCount"),
  clueCode: document.querySelector("#clueCode"),
  unlockForm: document.querySelector("#unlockForm"),
  unlockMessage: document.querySelector("#unlockMessage"),
  missionList: document.querySelector("#missionList"),
  suspectList: document.querySelector("#suspectList"),
  accusePanel: document.querySelector("#accusePanel"),
  accuseForm: document.querySelector("#accuseForm"),
  accuseMessage: document.querySelector("#accuseMessage"),
  leaderboard: document.querySelector("#leaderboard"),
  toast: document.querySelector("#toast")
};

const store = {
  get teamId() {
    return localStorage.getItem("opeMysteryTeamId");
  },
  set teamId(value) {
    if (value) localStorage.setItem("opeMysteryTeamId", value);
    else localStorage.removeItem("opeMysteryTeamId");
  },
  hasSeenIntro(teamId) {
    return localStorage.getItem(`opeMysteryIntroSeen:${teamId}`) === "1";
  },
  markIntroSeen(teamId) {
    localStorage.setItem(`opeMysteryIntroSeen:${teamId}`, "1");
  },
  forgetIntro(teamId) {
    if (teamId) localStorage.removeItem(`opeMysteryIntroSeen:${teamId}`);
  }
};

let currentState = null;
let introActive = false;
let caseFileSignature = "";
let notesTeamId = null;
let lastSyncedNotes = "";
let notesDirty = false;
let notesSaveTimer = null;
let notesUpdatedAt = null;
let notesSaving = false;
let notesSaveQueued = false;

async function api(path, payload) {
  const options = payload
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }
    : {};
  const response = await fetch(`${OPE_MYSTERY_BASE}${path}`, options);
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong");
    error.status = response.status;
    error.data = data;
    throw error;
  }
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

function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.remove("hidden");
  setTimeout(() => els.toast.classList.add("hidden"), 2600);
}

function optionList(options) {
  return options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
}

function renderAccuse(state) {
  if (state.currentAct < 4) {
    els.accusePanel.classList.add("hidden");
    return;
  }
  els.accusePanel.classList.remove("hidden");
  const game = state.game;
  const selected = state.accusation || {};
  els.accuseForm.innerHTML = `
    <label>Culprit
      <select name="culprit">
        ${game.suspects.map((suspect) => `<option value="${escapeHtml(suspect.id)}" ${selected.culprit === suspect.id ? "selected" : ""}>${escapeHtml(suspect.name)}</option>`).join("")}
      </select>
    </label>
    <label>Weapon
      <select name="weapon">${optionList(game.options.weapons)}</select>
    </label>
    <label>Motive
      <select name="motive">${optionList(game.options.motives)}</select>
    </label>
    <label>Best evidence
      <select name="evidence">${optionList(game.options.evidence)}</select>
    </label>
    <label>Closing argument
      <textarea name="closing" maxlength="240" placeholder="Make the case in one tight paragraph.">${escapeHtml(selected.closing || "")}</textarea>
    </label>
    <button type="submit">Submit Final Accusation</button>
  `;
  ["weapon", "motive", "evidence"].forEach((field) => {
    if (selected[field]) els.accuseForm.elements[field].value = selected[field];
  });
}

function renderCaseFile(state) {
  const unlocked = state.clues.filter((clue) => clue.unlocked);
  const total = state.game.stations.length;

  const signature = `${state.team.id}:${unlocked.map((clue) => clue.id).join(",")}`;
  if (signature === caseFileSignature) return;
  caseFileSignature = signature;
  els.caseFileCount.textContent = `${unlocked.length} / ${total} secured`;

  if (!unlocked.length) {
    els.caseFileList.innerHTML = '<p class="empty-case-file">No station evidence has been secured.</p>';
    return;
  }

  els.caseFileList.innerHTML = unlocked
    .map((clue) => {
      const stationIndex = state.game.stations.findIndex((station) => station.clueId === clue.id);
      const station = state.game.stations[stationIndex];
      const chapter = stationIndex >= 0 ? String(stationIndex + 1).padStart(2, "0") : "--";
      const video = station?.media?.src
        ? `
          <figure class="case-video-frame">
            <video src="${escapeHtml(station.media.src)}"${station.media.poster ? ` poster="${escapeHtml(station.media.poster)}"` : ""} controls playsinline preload="metadata"></video>
            <figcaption>${escapeHtml(station.media.caption || `${clue.title} character dramatization.`)}</figcaption>
          </figure>`
        : "";
      const location = station?.guestLocation
        ? `<p class="case-location"><strong>Filed from</strong>${escapeHtml(station.guestLocation)}</p>`
        : "";

      return `
        <details class="case-record" id="case-${escapeHtml(clue.id)}">
          <summary>
            <span class="case-record-number">${chapter}</span>
            <span class="case-record-title"><small>${escapeHtml(clue.type)} | Act ${Number(clue.act)}</small><strong>${escapeHtml(clue.title)}</strong></span>
            <span class="case-record-status">Review</span>
          </summary>
          <div class="case-record-body">
            ${video}
            ${location}
            <div class="case-note">
              <strong>Evidence Notes</strong>
              <p>${escapeHtml(clue.text)}</p>
            </div>
            <div class="case-note">
              <strong>Field Task</strong>
              <p>${escapeHtml(clue.action)}</p>
            </div>
            <div class="case-note connection">
              <strong>Connection</strong>
              <p>${escapeHtml(clue.connection)}</p>
            </div>
          </div>
        </details>`;
    })
    .join("");
}

function renderNotes(state) {
  const serverNotes = String(state.team.notes || "");
  if (notesTeamId !== state.team.id) {
    notesTeamId = state.team.id;
    lastSyncedNotes = serverNotes;
    notesDirty = false;
    notesUpdatedAt = state.team.notesUpdatedAt || null;
    els.caseNotes.value = serverNotes;
  } else if (!notesDirty && serverNotes !== lastSyncedNotes) {
    lastSyncedNotes = serverNotes;
    notesUpdatedAt = state.team.notesUpdatedAt || null;
    els.caseNotes.value = serverNotes;
    els.notesStatus.textContent = "Team notes updated";
  }
  els.notesCount.textContent = `${els.caseNotes.value.length} / 4000`;
}

function mergeNotes(base, localDraft, teamCopy) {
  if (localDraft === base) return teamCopy;
  if (teamCopy === base || localDraft === teamCopy) return localDraft;
  if (localDraft.startsWith(base) && teamCopy.startsWith(base)) {
    const additions = [teamCopy.slice(base.length).trim(), localDraft.slice(base.length).trim()].filter(Boolean);
    return `${base.trimEnd()}${additions.length ? `\n${additions.join("\n")}` : ""}`.slice(0, 4000);
  }
  return `${teamCopy.trimEnd()}\n\n${localDraft.trimStart()}`.trim().slice(0, 4000);
}

function render(state) {
  currentState = state;
  if (!state.team) {
    introActive = false;
    caseFileSignature = "";
    notesTeamId = null;
    lastSyncedNotes = "";
    notesDirty = false;
    notesUpdatedAt = null;
    notesSaving = false;
    notesSaveQueued = false;
    clearTimeout(notesSaveTimer);
    els.introVideo.pause();
    els.gamePanel.querySelectorAll("video").forEach((video) => video.pause());
    els.joinPanel.classList.remove("hidden");
    els.introPanel.classList.add("hidden");
    els.gamePanel.classList.add("hidden");
    return;
  }
  els.joinPanel.classList.add("hidden");

  if (introActive) {
    els.introTeamLine.textContent = `${state.team.teamName} has joined the investigation. Watch the briefing before opening your case file.`;
    els.introPanel.classList.remove("hidden");
    els.gamePanel.classList.add("hidden");
    return;
  }

  els.introPanel.classList.add("hidden");
  els.gamePanel.classList.remove("hidden");

  const act = state.game.acts.find((candidate) => candidate.id === state.currentAct);
  els.currentAct.textContent = act.title;
  els.teamStatus.textContent = state.team.teamName;
  els.teamScore.textContent = state.team.score;
  renderCaseFile(state);
  renderNotes(state);

  els.missionList.innerHTML = state.game.missions
    .map((mission) => {
      const last = (state.submissions || []).find((submission) => submission.missionId === mission.id);
      return `
        <article class="mission">
          <div><strong>${escapeHtml(mission.title)}</strong><span>${Number(mission.points)} pts</span></div>
          <p>${escapeHtml(mission.prompt)}</p>
          <form data-mission="${escapeHtml(mission.id)}" class="mission-form">
            <textarea maxlength="240" placeholder="Submit what happened in the room."></textarea>
            <button type="submit">Send to Host</button>
          </form>
          ${last ? `<small>Last submission: ${escapeHtml(last.status)} (${Number(last.score)} pts)</small>` : ""}
        </article>
      `;
    })
    .join("");

  els.suspectList.innerHTML = state.game.suspects
    .map((suspect) => `
      <article>
        <strong>${escapeHtml(suspect.name)}</strong>
        <span>${escapeHtml(suspect.role)}</span>
        <p>${escapeHtml(suspect.publicAlibi)}</p>
        <small>${escapeHtml(suspect.interview)}</small>
      </article>
    `)
    .join("");

  els.leaderboard.innerHTML = state.leaderboard
    .slice(0, 8)
    .map((team) => `<li><span>${escapeHtml(team.teamName)}</span><strong>${Number(team.score)}</strong></li>`)
    .join("");

  renderAccuse(state);
}

async function openIntro(state, attemptPlayback = false) {
  introActive = true;
  els.introPlaybackMessage.textContent = attemptPlayback
    ? "Starting the narrated opening briefing..."
    : "Tap play to begin the narrated opening briefing.";
  els.introVideo.currentTime = 0;
  render(state);

  if (!attemptPlayback) return;
  try {
    await els.introVideo.play();
    els.introPlaybackMessage.textContent = "Opening briefing in progress. The case file will open when it ends.";
  } catch {
    els.introPlaybackMessage.textContent = "Tap play to begin the opening briefing, then continue to your case file.";
  }
}

function enterCaseFile() {
  if (!currentState?.team) return;
  store.markIntroSeen(currentState.team.id);
  introActive = false;
  els.introVideo.pause();
  render(currentState);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function refresh() {
  try {
    const teamId = store.teamId;
    const state = await api(`/api/state${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`);
    if (teamId && !state.team) {
      store.forgetIntro(teamId);
      store.teamId = null;
    } else if (state.team && !store.hasSeenIntro(state.team.id)) {
      introActive = true;
      els.introPlaybackMessage.textContent = els.introVideo.paused
        ? "Tap play to begin the narrated opening briefing."
        : "Opening briefing in progress. The case file will open when it ends.";
    }
    render(state);
  } catch (error) {
    showToast(error.message);
  }
}

els.joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/api/join", {
      playerName: els.playerName.value,
      teamName: els.teamName.value
    });
    store.teamId = data.team.id;
    store.forgetIntro(data.team.id);
    showToast("Team joined. Opening briefing ready.");
    await openIntro(data.state, true);
  } catch (error) {
    showToast(error.message);
  }
});

els.introVideo.addEventListener("play", () => {
  els.introPlaybackMessage.textContent = "Opening briefing in progress. The case file will open when it ends.";
});

els.introVideo.addEventListener("pause", () => {
  if (introActive && !els.introVideo.ended) {
    els.introPlaybackMessage.textContent = "Tap play to begin the narrated opening briefing.";
  }
});

els.introVideo.addEventListener("ended", enterCaseFile);
els.continueToCaseFile.addEventListener("click", enterCaseFile);

document.addEventListener("play", (event) => {
  if (!(event.target instanceof HTMLVideoElement)) return;
  document.querySelectorAll("video").forEach((video) => {
    if (video !== event.target) video.pause();
  });
}, true);

els.caseNotes.addEventListener("input", () => {
  notesDirty = els.caseNotes.value !== lastSyncedNotes;
  els.notesCount.textContent = `${els.caseNotes.value.length} / 4000`;
  els.notesStatus.textContent = notesDirty ? "Unsaved changes" : "Saved for your team";
  clearTimeout(notesSaveTimer);
  if (notesDirty) notesSaveTimer = setTimeout(() => saveNotes(true), 1200);
});

async function saveNotes(silent = false) {
  if (!store.teamId) return;
  clearTimeout(notesSaveTimer);
  if (notesSaving) {
    notesSaveQueued = true;
    return;
  }
  const draft = els.caseNotes.value;
  notesSaving = true;
  els.notesStatus.textContent = "Saving...";
  try {
    const data = await api("/api/notes", {
      teamId: store.teamId,
      notes: draft,
      expectedUpdatedAt: notesUpdatedAt
    });
    currentState = data.state;
    lastSyncedNotes = data.notes;
    notesUpdatedAt = data.notesUpdatedAt;
    if (els.caseNotes.value === draft) {
      notesDirty = false;
      els.caseNotes.value = data.notes;
      els.notesCount.textContent = `${data.notes.length} / 4000`;
      els.notesStatus.textContent = "Saved for your team";
      if (!silent) showToast("Team notes saved.");
    } else {
      notesDirty = els.caseNotes.value !== data.notes;
      els.notesCount.textContent = `${els.caseNotes.value.length} / 4000`;
      els.notesStatus.textContent = notesDirty ? "Unsaved changes" : "Saved for your team";
    }
  } catch (error) {
    if (error.status === 409 && error.data) {
      const teamCopy = String(error.data.notes || "");
      const mergedNotes = mergeNotes(lastSyncedNotes, els.caseNotes.value, teamCopy);
      lastSyncedNotes = teamCopy;
      notesUpdatedAt = error.data.notesUpdatedAt || null;
      els.caseNotes.value = mergedNotes;
      notesDirty = mergedNotes !== teamCopy;
      els.notesCount.textContent = `${mergedNotes.length} / 4000`;
      els.notesStatus.textContent = notesDirty ? "Team updates merged - review and save" : "Team notes updated";
      showToast("A teammate added notes. Both copies were preserved.");
      return;
    }
    els.notesStatus.textContent = "Save failed";
    showToast(error.message);
  } finally {
    notesSaving = false;
    if (notesSaveQueued) {
      notesSaveQueued = false;
      if (notesDirty) notesSaveTimer = setTimeout(() => saveNotes(true), 300);
    }
  }
}

els.notesForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveNotes();
});

els.unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/api/unlock", { teamId: store.teamId, code: els.clueCode.value });
    els.clueCode.value = "";
    els.unlockMessage.textContent = `${data.clue.title} unlocked.`;
    render(data.state);
    const record = document.querySelector(`#case-${data.clue.id}`);
    if (record) {
      record.open = true;
      record.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error) {
    els.unlockMessage.textContent = error.message;
  }
});

els.missionList.addEventListener("submit", async (event) => {
  const form = event.target.closest(".mission-form");
  if (!form) return;
  event.preventDefault();
  const textarea = form.querySelector("textarea");
  try {
    await api("/api/mission", { teamId: store.teamId, missionId: form.dataset.mission, text: textarea.value });
    textarea.value = "";
    showToast("Sent to host.");
    refresh();
  } catch (error) {
    showToast(error.message);
  }
});

els.accuseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.accuseForm);
  try {
    const data = await api("/api/accuse", {
      teamId: store.teamId,
      culprit: form.get("culprit"),
      weapon: form.get("weapon"),
      motive: form.get("motive"),
      evidence: form.get("evidence"),
      closing: form.get("closing")
    });
    els.accuseMessage.textContent = `Accusation submitted. Case score: ${data.accusation.score}.`;
    render(data.state);
  } catch (error) {
    els.accuseMessage.textContent = error.message;
  }
});

refresh();
setInterval(refresh, 4000);
