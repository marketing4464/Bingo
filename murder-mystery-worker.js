import { mysteryGame } from "./murder-mystery-data.js";

const BASE_PATH = "/murder-mystery";
const STORAGE_KEY = "state";

export function handleMurderMysteryApi(request, env) {
  const id = env.MURDER_MYSTERY_STATE.idFromName("ope-murder-mystery");
  return env.MURDER_MYSTERY_STATE.get(id).fetch(request);
}

export class MurderMysteryState {
  constructor(ctx) {
    this.ctx = ctx;
    this.state = freshState();
    this.mutationQueue = Promise.resolve();
    ctx.blockConcurrencyWhile(async () => {
      this.state = normalizeState(await ctx.storage.get(STORAGE_KEY));
    });
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname.slice(BASE_PATH.length);
      if (request.method === "GET" && pathname === "/api/state") {
        await this.mutationQueue;
        return json(publicState(this.state, url.searchParams.get("teamId"), url.searchParams.get("host") === "1"));
      }

      if (request.method === "GET" && pathname === "/api/stations") {
        await this.mutationQueue;
        return json({ stations: publicStations(), currentAct: this.state.currentAct });
      }

      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      const body = await readJson(request);
      const operation = this.mutationQueue.then(async () => {
        const nextState = structuredClone(this.state);
        const result = mutateState(pathname, body, nextState);
        if (result.changed) {
          nextState.lastUpdated = Date.now();
          await this.ctx.storage.put(STORAGE_KEY, nextState);
          this.state = nextState;
        }
        return result;
      });
      this.mutationQueue = operation.catch(() => {});
      const result = await operation;
      return json(result.payload, result.status);
    } catch (error) {
      return json({ error: error.message || "Request failed" }, 500);
    }
  }
}

