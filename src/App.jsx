import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Flag, Plus, Minus, RotateCcw, Trophy, Pencil, Check, Copy, Users,
  DollarSign, ListOrdered, ClipboardList, Lock, Unlock, Settings,
  TrendingUp, TrendingDown, Minus as MinusIcon, Star, Award, Eye, Table, Flame, Info,
} from "lucide-react";

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
const TEE_NAMES = ["Black", "Blue", "White", "Red", "Gold"];
const TEE_YARDS = { Black: 1.0, Blue: 0.93, White: 0.87, Red: 0.78, Gold: 0.72 };
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const TEAM_DEFS = [
  { id: "red", name: "Team Red", color: "#C8102E" },
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
async function dbSetIndexEntry(matchId, entry) {
  const res = await fetch(`${FIREBASE_DB_URL}/matchIndex/${matchId}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error("fail");
}
async function dbGetIndexList() {
  const res = await fetch(`${FIREBASE_DB_URL}/matchIndex.json`);
  if (!res.ok) throw new Error("fail");
  const data = await res.json();
  if (!data) return [];
  return Object.entries(data)
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function makeTeams() {
  return TEAM_DEFS.map((t) => ({
    ...t,
    players: [0, 1, 2, 3].map(() => ({ name: "", hcp: 12, tee: "White" })),
  }));
}
function baseYardage(par) {
  if (par === 3) return 165;
  if (par === 5) return 520;
  return 390;
}
function makeCourseHoles() {
  return DEFAULT_PARS.map((par, i) => {
    const yards = {};
    TEE_NAMES.forEach((t) => (yards[t] = Math.round((baseYardage(par) * TEE_YARDS[t]) / 5) * 5));
    return { number: i + 1, par, strokeIndex: DEFAULT_STROKE_INDEX[i], yardage: yards, notes: "" };
  });
}
function makeScoreHoles() {
  return DEFAULT_PARS.map((_, i) => ({ number: i + 1, scores: {} }));
}
function makeEvent() {
  return {
    eventName: "Golf Tournament",
    eventDate: "",
    courseName: "",
    stake: 1,
    locked: false,
    codes: { admin: "ADMIN1", scorer1: "SCORE1", scorer2: "SCORE2", scorer3: "SCORE3", scorer4: "SCORE4", view: "VIEW1" },
  };
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
function findPlayerHcp(teams, playerId) {
  for (const t of teams) {
    const i = t.players.findIndex((_, idx) => `${t.id}-${idx}` === playerId);
    if (i !== -1) return t.players[i].hcp;
  }
  return 12;
}
function playerPoints(teams, courseHoles, scoreHoles, playerId, holeIdx) {
  const gross = scoreHoles[holeIdx]?.scores?.[playerId];
  if (gross == null) return null;
  const ch = courseHoles[holeIdx];
  const hcp = findPlayerHcp(teams, playerId);
  const net = gross - strokesReceived(hcp, ch.strokeIndex);
  return { gross, net, points: pointsForNetRelative(net - ch.par) };
}
function teamHoleRoster(teams, courseHoles, scoreHoles, team, holeIdx) {
  const rows = team.players
    .map((p, i) => {
      const id = `${team.id}-${i}`;
      const r = playerPoints(teams, courseHoles, scoreHoles, id, holeIdx);
      return r ? { id, name: p.name || `Player ${i + 1}`, ...r } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.points - a.points);
  rows.forEach((r, i) => (r.counted = i < 2));
  return rows;
}
function teamHolePoints(teams, courseHoles, scoreHoles, team, holeIdx) {
  return teamHoleRoster(teams, courseHoles, scoreHoles, team, holeIdx)
    .filter((r) => r.counted)
    .reduce((s, r) => s + r.points, 0);
}
function teamTotalThru(teams, courseHoles, scoreHoles, team, uptoIdx) {
  let sum = 0;
  for (let i = 0; i <= uptoIdx; i++) sum += teamHolePoints(teams, courseHoles, scoreHoles, team, i);
  return sum;
}
function lastScoredHoleIdx(scoreHoles) {
  let last = -1;
  scoreHoles.forEach((h, i) => {
    if (Object.keys(h.scores || {}).length > 0) last = i;
  });
  return last;
}
function rankOf(teams, courseHoles, scoreHoles, uptoIdx) {
  if (uptoIdx < 0) return TEAM_DEFS.map((t) => ({ id: t.id, total: 0 }));
  return teams
    .map((t) => ({ id: t.id, total: teamTotalThru(teams, courseHoles, scoreHoles, t, uptoIdx) }))
    .sort((a, b) => b.total - a.total);
}
function movementFor(teams, courseHoles, scoreHoles) {
  const last = lastScoredHoleIdx(scoreHoles);
  const now = rankOf(teams, courseHoles, scoreHoles, last);
  const before = rankOf(teams, courseHoles, scoreHoles, last - 1);
  const map = {};
  now.forEach((r, i) => {
    const prevIdx = before.findIndex((b) => b.id === r.id);
    map[r.id] = prevIdx === -1 ? 0 : prevIdx - i;
  });
  return map;
}
function mvpPlayer(teams, courseHoles, scoreHoles) {
  let best = null;
  teams.forEach((t) =>
    t.players.forEach((p, i) => {
      const id = `${t.id}-${i}`;
      let total = 0;
      let any = false;
      scoreHoles.forEach((_, hi) => {
        const r = playerPoints(teams, courseHoles, scoreHoles, id, hi);
        if (r) { total += r.points; any = true; }
      });
      if (any && (!best || total > best.total)) best = { id, name: p.name || "Player", team: t, total };
    })
  );
  return best;
}
function strugglingPlayer(teams, courseHoles, scoreHoles) {
  let worst = null;
  teams.forEach((t) =>
    t.players.forEach((p, i) => {
      const id = `${t.id}-${i}`;
      let total = 0;
      let any = false;
      scoreHoles.forEach((_, hi) => {
        const r = playerPoints(teams, courseHoles, scoreHoles, id, hi);
        if (r) { total += r.points; any = true; }
      });
      if (any && (!worst || total < worst.total)) worst = { id, name: p.name || "Player", team: t, total };
    })
  );
  return worst;
}

const JAB_LINES = [
  "is cooked.",
  "left their swing at home today.",
  "is out here golfing like it's a company scramble.",
  "found every bunker on the course. Impressive, actually.",
  "might want to try disc golf instead.",
  "is currently sponsored by \"Where Did That Go\" ball retrievers.",
  "is giving the trees a run for their money.",
  "is playing captain's-choice-of-their-own-worst-shot.",
  "has officially entered the witness protection program.",
  "is 0 for their handicap today.",
  "needs a mulligan for the whole round, not just one hole.",
  "is putting like the green is made of lava.",
  "is on a heater... in the wrong direction.",
  "should probably just pick up and ride along.",
  "is making the sandbaggers proud.",
];
function jabHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function jabFor(struggling) {
  const seed = `${struggling.id}-${struggling.total}`;
  return JAB_LINES[jabHash(seed) % JAB_LINES.length];
}
function holeWinner(teams, courseHoles, scoreHoles, holeIdx) {
  if (holeIdx < 0) return null;
  const filled = Object.keys(scoreHoles[holeIdx]?.scores || {}).length;
  if (filled < 16) return null;
  let best = null;
  teams.forEach((t) => {
    const pts = teamHolePoints(teams, courseHoles, scoreHoles, t, holeIdx);
    if (!best || pts > best.pts) best = { team: t, pts };
  });
  return best;
}
function progressPct(scoreHoles) {
  let filled = 0;
  scoreHoles.forEach((h) => (filled += Object.keys(h.scores || {}).length));
  return Math.round((filled / (16 * scoreHoles.length)) * 100);
}

function moneyStandings(teams, courseHoles, scoreHoles, stake) {
  const lastIdx = lastScoredHoleIdx(scoreHoles);
  const totals = teams.map((t) => ({ team: t, total: teamTotalThru(teams, courseHoles, scoreHoles, t, lastIdx) }));
  return totals
    .map(({ team, total }) => {
      let net = 0;
      totals.forEach((o) => { if (o.team.id !== team.id) net += (total - o.total) * stake; });
      return { team, net };
    })
    .sort((a, b) => b.net - a.net);
}

// A player is "on a heater" when their most recent consecutive holes are all
// net birdie or better (Stableford points >= 4). Streak resets on any hole
// worse than that; trailing un-played holes don't count against it.
function heatList(teams, courseHoles, scoreHoles, threshold = 4, minStreak = 2) {
  const list = [];
  teams.forEach((t) =>
    t.players.forEach((p, i) => {
      const id = `${t.id}-${i}`;
      let streak = 0, lastPlayedStreak = 0, any = false;
      scoreHoles.forEach((_, hi) => {
        const r = playerPoints(teams, courseHoles, scoreHoles, id, hi);
        if (r) {
          any = true;
          streak = r.points >= threshold ? streak + 1 : 0;
          lastPlayedStreak = streak;
        }
      });
      if (any && lastPlayedStreak >= minStreak) {
        list.push({ id, name: p.name || "Player", team: t, streak: lastPlayedStreak });
      }
    })
  );
  return list.sort((a, b) => b.streak - a.streak);
}

function LandingScreen({ joinCode, setJoinCode, onJoin, onCreate, error, tournaments, loadingTournaments, onSelectTournament }) {
  return (
    <div className="setup">
      <div className="setup__flag"><Flag size={30} strokeWidth={2} /></div>
      <h1 className="setup__title">Trojan Match Play</h1>
      <p className="setup__sub">Live, shared tournament scoring.</p>

      {tournaments.length > 0 && (
        <div className="card" style={{ width: "100%", textAlign: "left" }}>
          <div className="sectionLabel">Existing tournaments</div>
          {tournaments.map((t) => (
            <button key={t.code} className="tourneyRow" onClick={() => onSelectTournament(t.code)}>
              <span className="tourneyRow__name">{t.eventName || "Untitled event"}</span>
              <span className="tourneyRow__code">{t.code}</span>
            </button>
          ))}
        </div>
      )}
      {loadingTournaments && <p className="setup__sub" style={{ margin: "0 0 14px" }}>Loading tournaments\u2026</p>}

      <label className="setup__field">
        <span>Have a match code?</span>
        <input value={joinCode} maxLength={4} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. K7QM" />
      </label>
      {error && <div className="setup__error">{error}</div>}
      <button className="setup__start" onClick={onJoin} disabled={joinCode.length !== 4}>Join Match</button>
      <div className="setup__divider"><span>or</span></div>
      <button className="setup__start setup__start--ghost" onClick={onCreate}>Start New Stableford Match <Flag size={16} strokeWidth={2.5} /></button>
    </div>
  );
}

function RoleGate({ event, onEnter, onCancel }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const c = code.trim().toUpperCase();
    if (c === event.codes.admin.toUpperCase()) return onEnter("admin", null);
    if (c === event.codes.view.toUpperCase()) return onEnter("view", null);
    for (let i = 0; i < 4; i++) {
      if (c === event.codes[`scorer${i + 1}`].toUpperCase()) return onEnter("scorer", i);
    }
    setError("Code not recognized.");
  };

  return (
    <div className="setup">
      <div className="setup__flag"><Lock size={26} strokeWidth={2} /></div>
      <h1 className="setup__title" style={{ fontSize: 26 }}>Enter Access Code</h1>
      <p className="setup__sub">{event.eventName}</p>
      <label className="setup__field">
        <span>Access code</span>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. SCORE2 for Foursome 2" />
      </label>
      {error && <div className="setup__error">{error}</div>}
      <button className="setup__start" onClick={submit}>Enter <Flag size={16} strokeWidth={2.5} /></button>
      {onCancel && <button className="setup__start setup__start--ghost" style={{ marginTop: 10 }} onClick={onCancel}>Cancel</button>}
    </div>
  );
}

function SetupTab({ event, setEvent, teams, setTeams, courseHoles, setCourseHoles, activeHole, setActiveHole }) {
  const [section, setSection] = useState("event");
  const ch = courseHoles[activeHole - 1];

  const updateEvent = (field, val) => setEvent((e) => ({ ...e, [field]: val }));
  const updateCode = (field, val) => setEvent((e) => ({ ...e, codes: { ...e.codes, [field]: val } }));
  const updatePlayer = (teamId, idx, field, value) => {
    setTeams((ts) => ts.map((t) => t.id !== teamId ? t : { ...t, players: t.players.map((p, i) => i === idx ? { ...p, [field]: value } : p) }));
  };
  const updateHole = (field, val) => setCourseHoles((hs) => hs.map((h, i) => i === activeHole - 1 ? { ...h, [field]: val } : h));
  const updateYardage = (tee, val) => setCourseHoles((hs) => hs.map((h, i) => i === activeHole - 1 ? { ...h, yardage: { ...h.yardage, [tee]: Number(val) || 0 } } : h));

  return (
    <>
      <div className="tabs">
        <button className={`tabs__btn ${section === "event" ? "tabs__btn--active" : ""}`} onClick={() => setSection("event")}>Event</button>
        <button className={`tabs__btn ${section === "teams" ? "tabs__btn--active" : ""}`} onClick={() => setSection("teams")}>Players</button>
        <button className={`tabs__btn ${section === "course" ? "tabs__btn--active" : ""}`} onClick={() => setSection("course")}>Course</button>
      </div>

      {section === "event" && (
        <div className="card">
          <label className="setup__field"><span>Event name</span><input value={event.eventName} onChange={(e) => updateEvent("eventName", e.target.value)} /></label>
          <label className="setup__field"><span>Date</span><input type="date" value={event.eventDate} onChange={(e) => updateEvent("eventDate", e.target.value)} /></label>
          <label className="setup__field"><span>Course name</span><input value={event.courseName} onChange={(e) => updateEvent("courseName", e.target.value)} placeholder="e.g. Trojan National" /></label>
          <label className="setup__field"><span>Payout: $ per point difference</span><input type="number" inputMode="numeric" value={event.stake} onChange={(e) => updateEvent("stake", Number(e.target.value) || 0)} /></label>
          <div className="codesGrid">
            <label className="setup__field"><span>Admin code</span><input value={event.codes.admin} onChange={(e) => updateCode("admin", e.target.value)} /></label>
            <label className="setup__field"><span>Foursome 1 scorer code</span><input value={event.codes.scorer1} onChange={(e) => updateCode("scorer1", e.target.value)} /></label>
            <label className="setup__field"><span>Foursome 2 scorer code</span><input value={event.codes.scorer2} onChange={(e) => updateCode("scorer2", e.target.value)} /></label>
            <label className="setup__field"><span>Foursome 3 scorer code</span><input value={event.codes.scorer3} onChange={(e) => updateCode("scorer3", e.target.value)} /></label>
            <label className="setup__field"><span>Foursome 4 scorer code</span><input value={event.codes.scorer4} onChange={(e) => updateCode("scorer4", e.target.value)} /></label>
            <label className="setup__field"><span>View-only code</span><input value={event.codes.view} onChange={(e) => updateCode("view", e.target.value)} /></label>
          </div>
        </div>
      )}

      {section === "teams" && teams.map((team) => (
        <div key={team.id} className="teamCard" style={{ borderColor: team.color }}>
          <div className="teamCard__header">
            <span className="teamCard__dot" style={{ background: team.color }} />
            <span className="teamCard__name" style={{ border: "none" }}>{team.name}</span>
          </div>
          {team.players.map((p, i) => (
            <div className="teamCard__row" key={i}>
              <input className="teamCard__playerName" placeholder={`Player ${i + 1} (Foursome ${i + 1})`} value={p.name} maxLength={18} onChange={(e) => updatePlayer(team.id, i, "name", e.target.value)} />
              <input className="teamCard__hcp" type="number" inputMode="numeric" value={p.hcp} onChange={(e) => updatePlayer(team.id, i, "hcp", Number(e.target.value) || 0)} />
              <select className="teamCard__tee" value={p.tee} onChange={(e) => updatePlayer(team.id, i, "tee", e.target.value)}>
                {TEE_NAMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          ))}
        </div>
      ))}

      {section === "course" && (
        <div className="card">
          <div className="sectionLabel">Par &amp; stroke index &middot; all holes</div>
          <div className="courseTable">
            <div className="courseTable__row courseTable__row--head">
              <span>Hole</span><span>Par</span><span>Stroke Index</span>
            </div>
            {courseHoles.map((h, i) => (
              <div className="courseTable__row" key={h.number}>
                <span className="courseTable__num">{h.number}</span>
                <input
                  type="number"
                  value={h.par}
                  onChange={(e) => setCourseHoles((hs) => hs.map((x, xi) => xi === i ? { ...x, par: Number(e.target.value) || 3 } : x))}
                />
                <input
                  type="number"
                  value={h.strokeIndex}
                  onChange={(e) => setCourseHoles((hs) => hs.map((x, xi) => xi === i ? { ...x, strokeIndex: Number(e.target.value) || 1 } : x))}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function AdminPanel({ event, setEvent, teams, scoreHoles, resetScores }) {
  const pct = progressPct(scoreHoles);
  const byFoursome = [0, 1, 2, 3].map((fi) => {
    let filled = 0;
    scoreHoles.forEach((h) => teams.forEach((t) => { if (h.scores?.[`${t.id}-${fi}`] != null) filled++; }));
    return Math.round((filled / (4 * scoreHoles.length)) * 100);
  });
  return (
    <div className="card">
      <div className="progressLabel">Event completion &middot; {pct}%</div>
      <div className="progressBar"><div className="progressBar__fill" style={{ width: `${pct}%` }} /></div>
      {byFoursome.map((p, i) => (
        <div key={i} className="progressLabel" style={{ marginTop: 10 }}>Foursome {i + 1} &middot; {p}%
          <div className="progressBar" style={{ marginTop: 4 }}><div className="progressBar__fill" style={{ width: `${p}%` }} /></div>
        </div>
      ))}
      <div className="adminActions">
        <button className="setup__start" style={{ marginTop: 16 }} onClick={() => setEvent((e) => ({ ...e, locked: !e.locked }))}>
          {event.locked ? <><Unlock size={16} /> Unlock Scoring</> : <><Lock size={16} /> Lock Scoring</>}
        </button>
        <button className="setup__start setup__start--ghost" style={{ marginTop: 10 }} onClick={() => { if (window.confirm("Reset all entered scores? This cannot be undone.")) resetScores(); }}>
          <RotateCcw size={16} /> Reset All Scores
        </button>
      </div>
    </div>
  );
}

function ScoreTab({ teams, courseHoles, scoreHoles, setScoreHoles, activeHole, setActiveHole, role, myFoursome, locked }) {
  const holeIdx = activeHole - 1;
  const ch = courseHoles[holeIdx];
  const visibleFoursomes = role === "scorer" ? [myFoursome] : [0, 1, 2, 3];
  const readOnly = role === "scorer" && locked;

  const setScore = (playerId, val) => {
    if (readOnly) return;
    setScoreHoles((hs) => hs.map((h, i) => i === holeIdx ? { ...h, scores: { ...h.scores, [playerId]: val } } : h));
  };
  const winner = holeWinner(teams, courseHoles, scoreHoles, holeIdx);

  return (
    <>
      {readOnly && <div className="configNotice">Scoring is locked by the admin.</div>}
      <div className="strip">
        {scoreHoles.map((h) => {
          const filled = Object.keys(h.scores || {}).length;
          let cls = "strip__hole";
          if (h.number === activeHole) cls += " strip__hole--active";
          if (filled === 16) cls += " strip__hole--tie";
          return (
            <button key={h.number} className={cls} onClick={() => setActiveHole(h.number)}>
              <span className="strip__num">{h.number}</span>
              <span className="strip__par">Par {courseHoles[h.number - 1].par}</span>
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="card__holeRow">
          <button className="card__nav" onClick={() => setActiveHole((n) => Math.max(1, n - 1))} disabled={activeHole === 1}>&lsaquo;</button>
          <div className="card__holeInfo">
            <div className="card__holeNum">HOLE {ch.number}</div>
            <div className="card__parLabel" style={{ cursor: "default" }}>Par {ch.par} &middot; SI {ch.strokeIndex}{ch.notes ? ` \u00b7 ${ch.notes}` : ""}</div>
          </div>
          <button className="card__nav" onClick={() => setActiveHole((n) => Math.min(courseHoles.length, n + 1))} disabled={activeHole === courseHoles.length}>&rsaquo;</button>
        </div>

        {winner && (
          <div className="holeWinnerCallout" style={{ borderColor: winner.team.color, color: winner.team.color }}>
            <Trophy size={13} strokeWidth={2.5} /> {winner.team.name} won hole {ch.number} &middot; {winner.pts} pts
          </div>
        )}

        {visibleFoursomes.map((fi) => (
          <div className="foursome" key={fi}>
            <div className="foursome__label">FOURSOME {fi + 1}</div>
            {teams.map((team) => {
              const id = `${team.id}-${fi}`;
              const player = team.players[fi];
              const gross = ch && scoreHoles[holeIdx].scores?.[id];
              const roster = teamHoleRoster(teams, courseHoles, scoreHoles, team, holeIdx);
              const mine = roster.find((r) => r.id === id);
              return (
                <div className="playerRow" key={id}>
                  <span className="playerRow__dot" style={{ background: team.color }} />
                  <span className="playerRow__name">{player.name || "\u2014"}</span>
                  <span className="playerRow__hcp">{player.hcp}</span>
                  <input
                    className="playerRow__input"
                    type="number"
                    inputMode="numeric"
                    value={gross ?? ""}
                    disabled={readOnly}
                    onChange={(e) => setScore(id, e.target.value === "" ? null : Number(e.target.value))}
                    placeholder="\u2013"
                  />
                  {mine && (
                    <span className={`playerRow__pts ${mine.counted ? "playerRow__pts--counts" : ""}`}>
                      {mine.points} pt{mine.points === 1 ? "" : "s"}{mine.counted ? " \u2605" : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

function LeaderboardTab({ teams, courseHoles, scoreHoles }) {
  const lastIdx = lastScoredHoleIdx(scoreHoles);
  const totals = teams.map((t) => ({ team: t, total: teamTotalThru(teams, courseHoles, scoreHoles, t, lastIdx) })).sort((a, b) => b.total - a.total);
  const movement = movementFor(teams, courseHoles, scoreHoles);
  const mvp = mvpPlayer(teams, courseHoles, scoreHoles);
  const struggling = strugglingPlayer(teams, courseHoles, scoreHoles);
  const heaters = heatList(teams, courseHoles, scoreHoles);
  const pct = progressPct(scoreHoles);

  return (
    <>
      <div className="card">
        <div className="progressLabel">Thru hole {lastIdx + 1 <= 0 ? 0 : lastIdx + 1} of {scoreHoles.length} &middot; {pct}% complete</div>
        <div className="progressBar"><div className="progressBar__fill" style={{ width: `${pct}%` }} /></div>
      </div>

      <div className="card">
        {totals.map((row, i) => {
          const mv = movement[row.team.id] || 0;
          return (
            <div className="boardRow" key={row.team.id}>
              <span className="boardRow__rank">{i + 1}</span>
              <span className="boardRow__dot" style={{ background: row.team.color }} />
              <span className="boardRow__name">{row.team.name}</span>
              {mv > 0 && <TrendingUp size={14} color="var(--turf)" />}
              {mv < 0 && <TrendingDown size={14} color="var(--flag)" />}
              {mv === 0 && <MinusIcon size={13} color="#A2ABA0" />}
              {i === 0 && row.total > 0 && <Trophy size={14} strokeWidth={2.25} color="var(--sand)" />}
              <span className="boardRow__total">{row.total} pts</span>
            </div>
          );
        })}
      </div>

      {mvp && (
        <div key={`${mvp.id}-${mvp.total}`} className="mvpCard mvpCard--gold" style={{ borderColor: mvp.team.color }}>
          <span className="mvpCard__sparkle mvpCard__sparkle--1">{"\u2728"}</span>
          <span className="mvpCard__sparkle mvpCard__sparkle--2">{"\u2728"}</span>
          <span className="mvpCard__trophy"><Award size={18} strokeWidth={2.25} color="var(--sand)" /></span>
          <div>
            <div className="mvpCard__label">MVP so far</div>
            <div className="mvpCard__name">{mvp.name} <span style={{ color: mvp.team.color }}>&middot; {mvp.team.name}</span></div>
          </div>
          <span className="mvpCard__pts">{mvp.total} pts</span>
        </div>
      )}

      {struggling && mvp && struggling.id !== mvp.id && (
        <div key={`${struggling.id}-${struggling.total}`} className="mvpCard mvpCard--struggling" style={{ borderColor: struggling.team.color, alignItems: "flex-start" }}>
          <span className="mvpCard__skull">{"\u2620\ufe0f"}</span>
          <div style={{ flex: 1 }}>
            <div className="mvpCard__label">Bringing up the rear</div>
            <div className="mvpCard__name">{struggling.name} <span style={{ color: struggling.team.color }}>&middot; {struggling.team.name}</span></div>
            <div className="mvpCard__jab">{struggling.name} {jabFor(struggling)}</div>
          </div>
          <span className="mvpCard__pts">{struggling.total} pts</span>
        </div>
      )}

      {heaters.length > 0 && (
        <div className="card">
          <div className="sectionLabel">Heat tracker &middot; on a run</div>
          {heaters.map((h) => (
            <div className="boardRow" key={h.id}>
              <span className="boardRow__dot" style={{ background: h.team.color }} />
              <span className="boardRow__name">{h.name} <span style={{ color: "#A2ABA0", fontWeight: 400 }}>&middot; {h.team.name}</span></span>
              <span className="heatFlames">
                {Array.from({ length: Math.min(h.streak, 5) }).map((_, i) => (
                  <Flame key={i} size={14} strokeWidth={2.25} color="#FF7A1A" fill="#FF7A1A" />
                ))}
              </span>
              <span className="boardRow__total">{h.streak} in a row</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="sectionLabel">Hole-by-hole team points</div>
        <div className="holeGridScroll">
          <table className="holeGrid">
            <thead>
              <tr>
                <th></th>
                {scoreHoles.map((h) => <th key={h.number}>{h.number}</th>)}
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td><span className="boardRow__dot" style={{ background: t.color }} /></td>
                  {scoreHoles.map((h, hi) => {
                    const played = Object.keys(h.scores || {}).some((k) => k.startsWith(t.id));
                    return <td key={h.number}>{played ? teamHolePoints(teams, courseHoles, scoreHoles, t, hi) : "\u2013"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="sectionLabel">Individual leaderboard</div>
        {teams.map((t) => (
          <div key={t.id} style={{ marginBottom: 10 }}>
            <div className="foursome__label" style={{ color: t.color }}>{t.name.toUpperCase()}</div>
            {t.players.map((p, i) => {
              const id = `${t.id}-${i}`;
              let total = 0, thru = 0;
              scoreHoles.forEach((_, hi) => {
                const r = playerPoints(teams, courseHoles, scoreHoles, id, hi);
                if (r) { total += r.points; thru++; }
              });
              return (
                <div className="playerRow" key={id}>
                  <span className="playerRow__name">{p.name || `Player ${i + 1}`}</span>
                  <span className="playerRow__hcp">hcp {p.hcp}</span>
                  <span className="playerRow__hcp">{p.tee}</span>
                  <span className="playerRow__pts">{thru > 0 ? `${total} pts thru ${thru}` : "\u2013"}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

function PayoutsTab({ teams, courseHoles, scoreHoles, stake }) {
  const lastIdx = lastScoredHoleIdx(scoreHoles);
  const standings = moneyStandings(teams, courseHoles, scoreHoles, stake);
  const pairs = [];
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) pairs.push([teams[i], teams[j]]);
  return (
    <>
      <div className="card">
        <div className="sectionLabel">Money leaderboard &middot; net across all matchups</div>
        {standings.map((row, i) => (
          <div className="boardRow" key={row.team.id}>
            <span className="boardRow__rank">{i + 1}</span>
            <span className="boardRow__dot" style={{ background: row.team.color }} />
            <span className="boardRow__name">{row.team.name}</span>
            <span className="boardRow__total" style={{ color: row.net > 0 ? "var(--turf)" : row.net < 0 ? "var(--fairway)" : "inherit" }}>
              {row.net > 0 ? "+" : ""}${row.net}
            </span>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="payHint">${stake} per point difference &middot; running totals</div>
        {pairs.map(([ta, tb], i) => {
        const totA = teamTotalThru(teams, courseHoles, scoreHoles, ta, lastIdx);
        const totB = teamTotalThru(teams, courseHoles, scoreHoles, tb, lastIdx);
        const diff = totA - totB;
        if (diff === 0) {
          return <div className="payRow" key={i}><span className="payRow__matchup"><b style={{ color: ta.color }}>{ta.name}</b> vs <b style={{ color: tb.color }}>{tb.name}</b></span><span className="payRow__outcome">Tied</span></div>;
        }
        const winner = diff > 0 ? ta : tb;
        const loser = diff > 0 ? tb : ta;
        const amount = Math.abs(diff) * stake;
        return (
          <div className="payRow" key={i}>
            <span className="payRow__matchup"><b style={{ color: ta.color }}>{ta.name}</b> vs <b style={{ color: tb.color }}>{tb.name}</b></span>
            <span className="payRow__outcome"><span style={{ color: loser.color }}>{loser.name}</span> pays <span style={{ color: winner.color }}>{winner.name}</span> ${amount}</span>
          </div>
        );
        })}
      </div>
    </>
  );
}

function ScorecardTab({ teams, courseHoles, scoreHoles }) {
  const [metric, setMetric] = useState("gross"); // gross | net

  const allRows = teams.flatMap((t) =>
    t.players.map((p, i) => {
      const id = `${t.id}-${i}`;
      const holeVals = courseHoles.map((ch, hi) => playerPoints(teams, courseHoles, scoreHoles, id, hi));
      const played = holeVals.filter(Boolean);
      const totGross = played.reduce((s, r) => s + r.gross, 0);
      const totNet = played.reduce((s, r) => s + r.net, 0);
      const totPts = played.reduce((s, r) => s + r.points, 0);
      const sortTotal = metric === "gross" ? totGross : totNet;
      return { id, name: p.name || "Player", team: t, hcp: p.hcp, holeVals, played: played.length, totGross, totNet, totPts, sortTotal };
    })
  );

  // Best score first: fewest strokes (gross or net, whichever is selected) wins.
  // Anyone with no scores entered yet sorts to the bottom.
  const rows = [...allRows].sort((a, b) => {
    if (a.played === 0 && b.played === 0) return 0;
    if (a.played === 0) return 1;
    if (b.played === 0) return -1;
    return a.sortTotal - b.sortTotal;
  });

  return (
    <div className="card">
      <div className="sectionLabel">Full field scorecard</div>
      <div className="metricToggle">
        <button className={`metricToggle__btn ${metric === "gross" ? "metricToggle__btn--active" : ""}`} onClick={() => setMetric("gross")}>Gross</button>
        <button className={`metricToggle__btn ${metric === "net" ? "metricToggle__btn--active" : ""}`} onClick={() => setMetric("net")}>Net</button>
      </div>
      <div className="holeGridScroll">
        <table className="holeGrid holeGrid--wide">
          <thead>
            <tr>
              <th className="holeGrid__sticky">Player</th>
              <th>Hcp</th>
              {courseHoles.map((h) => <th key={h.number}>{h.number}</th>)}
              <th>Tot</th>
              <th>Pts</th>
            </tr>
            <tr className="holeGrid__parRow">
              <th className="holeGrid__sticky">Par</th>
              <th></th>
              {courseHoles.map((h) => <th key={h.number}>{h.par}</th>)}
              <th>{courseHoles.reduce((s, h) => s + h.par, 0)}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rank) => (
              <tr key={row.id}>
                <td className="holeGrid__sticky holeGrid__player">
                  {row.played > 0 && <span className="holeGrid__rank">{rank + 1}</span>}
                  <span className="boardRow__dot" style={{ background: row.team.color }} />
                  {row.name}
                </td>
                <td>{row.hcp}</td>
                {row.holeVals.map((r, hi) => <td key={hi}>{r ? (metric === "gross" ? r.gross : r.net) : "\u2013"}</td>)}
                <td style={{ fontWeight: 700 }}>{row.played ? (metric === "gross" ? row.totGross : row.totNet) : "\u2013"}</td>
                <td style={{ fontWeight: 700, color: "var(--turf)" }}>{row.played ? row.totPts : "\u2013"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="payHint" style={{ marginTop: 10 }}>
        Sorted best to worst by {metric === "gross" ? "gross" : "net"} total &middot; Gross = actual strokes &middot; Net = handicap-adjusted
      </div>
    </div>
  );
}

function RulesTab({ event }) {
  return (
    <div className="card">
      <div className="sectionLabel">How this tournament works</div>

      <div className="rulesBlock">
        <div className="rulesBlock__title">The format</div>
        <p className="rulesBlock__text">
          16 players &middot; 4 teams of 4 &middot; 4 foursomes, with one player from each team in every foursome.
          Everyone plays their own ball. Full (100%) handicap is used for every player.
        </p>
      </div>

      <div className="rulesBlock">
        <div className="rulesBlock__title">Scoring &mdash; Stableford points</div>
        <p className="rulesBlock__text">Points are based on your <b>net</b> score (gross score minus the strokes your handicap gives you on that hole), not your raw gross score.</p>
        <table className="rulesTable">
          <tbody>
            <tr><td>Double bogey or worse</td><td>0 pts</td></tr>
            <tr><td>Bogey</td><td>1 pt</td></tr>
            <tr><td>Par</td><td>2 pts</td></tr>
            <tr><td>Birdie</td><td>4 pts</td></tr>
            <tr><td>Eagle</td><td>8 pts</td></tr>
            <tr><td>Double eagle or better</td><td>10 pts</td></tr>
          </tbody>
        </table>
      </div>

      <div className="rulesBlock">
        <div className="rulesBlock__title">Team scoring</div>
        <p className="rulesBlock__text">
          On every hole, each team's <b>best 2</b> individual point totals (out of that team's 4 players) count toward
          the team score for that hole &mdash; marked with a ★ on the Score tab. Add those up across all 18 holes; most total points wins.
        </p>
      </div>

      <div className="rulesBlock">
        <div className="rulesBlock__title">Payouts</div>
        <p className="rulesBlock__text">
          Every team is compared against every other team. The team with more points is owed the point difference
          multiplied by the stake (currently <b>${event.stake} per point</b>), from the team with fewer points.
          The Money Leaderboard on the Payouts tab totals this up across all matchups for a single net number per team.
        </p>
      </div>

      <div className="rulesBlock">
        <div className="rulesBlock__title">Access codes</div>
        <p className="rulesBlock__text">
          Admins can edit the event, players, course, and every score. Each foursome has its own scorer code so
          they can only enter scores for their own group. The view-only code shows the leaderboard without editing.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  useGoogleFonts();

  const [view, setView] = useState("landing");
  const [role, setRole] = useState(null);
  const [myFoursome, setMyFoursome] = useState(0);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [matchId, setMatchId] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [copied, setCopied] = useState(false);
  const [activeHole, setActiveHole] = useState(1);
  const [tab, setTab] = useState("leaderboard");

  const [event, setEvent] = useState(makeEvent);
  const [teams, setTeams] = useState(makeTeams);
  const [courseHoles, setCourseHoles] = useState(makeCourseHoles);
  const [scoreHoles, setScoreHoles] = useState(makeScoreHoles);

  const [tournaments, setTournaments] = useState([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);

  const skipNextSave = useRef(false);
  const pollRef = useRef(null);
  const lastEditRef = useRef(0);
  const markEdited = () => { lastEditRef.current = Date.now(); };
  const setEventTracked = (u) => { markEdited(); setEvent(u); };
  const setTeamsTracked = (u) => { markEdited(); setTeams(u); };
  const setCourseHolesTracked = (u) => { markEdited(); setCourseHoles(u); };
  const setScoreHolesTracked = (u) => { markEdited(); setScoreHoles(u); };

  useEffect(() => {
    if (view !== "landing" || !configured()) return;
    setLoadingTournaments(true);
    dbGetIndexList().then(setTournaments).catch(() => {}).finally(() => setLoadingTournaments(false));
  }, [view]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("match");

    // A remembered admin/scorer login takes priority over a plain share link,
    // so refreshing (even via a shared ?match= URL) never demotes someone
    // back down to view-only or re-prompts them for a code.
    try {
      const saved = JSON.parse(localStorage.getItem("trojanMatchSession") || "null");
      if (saved && saved.matchId && (!code || code.toUpperCase() === saved.matchId)) {
        setJoinCode(saved.matchId);
        rejoinWithSession(saved.matchId, saved.role, saved.myFoursome);
        return;
      }
    } catch { /* ignore malformed saved session */ }

    if (code && code.length === 4) { setJoinCode(code.toUpperCase()); joinMatch(code.toUpperCase()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rejoinWithSession(code, savedRole, savedFoursome) {
    if (!configured()) return;
    try {
      const data = await dbGet(code);
      if (!data) { localStorage.removeItem("trojanMatchSession"); return; }
      skipNextSave.current = true;
      applyPayload(data);
      setMatchId(code);
      setRole(savedRole);
      if (savedFoursome != null) setMyFoursome(savedFoursome);
      setTab(savedRole === "view" ? "leaderboard" : "score");
      setView("live");
      setSyncStatus("synced");
    } catch { /* stay on landing if offline */ }
  }

  function saveSession(code, r, fs) {
    try { localStorage.setItem("trojanMatchSession", JSON.stringify({ matchId: code, role: r, myFoursome: fs })); } catch {}
  }
  function clearSession() {
    try { localStorage.removeItem("trojanMatchSession"); } catch {}
  }

  function payload() {
    return { mode: "usc-stableford", event, teams, courseHoles, scoreHoles };
  }
  function applyPayload(data) {
    setEvent(data.event || makeEvent());
    setTeams(data.teams || makeTeams());
    setCourseHoles(data.courseHoles || makeCourseHoles());
    setScoreHoles(data.scoreHoles || makeScoreHoles());
  }

  async function joinMatch(code) {
    if (!configured()) { setJoinError("Database not configured."); return; }
    setJoinError("");
    try {
      const data = await dbGet(code);
      if (!data) { setJoinError("No match found with that code."); return; }
      skipNextSave.current = true;
      applyPayload(data);
      setMatchId(code);
      setRole("view");
      setTab("leaderboard");
      setView("live");
      setSyncStatus("synced");
    } catch { setJoinError("Couldn't reach the shared database."); }
  }

  async function createMatch() {
    const code = generateCode();
    const ev = makeEvent();
    const t = makeTeams();
    const ch = makeCourseHoles();
    const sh = makeScoreHoles();
    skipNextSave.current = true;
    setEvent(ev); setTeams(t); setCourseHoles(ch); setScoreHoles(sh);
    setMatchId(code);
    setActiveHole(1);
    setRole("admin");
    setView("live");
    setTab("setup");
    setSyncStatus("saving");
    try {
      await dbSet(code, { mode: "usc-stableford", event: ev, teams: t, courseHoles: ch, scoreHoles: sh });
      await dbSetIndexEntry(code, { eventName: ev.eventName, courseName: ev.courseName, createdAt: Date.now() });
      saveSession(code, "admin", null);
      setSyncStatus("synced");
    } catch { setSyncStatus("error"); }
  }

  useEffect(() => {
    if (view !== "live" || !matchId) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    setSyncStatus("saving");
    const t = setTimeout(async () => {
      try { await dbSet(matchId, payload()); setSyncStatus("synced"); } catch { setSyncStatus("error"); }
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, teams, courseHoles, scoreHoles]);

  useEffect(() => {
    if (view !== "live" || !matchId) return;
    pollRef.current = setInterval(async () => {
      // Skip pulling remote updates while the person is actively typing/tapping,
      // so their in-progress entry never gets overwritten mid-edit.
      if (Date.now() - lastEditRef.current < 10000) return;
      try { const data = await dbGet(matchId); if (data) { skipNextSave.current = true; applyPayload(data); setSyncStatus("synced"); } }
      catch { setSyncStatus("error"); }
    }, 12000);
    return () => clearInterval(pollRef.current);
  }, [view, matchId]);

  const leaveMatch = () => {
    clearInterval(pollRef.current);
    clearSession();
    setMatchId(null); setRole(null);
    setEvent(makeEvent()); setTeams(makeTeams()); setCourseHoles(makeCourseHoles()); setScoreHoles(makeScoreHoles());
    setJoinCode(""); setActiveHole(1); setView("landing");
    window.history.replaceState({}, "", window.location.pathname);
  };

  const shareLink = matchId ? `${window.location.origin}${window.location.pathname}?match=${matchId}` : "";
  const copyLink = async () => { try { await navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {} };
  const resetScores = () => setScoreHoles(makeScoreHoles());

  if (view === "landing") {
    return (
      <>
        <GlobalStyle />
        <div className="app">
          {!configured() && <div className="configNotice">Shared database not configured yet.</div>}
          <LandingScreen
            joinCode={joinCode} setJoinCode={setJoinCode}
            onJoin={() => joinMatch(joinCode)} onCreate={createMatch} error={joinError}
            tournaments={tournaments} loadingTournaments={loadingTournaments}
            onSelectTournament={(code) => joinMatch(code)}
          />
        </div>
      </>
    );
  }

  if (view === "rolegate") {
    return (
      <>
        <GlobalStyle />
        <div className="app">
          <RoleGate
            event={event}
            onEnter={(r, fs) => { setRole(r); if (fs != null) setMyFoursome(fs); setTab(r === "view" ? "leaderboard" : "score"); setView("live"); saveSession(matchId, r, fs); }}
            onCancel={matchId ? () => setView("live") : null}
          />
        </div>
      </>
    );
  }

  const tabsForRole = role === "admin" ? ["setup", "score", "leaderboard", "scorecard", "payouts", "rules", "admin"]
    : role === "scorer" ? ["score", "leaderboard", "scorecard", "payouts", "rules"]
    : ["leaderboard", "scorecard", "payouts", "rules"];

  return (
    <>
      <GlobalStyle />
      <div className="app">
        <header className="header">
          <div className="header__title"><Flag size={18} strokeWidth={2.5} /><span>{event.eventName?.toUpperCase() || "TROJAN MATCH PLAY"}</span></div>
          {role === "view" && (
            <button className="header__unlock" onClick={() => setView("rolegate")}>
              <Lock size={12} strokeWidth={2.5} /> Unlock
            </button>
          )}
        </header>

        <div className="shareBar">
          <div className="shareBar__code"><Users size={13} strokeWidth={2.5} /> {matchId}</div>
          <button className="shareBar__copy" onClick={copyLink}><Copy size={12} strokeWidth={2.5} /> {copied ? "Copied!" : "Copy link"}</button>
          <span className="shareBar__role"><Eye size={11} /> {role}</span>
          <span className={`shareBar__status shareBar__status--${syncStatus}`}>
            {syncStatus === "saving" && "Saving\u2026"}
            {syncStatus === "synced" && "Synced"}
            {syncStatus === "error" && "Offline"}
          </span>
        </div>

        <div className="tabs">
          {tabsForRole.map((t) => (
            <button key={t} className={`tabs__btn ${tab === t ? "tabs__btn--active" : ""}`} onClick={() => setTab(t)}>
              {t === "setup" && <Settings size={13} strokeWidth={2.25} />}
              {t === "score" && <ClipboardList size={13} strokeWidth={2.25} />}
              {t === "leaderboard" && <ListOrdered size={13} strokeWidth={2.25} />}
              {t === "scorecard" && <Table size={13} strokeWidth={2.25} />}
              {t === "payouts" && <DollarSign size={13} strokeWidth={2.25} />}
              {t === "admin" && <Star size={13} strokeWidth={2.25} />}
              {t === "rules" && <Info size={13} strokeWidth={2.25} />}
              {" "}{t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "setup" && role === "admin" && (
          <SetupTab event={event} setEvent={setEventTracked} teams={teams} setTeams={setTeamsTracked} courseHoles={courseHoles} setCourseHoles={setCourseHolesTracked} activeHole={activeHole} setActiveHole={setActiveHole} />
        )}
        {tab === "score" && (role === "admin" || role === "scorer") && (
          <ScoreTab teams={teams} courseHoles={courseHoles} scoreHoles={scoreHoles} setScoreHoles={setScoreHolesTracked} activeHole={activeHole} setActiveHole={setActiveHole} role={role} myFoursome={myFoursome} locked={event.locked} />
        )}
        {tab === "leaderboard" && <LeaderboardTab teams={teams} courseHoles={courseHoles} scoreHoles={scoreHoles} />}
        {tab === "scorecard" && <ScorecardTab teams={teams} courseHoles={courseHoles} scoreHoles={scoreHoles} />}
        {tab === "payouts" && <PayoutsTab teams={teams} courseHoles={courseHoles} scoreHoles={scoreHoles} stake={event.stake} />}
        {tab === "admin" && role === "admin" && <AdminPanel event={event} setEvent={setEventTracked} teams={teams} scoreHoles={scoreHoles} resetScores={resetScores} />}
        {tab === "rules" && <RulesTab event={event} />}

        <footer className="footer">share code {matchId} &middot; {event.courseName}</footer>
      </div>
    </>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      :root {
        --fairway: #990000; --turf: #7A0000; --sand: #FFC72C;
        --chalk: #FAFAFA; --ink: #1A1A1A; --flag: #1A1A1A; --line: #E8DCC0;
        --augusta: #0B3D26; --augustaDeep: #072B1B; --cream: #F4EFDD;
      }
      * { box-sizing: border-box; }
      .app {
        font-family: 'Inter', sans-serif;
        background:
          radial-gradient(ellipse at 50% -10%, rgba(255,199,44,0.10), transparent 55%),
          linear-gradient(180deg, var(--augusta) 0%, var(--augustaDeep) 100%);
        background-attachment: fixed;
        color: var(--cream);
        min-height: 100vh; max-width: 560px; margin: 0 auto; padding: 20px 16px 40px;
      }
      @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }

      .configNotice { background: #FDECEC; border: 1px solid #E8B4B4; color: #8A2E2E; font-size: 12.5px; padding: 10px 12px; border-radius: 8px; margin-bottom: 16px; }

      .setup { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 20px; }
      .setup__flag { width: 56px; height: 56px; border-radius: 50%; background: var(--fairway); color: var(--cream); display: flex; align-items: center; justify-content: center; margin-bottom: 18px; border: 2px solid var(--sand); box-shadow: 0 4px 14px rgba(0,0,0,0.25); }
      .setup__title { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 28px; letter-spacing: 0.5px; margin: 0 0 6px; color: var(--sand); }
      .setup__sub { color: rgba(244,239,221,0.72); font-size: 14px; margin: 0 0 22px; }
      .setup__field { width: 100%; text-align: left; display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
      .setup__field span { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6B5B5B; }
      .setup__field input, .selectInput { border: 1.5px solid var(--line); border-radius: 10px; padding: 12px 14px; font-size: 15px; font-family: 'Inter', sans-serif; background: white; color: var(--ink); width: 100%; }
      .setup__field input:focus, .selectInput:focus { outline: 2px solid var(--fairway); outline-offset: 1px; border-color: var(--fairway); }
      .setup__error { color: var(--fairway); font-size: 12.5px; margin-bottom: 10px; }
      .setup__start { margin-top: 4px; width: 100%; background: var(--fairway); color: white; border: none; border-radius: 10px; padding: 14px; font-size: 15px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
      .setup__start:disabled { opacity: 0.4; }
      .setup__start:not(:disabled):hover { background: var(--turf); }
      .setup__start--ghost { background: white; color: var(--fairway); border: 1.5px solid var(--fairway); }
      .setup__divider { display: flex; align-items: center; width: 100%; margin: 16px 0; color: #A2ABA0; font-size: 12px; }
      .setup__divider::before, .setup__divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }
      .setup__divider span { padding: 0 10px; }
      .codesGrid { display: flex; flex-direction: column; gap: 0; }

      .teamCard { width: 100%; background: white; border: 1.5px solid var(--line); border-left-width: 5px; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; text-align: left; color: var(--ink); }
      .teamCard__header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
      .teamCard__dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
      .teamCard__name { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 15px; }
      .teamCard__row { display: flex; gap: 6px; margin-bottom: 6px; }
      .teamCard__playerName { flex: 1.4; border: 1px solid var(--line); border-radius: 7px; padding: 8px; font-size: 13px; min-width: 0; }
      .teamCard__hcp { width: 46px; border: 1px solid var(--line); border-radius: 7px; padding: 8px 4px; font-size: 13px; text-align: center; }
      .teamCard__tee { width: 78px; border: 1px solid var(--line); border-radius: 7px; padding: 8px 4px; font-size: 12px; }

      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
      .header__title { display: flex; align-items: center; gap: 8px; font-family: 'Oswald', sans-serif; font-weight: 700; letter-spacing: 1.2px; font-size: 12.5px; color: var(--sand); }
      .header__reset { background: rgba(244,239,221,0.08); border: 1.5px solid rgba(244,239,221,0.25); border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: var(--cream); cursor: pointer; }
      .header__unlock { display: flex; align-items: center; gap: 4px; background: rgba(244,239,221,0.08); border: 1.5px solid rgba(244,239,221,0.25); border-radius: 8px; padding: 6px 10px; color: var(--cream); font-size: 11px; font-weight: 600; cursor: pointer; }

      .shareBar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; font-size: 12px; flex-wrap: wrap; }
      .shareBar__code { display: flex; align-items: center; gap: 5px; font-weight: 600; letter-spacing: 1px; background: #FBEAEA; padding: 5px 9px; border-radius: 7px; color: var(--fairway); }
      .shareBar__copy { display: flex; align-items: center; gap: 5px; background: white; border: 1.5px solid var(--line); border-radius: 7px; padding: 5px 9px; cursor: pointer; color: #6B5B5B; }
      .shareBar__role { text-transform: uppercase; font-weight: 700; font-size: 10.5px; color: var(--sand); background: var(--ink); padding: 5px 8px; border-radius: 7px; display: flex; align-items: center; gap: 4px; }
      .shareBar__status { margin-left: auto; color: rgba(244,239,221,0.55); }
      .shareBar__status--error { color: var(--fairway); }
      .shareBar__status--synced { color: var(--turf); }

      .tabs { display: flex; gap: 5px; margin-bottom: 14px; flex-wrap: wrap; }
      .tabs__btn { flex: 1; min-width: 70px; display: flex; align-items: center; justify-content: center; gap: 5px; background: white; border: 1.5px solid var(--line); border-radius: 8px; padding: 9px 4px; font-size: 11.5px; font-weight: 600; color: #6B5B5B; cursor: pointer; }
      .tabs__btn--active { background: var(--fairway); border-color: var(--fairway); color: white; }

      .banner { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 13px; border-radius: 10px; font-family: 'Oswald', sans-serif; font-weight: 500; font-size: 14px; margin-bottom: 14px; }

      .strip { display: flex; gap: 5px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 16px; }
      .strip__hole { flex: 0 0 auto; width: 44px; border: 1.5px solid var(--line); background: white; border-radius: 8px; padding: 6px 0; display: flex; flex-direction: column; align-items: center; cursor: pointer; color: var(--ink); }
      .strip__num { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 14px; }
      .strip__par { font-size: 9px; color: #8A9490; }
      .strip__hole--active { border-color: var(--fairway); border-width: 2px; }
      .strip__hole--tie { background: #FFF6DD; border-color: var(--sand); }

      .card { background: var(--cream); border: 1.5px solid rgba(255,199,44,0.35); border-radius: 14px; padding: 18px; margin-bottom: 14px; box-shadow: 0 6px 18px rgba(0,0,0,0.18); color: var(--ink); }
      .card__holeRow { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
      .card__nav { width: 34px; height: 34px; border-radius: 8px; border: 1.5px solid var(--line); background: white; font-size: 20px; color: var(--fairway); cursor: pointer; }
      .card__nav:disabled { opacity: 0.3; }
      .card__holeInfo { text-align: center; }
      .card__holeNum { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 20px; }
      .card__parLabel { border: none; background: none; color: #8A9490; font-size: 11.5px; }

      .courseFieldsRow { display: flex; gap: 10px; }
      .courseTable { display: flex; flex-direction: column; }
      .courseTable__row { display: grid; grid-template-columns: 50px 1fr 1fr; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); }
      .courseTable__row:last-child { border-bottom: none; }
      .courseTable__row--head { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #A2ABA0; font-weight: 700; padding-bottom: 8px; }
      .courseTable__num { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 14px; text-align: center; }
      .courseTable__row input { border: 1.5px solid var(--line); border-radius: 7px; padding: 7px 4px; text-align: center; font-size: 14px; width: 100%; }
      .courseTable__row input:focus { outline: 2px solid var(--fairway); border-color: var(--fairway); }
      .yardageGrid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
      .yardageCell { display: flex; flex-direction: column; align-items: center; gap: 3px; }
      .yardageCell span { font-size: 9px; color: #8A9490; }
      .yardageCell input { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 5px 2px; text-align: center; font-size: 12px; }

      .holeWinnerCallout { border: 1.5px dashed; border-radius: 8px; padding: 8px 10px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }

      .foursome { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--line); }
      .foursome:first-of-type { margin-top: 4px; }
      .foursome__label { font-size: 10.5px; letter-spacing: 1px; color: #A2ABA0; font-weight: 700; margin-bottom: 8px; }
      .playerRow { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
      .playerRow__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .playerRow__name { flex: 1; font-size: 13.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .playerRow__hcp { font-size: 10.5px; color: #A2ABA0; width: 40px; text-align: right; }
      .playerRow__input { width: 46px; border: 1.5px solid var(--line); border-radius: 7px; padding: 6px 4px; text-align: center; font-size: 14px; }
      .playerRow__pts { width: 60px; text-align: right; font-size: 11px; color: var(--turf); font-weight: 600; }
      .playerRow__pts--counts { color: var(--sand); background: var(--ink); border-radius: 6px; padding: 2px 4px; }

      .progressLabel { font-size: 11.5px; color: #6B5B5B; margin-bottom: 6px; font-weight: 600; }
      .progressBar { height: 8px; background: #F0EAE0; border-radius: 5px; overflow: hidden; }
      .progressBar__fill { height: 100%; background: var(--fairway); border-radius: 5px; }

      .adminActions { display: flex; flex-direction: column; }

      .boardRow { display: flex; align-items: center; gap: 8px; padding: 10px 4px; border-bottom: 1px solid var(--line); }
      .boardRow:last-child { border-bottom: none; }
      .boardRow__rank { width: 18px; font-family: 'Oswald', sans-serif; font-weight: 600; color: #A2ABA0; }
      .boardRow__dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
      .boardRow__name { flex: 1; font-weight: 600; font-size: 14px; }
      .boardRow__total { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 15px; }

      .mvpCard { display: flex; align-items: center; gap: 10px; background: white; border: 1.5px solid var(--line); border-left-width: 4px; border-radius: 10px; padding: 12px; margin-bottom: 14px; color: var(--ink); }
      .mvpCard--gold {
        position: relative;
        overflow: hidden;
        background: linear-gradient(135deg, #FFFDF6 0%, #FFF6DD 100%);
        box-shadow: 0 0 0 1px rgba(255,199,44,0.4), 0 4px 16px rgba(255,199,44,0.25);
        animation: mvpPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .mvpCard__trophy { display: flex; align-items: center; justify-content: center; animation: mvpTrophyGlow 1.8s ease-in-out infinite; filter: drop-shadow(0 0 4px rgba(255,199,44,0.7)); }
      .mvpCard__sparkle { position: absolute; font-size: 12px; opacity: 0; animation: mvpSparkle 2.2s ease-in-out infinite; pointer-events: none; }
      .mvpCard__sparkle--1 { top: 8px; right: 18px; animation-delay: 0.2s; }
      .mvpCard__sparkle--2 { bottom: 10px; right: 46px; font-size: 9px; animation-delay: 1.1s; }
      @keyframes mvpPopIn {
        0% { transform: scale(0.9); opacity: 0; }
        60% { transform: scale(1.03); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes mvpTrophyGlow {
        0%, 100% { transform: scale(1) rotate(0deg); filter: drop-shadow(0 0 3px rgba(255,199,44,0.6)); }
        50% { transform: scale(1.12) rotate(-4deg); filter: drop-shadow(0 0 8px rgba(255,199,44,0.9)); }
      }
      @keyframes mvpSparkle {
        0%, 100% { opacity: 0; transform: scale(0.6) rotate(0deg); }
        50% { opacity: 1; transform: scale(1.1) rotate(15deg); }
      }
      .mvpCard--struggling { opacity: 0.92; animation: struggleShake 0.55s ease-in-out; }
      .mvpCard__jab { font-size: 12px; font-style: italic; color: #8A6B6B; margin-top: 3px; }
      .mvpCard__skull { font-size: 18px; line-height: 1; margin-top: 1px; animation: struggleSkullPulse 1.6s ease-in-out infinite; }
      @keyframes struggleShake {
        0%, 100% { transform: translateX(0) rotate(0deg); }
        15% { transform: translateX(-4px) rotate(-2deg); }
        30% { transform: translateX(4px) rotate(2deg); }
        45% { transform: translateX(-3px) rotate(-1.5deg); }
        60% { transform: translateX(3px) rotate(1.5deg); }
        75% { transform: translateX(-1.5px) rotate(-0.5deg); }
      }
      @keyframes struggleSkullPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.18); }
      }
      .heatFlames { display: flex; gap: 1px; }
      .rulesBlock { margin-bottom: 18px; }
      .rulesBlock:last-child { margin-bottom: 0; }
      .rulesBlock__title { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 14px; color: var(--fairway); margin-bottom: 6px; }
      .rulesBlock__text { font-size: 13px; line-height: 1.55; color: #4A5A4D; margin: 0; }
      .rulesTable { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12.5px; }
      .rulesTable td { padding: 6px 4px; border-bottom: 1px solid var(--line); }
      .rulesTable td:last-child { text-align: right; font-weight: 700; color: var(--turf); }
      .rulesTable tr:last-child td { border-bottom: none; }
      .mvpCard__label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #A2ABA0; font-weight: 700; }
      .mvpCard__name { font-size: 14px; font-weight: 600; }
      .mvpCard__pts { margin-left: auto; font-family: 'Oswald', sans-serif; font-weight: 600; }

      .sectionLabel { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #A2ABA0; font-weight: 700; margin-bottom: 10px; }
      .tourneyRow { width: 100%; display: flex; align-items: center; justify-content: space-between; background: none; border: none; border-bottom: 1px solid var(--line); padding: 10px 2px; cursor: pointer; text-align: left; }
      .tourneyRow:last-child { border-bottom: none; }
      .tourneyRow__name { font-weight: 600; font-size: 13.5px; color: var(--ink); }
      .tourneyRow__code { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 12px; color: var(--fairway); letter-spacing: 1px; }
      .scorecardHead { display: flex; align-items: center; gap: 8px; border-left: 4px solid; padding: 8px 10px; background: rgba(0,0,0,0.03); border-radius: 8px; margin-bottom: 14px; }
      .scorecardHead__dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
      .scorecardHead__name { font-weight: 700; font-size: 14px; flex: 1; }
      .scorecardHead__meta { font-size: 11px; color: #8A9490; }
      .metricToggle { display: flex; gap: 6px; margin-bottom: 14px; }
      .metricToggle__btn { flex: 1; background: white; border: 1.5px solid var(--line); border-radius: 8px; padding: 8px; font-size: 13px; font-weight: 600; color: #6B5B5B; cursor: pointer; }
      .metricToggle__btn--active { background: var(--fairway); border-color: var(--fairway); color: white; }
      .holeGrid__rank { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 10px; color: #A2ABA0; width: 12px; display: inline-block; }
      .holeGridScroll { overflow-x: auto; }
      .holeGrid--wide { font-size: 10.5px; }
      .holeGrid__sticky { position: sticky; left: 0; background: var(--cream); text-align: left; padding-right: 8px; z-index: 1; }
      .holeGrid__player { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
      .holeGrid__parRow th { color: #C7B98A; font-weight: 500; font-size: 10px; }
      .holeGrid { border-collapse: collapse; font-size: 11px; }
      .holeGrid th, .holeGrid td { padding: 5px 7px; text-align: center; border-bottom: 1px solid var(--line); }
      .holeGrid th { color: #A2ABA0; font-weight: 600; }

      .payHint { font-size: 11.5px; color: #8A9490; margin-bottom: 10px; text-align: center; }
      .payRow { display: flex; flex-direction: column; gap: 2px; padding: 10px 4px; border-bottom: 1px solid var(--line); font-size: 13px; }
      .payRow:last-child { border-bottom: none; }
      .payRow__outcome { font-size: 12.5px; color: #4A5A4D; }

      .footer { text-align: center; font-size: 11px; color: rgba(244,239,221,0.5); letter-spacing: 0.4px; margin-top: 8px; }
    `}</style>
  );
}
