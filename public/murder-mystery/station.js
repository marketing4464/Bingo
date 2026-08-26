const OPE_MYSTERY_BASE = "/murder-mystery";

const stationEls = {
  title: document.querySelector("#stationTitle"),
  location: document.querySelector("#stationLocation"),
  joinPanel: document.querySelector("#stationJoinPanel"),
  joinForm: document.querySelector("#stationJoinForm"),
  playerName: document.querySelector("#stationPlayerName"),
  teamName: document.querySelector("#stationTeamName"),
  panel: document.querySelector("#stationPanel"),
  videoCard: document.querySelector("#stationVideoCard"),
  video: document.querySelector("#stationVideo"),
  videoCaption: document.querySelector("#stationVideoCaption"),
  type: document.querySelector("#stationType"),
  act: document.querySelector("#stationAct"),
  scene: document.querySelector("#stationScene"),
  interviewLabel: document.querySelector("#stationInterviewLabel"),
  interview: document.querySelector("#stationInterview"),
  task: document.querySelector("#stationTask"),
  connect: document.querySelector("#stationConnect"),
  hintsDetails: document.querySelector("#stationHintsDetails"),
  hintList: document.querySelector("#stationHintList"),
  hintButton: document.querySelector("#stationHintButton"),
  unlockButton: document.querySelector("#unlockStationButton"),
  message: document.querySelector("#stationMessage"),
  cluePanel: document.querySelector("#stationCluePanel"),
  points: document.querySelector("#stationPoints"),
  clueType: document.querySelector("#stationClueType"),
  clueTitle: document.querySelector("#stationClueTitle"),
  clueText: document.querySelector("#stationClueText"),
  clueAction: document.querySelector("#stationClueAction"),
  clueConnection: document.querySelector("#stationClueConnection"),
  toast: document.querySelector("#stationToast")
};

const stationStore = {
  get teamId() {
    return localStorage.getItem("opeMysteryTeamId");
  },
  set teamId(value) {
    if (value) localStorage.setItem("opeMysteryTeamId", value);
    else localStorage.removeItem("opeMysteryTeamId");
  }
};

let activeStation = null;
let activeCurrentAct = 0;

async function stationApi(path, payload) {
  const options = payload
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }
    : {};
  const response = await fetch(`${OPE_MYSTERY_BASE}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function stationSlug() {
  return decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
}

function showStationToast(text) {
  stationEls.toast.textContent = text;
  stationEls.toast.classList.remove("hidden");
  setTimeout(() => stationEls.toast.classList.add("hidden"), 2600);
}

function stationHintKey(station) {
  return `opeMysteryHints:${stationStore.teamId || "device"}:${station.id}`;
}

function revealedHintCount(station) {
  const count = Number(localStorage.getItem(stationHintKey(station)) || 0);
  return Math.max(0, Math.min(station.hints?.length || 0, count));
}

function renderStationHints(station, currentAct) {
  const hints = Array.isArray(station.hints) ? station.hints : [];
  stationEls.hintsDetails.classList.toggle("hidden", !hints.length);
  if (!hints.length) return;

  const revealed = revealedHintCount(station);
  stationEls.hintList.innerHTML = hints
    .slice(0, revealed)
    .map((hint, index) => `<li><strong>Hint ${index + 1}</strong><span>${hint}</span></li>`)
    .join("");
  stationEls.hintButton.disabled = station.act > currentAct || revealed >= hints.length;
  stationEls.hintButton.textContent = revealed >= hints.length ? "All Hints Revealed" : `Reveal Hint ${revealed + 1}`;
  if (revealed) stationEls.hintsDetails.open = true;
}

function renderStation(station, currentAct) {
  activeCurrentAct = currentAct;
  stationEls.title.textContent = station.title;
  stationEls.location.textContent = station.guestLocation || station.location;
  stationEls.type.textContent = station.type;
  stationEls.act.textContent = `Act ${station.act}`;
  stationEls.scene.textContent = station.scene;
  stationEls.interviewLabel.textContent = station.interviewLabel || "Recorded Statement";
  stationEls.interview.textContent = station.interview;
  stationEls.task.textContent = station.task;
  stationEls.connect.textContent = station.connect;
  renderStationHints(station, currentAct);
  if (station.media && station.media.src) {
    stationEls.video.src = station.media.src;
    if (station.media.poster) stationEls.video.poster = station.media.poster;
    else stationEls.video.removeAttribute("poster");
    stationEls.videoCaption.textContent = station.media.caption
      ? `${station.media.caption} Tap play to watch the narrated character scene before unlocking.`
      : "Tap play to watch the narrated character scene before unlocking.";
    stationEls.videoCard.classList.remove("hidden");
  } else {
    stationEls.video.removeAttribute("src");
    stationEls.video.removeAttribute("poster");
    stationEls.videoCard.classList.add("hidden");
  }
  stationEls.unlockButton.disabled = station.act > currentAct;
  stationEls.message.textContent =
    station.act > currentAct
      ? `This station opens in Act ${station.act}. Check the display or host announcement before unlocking.`
      : station.prompt;
  stationEls.joinPanel.classList.toggle("hidden", Boolean(stationStore.teamId));
}

function renderClue(clue, state) {
  stationEls.cluePanel.classList.remove("hidden");
  stationEls.points.textContent = `${clue.points} pts`;
  stationEls.clueType.textContent = clue.type;
  stationEls.clueTitle.textContent = clue.title;
  stationEls.clueText.textContent = clue.text;
  stationEls.clueAction.textContent = clue.action;
  stationEls.clueConnection.textContent = clue.connection;
  stationEls.message.textContent = `${clue.title} added to ${state.team.teamName}'s case file.`;
}