function mutateState(pathname, body, state) {
  if (pathname === "/api/join") {
    const teamName = clean(body.teamName, "Mystery Team");
    const playerName = clean(body.playerName, "Detective");
    let team = state.teams.find((candidate) => candidate.teamName.toLowerCase() === teamName.toLowerCase());
    let changed = false;
    if (!team) {
      team = {
        id: id("team"),
        teamName,
        players: [],
        score: 0,
        unlockedClues: [],
        notes: "",
        notesUpdatedAt: null,
        createdAt: Date.now(),
        accusationScore: 0,
      };
      state.teams.push(team);
      changed = true;
    }
    if (!team.players.includes(playerName)) {
      team.players.push(playerName);
      changed = true;
    }
    return { status: 200, payload: { team, state: publicState(state, team.id) }, changed };
  }

  if (pathname === "/api/unlock") {
    const team = getTeam(state, body.teamId);
    if (!team) return unchanged(404, { error: "Team not found" });
    const code = clean(body.code).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const clue = mysteryGame.clues.find((candidate) => candidate.code === code);
    if (!clue || clue.act > state.currentAct) {
      return unchanged(404, { error: "That clue code is not active yet." });
    }
    const changed = !team.unlockedClues.includes(clue.id);
    if (changed) {
      team.unlockedClues.push(clue.id);
      team.score += clue.points;
    }
    return { status: 200, payload: { clue, state: publicState(state, team.id) }, changed };
  }

  if (pathname === "/api/notes") {
    const team = getTeam(state, body.teamId);
    if (!team) return unchanged(404, { error: "Team not found" });
    const expectedUpdatedAt = body.expectedUpdatedAt == null ? null : Number(body.expectedUpdatedAt);
    const currentUpdatedAt = team.notesUpdatedAt || null;
    if (expectedUpdatedAt !== currentUpdatedAt) {
      return unchanged(409, {
        error: "A teammate updated these notes.",
        notes: String(team.notes || ""),
        notesUpdatedAt: currentUpdatedAt,
      });
    }
    team.notes = cleanNotes(body.notes);
    team.notesUpdatedAt = Math.max(Date.now(), Number(team.notesUpdatedAt || 0) + 1);
    return {
      status: 200,
      payload: { notes: team.notes, notesUpdatedAt: team.notesUpdatedAt, state: publicState(state, team.id) },
      changed: true,
    };
  }

  if (pathname === "/api/mission") {
    const team = getTeam(state, body.teamId);
    const mission = mysteryGame.missions.find((candidate) => candidate.id === body.missionId && candidate.act <= state.currentAct);
    if (!team || !mission) return unchanged(404, { error: "Team or mission not found" });
    const submission = {
      id: id("sub"),
      type: "mission",
      teamId: team.id,
      teamName: team.teamName,
      missionId: mission.id,
      missionTitle: mission.title,
      text: clean(body.text),
      status: "pending",
      score: 0,
      createdAt: Date.now(),
    };
    state.submissions.unshift(submission);
    return { status: 200, payload: { submission, state: publicState(state, team.id) }, changed: true };
  }

  if (pathname === "/api/accuse") {
    const team = getTeam(state, body.teamId);
    if (!team || state.currentAct < 4) return unchanged(403, { error: "Final accusations are not open yet." });
    const previous = state.accusations.find((accusation) => accusation.teamId === team.id);
    const score = scoreAccusation(body);
    team.score -= team.accusationScore || 0;
    team.accusationScore = score;
    team.score += score;
    const accusation = {
      id: previous ? previous.id : id("acc"),
      teamId: team.id,
      teamName: team.teamName,
      culprit: clean(body.culprit),
      weapon: clean(body.weapon),
      motive: clean(body.motive),
      evidence: clean(body.evidence),
      closing: clean(body.closing),
      score,
      createdAt: Date.now(),
    };
    if (previous) Object.assign(previous, accusation);
    else state.accusations.unshift(accusation);
    return { status: 200, payload: { accusation, state: publicState(state, team.id) }, changed: true };
  }

  if (pathname === "/api/host/act") {
    const nextAct = Number(body.act);
    if (!Number.isInteger(nextAct) || nextAct < 0 || nextAct > 5) return unchanged(400, { error: "Invalid act" });
    state.currentAct = nextAct;
    if (!state.startedAt) state.startedAt = Date.now();
    return { status: 200, payload: publicState(state, null, true), changed: true };
  }

  if (pathname === "/api/host/submission") {
    const submission = state.submissions.find((candidate) => candidate.id === body.submissionId);
    const team = submission ? getTeam(state, submission.teamId) : null;
    if (!submission || !team) return unchanged(404, { error: "Submission not found" });
    if (submission.status === "approved") team.score -= submission.score;
    submission.status = body.status === "approved" ? "approved" : "rejected";
    submission.score = submission.status === "approved" ? Number(body.score || 0) : 0;
    if (submission.status === "approved") team.score += submission.score;
    return { status: 200, payload: publicState(state, null, true), changed: true };
  }

  if (pathname === "/api/host/score") {
    const team = getTeam(state, body.teamId);
    if (!team) return unchanged(404, { error: "Team not found" });
    team.score += Number(body.delta || 0);
    return { status: 200, payload: publicState(state, null, true), changed: true };
  }

  if (pathname === "/api/host/reset") {
    if (body.confirm !== "RESET") return unchanged(400, { error: "Type RESET to confirm." });
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, freshState());
    return { status: 200, payload: publicState(state, null, true), changed: true };
  }

  return unchanged(404, { error: "Unknown API route" });
}

function freshState() {
  return {
    currentAct: 0,
    startedAt: null,
    teams: [],
    submissions: [],
    accusations: [],
    lastUpdated: Date.now(),
  };
}

function normalizeState(value) {
  const source = value && typeof value === "object" ? value : {};
  const next = { ...freshState(), ...source };
  next.teams = Array.isArray(source.teams)
    ? source.teams.map((team) => ({
        ...team,
        players: Array.isArray(team.players) ? team.players : [],
        score: Number(team.score || 0),
        unlockedClues: Array.isArray(team.unlockedClues) ? team.unlockedClues : [],
        notes: String(team.notes || ""),
        notesUpdatedAt: team.notesUpdatedAt || null,
        accusationScore: Number(team.accusationScore || 0),
      }))
    : [];
  next.submissions = Array.isArray(source.submissions) ? source.submissions : [];
  next.accusations = Array.isArray(source.accusations) ? source.accusations : [];
  return next;
}

