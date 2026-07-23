import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Flag, Plus, Minus, RotateCcw, Trophy, Pencil, Check, Copy, Users,
  DollarSign, ListOrdered, ClipboardList,
} from "lucide-react";

/* ============================================================
   SETUP REQUIRED BEFORE DEPLOYING
   Firebase Realtime Database URL is already filled in below.
   ============================================================ */
const FIREBASE_DB_URL = "https://golf-live-tracking-default-rtdb.firebaseio.com";

const FONT_LINK_ID = "mp-fonts";
function useGoogleFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);
}

const DEFAULT_PARS = [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4];
const DEFAULT_STROKE_INDEX = [5, 11, 15, 1, 7, 13, 3, 17, 9, 4, 10, 16, 2, 8, 14, 6, 18, 12];
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const TEAM_DEFS = [
  { id: "red", name: "Team Red", color: "#B5482F" },
  { id: "blue", name: "Team Blue", color: "#2A5C8A" },
  { id: "green", name: "Team Green", color: "#2D6A4F" },
  { id: "black", name: "Team Black", color: "#2B2B2B" },
];

function generateCode() {
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}
function configured() {
  return FIREBASE_DB_URL && !FIREBASE_DB_URL.includes("YOUR-PROJECT");
}
async function dbGet(matchId) {
  const res = await fetch(`${FIREBASE_DB_URL}/matches/${matchId}.json`);
  if (!res.ok) throw new Error("fail");
  return res.json();
}
async function dbSet(matchId, data) {
  const res = await fetch(`${FIREBASE_DB_URL}/matches/${matchId}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("fail");
}

/* ---------------- Match Play helpers ---------------- */
function makeMatchHoles() {
  return DEFAULT_PARS.map((par, i) => ({ number: i + 1, par, a: null, b: null }));
}
function computeMatchStatus(holes) {
  let diff = 0, thru = 0, result = null, resultThru = null;
  for (const h of holes) {
    if (h.a == null || h.b == null) break;
    thru = h.number;
    if (h.a < h.b) diff += 1; else if (h.b < h.a) diff -= 1;
    const left = 18 - h.number;
    if (Math.abs(diff) > left && !result) {
      result = `${diff > 0 ? "a" : "b"}|${Math.abs(diff)}&${left}`;
      resultThru = h.number;
    }
  }
  const left = 18 - thru;
  const dormie = !result && Math.abs(diff) === left && left > 0 && thru > 0;
  return { diff, thru, dormie, result, resultThru };
}

/* ---------------- Stableford helpers ---------------- */
function makeTeams() {
  return TEAM_DEFS.map((t) => ({
    ...t,
    players: [0, 1, 2, 3].map(() => ({ name: "", hcp: 12 })),
  }));
}
function makeStablefordHoles() {
  return DEFAULT_PARS.map((par, i) => ({
    number: i + 1,
    par,
    strokeIndex: DEFAULT_STROKE_INDEX[i],
    scores: {},
  }));
}
function strokesReceived(hcp, strokeIndex) {
  const h = Math.max(0, Number(hcp) || 0);
  const full = Math.floor(h / 18);
  const rem = h % 18;
  return full + (strokeIndex <= rem ? 1 : 0);
}
function pointsForNetRelative(rel) {
  if (rel <= -3) return 10;
  if (rel === -2) return 8;
  if (rel === -1) return 4;
  if (rel === 0) return 2;
  if (rel === 1) return 1;
  return 0;
}
function playerPoints(teams, holes, playerId, holeIdx) {
  const h = holes[holeIdx];
  const gross = h.scores?.[playerId];
  if (gross == null) return null;
  let hcp = 12;
  for (const t of teams) {
    const p = t.players.find((_, i) => `${t.id}-${i}` === playerId);
    if (p) hcp = p.hcp;
  }
  const net = gross - strokesReceived(hcp, h.strokeIndex);
  return pointsForNetRelative(net - h.par);
}
function teamHolePoints(teams, holes, team, holeIdx) {
  const pts = team.players
    .map((_, i) => playerPoints(teams, holes, `${team.id}-${i}`, holeIdx))
    .filter((p) => p != null)
    .sort((a, b) => b - a);
  return pts.slice(0, 2).reduce((s, p) => s + p, 0);
}
function teamTotal(teams, holes, team) {
  return holes.reduce((sum, _, i) => sum + teamHolePoints(teams, holes, team, i), 0);
}

/* ============================================================ */

function LandingScreen({ joinCode, setJoinCode, onJoin, onCreate, error }) {
  return (
    <div className="setup">
      <div className="setup__flag"><Flag size={30} strokeWidth={2} /></div>
      <h1 className="setup__title">Match Play</h1>
      <p className="setup__sub">Live, shared scoring. Anyone with the link can edit.</p>
      <label className="setup__field">
        <span>Have a match code?</span>
        <input value={joinCode} maxLength={4} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. K7QM" />
      </label>
      {error && <div className="setup__error">{error}</div>}
      <button className="setup__start" onClick={onJoin} disabled={joinCode.length !== 4}>Join Match</button>
      <div className="setup__divider"><span>or</span></div>
      <button className="setup__start setup__start--ghost" onClick={onCreate}>Start New Match <Flag size={16} strokeWidth={2.5} /></button>
    </div>
  );
}

function ModeScreen({ onPick }) {
  return (
    <div className="setup">
      <div className="setup__flag"><Flag size={30} strokeWidth={2} /></div>
      <h1 className="setup__title">Choose a Format</h1>
      <p className="setup__sub">Pick how this round will be scored.</p>
      <button className="modeCard" onClick={() => onPick("matchplay")}>
        <div className="modeCard__title">Match Play</div>
        <div className="modeCard__desc">Head-to-head, hole by hole. 2 players or teams.</div>
      </button>
      <button className="modeCard" onClick={() => onPick("stableford")}>
        <div className="modeCard__title">16-Man Stableford Teams</div>
        <div className="modeCard__desc">4 teams of 4, best-2 net Stableford points, $ payouts.</div>
      </button>
    </div>
  );
}

function MatchSetupScreen({ names, setNames, onStart }) {
  return (
    <div className="setup">
      <div className="setup__flag"><Flag size={30} strokeWidth={2} /></div>
      <h1 className="setup__title">New Match</h1>
      <p className="setup__sub">Name both sides, then share the link that appears next.</p>
      <label className="setup__field">
        <span>Player / Team A</span>
        <input value={names.a} maxLength={20} onChange={(e) => setNames((n) => ({ ...n, a: e.target.value }))} placeholder="e.g. Cody" />
      </label>
      <label className="setup__field">
        <span>Player / Team B</span>
        <input value={names.b} maxLength={20} onChange={(e) => setNames((n) => ({ ...n, b: e.target.value }))} placeholder="e.g. Sam" />
      </label>
      <button className="setup__start" onClick={onStart}>Create Match <Flag size={16} strokeWidth={2.5} /></button>
    </div>
  );
}

function StablefordSetupScreen({ teams, setTeams, stake, setStake, onStart }) {
  const updatePlayer = (teamId, idx, field, value) => {
    setTeams((ts) =>
      ts.map((t) =>
        t.id !== teamId
          ? t
          : { ...t, players: t.players.map((p, i) => (i === idx ? { ...p, [field]: value } : p)) }
      )
    );
  };
  const updateTeamName = (teamId, value) => {
    setTeams((ts) => ts.map((t) => (t.id === teamId ? { ...t, name: value } : t)));
  };

  return (
    <div className="setup setup--wide">
      <div className="setup__flag"><Flag size={30} strokeWidth={2} /></div>
      <h1 className="setup__title">16-Man Stableford</h1>
      <p className="setup__sub">4 teams &middot; best 2 net scores count &middot; most points wins.</p>

      {teams.map((team) => (
        <div key={team.id} className="teamCard" style={{ borderColor: team.color }}>
          <div className="teamCard__header">
            <span className="teamCard__dot" style={{ background: team.color }} />
            <input
              className="teamCard__name"
              value={team.name}
              maxLength={18}
              onChange={(e) => updateTeamName(team.id, e.target.value)}
            />
          </div>
          {team.players.map((p, i) => (
            <div className="teamCard__row" key={i}>
              <input
                className="teamCard__playerName"
                placeholder={`Player ${i + 1}`}
                value={p.name}
                maxLength={18}
                onChange={(e) => updatePlayer(team.id, i, "name", e.target.value)}
              />
              <input
                className="teamCard__hcp"
                type="number"
                inputMode="numeric"
                value={p.hcp}
                onChange={(e) => updatePlayer(team.id, i, "hcp", Number(e.target.value) || 0)}
              />
            </div>
          ))}
        </div>
      ))}

      <label className="setup__field">
        <span>Payout: $ per point difference (per team)</span>
        <input
          type="number"
          inputMode="numeric"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value) || 0)}
        />
      </label>

      <button className="setup__start" onClick={onStart}>Create Match <Flag size={16} strokeWidth={2.5} /></button>
    </div>
  );
}

/* ---------------- Match Play live view ---------------- */
function MatchStatusBanner({ status, names }) {
  const { diff, thru, dormie, result } = status;
  if (result) {
    const [winner, margin] = result.split("|");
    const name = winner === "a" ? names.a : names.b;
    return <div className="banner banner--won">