async function unlockStation() {
  if (!activeStation) return;
  if (!stationStore.teamId) {
    stationEls.joinPanel.classList.remove("hidden");
    stationEls.message.textContent = "Join a team first, then this station will unlock.";
    return;
  }
  try {
    const data = await stationApi("/api/unlock", {
      teamId: stationStore.teamId,
      code: activeStation.clueCode
    });
    renderClue(data.clue, data.state);
  } catch (error) {
    if (error.message === "Team not found") {
      stationStore.teamId = null;
      stationEls.joinPanel.classList.remove("hidden");
      stationEls.message.textContent = "This device's earlier case was reset. Rejoin a team to unlock this station.";
      return;
    }
    stationEls.message.textContent = error.message;
  }
}

async function initStation() {
  try {
    const stationData = await stationApi("/api/stations");
    if (stationStore.teamId) {
      const playerState = await stationApi(`/api/state?teamId=${encodeURIComponent(stationStore.teamId)}`);
      if (!playerState.team) stationStore.teamId = null;
    }
    activeStation = stationData.stations.find((station) => station.id === stationSlug());
    if (!activeStation) {
      stationEls.title.textContent = "Station Not Found";
      stationEls.location.textContent = "Check the QR code and try again.";
      stationEls.panel.classList.add("hidden");
      return;
    }
    renderStation(activeStation, stationData.currentAct);
  } catch (error) {
    showStationToast(error.message);
  }
}

stationEls.unlockButton.addEventListener("click", unlockStation);

stationEls.hintButton.addEventListener("click", () => {
  if (!activeStation || activeStation.act > activeCurrentAct) return;
  const count = revealedHintCount(activeStation);
  if (count >= activeStation.hints.length) return;
  localStorage.setItem(stationHintKey(activeStation), String(count + 1));
  renderStationHints(activeStation, activeCurrentAct);
});

stationEls.joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await stationApi("/api/join", {
      playerName: stationEls.playerName.value,
      teamName: stationEls.teamName.value
    });
    stationStore.teamId = data.team.id;
    stationEls.joinPanel.classList.add("hidden");
    await unlockStation();
  } catch (error) {
    showStationToast(error.message);
  }
});

initStation();
