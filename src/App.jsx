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
    return <div className="banner banner--won"><Trophy size={18} strokeWidth={2.25} /><span>{name.toUpperCase()} WINS {margin}</span></div>;
  }
  if (thru === 0) return <div className="banner banner--neutral"><Flag size={18} strokeWidth={2.25} /><span>ALL SQUARE &mdash; TEE OFF</span></div>;
  if (diff === 0) return <div className="banner banner--neutral"><Flag size={18} strokeWidth={2.25} /><span>ALL SQUARE THRU {thru}</span></div>;
  const leader = diff > 0 ? names.a : names.b;
  return (
    <div className={`banner ${dormie ? "banner--dormie" : "banner--leading"}`}>
      <Flag size={18} strokeWidth={2.25} />
      <span>{leader.toUpperCase()} {Math.abs(diff)} UP {dormie ? "\u2014 DORMIE" : `THRU ${thru}`}</span>
    </div>
  );
}

function MatchPlayLive({ names, holes, setHoles, activeHole, setActiveHole }) {
  const [editingPar, setEditingPar] = useState(false);
  const status = useMemo(() => computeMatchStatus(holes), [holes]);
  const current = holes[activeHole - 1];
  const setStroke = (side, val) => setHoles((hs) => hs.map((h) => (h.number === activeHole ? { ...h, [side]: val } : h)));
  const setPar = (val) => setHoles((hs) => hs.map((h) => (h.number === activeHole ? { ...h, par: Math.max(3, val) } : h)));
  const aWins = current.a != null && current.b != null && current.a < current.b;
  const bWins = current.a != null && current.b != null && current.b < current.a;
  const matchOver = status.result && activeHole >= status.resultThru;

  return (
    <>
      <MatchStatusBanner status={status} names={names} />
      <div className="strip">
        {holes.map((h) => {
          const played = h.a != null && h.b != null;
          let cls = "strip__hole";
          if (h.number === activeHole) cls += " strip__hole--active";
          if (played) cls += h.a < h.b ? " strip__hole--a" : h.b < h.a ? " strip__hole--b" : " strip__hole--tie";
          return (
            <button key={h.number} className={cls} onClick={() => setActiveHole(h.number)}>
              <span className="strip__num">{h.number}</span>
              <span className="strip__par">Par {h.par}</span>
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="card__holeRow">
          <button className="card__nav" onClick={() => setActiveHole((n) => Math.max(1, n - 1))} disabled={activeHole === 1}>&lsaquo;</button>
          <div className="card__holeInfo">
            <div className="card__holeNum">HOLE {current.number}</div>
            {editingPar ? (
              <div className="card__parEdit">
                <button onClick={() => setPar(current.par - 1)}><Minus size={14} /></button>
                <span>Par {current.par}</span>
                <button onClick={() => setPar(current.par + 1)}><Plus size={14} /></button>
                <button className="card__parDone" onClick={() => setEditingPar(false)}><Check size={14} /></button>
              </div>
            ) : (
              <button className="card__parLabel" onClick={() => setEditingPar(true)}>Par {current.par} <Pencil size={11} strokeWidth={2.25} /></button>
            )}
          </div>
          <button className="card__nav" onClick={() => setActiveHole((n) => Math.min(18, n + 1))} disabled={activeHole === 18}>&rsaquo;</button>
        </div>

        <div className="card__steppers">
          <div className={`stepperWrap ${aWins ? "stepperWrap--win" : ""}`}>
            <div className="stepper">
              <span className="stepper__label" style={{ color: "var(--fairway)" }}>{names.a}</span>
              <div className="stepper__controls">
                <button className="stepper__btn" onClick={() => setStroke("a", Math.max(1, (current.a ?? 5) - 1))}><Minus size={16} strokeWidth={2.5} /></button>
                <span className="stepper__value">{current.a ?? "\u2013"}</span>
                <button className="stepper__btn" onClick={() => setStroke("a", (current.a ?? 3) + 1)}><Plus size={16} strokeWidth={2.5} /></button>
              </div>
            </div>
          </div>
          <div className={`stepperWrap ${bWins ? "stepperWrap--win" : ""}`}>
            <div className="stepper">
              <span className="stepper__label" style={{ color: "var(--flag)" }}>{names.b}</span>
              <div className="stepper__controls">
                <button className="stepper__btn" onClick={() => setStroke("b", Math.max(1, (current.b ?? 5) - 1))}><Minus size={16} strokeWidth={2.5} /></button>
                <span className="stepper__value">{current.b ?? "\u2013"}</span>
                <button className="stepper__btn" onClick={() => setStroke("b", (current.b ?? 3) + 1)}><Plus size={16} strokeWidth={2.5} /></button>
              </div>
            </div>
          </div>
        </div>

        {current.a != null && current.b != null && (
          <div className="card__result">{current.a === current.b ? "Hole halved" : `${current.a < current.b ? names.a : names.b} wins the hole`}</div>
        )}
      </div>
      {matchOver && <div className="matchOverNote">Match decided. You can still review earlier holes above.</div>}
    </>
  );
}

/* ---------------- Stableford live view ---------------- */
function StablefordLive({ teams, setTeams, holes, setHoles, stake, activeHole, setActiveHole }) {
  const [tab, setTab] = useState("score");
  const current = holes[activeHole - 1];
  const holeIdx = activeHole - 1;

  const foursomes = [0, 1, 2, 3].map((i) => teams.map((t) => ({ team: t, player: t.players[i], id: `${t.id}-${i}` })));

  const setScore = (playerId, val) => {
    setHoles((hs) => hs.map((h, i) => (i === holeIdx ? { ...h, scores: { ...h.scores, [playerId]: val } } : h)));
  };

  const totals = teams.map((t) => ({ team: t, total: teamTotal(teams, holes, t) })).sort((a, b) => b.total - a.total);

  const pairs = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) pairs.push([teams[i], teams[j]]);
  }

  return (
    <>
      <div className="tabs">
        <button className={`tabs__btn ${tab === "score" ? "tabs__btn--active" : ""}`} onClick={() => setTab("score")}>
          <ClipboardList size={14} strokeWidth={2.25} /> Score
        </button>
        <button className={`tabs__btn ${tab === "board" ? "tabs__btn--active" : ""}`} onClick={() => setTab("board")}>
          <ListOrdered size={14} strokeWidth={2.25} /> Leaderboard
        </button>
        <button className={`tabs__btn ${tab === "pay" ? "tabs__btn--active" : ""}`} onClick={() => setTab("pay")}>
          <DollarSign size={14} strokeWidth={2.25} /> Payouts
        </button>
      </div>

      {tab === "score" && (
        <>
          <div className="strip">
            {holes.map((h) => {
              const entered = Object.keys(h.scores || {}).length;
              let cls = "strip__hole";
              if (h.number === activeHole) cls += " strip__hole--active";
              if (entered === 16) cls += " strip__hole--tie";
              return (
                <button key={h.number} className={cls} onClick={() => setActiveHole(h.number)}>
                  <span className="strip__num">{h.number}</span>
                  <span className="strip__par">Par {h.par}</span>
                </button>
              );
            })}
          </div>

          <div className="card">
            <div className="card__holeRow">
              <button className="card__nav" onClick={() => setActiveHole((n) => Math.max(1, n - 1))} disabled={activeHole === 1}>&lsaquo;</button>
              <div className="card__holeInfo">
                <div className="card__holeNum">HOLE {current.number}</div>
                <div className="card__parLabel" style={{ cursor: "default" }}>Par {current.par} &middot; SI {current.strokeIndex}</div>
              </div>
              <button className="card__nav" onClick={() => setActiveHole((n) => Math.min(18, n + 1))} disabled={activeHole === 18}>&rsaquo;</button>
            </div>

            {foursomes.map((grp, gi) => (
              <div className="foursome" key={gi}>
                <div className="foursome__label">FOURSOME {gi + 1}</div>
                {grp.map(({ team, player, id }) => {
                  const gross = current.scores?.[id];
                  const pts = playerPoints(teams, holes, id, holeIdx);
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
                        onChange={(e) => setScore(id, e.target.value === "" ? null : Number(e.target.value))}
                        placeholder="\u2013"
                      />
                      <span className="playerRow__pts">{pts != null ? `${pts} pt${pts === 1 ? "" : "s"}` : ""}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "board" && (
        <div className="card">
          {totals.map((row, i) => (
            <div className="boardRow" key={row.team.id}>
              <span className="boardRow__rank">{i + 1}</span>
              <span className="boardRow__dot" style={{ background: row.team.color }} />
              <span className="boardRow__name">{row.team.name}</span>
              {i === 0 && row.total > 0 && <Trophy size={14} strokeWidth={2.25} color="var(--sand)" />}
              <span className="boardRow__total">{row.total} pts</span>
            </div>
          ))}
        </div>
      )}

      {tab === "pay" && (
        <div className="card">
          <div className="payHint">$1 per point difference &middot; final totals, per team</div>
          {pairs.map(([ta, tb], i) => {
            const totA = teamTotal(teams, holes, ta);
            const totB = teamTotal(teams, holes, tb);
            const diff = totA - totB;
            if (diff === 0) {
              return (
                <div className="payRow" key={i}>
                  <span className="payRow__matchup"><b style={{ color: ta.color }}>{ta.name}</b> vs <b style={{ color: tb.color }}>{tb.name}</b></span>
                  <span className="payRow__outcome">Tied</span>
                </div>
              );
            }
            const winner = diff > 0 ? ta : tb;
            const loser = diff > 0 ? tb : ta;
            const amount = Math.abs(diff) * stake;
            return (
              <div className="payRow" key={i}>
                <span className="payRow__matchup"><b style={{ color: ta.color }}>{ta.name}</b> vs <b style={{ color: tb.color }}>{tb.name}</b></span>
                <span className="payRow__outcome">
                  <span style={{ color: loser.color }}>{loser.name}</span> pays <span style={{ color: winner.color }}>{winner.name}</span> ${amount}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ============================================================ */

export default function App() {
  useGoogleFonts();

  const [view, setView] = useState("landing");
  const [mode, setMode] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [matchId, setMatchId] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [copied, setCopied] = useState(false);
  const [activeHole, setActiveHole] = useState(1);

  const [names, setNames] = useState({ a: "", b: "" });
  const [matchHoles, setMatchHoles] = useState(makeMatchHoles);

  const [teams, setTeams] = useState(makeTeams);
  const [stableHoles, setStableHoles] = useState(makeStablefordHoles);
  const [stake, setStake] = useState(1);

  const skipNextSave = useRef(false);
  const pollRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("match");
    if (code && code.length === 4) {
      setJoinCode(code.toUpperCase());
      joinMatch(code.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function currentPayload() {
    return mode === "stableford"
      ? { mode, teams, holes: stableHoles, stake }
      : { mode: "matchplay", names, holes: matchHoles };
  }

  function applyPayload(data) {
    if (data.mode === "stableford") {
      setTeams(data.teams || makeTeams());
      setStableHoles(data.holes || makeStablefordHoles());
      setStake(data.stake ?? 1);
    } else {
      setNames(data.names || { a: "Player A", b: "Player B" });
      setMatchHoles(data.holes || makeMatchHoles());
    }
    setMode(data.mode || "matchplay");
  }

  async function joinMatch(code) {
    if (!configured()) { setJoinError("This site isn't connected to a shared database yet."); return; }
    setJoinError("");
    try {
      const data = await dbGet(code);
      if (!data) { setJoinError("No match found with that code."); return; }
      skipNextSave.current = true;
      applyPayload(data);
      setMatchId(code);
      setView("live");
      setSyncStatus("synced");
    } catch {
      setJoinError("Couldn't reach the shared database. Check your connection.");
    }
  }

  async function createMatchPlay() {
    const finalNames = { a: names.a.trim() || "Player A", b: names.b.trim() || "Player B" };
    const code = generateCode();
    const holes = makeMatchHoles();
    skipNextSave.current = true;
    setNames(finalNames);
    setMatchHoles(holes);
    setMode("matchplay");
    setMatchId(code);
    setActiveHole(1);
    setView("live");
    setSyncStatus("saving");
    try {
      await dbSet(code, { mode: "matchplay", names: finalNames, holes });
      setSyncStatus("synced");
    } catch { setSyncStatus("error"); }
  }

  async function createStableford() {
    const code = generateCode();
    const holes = makeStablefordHoles();
    skipNextSave.current = true;
    setStableHoles(holes);
    setMode("stableford");
    setMatchId(code);
    setActiveHole(1);
    setView("live");
    setSyncStatus("saving");
    try {
      await dbSet(code, { mode: "stableford", teams, holes, stake });
      setSyncStatus("synced");
    } catch { setSyncStatus("error"); }
  }

  useEffect(() => {
    if (view !== "live" || !matchId) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    setSyncStatus("saving");
    const t = setTimeout(async () => {
      try { await dbSet(matchId, currentPayload()); setSyncStatus("synced"); }
      catch { setSyncStatus("error"); }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchHoles, names, stableHoles, teams, stake]);

  useEffect(() => {
    if (view !== "live" || !matchId) return;
    pollRef.current = setInterval(async () => {
      try {
        const data = await dbGet(matchId);
        if (data) { skipNextSave.current = true; applyPayload(data); setSyncStatus("synced"); }
      } catch { setSyncStatus("error"); }
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [view, matchId]);

  const leaveMatch = () => {
    clearInterval(pollRef.current);
    setMatchId(null);
    setMode(null);
    setMatchHoles(makeMatchHoles());
    setStableHoles(makeStablefordHoles());
    setTeams(makeTeams());
    setNames({ a: "", b: "" });
    setJoinCode("");
    setActiveHole(1);
    setView("landing");
    window.history.replaceState({}, "", window.location.pathname);
  };

  const shareLink = matchId ? `${window.location.origin}${window.location.pathname}?match=${matchId}` : "";
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { /* ignore */ }
  };

  if (view === "landing") {
    return (
      <>
        <GlobalStyle />
        <div className="app">
          {!configured() && (
            <div className="configNotice">
              Shared database not configured yet. Add your Firebase Realtime Database URL at the top of the file before deploying.
            </div>
          )}
          <LandingScreen joinCode={joinCode} setJoinCode={setJoinCode} onJoin={() => joinMatch(joinCode)} onCreate={() => setView("mode")} error={joinError} />
        </div>
      </>
    );
  }

  if (view === "mode") {
    return (
      <>
        <GlobalStyle />
        <div className="app">
          <ModeScreen onPick={(m) => setView(m === "matchplay" ? "matchsetup" : "stablefordsetup")} />
        </div>
      </>
    );
  }

  if (view === "matchsetup") {
    return (
      <>
        <GlobalStyle />
        <div className="app"><MatchSetupScreen names={names} setNames={setNames} onStart={createMatchPlay} /></div>
      </>
    );
  }

  if (view === "stablefordsetup") {
    return (
      <>
        <GlobalStyle />
        <div className="app"><StablefordSetupScreen teams={teams} setTeams={setTeams} stake={stake} setStake={setStake} onStart={createStableford} /></div>
      </>
    );
  }

  return (
    <>
      <GlobalStyle />
      <div className="app">
        <header className="header">
          <div className="header__title"><Flag size={18} strokeWidth={2.5} /><span>{mode === "stableford" ? "STABLEFORD TEAMS" : "MATCH PLAY"}</span></div>
          <button className="header__reset" onClick={leaveMatch} aria-label="Leave match"><RotateCcw size={15} strokeWidth={2.25} /></button>
        </header>

        <div className="shareBar">
          <div className="shareBar__code"><Users size={13} strokeWidth={2.5} /> {matchId}</div>
          <button className="shareBar__copy" onClick={copyLink}><Copy size={12} strokeWidth={2.5} /> {copied ? "Copied!" : "Copy link"}</button>
          <span className={`shareBar__status shareBar__status--${syncStatus}`}>
            {syncStatus === "saving" && "Saving\u2026"}
            {syncStatus === "synced" && "Synced"}
            {syncStatus === "error" && "Offline"}
          </span>
        </div>

        {mode === "stableford" ? (
          <StablefordLive teams={teams} setTeams={setTeams} holes={stableHoles} setHoles={setStableHoles} stake={stake} activeHole={activeHole} setActiveHole={setActiveHole} />
        ) : (
          <MatchPlayLive names={names} holes={matchHoles} setHoles={setMatchHoles} activeHole={activeHole} setActiveHole={setActiveHole} />
        )}

        <footer className="footer">share code {matchId}</footer>
      </div>
    </>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      :root {
        --fairway: #1B4332; --turf: #2D6A4F; --sand: #D8B45C;
        --chalk: #F6F4EE; --ink: #10231C; --flag: #B5482F; --line: #DDD8C9;
      }
      * { box-sizing: border-box; }
      .app { font-family: 'Inter', sans-serif; background: var(--chalk); color: var(--ink); min-height: 100vh; max-width: 520px; margin: 0 auto; padding: 20px 16px 40px; }
      @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }

      .configNotice { background: #FDECEC; border: 1px solid #E8B4B4; color: #8A2E2E; font-size: 12.5px; padding: 10px 12px; border-radius: 8px; margin-bottom: 16px; }

      .setup { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 24px; }
      .setup--wide { max-width: 480px; margin: 0 auto; }
      .setup__flag { width: 56px; height: 56px; border-radius: 50%; background: var(--fairway); color: var(--chalk); display: flex; align-items: center; justify-content: center; margin-bottom: 18px; }
      .setup__title { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 30px; letter-spacing: 0.5px; margin: 0 0 6px; color: var(--fairway); }
      .setup__sub { color: #5B6B5F; font-size: 14px; margin: 0 0 24px; }
      .setup__field { width: 100%; text-align: left; display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
      .setup__field span { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #5B6B5F; }
      .setup__field input { border: 1.5px solid var(--line); border-radius: 10px; padding: 12px 14px; font-size: 16px; font-family: 'Inter', sans-serif; background: white; color: var(--ink); }
      .setup__field input:focus { outline: 2px solid var(--turf); outline-offset: 1px; border-color: var(--turf); }
      .setup__error { color: var(--flag); font-size: 12.5px; margin-bottom: 10px; }
      .setup__start { margin-top: 4px; width: 100%; background: var(--fairway); color: var(--chalk); border: none; border-radius: 10px; padding: 14px; font-size: 15px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
      .setup__start:disabled { opacity: 0.4; cursor: default; }
      .setup__start:not(:disabled):hover { background: var(--turf); }
      .setup__start:focus-visible { outline: 2px solid var(--sand); outline-offset: 2px; }
      .setup__start--ghost { background: white; color: var(--fairway); border: 1.5px solid var(--fairway); }
      .setup__start--ghost:hover { background: #EEF3EF; }
      .setup__divider { display: flex; align-items: center; width: 100%; margin: 18px 0; color: #A2ABA0; font-size: 12px; }
      .setup__divider::before, .setup__divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }
      .setup__divider span { padding: 0 10px; }

      .modeCard { width: 100%; text-align: left; background: white; border: 1.5px solid var(--line); border-radius: 12px; padding: 16px; margin-bottom: 12px; cursor: pointer; }
      .modeCard:hover { border-color: var(--fairway); }
      .modeCard:focus-visible { outline: 2px solid var(--turf); outline-offset: 2px; }
      .modeCard__title { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 16px; color: var(--fairway); margin-bottom: 4px; }
      .modeCard__desc { font-size: 12.5px; color: #5B6B5F; }

      .teamCard { width: 100%; background: white; border: 1.5px solid var(--line); border-left-width: 5px; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; text-align: left; }
      .teamCard__header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
      .teamCard__dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
      .teamCard__name { border: none; background: none; font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 15px; color: var(--ink); flex: 1; padding: 2px 0; }
      .teamCard__name:focus { outline: none; border-bottom: 1px solid var(--line); }
      .teamCard__row { display: flex; gap: 8px; margin-bottom: 6px; }
      .teamCard__playerName { flex: 1; border: 1px solid var(--line); border-radius: 7px; padding: 8px 10px; font-size: 13.5px; }
      .teamCard__hcp { width: 56px; border: 1px solid var(--line); border-radius: 7px; padding: 8px 6px; font-size: 13.5px; text-align: center; }

      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
      .header__title { display: flex; align-items: center; gap: 8px; font-family: 'Oswald', sans-serif; font-weight: 600; letter-spacing: 1.5px; font-size: 12.5px; color: var(--fairway); }
      .header__reset { background: none; border: 1.5px solid var(--line); border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: #5B6B5F; cursor: pointer; }
      .header__reset:hover { border-color: var(--flag); color: var(--flag); }
      .header__reset:focus-visible { outline: 2px solid var(--turf); outline-offset: 2px; }

      .shareBar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; font-size: 12px; flex-wrap: wrap; }
      .shareBar__code { display: flex; align-items: center; gap: 5px; font-weight: 600; letter-spacing: 1px; background: #EEF3EF; padding: 5px 9px; border-radius: 7px; color: var(--fairway); }
      .shareBar__copy { display: flex; align-items: center; gap: 5px; background: white; border: 1.5px solid var(--line); border-radius: 7px; padding: 5px 9px; cursor: pointer; color: #5B6B5F; }
      .shareBar__copy:hover { border-color: var(--fairway); color: var(--fairway); }
      .shareBar__status { margin-left: auto; color: #A2ABA0; }
      .shareBar__status--error { color: var(--flag); }
      .shareBar__status--synced { color: var(--turf); }

      .tabs { display: flex; gap: 6px; margin-bottom: 14px; }
      .tabs__btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: white; border: 1.5px solid var(--line); border-radius: 8px; padding: 9px 4px; font-size: 12px; font-weight: 600; color: #5B6B5F; cursor: pointer; }
      .tabs__btn--active { background: var(--fairway); border-color: var(--fairway); color: var(--chalk); }
      .tabs__btn:focus-visible { outline: 2px solid var(--turf); outline-offset: 2px; }

      .banner { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 13px; border-radius: 10px; font-family: 'Oswald', sans-serif; font-weight: 500; font-size: 14px; letter-spacing: 0.4px; margin-bottom: 14px; }
      .banner--neutral { background: #E7E4D8; color: #4A5A4D; }
      .banner--leading { background: var(--fairway); color: var(--chalk); }
      .banner--dormie { background: var(--sand); color: var(--ink); }
      .banner--won { background: var(--flag); color: var(--chalk); }

      .strip { display: flex; gap: 5px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 16px; scrollbar-width: thin; }
      .strip__hole { flex: 0 0 auto; width: 44px; border: 1.5px solid var(--line); background: white; border-radius: 8px; padding: 6px 0; display: flex; flex-direction: column; align-items: center; cursor: pointer; color: var(--ink); }
      .strip__num { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 14px; }
      .strip__par { font-size: 9px; color: #8A9490; }
      .strip__hole--active { border-color: var(--fairway); border-width: 2px; }
      .strip__hole--a { background: rgba(27,67,50,0.12); border-color: var(--fairway); }
      .strip__hole--b { background: rgba(181,72,47,0.12); border-color: var(--flag); }
      .strip__hole--tie { background: #EFEBDA; }
      .strip__hole:focus-visible { outline: 2px solid var(--turf); outline-offset: 1px; }

      .card { background: white; border: 1.5px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 14px; }
      .card__holeRow { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
      .card__nav { width: 34px; height: 34px; border-radius: 8px; border: 1.5px solid var(--line); background: white; font-size: 20px; color: var(--fairway); cursor: pointer; display: flex; align-items: center; justify-content: center; }
      .card__nav:disabled { opacity: 0.3; cursor: default; }
      .card__nav:not(:disabled):hover { border-color: var(--fairway); }
      .card__nav:focus-visible { outline: 2px solid var(--turf); outline-offset: 2px; }
      .card__holeInfo { text-align: center; }
      .card__holeNum { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 20px; letter-spacing: 0.5px; color: var(--ink); }
      .card__parLabel { border: none; background: none; color: #8A9490; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; margin-top: 2px; }
      .card__parLabel:hover { color: var(--turf); }
      .card__parEdit { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-top: 4px; color: #5B6B5F; }
      .card__parEdit button { width: 22px; height: 22px; border-radius: 6px; border: 1px solid var(--line); background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; }
      .card__parDone { color: var(--turf); border-color: var(--turf) !important; }

      .card__steppers { display: flex; flex-direction: column; gap: 10px; }
      .stepperWrap { border-radius: 10px; transition: background 0.15s ease; }
      .stepperWrap--win { background: rgba(216,180,92,0.25); }
      .stepper { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; }
      .stepper__label { font-weight: 600; font-size: 14px; }
      .stepper__controls { display: flex; align-items: center; gap: 12px; }
      .stepper__btn { width: 30px; height: 30px; border-radius: 50%; border: 1.5px solid var(--line); background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink); }
      .stepper__btn:hover { border-color: var(--fairway); }
      .stepper__btn:focus-visible { outline: 2px solid var(--turf); outline-offset: 2px; }
      .stepper__value { font-family: 'Oswald', sans-serif; font-size: 18px; font-weight: 600; width: 22px; text-align: center; }
      .card__result { margin-top: 14px; text-align: center; font-size: 12.5px; color: #5B6B5F; border-top: 1px dashed var(--line); padding-top: 10px; }
      .matchOverNote { text-align: center; font-size: 12px; color: #8A9490; margin-bottom: 10px; }

      .foursome { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--line); }
      .foursome:first-of-type { margin-top: 4px; }
      .foursome__label { font-size: 10.5px; letter-spacing: 1px; color: #A2ABA0; font-weight: 700; margin-bottom: 8px; }
      .playerRow { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
      .playerRow__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .playerRow__name { flex: 1; font-size: 13.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .playerRow__hcp { font-size: 10.5px; color: #A2ABA0; width: 24px; text-align: right; }
      .playerRow__input { width: 46px; border: 1.5px solid var(--line); border-radius: 7px; padding: 6px 4px; text-align: center; font-size: 14px; }
      .playerRow__input:focus { outline: 2px solid var(--turf); border-color: var(--turf); }
      .playerRow__pts { width: 42px; text-align: right; font-size: 11px; color: var(--turf); font-weight: 600; }

      .boardRow { display: flex; align-items: center; gap: 10px; padding: 10px 4px; border-bottom: 1px solid var(--line); }
      .boardRow:last-child { border-bottom: none; }
      .boardRow__rank { width: 18px; font-family: 'Oswald', sans-serif; font-weight: 600; color: #A2ABA0; }
      .boardRow__dot { width: 10px; height: 10px; border-radius: 50%; }
      .boardRow__name { flex: 1; font-weight: 600; font-size: 14px; }
      .boardRow__total { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 15px; }

      .payHint { font-size: 11.5px; color: #8A9490; margin-bottom: 10px; text-align: center; }
      .payRow { display: flex; flex-direction: column; gap: 2px; padding: 10px 4px; border-bottom: 1px solid var(--line); font-size: 13px; }
      .payRow:last-child { border-bottom: none; }
      .payRow__outcome { font-size: 12.5px; color: #4A5A4D; }

      .footer { text-align: center; font-size: 11px; color: #A2ABA0; letter-spacing: 0.4px; margin-top: 8px; }
    `}</style>
  );
}