function publicState(state, teamId, isHost = false) {
  const team = teamId ? getTeam(state, teamId) : null;
  const stations = publicStations();
  const game = {
    title: mysteryGame.title,
    subtitle: mysteryGame.subtitle,
    joinPath: BASE_PATH,
    venue: mysteryGame.venue,
    acts: mysteryGame.acts,
    suspects: mysteryGame.suspects.map(({ secret, ...suspect }) => suspect),
    missions: mysteryGame.missions.filter((mission) => mission.act <= state.currentAct),
    options: mysteryGame.options,
    stations,
    progressTotals: { clues: mysteryGame.clues.length, missions: mysteryGame.missions.length },
  };
  const base = {
    game,
    currentAct: state.currentAct,
    startedAt: state.startedAt,
    leaderboard: leaderboard(state),
    team: team ? { ...team, notes: String(team.notes || ""), notesUpdatedAt: team.notesUpdatedAt || null } : null,
    clues: publicClues(state, team),
  };

  if (isHost) {
    return {
      ...base,
      game: { ...game, clues: mysteryGame.clues },
      clues: mysteryGame.clues,
      teams: state.teams,
      submissions: state.submissions,
      accusations: state.accusations,
    };
  }
  if (team) {
    base.submissions = state.submissions.filter((submission) => submission.teamId === team.id);
    base.accusation = state.accusations.find((accusation) => accusation.teamId === team.id) || null;
  }
  return base;
}

function publicStations() {
  return mysteryGame.stations.map((station) => {
    const clue = mysteryGame.clues.find((candidate) => candidate.code === station.clueCode);
    const media = station.media
      ? {
          ...station.media,
          src: prefixedAsset(station.media.src),
          poster: prefixedAsset(station.media.poster),
        }
      : null;
    return {
      ...station,
      media,
      clueId: clue ? clue.id : null,
      clueTitle: clue ? clue.title : station.title,
      points: clue ? clue.points : 0,
      path: `${BASE_PATH}/station/${station.id}`,
    };
  });
}

function publicClues(state, team) {
  return mysteryGame.clues
    .filter((clue) => clue.act <= state.currentAct)
    .map((clue) => {
      const unlocked = Boolean(team && team.unlockedClues.includes(clue.id));
      return {
        id: clue.id,
        act: clue.act,
        title: clue.title,
        type: clue.type,
        points: clue.points,
        unlocked,
        codeHint: `${clue.code.length} letters`,
        text: unlocked ? clue.text : "",
        action: unlocked ? clue.action : "",
        connection: unlocked ? clue.connection : "",
      };
    });
}

function leaderboard(state) {
  return [...state.teams]
    .sort((a, b) => b.score - a.score || a.teamName.localeCompare(b.teamName))
    .map((team) => {
      const missionSubmissions = state.submissions.filter((submission) => submission.teamId === team.id);
      const submittedMissions = new Set(missionSubmissions.map((submission) => submission.missionId));
      const approvedMissions = new Set(
        missionSubmissions.filter((submission) => submission.status === "approved").map((submission) => submission.missionId),
      );
      return {
        id: team.id,
        teamName: team.teamName,
        players: team.players,
        score: team.score,
        unlockedCount: team.unlockedClues.length,
        missionSubmittedCount: submittedMissions.size,
        missionApprovedCount: approvedMissions.size,
        accusationSubmitted: state.accusations.some((accusation) => accusation.teamId === team.id),
      };
    });
}

function scoreAccusation(body) {
  let score = 0;
  if (body.culprit === mysteryGame.truth.culprit) score += 80;
  if (body.weapon === mysteryGame.truth.weapon) score += 40;
  if (body.motive === mysteryGame.truth.motive) score += 50;
  if (body.evidence === mysteryGame.truth.evidence) score += 30;
  return score;
}

function prefixedAsset(value) {
  if (!value || !String(value).startsWith("/")) return value || "";
  return `${BASE_PATH}${value}`;
}

function getTeam(state, teamId) {
  return state.teams.find((team) => team.id === teamId);
}

function clean(input, fallback = "") {
  return String(input || fallback).trim().slice(0, 240);
}

function cleanNotes(input) {
  return String(input ?? "").replace(/\r\n?/g, "\n").replace(/\0/g, "").slice(0, 4000);
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function unchanged(status, payload) {
  return { status, payload, changed: false };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
