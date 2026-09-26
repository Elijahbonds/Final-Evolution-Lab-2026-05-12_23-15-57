// _hoops-motion-probe — every hoops action as MOTION (HOOPS MOTION pass, phase 1, 2026-09-24; owner: "upgrade the basketball
// suite with the same workflow we just used with the dunk mode for all other animations and actions").
//
// The dunk pass's instrument (_dunk-motion-probe) pointed at 1v1, 3v3, the 3PT shootout and the carnival: record the FINAL
// DRAWN POSE of every player body on every rendered frame of a real action, measure it with the dunk probe's own metric
// definitions (so the numbers compare), and replay it frozen for side and front-three-quarter sheets.
//
// WHAT IS NEW AGAINST THE DUNK PROBE
//   · A VIRTUAL CLOCK (scripts/probes/_vclock-page.js, shared with the dunk probe since 2a): each rendered frame advances the
//     game exactly VDT ms (default 1000/60) whatever the wall clock did — performance.now, requestAnimationFrame, setTimeout
//     and setInterval are all on it, and so are the drivers. CPU is shared with other workflows; with this clock machine load
//     changes how long a run takes, not what it measures. Math.random is reseeded per take (SEED + take name) and per frame.
//     2a: the page's rAF callbacks run from one queue after the step, the step waits for every timer of the current time (and
//     what it resolves), and every step is the same double (the base's float grid) — see _vclock-page.js.
//   · IN-PAGE DRIVERS (_hoops-motion-page.js): 1v1 / 3v3 through the agent bridge (?agent=1 bypasses local input by design),
//     the right stick through InputBus.emit, 3PT and the carnival through the KEYBOARD handler (a KeyboardEvent on window:
//     J = A, space = the analog R trigger). Nothing is timed from node.
//   · EVERY BODY: the hero and the AI (1v1 foe; 3v3 mate0/1 + foe0/1/2; 3PT / carnival b0 …) are recorded together, and an
//     action's subject is whichever body played it — so the AI's jumper and the hero's are measured the same way.
//   · ANCHORS ARE CLIPS (or the ball changing hands, a state edge, or — for three windows the game never draws — the mode's
//     own log line), not log text in general: the hotfix in flight moves the modes' log lines again.
//   · HOOPS METRICS on top of the dunk set: foot slide while planted (the footplant probe's contact test), which hand holds
//     and releases — by rig bone AND by the side it is drawn on (the runtime rig is mirrored: rig RightHand draws on the
//     body's LEFT), the release against the jump's apex, and the clip names against what the body visibly did (did the ball
//     cross, go under the legs, behind the back; did the body turn; slide sideways).
//   · PHASE 2a (2026-09-25) — INSTRUMENT II: the four attempts runners folded in as REPS with NAMED repeats (a repeat is the
//     same play under its own name: the dice are seeded by name, so each is a fresh roll of the same inputs); fourteen new
//     metrics (ball path, dribble contact, hip-yaw seam, cadence, finishing side, guide hand, wrist flex, overlap, AI-ARMS,
//     look, shield, catch reach, celebration visibility, pacing) plus the stacked-clip count; "ball against the palm" gone
//     (a constant 0.15 m while the ball is attached); the animation-group weights logged every frame around the 3PT shots
//     (weights-*.txt: the crossFade re-entrancy question); driver variants for the game dunks and a 3v3 layup outside traffic.
//
//   BASE=http://127.0.0.1:3098 TAG=p2/base2 ACTIONS=all REPS=5 npx tsx scripts/probes/_hoops-motion-probe.mts
//   ACTIONS=hero_1v1_jumper_set,ai_1v1_closeout   (ids from LIST=1; a session id such as 1v1-off selects all its actions)
//   LIST=1 — print the catalogue and exit      SCRUB=0 — numbers only, no sheets
//   REPS=N — attempts kept per action (1 = the canonical instance; ≥ 5 = the plan's gate; per-action caps in MAXA)
//   TAKES=canon|all — which takes run (default: canon for REPS=1, all for REPS>1; canon = phase 1's take list exactly)
//   SEED=7  VDT=16.6667  COLS=12  HOG=<ms>  FROM_REC=<dir> — re-measure recordings already on disk (sheets need SCRUB=1 + a server)
//   WEIGHTS=1 — write the per-frame weights log for every recording (default: the 3PT shots only, plus weights-summary.txt)
//   HUNT=<take>:<from>-<to> + ACTIONS=<action> + AOFF=<action>:<n> — a supplemental hunt for a rare action, merged after the n on disk
//   Determinism: run the same TAG twice idle and once with HOG=60, then DET=1 _hoops-motion-compare.mts <tagA> <tagB>
//   Output: ~/Claude/outbox/finish-release/hoopsmotion/<TAG>/ — metrics.json (every attempt), status.txt / .json, takes-<session>.json,
//           rec-<action>[-a<k>].json, sheet-<action>[-a<k>].png, weights-<action>[-a<k>].txt
import { chromium, type Page, type Browser } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { chromiumExe } from './_chromium.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const TAG = process.env.TAG ?? 'run';
const OUT = TAG.startsWith('/') ? TAG : `${process.env.HOME}/Claude/outbox/finish-release/hoopsmotion/${TAG}`;
const SCRUB = process.env.SCRUB !== '0';
const REPS = Math.max(1, Number(process.env.REPS ?? 1));
const TAKES = process.env.TAKES ?? (REPS > 1 ? 'all' : 'canon');
const SEED = Number(process.env.SEED ?? 7);
const VDT = Number(process.env.VDT ?? 1000 / 60);
const COLS = Number(process.env.COLS ?? 12);
const FROM_REC = process.env.FROM_REC ?? '';
const TAKE_WALL_MS = Number(process.env.TAKE_WALL_MS ?? 240000);
const WEIGHTS_ALL = process.env.WEIGHTS === '1';
/** HOG=<ms>: the load self-test — burn up to that much wall time inside every frame (see the clock). Numbers must not move. */
const HOG = Number(process.env.HOG ?? 0);
const VCLOCK_JS = fs.readFileSync(path.join(HERE, '_vclock-page.js'), 'utf8');
const PAGE_JS = fs.readFileSync(path.join(HERE, '_hoops-motion-page.js'), 'utf8');

// ── the catalogue ───────────────────────────────────────────────────────────────────────────────────────────────────
type SessionId = '1v1-off' | '1v1-def' | '3v3-off' | '3v3-def' | '3pt' | 'carnival';
/** canon: one of phase 1's takes (an ACTIONS=all REPS=1 run is exactly phase 1's history). A repeat / variant is not. */
interface Take { name: string; play: string; prep?: 'offense' | 'defense'; postMs?: number; rec?: boolean; settle?: number; canon?: boolean; [k: string]: unknown }
interface Session { id: SessionId; mode: string; qs: string; takes: Take[] }
/** An offensive take. luck 0.99 by default: the AI's strip / block / hand-up rolls never land, so MY play reaches its end (the
 *  1v1 AI strips a dribbler inside 1.6 m within half a second of the check — measured, both first takes). luck 0 = every roll
 *  lands (the contested look); 0.5 is the one value that reads HAND UP (aiShotRead: block < 0.30, hand up < 0.75); null = the dice. */
const off = (name: string, play: string, extra: Record<string, unknown> = {}): Take => ({ name, play, prep: 'offense', luck: 0.99, ...extra });
const def = (name: string, style: string): Take => ({ name, play: 'defend', prep: 'defense', style, postMs: 1800 });
/** A NAMED REPEAT of a take: the same inputs under its own name (`base~2`, `base~3` …), so the dice roll fresh but the same on
 *  every run. Phase 1's attempts runners built these; 2a folds them in. */
const rep = (src: Take, n: number, from = 2, extra: Record<string, unknown> = {}): Take[] => Array.from({ length: n }, (_, i) => ({ ...src, ...extra, name: `${src.name}~${i + from}`, canon: false }));
const canon = (takes: Take[]): Take[] => takes.map((t) => ({ ...t, canon: true }));
// the R-stick handles: attempts 1-3 are the SAME input (the take + two repeats), then two CONTEXT variants on the same flick —
// standing still (no jog) and at speed (stick 0.9 + sprint): the pro-stick map reads speed01 / sprint (a crossover at pace is
// the momentum cross), so the variants show what the move becomes in a game
const hv = (name: string, move: string, jog: number, sprint: boolean): Take => ({ name, play: 'handleV', prep: 'offense', luck: 0.99, move, jog, sprint, postMs: 800, canon: false });
const handleSet = (pfx: string, base: Take, move: string): Take[] => [...rep(base, 2), hv(`${pfx}_${move}_stand`, move, 0, false), hv(`${pfx}_${move}_fast`, move, 0.9, true)];
const T3 = { close: true, charge: 0.3, spot: [0, -0.1], postMs: 1500 };
const O = {   // the 1v1 offence takes referenced by name below
  set: off('o_set', 'jumper'), contest: off('o_contest', 'jumperNow', { luck: 0 }), block: off('o_block', 'contested', { luckShot: 0 }), block2: off('o_block2', 'contested', { luckShot: 0, creep: 0.5, hold: 500 }), strip: off('o_strip', 'idle', { ms: 1800, luck: null }),
  pullup: off('o_pullup', 'pullup'), fade: off('o_fade', 'fade'), stepback: off('o_stepback', 'stepback'),
  layup: off('o_layup', 'layup', { wing: 3.2 }), layup2: off('o_layup2', 'layup', { wing: -3.2 }), layup3: off('o_layup3', 'layup', { wing: 4.5, mag: 0.84, stop: 2.9 }), layup4: off('o_layup4', 'layup', { baseline: true, stop: 2.2 }),
  floater: off('o_floater', 'floater'), dunk: off('o_dunk', 'dunk', { postMs: 3000 }),
  cross: off('o_cross', 'handle', { move: 'crossover', postMs: 800 }), between: off('o_between', 'handle', { move: 'between', postMs: 800 }), behind: off('o_behind', 'handle', { move: 'behind', postMs: 800 }),
  spin: off('o_spin', 'handle', { move: 'spin', postMs: 800 }), hesi: off('o_hesi', 'handle', { move: 'hesi', postMs: 800 }), inout: off('o_inout', 'handle', { move: 'inout', postMs: 800 }),
  hook: off('o_hook', 'posthook'), dropstep: off('o_dropstep', 'postread', { read: 'dropstep' }), shimmy: off('o_shimmy', 'postread', { read: 'fade' }), upunder: off('o_upunder', 'postread', { read: 'pump' }),
  rebound: off('o_rebound', 'rebound', { postMs: 1500 }), rebound2: off('o_rebound2', 'rebound', { crash: false, postMs: 1500 }), rebound3: off('o_rebound3', 'rebound', { charge: 0.4, postMs: 1500 }), rebound4: off('o_rebound4', 'rebound', { charge: 0.4, crash: false, postMs: 1500 }), rebound5: off('o_rebound5', 'rebound', { close: true, charge: 0.3, spot: [0, -0.1], postMs: 1500 }),
};
const D = { passive1: def('d_passive1', 'passive'), contest1: def('d_contest1', 'contest'), block1: def('d_block1', 'block'), steal1: def('d_steal1', 'steal'), box1: def('d_box1', 'box'), passive2: def('d_passive2', 'passive'), contest2: def('d_contest2', 'contest'), block2: def('d_block2', 'block'), passive3: def('d_passive3', 'passive'), steal2: def('d_steal2', 'steal') };
const T = {
  set: off('t_set', 'jumper'), contest: off('t_contest', 'jumperNow', { luck: 0 }), contest2: off('t_contest2', 'contested', { luckShot: 0, creep: -0.8, hold: 550 }), block: off('t_block', 'contested', { luckShot: 0 }), layup: off('t_layup', 'layup', { wing: 3.2 }), layup2: off('t_layup2', 'layup', { wing: -3.2 }), dunk: off('t_dunk', 'dunk', { postMs: 3000 }), dunk2: off('t_dunk2', 'dunk', { wing: 3.4, postMs: 3000 }), pass: off('t_pass', 'pass', { postMs: 2500 }),
  screen: off('t_screen', 'screen'), cross: off('t_cross', 'handle', { move: 'crossover', postMs: 800 }), rebound: off('t_rebound', 'rebound', { postMs: 1500 }), rebound2: off('t_rebound2', 'rebound', { charge: 0.4, postMs: 1500 }), pass2: off('t_pass2', 'pass', { afterScreen: true, postMs: 2500 }), pass3: off('t_pass3', 'pass', { wait: 250, postMs: 2500 }), oop: off('t_oop', 'passToCutter', { postMs: 2500 }),
};
const E = { passive1: def('e_passive1', 'passive'), contest1: def('e_contest1', 'contest'), block1: def('e_block1', 'block'), steal1: def('e_steal1', 'steal'), passive2: def('e_passive2', 'passive'), box1: def('e_box1', 'box'), passive3: def('e_passive3', 'passive'), steal2: def('e_steal2', 'steal'), passive4: def('e_passive4', 'passive'), contest2: def('e_contest2', 'contest'), passive5: def('e_passive5', 'passive') };
/** The 1v1 rival's dunk: he only dunks a lane he has BEATEN — these takes get beaten on purpose (phase 1 found 1 in ~68 takes). */
const give = (name: string, how: string, at = 2.1): Take => ({ name, play: 'giveDunk', prep: 'defense', how, at, postMs: 2600, canon: false });
const cont = (name: string, c: number, lo = 1.3, hi = 2.0): Take => ({ name, play: 'containReach', prep: 'defense', cont: c, lo, hi, postMs: 2600, canon: false });
const rack = (name: string, extra: Record<string, unknown> = {}): Take => ({ name, play: 'threept', ms: 13000, postMs: 200, canon: false, ...extra });
const SESSIONS: Session[] = [
  { id: '1v1-off', mode: 'onevone', qs: '&handle=100', takes: [
    ...canon([O.set, O.contest, O.block, O.block2, O.strip, O.pullup, O.fade, O.stepback, O.layup, O.layup2, O.layup3, O.layup4, O.floater, O.dunk, O.cross, O.between, O.behind, O.spin, O.hesi, O.inout, O.hook, O.dropstep, O.shimmy, O.upunder, O.rebound, O.rebound2, O.rebound3, O.rebound4, O.rebound5]),
    // ── the repeats and variants (phase 1's four runners, folded; each under its own name) ──
    ...rep(O.set, 4), ...rep(O.pullup, 4), ...rep(O.fade, 4), ...rep(O.stepback, 4),
    ...rep(O.contest, 2), off('o_hand1', 'jumperNow', { luck: 0.5, canon: false }), off('o_hand2', 'jumperNow', { luck: 0.5, canon: false }), off('o_hand3', 'contested', { luckShot: 0.5, canon: false }),
    ...rep(O.block2, 2), ...rep(O.strip, 2),
    // the layup VARIANTS: the wing drives read a running hook when the defender is on the hip, so the plain LAYUP (under
    // FINGER_ROLL_MIN_SPEED) and the MIKAN (inside MIKAN_RANGE) need their own slow approaches to be seen at all
    ...rep(O.layup, 2), ...rep(O.layup2, 2),
    off('o_layup5', 'layup', { wing: -3.2, mag: 0.5, stop: 2.0, canon: false }), off('o_layup6', 'layup', { wing: -3.2, mag: 0.8, stop: 1.0, canon: false }), off('o_layup7', 'layup', { wing: 3.2, mag: 0.5, stop: 2.0, canon: false }),
    off('o_layup7~2', 'layup', { wing: 3.2, mag: 0.5, stop: 2.0, canon: false }), off('o_layup7~3', 'layup', { wing: 3.2, mag: 0.5, stop: 2.0, canon: false }),
    off('o_layup8', 'layup', { wing: 3.2, mag: 0.5, stop: 1.6, canon: false }), off('o_layup9', 'layup', { wing: 2.4, mag: 0.45, stop: 2.0, canon: false }),
    ...rep(O.floater, 4), ...rep(O.dunk, 4),
    // PHASE 2a driver variants (B: 9 of 9 game dunks were DOUBLE CLUTCH): the baseline drive (REVERSE), the fast wing drive across
    // the face (WINDMILL / TOMAHAWK), the slow angled drive (CRADLE), the jog (POWER SLAM) — see the page's P.dunk
    off('o_dunk_base', 'dunk', { baseline: true, stop: 2.2, postMs: 3000, canon: false }), off('o_dunk_base~2', 'dunk', { baseline: true, stop: 2.2, postMs: 3000, canon: false }),
    off('o_dunk_wing', 'dunk', { wing: 4.5, stop: 2.4, postMs: 3000, canon: false }), off('o_dunk_wing~2', 'dunk', { wing: -4.5, stop: 2.4, postMs: 3000, canon: false }),
    off('o_dunk_slow', 'dunk', { wing: 3.4, mag: 0.6, stop: 2.4, postMs: 3000, canon: false }), off('o_dunk_jog', 'dunk', { mag: 0.6, stop: 2.2, postMs: 3000, canon: false }),
    // … and the three that are not the double clutch: every drive above reads a body in the lane (contest ≥ 0.45). The seam's poster
    // geometry (a set defender: TOMAHAWK), its standing geometry (TWO-HAND FLUSH), and a spin by him first (a stunned defender is no
    // contest: the angle and the speed pick)
    off('o_dunk_poster', 'dunkSeam', { seam: 'poster', postMs: 3000, canon: false }), off('o_dunk_standing', 'dunkSeam', { seam: 'standing', postMs: 3000, canon: false }),
    off('o_dunk_spin', 'spinDunk', { postMs: 3000, canon: false }), off('o_dunk_spin~2', 'spinDunk', { at: 2.2, postMs: 3000, canon: false }),
    ...handleSet('o', O.cross, 'crossover'), ...handleSet('o', O.between, 'between'), ...handleSet('o', O.behind, 'behind'), ...handleSet('o', O.spin, 'spin'), ...handleSet('o', O.hesi, 'hesi'), ...handleSet('o', O.inout, 'inout'),
    ...rep(O.hook, 4), ...rep(O.dropstep, 4), ...rep(O.shimmy, 4), ...rep(O.upunder, 4),
    ...rep(O.rebound, 2), ...rep(O.rebound3, 2), ...rep(O.rebound5, 3), ...rep(O.rebound4, 2),
  ] },
  { id: '1v1-def', mode: 'onevone', qs: '', takes: [
    ...canon([D.passive1, D.contest1, D.block1, D.steal1, D.box1, D.passive2, D.contest2, D.block2, D.passive3, D.steal2]),
    ...rep(D.passive1, 4), ...rep(D.contest1, 5), ...rep(D.block1, 5), ...rep(D.steal1, 2), ...rep(D.box1, 4), ...rep(D.passive2, 2), ...rep(D.passive3, 2),
    // the rival's dunk (the one give that worked in phase 1: a REACH whiffed at ~1.9 m after he has been contained)
    give('d_give5', 'reach', 1.9), give('d_give5~2', 'reach', 1.9), give('d_give5~3', 'reach', 1.9), give('d_give7', 'reach', 1.8), give('d_give8', 'reach', 2.0), give('d_give9', 'reach', 1.85),
    cont('d_cs1', 10, 1.3), cont('d_cs2', 12, 1.4), cont('d_cs3', 14, 1.5), cont('d_cs4', 16, 1.3),
  ] },
  { id: '3v3-off', mode: 'threevthree', qs: '&handle=100', takes: [
    ...canon([T.set, T.contest, T.contest2, T.block, T.layup, T.layup2, T.dunk, T.dunk2, T.pass, T.screen, T.cross, T.rebound, T.rebound2, T.pass2, T.pass3, T.oop]),
    ...rep(T.set, 4), ...rep(T.contest, 2), ...rep(T.block, 2),
    off('t_hand1', 'jumperNow', { luck: 0.5, canon: false }), off('t_hand2', 'jumperNow', { luck: 0.5, canon: false }), off('t_hand3', 'contested', { luckShot: 0.5, canon: false }), off('t_hand4', 'contested', { luckShot: 0.5, creep: 0.5, hold: 500, canon: false }),
    ...rep(T.layup, 2), ...rep(T.layup2, 2),
    off('t_layup3', 'layup', { wing: -4.5, mag: 0.84, stop: 2.9, canon: false }), off('t_layup4', 'layup', { baseline: true, stop: 2.2, canon: false }), off('t_layup4~2', 'layup', { baseline: true, stop: 2.2, canon: false }),
    off('t_layup5', 'layup', { wing: -3.2, mag: 0.5, stop: 2.0, canon: false }), off('t_layup5~2', 'layup', { wing: -3.2, mag: 0.5, stop: 2.0, canon: false }), off('t_layup6', 'layup', { wing: 3.2, mag: 0.8, stop: 1.0, canon: false }), off('t_layup7', 'layup', { baseline: true, stop: 1.8, canon: false }),
    // PHASE 2a: a 3v3 layup OUTSIDE traffic — off the check before the coverage sets, and off a screen's pop
    off('t_layup_open', 'layup', { fromCheck: true, mag: 1, stop: 2.6, canon: false }), off('t_layup_open~2', 'layup', { fromCheck: true, mag: 1, stop: 2.6, canon: false }),
    off('t_layup_screen', 'layup', { screen: true, wing: 3.2, mag: 0.9, stop: 2.6, canon: false }), off('t_layup_screen~2', 'layup', { screen: true, wing: -3.2, mag: 0.9, stop: 2.6, canon: false }),
    ...rep(T.dunk, 3), ...rep(T.dunk2, 2),
    off('t_dunk_base', 'dunk', { baseline: true, stop: 2.2, postMs: 3000, canon: false }), off('t_dunk_wing', 'dunk', { wing: -4.5, stop: 2.4, postMs: 3000, canon: false }),
    off('t_dunk_spin', 'spinDunk', { postMs: 3000, canon: false }), off('t_dunk_spin~2', 'spinDunk', { at: 2.2, postMs: 3000, canon: false }),
    // the teammate's shot: a lob to a mate cutting inside 3.2 m (the alley-oop), or a pass to a mate already inside 3 m of the rim
    { name: 't_oopwait1', play: 'oopWait', prep: 'offense', luck: 0.99, waitMs: 7000, postMs: 3500, canon: false },
    { name: 't_passrim1', play: 'passNearRim', prep: 'offense', luck: 0.99, waitMs: 7000, postMs: 6000, canon: false },
    { name: 't_passlong1', play: 'pass', prep: 'offense', luck: 0.99, postMs: 9000, canon: false },
    ...handleSet('t', T.cross, 'crossover'), ...rep(T.cross, 2, 4),
    ...rep(T.pass, 3), ...rep(T.pass3, 2),
    ...rep(T.rebound, 5), ...rep(T.rebound2, 3),
    ...['t_rebound3', 't_rebound3~2', 't_rebound3~3', 't_rebound3~4', 't_rebound3~5'].map((name) => off(name, 'rebound', { ...T3, canon: false })), off('t_rebound4', 'rebound', { charge: 0.4, postMs: 1500, canon: false }),
  ] },
  { id: '3v3-def', mode: 'threevthree', qs: '', takes: [
    ...canon([E.passive1, E.contest1, E.block1, E.steal1, E.passive2, E.box1, E.passive3, E.steal2, E.passive4, E.contest2, E.passive5]),
    ...rep(E.passive1, 3), ...rep(E.contest1, 2), ...rep(E.block1, 3), ...rep(E.steal1, 2), ...rep(E.passive2, 2),
    // the 3v3 AI's jumper (phase 1: 1 attempt): defence takes that close the lane (his tell reads 'jumper' when the lane is shut)
    ...rep(E.contest1, 3, 4), ...rep(E.block1, 2, 5),
    // the steal AT THE CHECK (2a: at this tip the rival gathers ~150 ms into the play and scores by ~500 ms, 4.5 m from me — the
    // settled steal takes never got a poke in: 0 of 14): no settle after the reset, and the poke repeated inside 1.5 m (repoke)
    { ...def('e_steal_check', 'steal'), settle: 0, repoke: true, canon: false }, { ...def('e_steal_rim', 'steal'), settle: 0, repoke: true, drop: true, canon: false }, { ...def('e_steal_rush', 'steal'), settle: 0, repoke: true, rush: true, repokeMs: 0, stepMs: 50, canon: false },
  ] },
  { id: '3pt', mode: 'threepoint', qs: '', takes: [
    { name: 'p_rack1', play: 'threept', ms: 13000, postMs: 200, canon: true }, { name: 'p_rack2', play: 'threept', ms: 12000, postMs: 200, canon: true },
    rack('p_rack3'), rack('p_rack4'), rack('p_rack5'),   // the rest of the qualifying round, recorded (7 racks in all: ≥ 5 money balls)
    { name: 'p_rest', play: 'threeptUntilStandings', ms: 70000, postMs: 0, rec: false, canon: true }, { name: 'p_standings', play: 'idle', ms: 6000, postMs: 0, playKind: 'wait', canon: true },
    rack('p_rack6'), rack('p_rack7'), { name: 'p_final', play: 'threeptUntilStandings', ms: 70000, postMs: 0, rec: false, canon: false }, { name: 'p_result', play: 'waitOnly', ms: 8000, postMs: 0, canon: false },
  ] },
  { id: 'carnival', mode: 'carnival', qs: '&events=slam_rush', takes: [
    { name: 'c_slam1', play: 'slam', holdMs: 950, after: 900, postMs: 300, canon: true }, { name: 'c_slam2', play: 'slam', holdMs: 700, after: 900, postMs: 300, canon: true }, { name: 'c_slam3', play: 'slam', holdMs: 1100, after: 900, postMs: 300, canon: true },
    { name: 'c_slam4', play: 'slam', holdMs: 850, after: 900, postMs: 300, canon: false }, { name: 'c_slam5', play: 'slam', holdMs: 1000, after: 900, postMs: 300, canon: false },
    { name: 'c_settle', play: 'carnivalSettle', ms: 30000, after: 3500, postMs: 0, canon: true },
  ] },
];
/** HUNT=<take>:<from>-<to>,… — a supplemental hunt for a rare action (the runners' SUPP / AIDUNK / AIJ3 runs, folded): named repeats
 *  <take>~<from> … <take>~<to> join the take's session and ONLY they run there. Pair it with ACTIONS=<the action> and
 *  AOFF=<action>:<n> (the n attempts already in the tag): the new attempts are numbered after them and merged in. */
const HUNT = (process.env.HUNT ?? '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const m = /^([^:]+):(\d+)-(\d+)$/.exec(x); if (!m) throw new Error(`HUNT ${x}: want <take>:<from>-<to>`); return { base: m[1], from: Number(m[2]), to: Number(m[3]) }; });
const huntNames = new Set<string>();
for (const h of HUNT) {
  const s = SESSIONS.find((x) => x.takes.some((t) => t.name === h.base)); if (!s) throw new Error(`HUNT: no take ${h.base}`);
  const src = s.takes.find((t) => t.name === h.base)!;
  for (let k = h.from; k <= h.to; k++) { const name = `${h.base}~${k}`; if (!s.takes.some((t) => t.name === name)) s.takes.push({ ...src, name, canon: false }); huntNames.add(name); }
}
/** AOFF=<action>:<n>,… — attempts of that action already in the tag: this run numbers its attempts after them and keeps them. */
const AOFF: Record<string, number> = Object.fromEntries((process.env.AOFF ?? '').split(',').filter(Boolean).map((x) => { const [k, v] = x.split(':'); return [k.trim(), Number(v)]; }));
// 3PT's standings take uses P.idle with no agent: make it a plain wait
for (const t of SESSIONS.find((s) => s.id === '3pt')!.takes) if (t.playKind === 'wait') t.play = 'waitOnly';
{ const names = SESSIONS.flatMap((s) => s.takes.map((t) => t.name)); const dup = names.filter((n, i) => names.indexOf(n) !== i); if (dup.length) throw new Error(`duplicate take names: ${dup.join(', ')}`); }

interface Anchor {
  /** 'me' | 'foe' | 'mate*' | 'foe*' | 'b*' | 'ai' (any body but me) */
  body: string;
  clip?: RegExp; ballTo?: boolean; ballFrom?: boolean; start?: boolean;
  /** ballTo: the last body to hold it before (a pattern like body), how many frames it was loose first, and whether it
   *  ARRIVED (in the hand's reach the frame before — a reset puts the ball in the palm from wherever it was: not a catch) */
  from?: string; minFree?: number; arrives?: boolean;
  /** ballTo: the receiver did not TELEPORT that frame (< 0.3 m of root) — a board is a palm warp here (the ball jumps to the
   *  hand), which is the rebound as the game draws it; a possession reset moves the body too, and is not one */
  still?: boolean;
  state?: (s: Record<string, unknown>, prev: Record<string, unknown> | null, bodyId: string) => boolean;
  where?: (s: Record<string, unknown>, bodyId: string) => boolean;
  /** the subject's root within this many metres of the rim at the onset; the subject holds the ball within 20 frames of it (a
   *  no-ball body frozen in a gather end pose is not a layup; a jumper's charge-gather tell is not a dunk) */
  nearRim?: number; holds?: boolean;
  /** the frame the mode logs a line matching this (HM.marks, virtual time) — for events drawn without a clip or a ball edge */
  mark?: RegExp;
}
interface ActionDef { id: string; label: string; who: 'hero' | 'ai'; family: string; kind: string; session: SessionId; also?: SessionId[]; takes: string[] | '*'; anchor: Anchor; pre: number; post: number; supplemental?: boolean }
const sessionsOf = (a: ActionDef): SessionId[] => [a.session, ...(a.also ?? [])];
const A = (id: string, label: string, family: string, kind: string, session: SessionId, takes: string[] | '*', anchor: Anchor, pre = 500, post = 1500): ActionDef =>
  ({ id, label, who: anchor.body === 'me' ? 'hero' : 'ai', family, kind, session, takes, anchor, pre, post });
const SHOT_START = /pullup_gather|stepback_gather|set_gather|jumpshot|shoot_jumper/;
/** A dunk's first clip — not the celebration, whose clips are dunk_* too (measured: a 3v3 "dunk" anchored on dunk_mc_celebrate_big). */
const DUNK = /^dunk_(?!.*celeb)/;
const FINISH = /layup|finger_roll|scoop|mikan|reverse/;
const ANY_FINISH = /layup|finger_roll|scoop|mikan|reverse|hook|floater|euro/;
/** A take name plus every named repeat of it in its session (`o_set` → o_set, o_set~2 …): the action's attempts. */
const withReps = (names: string[]): string[] => { const all = SESSIONS.flatMap((s) => s.takes.map((t) => t.name)); const out: string[] = []; for (const n of names) for (const x of all) if ((x === n || x.startsWith(n + '~')) && !out.includes(x)) out.push(x); return out; };
const CATALOGUE: ActionDef[] = [
  // ── 1v1, my possession: the hero ──
  A('hero_1v1_idle', 'dribble idle at the check', 'idles/reactions', 'idle', '1v1-off', withReps(['o_set']), { body: 'me', start: true }, 0, 450),
  A('hero_1v1_jumper_set', 'set jumper (standing)', 'jumpers', 'shot', '1v1-off', withReps(['o_set']), { body: 'me', clip: SHOT_START }, 450, 1700),
  A('hero_1v1_pullup', 'pull-up jumper off the dribble', 'jumpers', 'shot', '1v1-off', withReps(['o_pullup']), { body: 'me', clip: SHOT_START }, 450, 1700),
  A('hero_1v1_fade', 'fadeaway (giving ground)', 'jumpers', 'shot', '1v1-off', withReps(['o_fade']), { body: 'me', clip: /fade|pullup_gather|jumpshot/ }, 450, 1700),
  A('hero_1v1_stepback', 'step-back jumper', 'jumpers', 'shot', '1v1-off', withReps(['o_stepback']), { body: 'me', clip: /stepback/ }, 450, 1800),
  A('hero_1v1_layup', 'driving layup (in from the wing)', 'layups/floaters/hooks', 'finish', '1v1-off', withReps(['o_layup', 'o_layup2', 'o_layup3', 'o_layup4', 'o_layup5', 'o_layup6', 'o_layup7', 'o_layup8', 'o_layup9']), { body: 'me', clip: FINISH }, 600, 1600),
  A('hero_1v1_floater', 'floater (2.2–3.4 m, not at speed)', 'layups/floaters/hooks', 'finish', '1v1-off', withReps(['o_floater']), { body: 'me', clip: /floater|layup|finger_roll|mikan|jumpshot|pullup_gather/ }, 600, 1600),
  A('hero_1v1_dunk', 'game dunk off the drive', 'game dunks', 'dunk', '1v1-off', withReps(['o_dunk', 'o_dunk_base', 'o_dunk_wing', 'o_dunk_slow', 'o_dunk_jog', 'o_dunk_poster', 'o_dunk_standing', 'o_dunk_spin']), { body: 'me', clip: DUNK }, 700, 2000),
  A('hero_1v1_cross', 'crossover (R stick)', 'handles', 'handle', '1v1-off', withReps(['o_cross', 'o_crossover_stand', 'o_crossover_fast']), { body: 'me', clip: /crossover/ }, 400, 1000),
  A('hero_1v1_between', 'between the legs (R stick)', 'handles', 'handle', '1v1-off', withReps(['o_between', 'o_between_stand', 'o_between_fast']), { body: 'me', clip: /between/ }, 400, 1000),
  A('hero_1v1_behind', 'behind the back (R stick)', 'handles', 'handle', '1v1-off', withReps(['o_behind', 'o_behind_stand', 'o_behind_fast']), { body: 'me', clip: /behind/ }, 400, 1000),
  A('hero_1v1_spin', 'spin move (R stick sweep)', 'handles', 'handle', '1v1-off', withReps(['o_spin', 'o_spin_stand', 'o_spin_fast']), { body: 'me', clip: /spin(?!_layup)/ }, 400, 1100),
  A('hero_1v1_hesi', 'hesitation (R stick toward the ball)', 'handles', 'handle', '1v1-off', withReps(['o_hesi', 'o_hesi_stand', 'o_hesi_fast']), { body: 'me', clip: /hesi|jab/ }, 400, 1000),
  A('hero_1v1_inout', 'in-and-out (R stick up)', 'handles', 'handle', '1v1-off', withReps(['o_inout', 'o_inout_stand', 'o_inout_fast']), { body: 'me', clip: /feint|in_and_out|inout/ }, 400, 1000),
  A('hero_1v1_post_hook', 'post hook', 'post moves', 'finish', '1v1-off', withReps(['o_hook']), { body: 'me', clip: /hook/ }, 600, 1500),
  A('hero_1v1_dropstep', 'drop step', 'post moves', 'post', '1v1-off', withReps(['o_dropstep']), { body: 'me', clip: /drop_step/ }, 500, 1500),
  A('hero_1v1_shimmy_fade', 'shimmy fade', 'post moves', 'shot', '1v1-off', withReps(['o_shimmy']), { body: 'me', clip: /shimmy|fade/ }, 500, 1700),
  A('hero_1v1_up_and_under', 'pump fake → up and under', 'post moves', 'post', '1v1-off', withReps(['o_upunder']), { body: 'me', clip: /pump_fake|step_through|up_and_under/ }, 500, 1700),
  A('hero_1v1_post_up', 'post-up (backing down)', 'post moves', 'post', '1v1-off', withReps(['o_hook', 'o_dropstep', 'o_shimmy', 'o_upunder']), { body: 'me', clip: /post_up/ }, 300, 1000),
  A('hero_1v1_rebound', 'rebound (ball recovered after a miss)', 'rebounds/box-out', 'rebound', '1v1-off', withReps(['o_rebound', 'o_rebound3', 'o_rebound5']), { body: 'me', ballTo: true, minFree: 20, still: true }, 900, 700),
  A('hero_1v1_celebrate', 'celebration after a make', 'idles/reactions', 'react', '1v1-off', '*', { body: 'me', clip: /celebrate/ }, 200, 1100),
  A('hero_1v1_drive', 'dribble drive (run with the ball)', 'handles', 'move', '1v1-off', withReps(['o_layup', 'o_dunk']), { body: 'me', clip: /dribble_run|dribble_jog|drive/ }, 200, 900),
  // ── 1v1, my possession: the AI defender ──
  A('ai_1v1_def_slide', 'defensive slide', 'defense', 'defense', '1v1-off', '*', { body: 'foe', clip: /defend_slide|slide_hard/ }, 300, 900),
  A('ai_1v1_def_backpedal', 'backpedal', 'defense', 'defense', '1v1-off', '*', { body: 'foe', clip: /backpedal/ }, 300, 900),
  A('ai_1v1_closeout', 'closeout', 'defense', 'defense', '1v1-off', '*', { body: 'foe', clip: /closeout/ }, 300, 900),
  A('ai_1v1_contest', 'contest (hand up)', 'defense', 'defense', '1v1-off', '*', { body: 'foe', clip: /hand_up/ }, 300, 1000),
  A('ai_1v1_block', 'block attempt', 'defense', 'defense', '1v1-off', '*', { body: 'foe', clip: /block_reach/ }, 300, 1000),
  A('ai_1v1_steal', 'steal poke', 'defense', 'defense', '1v1-off', '*', { body: 'foe', clip: /steal_reach/ }, 300, 800),
  A('ai_1v1_react', 'reaction (bump / ankle break / poster)', 'idles/reactions', 'react', '1v1-off', '*', { body: 'foe', clip: /contact_react|ankle|stumble|slip|knockdown/ }, 200, 1100),
  A('ai_1v1_boxout', 'box-out (defender seals on the miss)', 'rebounds/box-out', 'defense', '1v1-off', withReps(['o_rebound', 'o_rebound2', 'o_rebound3', 'o_rebound4', 'o_rebound5']), { body: 'foe', state: (s, p) => s.fj === 'boxout' && (!p || p.fj !== 'boxout') }, 300, 1000),
  A('ai_1v1_rebound', 'rebound (the defender comes down with it)', 'rebounds/box-out', 'rebound', '1v1-off', withReps(['o_rebound', 'o_rebound2', 'o_rebound3', 'o_rebound4', 'o_rebound5']), { body: 'foe', ballTo: true, minFree: 20, still: true }, 900, 700),
  // ── 1v1, his possession: the hero defends ──
  A('hero_1v1_def_stance', 'defensive stance', 'defense', 'defense', '1v1-def', '*', { body: 'me', clip: /defend_stance/ }, 200, 800),
  A('hero_1v1_def_slide', 'defensive slide', 'defense', 'defense', '1v1-def', '*', { body: 'me', clip: /defend_slide|slide_hard/ }, 300, 900),
  A('hero_1v1_def_backpedal', 'backpedal', 'defense', 'defense', '1v1-def', '*', { body: 'me', clip: /backpedal/ }, 300, 900),
  A('hero_1v1_def_closeout', 'closeout', 'defense', 'defense', '1v1-def', '*', { body: 'me', clip: /closeout/ }, 300, 900),
  A('hero_1v1_def_contest', 'contest (hand up)', 'defense', 'defense', '1v1-def', withReps(['d_contest1', 'd_contest2']), { body: 'me', clip: /hand_up/ }, 300, 1000),
  A('hero_1v1_def_block', 'block (on the gather)', 'defense', 'defense', '1v1-def', withReps(['d_block1', 'd_block2']), { body: 'me', clip: /block_reach/ }, 300, 1100),
  A('hero_1v1_def_steal', 'steal poke', 'defense', 'defense', '1v1-def', withReps(['d_steal1', 'd_steal2']), { body: 'me', clip: /steal_reach/ }, 300, 900),
  A('hero_1v1_react', 'reaction (bumped / posterized / charge)', 'idles/reactions', 'react', '1v1-def', '*', { body: 'me', clip: /contact_react|knockdown|get_up/ }, 200, 1100),
  A('hero_1v1_boxout', 'box-out (L2 held on his miss)', 'rebounds/box-out', 'defense', '1v1-def', withReps(['d_box1']), { body: 'me', clip: /box|post_up|defend_stance/ }, 300, 1000),
  // ── 1v1, his possession: the AI attacks ──
  A('ai_1v1_drive', 'drive (dribble run)', 'handles', 'move', '1v1-def', '*', { body: 'foe', clip: /dribble_run|dribble_jog|drive/ }, 200, 900),
  A('ai_1v1_cross', 'crossover', 'handles', 'handle', '1v1-def', '*', { body: 'foe', clip: /crossover/ }, 400, 1000),
  A('ai_1v1_hesi', 'hesitation / step-back', 'handles', 'handle', '1v1-def', '*', { body: 'foe', clip: /hesi/ }, 400, 1000),
  A('ai_1v1_jumper', 'pull-up jumper', 'jumpers', 'shot', '1v1-def', '*', { body: 'foe', clip: /jumpshot/ }, 500, 1600),
  A('ai_1v1_layup', 'layup', 'layups/floaters/hooks', 'finish', '1v1-def', '*', { body: 'foe', clip: /layup/, holds: true }, 500, 1500),
  A('ai_1v1_dunk', 'dunk', 'game dunks', 'dunk', '1v1-def', '*', { body: 'foe', clip: DUNK, nearRim: 4.0, holds: true }, 600, 1900),
  A('ai_1v1_idle', 'check / idle with the ball', 'idles/reactions', 'idle', '1v1-def', '*', { body: 'foe', clip: /dribble_idle|idle_stand/ }, 0, 600),
  A('ai_1v1_celebrate', 'celebration after his make', 'idles/reactions', 'react', '1v1-def', '*', { body: 'foe', clip: /celebrate/ }, 200, 1100),
  // ── 3v3, my possession ──
  A('hero_3v3_jumper_set', 'set jumper', 'jumpers', 'shot', '3v3-off', withReps(['t_set']), { body: 'me', clip: SHOT_START }, 450, 1700),
  A('hero_3v3_layup', 'driving layup (in from the wing)', 'layups/floaters/hooks', 'finish', '3v3-off', '*', { body: 'me', clip: FINISH }, 600, 1600),
  A('hero_3v3_dunk', 'game dunk', 'game dunks', 'dunk', '3v3-off', '*', { body: 'me', clip: DUNK }, 700, 2000),
  A('hero_3v3_cross', 'crossover (R stick)', 'handles', 'handle', '3v3-off', withReps(['t_cross', 't_crossover_stand', 't_crossover_fast']), { body: 'me', clip: /crossover/ }, 400, 1000),
  A('hero_3v3_pass', 'pass (the ball leaves my hands)', 'passes/catches', 'pass', '3v3-off', withReps(['t_pass', 't_pass2', 't_pass3', 't_oop', 't_passlong1']), { body: 'me', ballFrom: true }, 600, 900),
  A('hero_3v3_catch', 'catch (a pass from a teammate comes to me)', 'passes/catches', 'catch', '3v3-off', '*', { body: 'me', ballTo: true, from: 'mate*', minFree: 3, arrives: true }, 600, 800),
  A('hero_3v3_rebound', 'rebound', 'rebounds/box-out', 'rebound', '3v3-off', withReps(['t_rebound', 't_rebound2', 't_rebound3', 't_rebound4']), { body: 'me', ballTo: true, minFree: 20, still: true }, 900, 700),
  A('ai_3v3_catch', 'teammate catches my pass', 'passes/catches', 'catch', '3v3-off', withReps(['t_pass', 't_pass2', 't_pass3', 't_oop', 't_passlong1']), { body: 'mate*', ballTo: true, from: 'me', minFree: 3, arrives: true }, 600, 900),
  A('ai_3v3_mate_shot', 'teammate shoots (the alley-oop off my lob)', 'jumpers', 'shot', '3v3-off', withReps(['t_pass', 't_pass2', 't_pass3', 't_oop', 't_oopwait1', 't_passrim1', 't_passlong1']), { body: 'mate*', clip: /jumpshot|layup|oop|^dunk_(?!.*celeb)/ }, 500, 1600),
  A('ai_3v3_closeout', 'defender closeout', 'defense', 'defense', '3v3-off', '*', { body: 'foe*', clip: /closeout/ }, 300, 900),
  A('ai_3v3_contest', 'defender contest (hand up)', 'defense', 'defense', '3v3-off', '*', { body: 'foe*', clip: /hand_up/ }, 300, 1000),
  A('ai_3v3_block', 'defender block', 'defense', 'defense', '3v3-off', '*', { body: 'foe*', clip: /block_reach/ }, 300, 1000),
  A('ai_3v3_slide', 'defender slide', 'defense', 'defense', '3v3-off', '*', { body: 'foe*', clip: /defend_slide|slide_hard/ }, 300, 900),
  A('ai_3v3_rebound', 'AI rebound', 'rebounds/box-out', 'rebound', '3v3-off', withReps(['t_rebound', 't_rebound2', 't_rebound3', 't_rebound4']), { body: 'ai', ballTo: true, minFree: 20, still: true }, 900, 700),
  A('ai_3v3_boxout', 'AI box-out', 'rebounds/box-out', 'defense', '3v3-off', withReps(['t_rebound', 't_rebound2', 't_rebound3', 't_rebound4', 't_set']), { body: 'ai', state: (s, p, id) => boxing(s, id) && !(p && boxing(p, id)) }, 300, 1000),
  A('ai_3v3_offball', 'teammate off-ball run (no ball)', 'idles/reactions', 'move', '3v3-off', '*', { body: 'mate*', clip: /drive|run|jog|sprint|cut/, where: (s, id) => s.cr !== id }, 200, 900),
  // ── 3v3, their possession ──
  A('hero_3v3_def_slide', 'defensive slide', 'defense', 'defense', '3v3-def', '*', { body: 'me', clip: /defend_slide|slide_hard/ }, 300, 900),
  A('hero_3v3_def_contest', 'contest (hand up)', 'defense', 'defense', '3v3-def', withReps(['e_contest1', 'e_contest2']), { body: 'me', clip: /hand_up/ }, 300, 1000),
  A('hero_3v3_def_block', 'block', 'defense', 'defense', '3v3-def', withReps(['e_block1']), { body: 'me', clip: /block_reach/ }, 300, 1100),
  A('hero_3v3_def_steal', 'steal poke', 'defense', 'defense', '3v3-def', withReps(['e_steal1', 'e_steal2', 'e_steal_check', 'e_steal_rim', 'e_steal_rush']), { body: 'me', clip: /steal_reach/ }, 300, 900),
  A('ai_3v3_drive', 'AI drive', 'handles', 'move', '3v3-def', '*', { body: 'foe*', clip: /dribble_run|dribble_jog|drive/ }, 200, 900),
  { ...A('ai_3v3_jumper', 'AI jumper', 'jumpers', 'shot', '3v3-def', '*', { body: 'foe*', clip: /jumpshot/ }, 500, 1600), also: ['3v3-off'] },
  A('ai_3v3_layup', 'AI layup', 'layups/floaters/hooks', 'finish', '3v3-def', '*', { body: 'foe*', clip: /layup/, holds: true }, 500, 1500),
  A('ai_3v3_dunk', 'AI dunk', 'game dunks', 'dunk', '3v3-def', '*', { body: 'foe*', clip: DUNK, nearRim: 4.0, holds: true }, 600, 1900),
  { ...A('ai_3v3_pass', 'AI pass (caught by another foe)', 'passes/catches', 'catch', '3v3-def', '*', { body: 'foe*', ballTo: true, from: 'foe*', minFree: 3, arrives: true }, 600, 900), also: ['3v3-off'] },
  A('ai_3v3_help', 'teammate help defense', 'defense', 'defense', '3v3-def', '*', { body: 'mate*', clip: /closeout|defend_slide|hand_up|block_reach/ }, 300, 900),
  // ── 3PT shootout ──
  A('hero_3pt_rack_shot', 'rack shot (regular ball)', '3PT', 'shot', '3pt', ['p_rack1', 'p_rack2', 'p_rack3', 'p_rack4', 'p_rack5', 'p_rack6', 'p_rack7'], { body: 'me', clip: /jumpshot|pullup_gather/, where: (s) => s.mo === 0 }, 500, 1700),
  A('hero_3pt_money_ball', 'money ball (last of the rack)', '3PT', 'shot', '3pt', ['p_rack1', 'p_rack2', 'p_rack3', 'p_rack4', 'p_rack5', 'p_rack6', 'p_rack7'], { body: 'me', clip: /jumpshot|pullup_gather/, where: (s) => s.mo === 1 }, 500, 1700),
  A('hero_3pt_rack_jog', 'jog to the next rack', '3PT', 'move', '3pt', ['p_rack1', 'p_rack2', 'p_rack3', 'p_rack4', 'p_rack5', 'p_rack6', 'p_rack7'], { body: 'me', clip: /^run$|_run$|jog/ }, 200, 1000),
  A('ai_3pt_react', 'sideline rival reacts to his number', '3PT', 'react', '3pt', ['p_standings', 'p_result'], { body: 'ai', clip: /celebrate|contact_react/ }, 200, 1100),
  // ── carnival ──
  A('hero_carn_slam_charge', 'Slam Rush charge (space held)', 'carnival', 'dunk', 'carnival', ['c_slam1', 'c_slam2', 'c_slam3', 'c_slam4', 'c_slam5'], { body: 'me', clip: /charge_gather/ }, 200, 1000),
  A('hero_carn_slam_launch', 'Slam Rush launch (space let go)', 'carnival', 'dunk', 'carnival', ['c_slam1', 'c_slam2', 'c_slam3', 'c_slam4', 'c_slam5'], { body: 'me', clip: /dunk_launch/ }, 300, 1000),
  A('ai_carn_react', 'hub party-goer reacts to the result', 'carnival', 'react', 'carnival', ['c_settle'], { body: 'ai', clip: /celebrate|hit_react|contact_react/ }, 200, 1100),
  // ── SUPPLEMENTAL (not in the 81-action catalogue; phase 1's runners): windows the catalogue's anchors cannot place ──
  //   ai_1v1_rebound_board — "[1V1-BOARD] foe secures it": off MY miss the rival's board is never drawn in his hands (awardBoard →
  //     startDefense teleports both bodies to the check on the frame), so the ball→foe (still) anchor can never fire; this is what
  //     the player SEES of his rebound: the pursuit (or not) up to the frame the board is his.
  //   hero_1v1_boxout_board — "[1V1-DEF] rival release" in the L2 (brace) takes: the clip anchor fires on the stance at the take's
  //     first frame, not on the box-out.
  //   hero_3v3_rebound_board — "[3V3-BOARD] me secures it" / "board → me", both possessions, drawn or not.
  //   hero_1v1_drive_finish / hero_3v3_drive_finish — whatever finish the WING DRIVE actually plays (a running hook or a euro
  //     floater as often as a layup): the motion a player sees when he drives and squeezes.
  { ...A('ai_1v1_rebound_board', "the rival's board as the mode calls it ('[1V1-BOARD] foe secures it')", 'rebounds/box-out', 'rebound', '1v1-off', '*', { body: 'foe', mark: /\[1V1-BOARD\] foe secures it/ }, 1200, 900), also: ['1v1-def'], supplemental: true },
  { ...A('hero_1v1_boxout_board', 'box-out through his shot and the board (L2 held; anchored on his release)', 'rebounds/box-out', 'defense', '1v1-def', withReps(['d_box1']), { body: 'me', mark: /\[1V1-DEF\] rival release/ }, 300, 1600), supplemental: true },
  { ...A('hero_3v3_rebound_board', "my board as the mode calls it ('[3V3-BOARD] me secures it' / 'board → me')", 'rebounds/box-out', 'rebound', '3v3-off', '*', { body: 'me', mark: /\[3V3-BOARD\] me secures it|\[3V3-OFF\] board → me/ }, 1200, 900), also: ['3v3-def'], supplemental: true },
  { ...A('hero_1v1_drive_finish', "the wing drive's finish, whatever it reads (hook / finger roll / euro floater / layup / mikan)", 'layups/floaters/hooks', 'finish', '1v1-off', withReps(['o_layup', 'o_layup2', 'o_layup3', 'o_layup4', 'o_layup5', 'o_layup6', 'o_layup7', 'o_layup8', 'o_layup9']), { body: 'me', clip: ANY_FINISH }, 600, 1600), supplemental: true },
  { ...A('hero_3v3_drive_finish', "3v3 wing drive's finish, whatever it reads", 'layups/floaters/hooks', 'finish', '3v3-off', withReps(['t_layup', 't_layup2', 't_layup3', 't_layup4', 't_layup5', 't_layup6', 't_layup7', 't_layup_open', 't_layup_screen']), { body: 'me', clip: ANY_FINISH }, 600, 1600), supplemental: true },
];
/** Per-action caps above REPS: the drive finishes keep one per approach; the post-up its instances across the four reads. */
const MAXA: Record<string, number> = { hero_1v1_layup: 8, hero_1v1_drive_finish: 9, hero_3v3_drive_finish: 10, hero_1v1_post_up: 8, hero_3v3_layup: 6, hero_3pt_rack_shot: 8, hero_1v1_dunk: 14, hero_3v3_dunk: 11 };
const capOf = (id: string) => (REPS === 1 ? 1 : Math.max(REPS, MAXA[id] ?? 0));
function nameSeed(n: string): number { let h = 2166136261; for (let i = 0; i < n.length; i++) { h ^= n.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 997; }
function boxing(s: Record<string, unknown>, id: string): boolean { return typeof s.jb === 'string' && new RegExp(`(^| )${id}:[^ ]*!`).test(s.jb) ; }
const byId = new Map(CATALOGUE.map((a) => [a.id, a]));
{ const dup = CATALOGUE.map((a) => a.id).filter((n, i, arr) => arr.indexOf(n) !== i); if (dup.length) throw new Error(`duplicate action ids: ${dup.join(', ')}`); }
for (const a of CATALOGUE) if (a.takes !== '*') for (const n of a.takes) if (!SESSIONS.some((s) => sessionsOf(a).includes(s.id) && s.takes.some((t) => t.name === n))) throw new Error(`${a.id} names a take that is not in its session: ${n}`);

if (process.env.LIST === '1') {
  const fams = [...new Set(CATALOGUE.map((a) => a.family))];
  for (const fam of fams) {
    console.log(`\n${fam}`);
    for (const a of CATALOGUE.filter((x) => x.family === fam)) console.log(`  ${a.id.padEnd(26)} ${a.who.padEnd(5)} ${sessionsOf(a).join('+').padEnd(9)} ${a.label}${a.supplemental ? ' [supplemental]' : ''}  [${a.anchor.clip ? a.anchor.clip.source : a.anchor.ballTo ? 'ball → body' : a.anchor.ballFrom ? 'ball leaves body' : a.anchor.state ? 'state' : a.anchor.mark ? 'mark ' + a.anchor.mark.source : 'take start'} on ${a.anchor.body}] takes ${a.takes === '*' ? '*' : a.takes.length}`);
  }
  console.log(`\n${CATALOGUE.length} actions (${CATALOGUE.filter((a) => !a.supplemental).length} catalogue + ${CATALOGUE.filter((a) => a.supplemental).length} supplemental) · sessions ${SESSIONS.map((s) => `${s.id} ${s.takes.filter((t) => t.canon).length}+${s.takes.filter((t) => !t.canon).length} takes`).join(', ')}`);
  process.exit(0);
}
const want = (process.env.ACTIONS ?? 'all').split(',').map((s) => s.trim()).filter(Boolean);
const ACTS = want.includes('all') ? CATALOGUE : CATALOGUE.filter((a) => want.includes(a.id) || sessionsOf(a).some((x) => want.includes(x)));
for (const w of want) if (w !== 'all' && !byId.has(w) && !SESSIONS.some((s) => s.id === w)) throw new Error(`unknown action ${w} (LIST=1 prints the catalogue)`);
fs.mkdirSync(OUT, { recursive: true });

// ── recordings ──────────────────────────────────────────────────────────────────────────────────────────────────────
type V3 = [number, number, number];
/** hf: where the face points (world); dh: the drawn hands per side — [hand centroid, arm tip], each [x,y,z] or null (phase 2a) */
/** c: the playing groups above weight 0.02 as [name, weight] or [name, 1, −1] for a group whose weight was never set; cz (2a): the
 *  groups PLAYING at weight ≤ 0.02 (a clip stranded at 0 by the crossFade re-entrancy shows here frame after frame); an (2a): the
 *  running animatables on the Hips node (the scene's count, not the groups'); ao (2a): ORPHAN animatables — running, but no longer
 *  listed by their group (the hotfix's end-callback restart) — as [group, max weight, count] */
interface BodyFrame { rp: number[]; rq: number[] | null; rr: number[]; rs: number[]; q: number[]; hp: number[] | null; j: (number[] | null)[]; jt: Record<string, [number, number, number]>; c: ([string, number] | [string, number, number])[]; cz?: string[]; hf?: number[] | null; dh?: Record<string, [number[] | null, number[] | null]> | null; an?: number; ao?: [string, number, number][] }
interface Frame { t: number; B: Record<string, BodyFrame>; ball?: number[]; bp?: string; bb?: string; bh?: string; br?: boolean; be?: number; s: Record<string, unknown> }
interface Mark { t: number; msg: string }
interface TakeData { session: SessionId; take: string; bodies: Record<string, string[]>; frames: Frame[]; marks: Mark[]; meta: Record<string, unknown> }
interface Rec { attempt?: number; action: string; label: string; who: string; kind: string; family: string; session: SessionId; take: string; subject: string; anchorT: number; anchorClip: string; pre: number; post: number; bodies: Record<string, string[]>; frames: Frame[]; marks: Mark[]; meta: Record<string, unknown> }

const JN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
const J = Object.fromEntries(JN.map((n, i) => [n, i])) as Record<string, number>;
const RIM: V3 = [0, 3.05, -0.6];   // every hoops mode's rim (OneVOneMode / ThreeVThreeMode / ThreePointMode: RIM = (0, 3.05, −0.6))
const clipName = (n: string) => n.replace(/(_c\d+)+$/, '').replace(/\s*\(.*\)$/, '');
const bodyMatches = (pat: string, id: string) => pat === id || (pat === 'ai' && id !== 'me') || (pat.endsWith('*') && id.startsWith(pat.slice(0, -1)));

function clipMatch(bf: BodyFrame | undefined, re: RegExp): string | null {
  if (!bf) return null;
  let best: string | null = null, bw = 0;
  for (const [n, w] of bf.c) { const c = clipName(n); if (w >= 0.1 && re.test(c) && w > bw) { bw = w; best = c; } }
  return best;
}
/** Every onset of an action in a take (a clip starting, the ball arriving / leaving, a state edge, a logged mark), per matching body. */
function anchorsIn(td: TakeData, act: ActionDef): { i: number; body: string; clip: string }[] {
  const out: { i: number; body: string; clip: string }[] = [];
  const fr = td.frames; if (!fr.length) return out;
  const ids = Object.keys(td.bodies).filter((id) => bodyMatches(act.anchor.body, id));
  const an = act.anchor;
  // AUDIT 2026-09-25: recordings start at the prep's reset (the page's recPrep). A play anchor (the take's start, the ball changing
  // hands, a state edge) is searched from the play's first frame (tPlay) — the prep hands the ball over by a warp; a CLIP onset may
  // fall in the settle but must be a real 0.5 crossing seen in the recording (i > 0): a clip already on at the first recorded frame
  // began before it, and anchoring there put the window on the wrong frame (74 of 382 baseline recordings).
  const tPlay = typeof td.meta.tPlay === 'number' ? (td.meta.tPlay as number) : -Infinity;
  const i0 = Math.max(0, fr.findIndex((f) => f.t > tPlay));
  const tEnd = fr[fr.length - 1].t;
  for (const id of ids) {
    if (an.start) { const i = fr.findIndex((f, k) => k >= i0 && f.B[id]); if (i >= 0) out.push({ i, body: id, clip: topClip(fr[i].B[id]) }); continue; }
    if (an.mark) { let la = -1e9; for (const m of td.marks) { if (!an.mark.test(m.msg) || m.t - la < act.post) continue; const i = fr.findIndex((f) => f.t >= m.t); if (i < 0 || !fr[i].B[id] || tEnd - fr[i].t < Math.min(act.post, 600)) continue; la = m.t; out.push({ i, body: id, clip: 'mark: ' + m.msg.slice(0, 70) }); } continue; }
    /** CLIP ONSET = the frame the matching clip's weight crosses 0.5 upward (it becomes the body's pose), or the take's first
     *  frame if it already is. A "no match in the last 4 frames" test missed every clip that starts at the take or never
     *  fades fully behind the next (measured: the hero's hand_up in both contest takes). */
    const wOf = (i: number): number => { const b = fr[i]?.B[id]; if (!b || !an.clip) return 0; let w = 0; for (const [n, x] of b.c) if (an.clip.test(clipName(n))) w = Math.max(w, x); return w; };
    const lastHolder = (i: number): { id: string; free: number } => { let free = 0; for (let k = i - 1; k >= 0 && k >= i - 240; k--) { const h = holderOf(fr[k]); if (h) return { id: h, free }; free++; } return { id: '', free }; };
    const hit = (i: number): string | null => {
      const f = fr[i]; if (!f || !f.B[id]) return null;
      if (an.where && !an.where(f.s, id)) return null;
      if (an.nearRim != null) { const b0 = f.B[id]; if (!b0 || Math.hypot(b0.rp[0] - RIM[0], b0.rp[2] - RIM[2]) > an.nearRim) return null; }
      if (an.holds) { let ok = false; for (let k = Math.max(0, i - 20); k <= Math.min(fr.length - 1, i + 20); k++) if (holderOf(fr[k]) === id) { ok = true; break; } if (!ok) return null; }
      if (an.clip) { if (i === 0) return null; const w = wOf(i); if (w < 0.5) return null; if (wOf(i - 1) >= 0.5) return null; return clipMatch(f.B[id], an.clip); }
      if (i < i0) return null;
      if (an.ballTo) {
        if (holderOf(f) !== id || (i > 0 && holderOf(fr[i - 1]) === id)) return null;
        const lh = lastHolder(i);
        if (an.from && !(lh.id && bodyMatches(an.from, lh.id) && lh.id !== id)) return null;
        if (an.minFree && lh.free < an.minFree) return null;
        if (an.still && i > 0) { const a = fr[i].B[id], b = fr[i - 1].B[id]; if (!a || !b || len(sub(a.rp, b.rp)) > 0.3) return null; }
        if (an.arrives && i > 0) { const pb = fr[i - 1].ball, b = fr[i - 1].B[id]; const hands = b ? [b.j[J.LeftHand], b.j[J.RightHand]].filter((h): h is number[] => !!h) : []; if (!pb || !hands.length || Math.min(...hands.map((h) => len(sub(pb, h)))) > 0.9) return null; }
        const pb = i > 0 ? fr[i - 1].ball : null, bb2 = fr[i].B[id]; const hands = bb2 ? [bb2.j[J.LeftHand], bb2.j[J.RightHand]].filter((h): h is number[] => !!h) : [];
        const warp = pb && hands.length ? Math.min(...hands.map((h) => len(sub(pb, h)))) : NaN;
        return `ball→${id} from ${lh.id || 'loose'} after ${lh.free} loose frames, ${isFinite(warp) ? warp.toFixed(2) : '?'} m from the hand the frame before (${f.bp || 'the dribble'})`;
      }
      if (an.ballFrom) return i > 0 && holderOf(f) !== id && holderOf(fr[i - 1]) === id ? `ball left ${id} (${fr[i - 1].bp || 'the dribble'})${f.bb ? ' to ' + f.bb : f.br ? ' released' : ''}` : null;
      if (an.state) return an.state(f.s, i > 0 ? fr[i - 1].s : null, id) ? 'state' : null;
      return null;
    };
    let lastAt = -1e9;
    for (let i = 0; i < fr.length; i++) {
      // AUDIT 2026-09-25: an onset the take ends right after is not a measurement (baseline: ai_1v1_idle a4 had ONE frame, def_stance
      // a4 twelve — SPARC shrinks with the window, so a truncated one reads smoother). At least min(post, 600) ms must follow.
      if (tEnd - fr[i].t < Math.min(act.post, 600)) break;
      const h = hit(i); if (!h) continue;
      if (fr[i].t - lastAt < act.post) continue;
      lastAt = fr[i].t;
      out.push({ i, body: id, clip: h });
    }
  }
  return out.sort((a, b) => a.i - b.i);
}
function topClip(bf: BodyFrame | undefined): string { if (!bf || !bf.c.length) return ''; return clipName(bf.c.slice().sort((a, b) => b[1] - a[1])[0][0]); }
/** Run-length timeline of each body's top clip over a take: what played, for the status report. */
function timeline(td: TakeData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const id of Object.keys(td.bodies)) {
    const runs: [string, number, number][] = [];
    for (const f of td.frames) { const c = topClip(f.B[id]) || '-'; const r = runs[runs.length - 1]; if (r && r[0] === c) r[2] = f.t; else runs.push([c, f.t, f.t]); }
    o[id] = runs.filter((r) => r[2] - r[1] >= 50 || runs.length < 30).map((r) => `${r[0].replace(/^bball_/, '')}(${((r[2] - r[1]) / 1000).toFixed(2)})`).join(' → ').slice(0, 1600);
  }
  return o;
}

// ── measurement: the dunk probe's definitions, per subject body, over the action window ─────────────────────────────
const sub = (a: number[], b: number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angleAt = (a: number[], m: number[], b: number[]) => { const u = sub(a, m), v = sub(b, m); return (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (len(u) * len(v) || 1)))) * 180) / Math.PI; };
const angleBetween = (u: number[], v: number[]) => (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / ((len(u) * len(v)) || 1)))) * 180) / Math.PI;
function fft(re: number[], im: number[]): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let size = 2; size <= n; size <<= 1) {
    const ang = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) for (let k = 0; k < size / 2; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
      const xr = re[i + k + size / 2] * wr - im[i + k + size / 2] * wi, xi = re[i + k + size / 2] * wi + im[i + k + size / 2] * wr;
      re[i + k + size / 2] = re[i + k] - xr; im[i + k + size / 2] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi;
    }
  }
}
/** SPARC (Balasubramanian 2015), exactly as the dunk probe: ~−1.5 is one smooth reach; more negative is jerkier. */
function sparc(speed: number[], fs: number, fc = 10, amp = 0.05, pad = 4): number {
  if (speed.length < 8) return NaN;
  const nfft = 1 << (Math.ceil(Math.log2(speed.length)) + pad);
  const re = new Array(nfft).fill(0), im = new Array(nfft).fill(0);
  speed.forEach((v, i) => { re[i] = v; });
  fft(re, im);
  const mag = re.map((r, i) => Math.hypot(r, im[i]));
  const mx = Math.max(...mag.slice(0, nfft / 2)) || 1;
  const df = fs / nfft; const sel: number[] = [];
  for (let i = 0; i * df <= fc && i < nfft / 2; i++) sel.push(mag[i] / mx);
  let last = 0; sel.forEach((m, i) => { if (m >= amp) last = i; });
  const cut = sel.slice(0, last + 1);
  let s = 0; for (let i = 1; i < cut.length; i++) s += Math.hypot(df / fc, cut[i] - cut[i - 1]);
  return -s;
}
function yawOf(b: BodyFrame): number { if (b.rq) { const [x, y, z, w] = b.rq; return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + x * x)); } return b.rr[1]; }
function local(b: BodyFrame, p: number[]): V3 { const d = sub(p, b.rp); const a = -yawOf(b); const c = Math.cos(a), s = Math.sin(a); return [d[0] * c + d[2] * s, d[1], -d[0] * s + d[2] * c]; }
/** AUDIT 2026-09-25: NORMALISED. The recorder rounds every component to 5 decimals, so an unchanged rotation's self-dot is |q|² ≠ 1 and
 *  acos read it as motion: a bone that never moved read 5.9°/s (rig LeftHand) or 19.6°/s (rig RightHand) on every frame — which is
 *  why "held <8°/s" said LeftHand 1.00 / RightHand 0.00 on all 382 baseline recordings. Both hands' local rotations are in fact
 *  CONSTANT in every one of them. The dunk probe had the same (un-normalised) formula until 2a; pops (≥600°/s) and whips are unaffected. */
function qAngleDeg(a: number[], b: number[]): number { const na = Math.hypot(a[0], a[1], a[2], a[3]) || 1, nb = Math.hypot(b[0], b[1], b[2], b[3]) || 1; const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) / (na * nb); return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI; }
/** Where the body FACES as drawn: the feet's heel→toe line (the runtime rig is mirrored, so the root's yaw is not trusted). */
function facing(b: BodyFrame): V3 {
  const v: number[] = [0, 0, 0]; let n = 0;
  for (const sd of ['Left', 'Right']) { const f = b.j[J[sd + 'Foot']], t = b.j[J[sd + 'ToeBase']]; if (f && t) { v[0] += t[0] - f[0]; v[2] += t[2] - f[2]; n++; } }
  if (!n) { const y = yawOf(b); return [Math.sin(y), 0, Math.cos(y)]; }
  const l = Math.hypot(v[0], v[2]) || 1; return [v[0] / l, 0, v[2] / l];
}
/** The body's own right, as drawn: up × forward in Babylon's left-handed world (+x for a body facing +z). */
const rightOf = (fwd: V3): V3 => [fwd[2], 0, -fwd[0]];
/** Which side of the body a point is DRAWN on — 'R' is the athlete's own right hand side. */
function visSide(b: BodyFrame, p: number[]): 'R' | 'L' | '' { const h = b.j[J.Hips]; if (!h) return ''; const d = dot(sub(p, h), rightOf(facing(b))); return Math.abs(d) < 0.03 ? '' : d > 0 ? 'R' : 'L'; }
const pctl = (a: number[], p: number) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const r2 = (x: number) => (isFinite(x) ? Math.round(x * 100) / 100 : x);
const r3 = (x: number) => (isFinite(x) ? Math.round(x * 1000) / 1000 : x);
/** Closest distance between two segments (the torso capsules of two bodies). */
function segDist(p1: number[], q1: number[], p2: number[], q2: number[]): number {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2); const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) return len(r);
  if (a <= 1e-9) { t = Math.max(0, Math.min(1, f / e)); } else {
    const c = dot(d1, r);
    if (e <= 1e-9) s = Math.max(0, Math.min(1, -c / a));
    else { const b = dot(d1, d2), den = a * e - b * b; s = den !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0; t = (b * s + f) / e; if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); } }
  }
  const c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s], c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
  return len(sub(c1, c2));
}
/** Distance from a point to a segment, and where along it (0..1). */
function pointSeg(p: number[], a: number[], b: number[]): { d: number; t: number } { const ab = sub(b, a), l2 = dot(ab, ab) || 1e-9; const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)); return { d: len(sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t])), t }; }
const teamOf = (id: string): 'me' | 'foe' => (id === 'me' || id.startsWith('mate') ? 'me' : 'foe');

export interface Metrics {
  id: string; label: string; who: string; kind: string; family: string; session: string; take: string; subject: string; anchorClip: string; attempt?: number;
  frames: number; fps: number; windowMs: [number, number]; clips: string[]; shotTypes: string[];
  sparc: Record<string, number>; sparcMean: number;
  pops: { bone: string; atMs: number; degPerSec: number; clip: string }[]; popsN: number; severe: number; whips: number;
  heldFrac: Record<string, number>; wristStill: number; thoracicStill: number;
  lockedElbow: number; lockedKnee: number;
  joints: Record<string, { bent: number; off: number; inverted: number; errP90: number; rollMax: number; rollFast: number }>;
  elbowBad: Record<string, { high: number; low: number }>;
  foot: { planted: number; p90Cm: number; maxCm: number; totalCm: number; skates: number };
  /** PHASE 2a: "ball against the palm" (gapP90 / gapMax / far) is gone — a constant 0.15 m while the ball is attached. The ball
   *  PATH (the most it moves in one frame while held, dribbled or caught) is the metric now: it catches warps and snaps. */
  ball: { heldFrames: number; heldRig: Record<string, number>; heldVis: Record<string, number>; carryFrames: number; carryVisRight: number | null; pathMaxM: number | null; pathMaxAtMs: number | null; pathP90M: number | null; pathFrames: number;
    /** the same against the body (the ball's offset from the hips, frame to frame): the body's own travel taken out — a sprint moves a
     *  held ball 0.08 m a frame in the world; a warp moves it against the body */
    pathMaxRelM: number | null; pathMaxRelAtMs: number | null; pathP90RelM: number | null };
  /** jumpM / apexMs / relToApexMs: the HIPS rise from the lowest pre-anchor hips (a crouch counts as "jump") — kept for the baseline's
   *  numbers. feet*: the real flight — the lower foot's clearance over this body's floor, its apex, and the release against it. */
  release: { atMs: number; rig: string; vis: string; apexMs: number | null; jumpM: number; relToApexMs: number | null; feetUpM?: number; feetApexMs?: number | null; relToFeetApexMs?: number | null; airborne?: boolean } | null;
  visual: { sideStart: string; sideEnd: string; crossed: boolean; underLegs: boolean; behindBack: boolean; spinDeg: number; lateralFrac: number | null; handOverHead: number; verdict: string };
  marks: string[];
  /** AUDIT 2026-09-25 — the window's honesty: resets (root > 1 m in a frame: a possession reset / replay warp) cut the window;
   *  anchorAtReset = one fell within 50 ms of the anchor (the "onset" is the reset); snaps = root jumps of 0.25–1 m in a frame
   *  (a real glitch, kept in the window); preMs = the pre-roll the recording actually had; frozen = bones whose local rotation
   *  never changed in the window; flight = the lower foot's clearance and the root's rise. */
  audit?: { windowMs: [number, number]; frames: number; resetsMs: number[]; anchorAtReset: boolean; snaps: number; preMs: number; frozen: string[]; flight: { feetUpM: number; feetApexMs: number | null; rootUpM: number } };
  /** PHASE 2a — the fourteen new metrics (the plan's 2a list, in its order) plus the stacked-clip count. null = not applicable
   *  to this kind of action, or no data in the window. */
  h2: {
    /** 2. the dribbling palm (the nearer hand) to the ball at the top of each bounce */
    dribbleContact: { bounces: number; p50M: number | null; p90M: number | null } | null;
    /** 3. the largest change of the hips' yaw inside one frame at a clip hand-over (the top clip changed, or a clip crossed 0.5) */
    hipYawSeam: { maxDeg: number; atMs: number | null; clip: string; handovers: number; maxAnyDeg: number } | null;
    /** 4. steps per second and the same-foot stride from foot contacts, against the root's speed (cadence × stride = the speed the
     *  feet account for; below the root speed the body is skating) */
    cadence: { steps: number; stepsPerSec: number | null; strideM: number | null; rootMps: number | null; feetMps: number | null; movingFrames: number } | null;
    /** 5. the release hand against the rim line and the nearest defender (the outside hand = away from him) */
    finish: { hand: string; rimSide: string; defender: string; defenderM: number | null; defenderSide: string; outsideHand: boolean | null } | null;
    /** 6. the guide (off) hand's gap to the ball within 50 ms of the release */
    guideHand: { minM: number | null; atReleaseM: number | null } | null;
    /** 7. the release hand's rotation range through the release (−200 … +100 ms), readable now that the formula is normalised */
    wristFlex: { rangeDeg: number | null; bone: string } | null;
    /** 8. frames where this body's torso capsule (Hips→Neck, r 0.16) interpenetrates another's */
    overlap: { frames: number; with: string; minM: number | null };
    /** 9. AI-ARMS: the drawn hand (hand-weighted skinned centroid) and the arm's drawn tip against the hand bone, per side */
    aiArms: Record<string, { handOffP50: number | null; handOffP90: number | null; tipOffP50: number | null; tipOffP90: number | null; n: number }> | null;
    /** 10. the face's direction against the look target (the rim for a shooter, the ball otherwise) */
    look: { target: string; errP50Deg: number | null; errP90Deg: number | null; n: number } | null;
    /** 11. under pressure (a defender inside 1.5 m while this body has the ball): the ball on the far side, the off forearm between */
    shield: { pressured: number; ballFarFrac: number | null; forearmBetweenFrac: number | null; defender: string } | null;
    /** 12. the receiver's nearer hand to the ball 100 ms before it arrives (catches and rebounds) */
    catchReach: { m100Ms: number | null; m50Ms: number | null } | null;
    /** 13. hand travel (both hands, body-local) over the window — a celebration you can see moves the hands */
    celebration: { handTravelM: number } | null;
    /** 14. pacing: the make (the ball through, '[..-JUICE] … make') to the next check (the possession reset), and the release to it */
    pacing: { releaseMs: number | null; makeMs: number | null; makeBy: string; resetMs: number | null; makeToResetMs: number | null; releaseToResetMs: number | null } | null;
    /** two or more clips at weight ≥ 0.9 on one frame (Babylon slerps them: each at half strength) — the 3PT crossFade question */
    stacked: { frames: number; pairs: Record<string, number> };
    /** 1. the ball path's worst frame is in ball.pathMaxM; here: the same for the CATCH frame alone (the warp into the palm) */
    catchWarpM: number | null;
  };
}
/** The look target of an action kind: the rim while shooting / finishing / dunking, the ball otherwise (a defender watches the
 *  handler; a receiver the pass); a reaction has none. */
const lookTargetOf = (kind: string): 'rim' | 'ball' | '' => (/shot|finish|dunk|post/.test(kind) ? 'rim' : /react/.test(kind) ? '' : 'ball');
export function measure(rec: Rec): Metrics {
  const A0 = rec.anchorT; const S = rec.subject;
  // AUDIT 2026-09-25: THE WINDOW STOPS AT A RESET. 65 of 382 baseline windows held a root warp of 1–11 m in one frame (a make's
  // possession reset, a rebound's re-check): every derivative metric (pops, whips, SPARC, rolls) straddled it, and 24 anchors sat
  // within 100 ms of one. The dunk probe stopped its window at contact + 250 ms for the same reason (the replay's teleport).
  const RESET_M = 1.0;
  const withS = rec.frames.filter((f) => f.B[S]);
  const resetsT: number[] = []; let snaps = 0;
  for (let i = 1; i < withS.length; i++) { const a = withS[i - 1].B[S].rp, b = withS[i].B[S].rp; const d = Math.hypot(a[0] - b[0], a[2] - b[2]); if (d > RESET_M) resetsT.push(withS[i].t); else if (d > 0.25 && withS[i].t >= A0 - rec.pre && withS[i].t <= A0 + rec.post) snaps++; }
  let wS = A0 - rec.pre, wE = A0 + rec.post; const anchorAtReset = resetsT.some((t) => Math.abs(t - A0) <= 50);
  // a reset before the anchor frame starts the window at it; one at or after the anchor ends the window before it (a steal that
  // flips possession warps the stealer to the check on the frame his reach clip crosses 0.5: the reach is the frames BEFORE it)
  for (const t of resetsT) { if (t < A0 - 1e-6) wS = Math.max(wS, t); else wE = Math.min(wE, t - VDT / 2); }
  const win = rec.frames.filter((f) => f.t >= wS - 1e-6 && f.t <= wE + 1e-6 && f.B[S]);
  const preMs = Math.round(A0 - (withS[0]?.t ?? A0));
  const bw = win.map((f) => f.B[S]);
  const dtAvg = win.length > 1 ? (win[win.length - 1].t - win[0].t) / (win.length - 1) : VDT;
  const fs = 1000 / dtAvg;
  // SPARC of the 9 effectors on the body-local speed (dunk definition)
  const eff: Record<string, number> = { RightHand: J.RightHand, LeftHand: J.LeftHand, RightFoot: J.RightFoot, LeftFoot: J.LeftFoot, Head: J.Head, RightForeArm: J.RightForeArm, LeftForeArm: J.LeftForeArm, LeftLeg: J.LeftLeg, RightLeg: J.RightLeg };
  const sp: Record<string, number> = {};
  for (const [name, ji] of Object.entries(eff)) {
    const pts = bw.map((b) => (b.j[ji] ? local(b, b.j[ji]!) : null));
    const speed: number[] = [];
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (!a || !b) continue; const dt = (win[i].t - win[i - 1].t) / 1000 || VDT / 1000; speed.push(len(sub(b, a)) / dt); }
    sp[name] = +sparc(speed, fs).toFixed(2);
  }
  const vals = Object.values(sp).filter((v) => isFinite(v));
  // pops (≥600°/s, ≥3.5× the ±6-frame median floored at 60, ≥3× the speed 3 frames either side), severe ≥3000°/s, whips >1500°/s on a limb
  const names = rec.bodies[S] ?? [];
  const idxOf = (n: string) => names.findIndex((x) => x.replace(/^mixamorig:?/, '').replace(/(_c\d+)+$/, '').replace(/_p\d+$/, '') === n);
  const frozen: string[] = [];
  const watch = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];
  const pops: Metrics['pops'] = []; let whips = 0; const held: Record<string, number> = {};
  for (const bn of watch) {
    const bi = idxOf(bn); if (bi < 0) continue;
    const w: number[] = [];
    for (let i = 1; i < bw.length; i++) { const dt = (win[i].t - win[i - 1].t) / 1000 || VDT / 1000; w.push(qAngleDeg(bw[i - 1].q.slice(bi * 4, bi * 4 + 4), bw[i].q.slice(bi * 4, bi * 4 + 4)) / dt); }
    for (let i = 0; i < w.length; i++) {
      const nbh = w.slice(Math.max(0, i - 6), i).concat(w.slice(i + 1, i + 7)).sort((a, b) => a - b);
      const med = nbh[Math.floor(nbh.length / 2)] ?? 0;
      const side = Math.max(w[i - 3] ?? 0, w[i + 3] ?? 0);
      if (/Arm|Leg|Hand|Foot/.test(bn) && w[i] > 1500) whips++;
      if (w[i] >= 600 && w[i] >= 3.5 * Math.max(med, 60) && w[i] >= 3 * side) pops.push({ bone: bn, atMs: Math.round(win[i + 1].t - A0), degPerSec: Math.round(w[i]), clip: bw[i + 1].c.map((c) => `${clipName(c[0])}:${c[1]}`).join('+') });
    }
    held[bn] = w.length ? +(w.filter((x) => x < 8).length / w.length).toFixed(2) : 0;
    if (w.length && w.every((x) => x < 0.01)) frozen.push(bn);
  }
  let lockedElbow = 0, lockedKnee = 0;
  for (const b of bw) {
    const e = (a: string, m: string, c: string) => (b.j[J[a]] && b.j[J[m]] && b.j[J[c]] ? angleAt(b.j[J[a]]!, b.j[J[m]]!, b.j[J[c]]!) : 0);
    if (e('RightArm', 'RightForeArm', 'RightHand') > 172 || e('LeftArm', 'LeftForeArm', 'LeftHand') > 172) lockedElbow++;
    if (e('RightUpLeg', 'RightLeg', 'RightFoot') > 176 || e('LeftUpLeg', 'LeftLeg', 'LeftFoot') > 176) lockedKnee++;
  }
  // the joint audit (phase 9 of the dunk pass): off the hinge >35°, inverted >120°, hinge error p90, upper-bone roll
  const joints: Metrics['joints'] = {};
  for (const k of ['LArm', 'RArm', 'LLeg', 'RLeg']) {
    const fr = win.filter((f) => f.B[S].jt && f.B[S].jt[k]);
    const bent = fr.filter((f) => f.B[S].jt[k][1] >= 0), errs = bent.map((f) => f.B[S].jt[k][1]).sort((a, b) => a - b);
    const rolls = fr.map((f, i) => (i ? Math.abs(f.B[S].jt[k][2]) / Math.max(1e-3, (f.t - fr[i - 1].t) / 1000) : 0));
    joints[k] = { bent: bent.length, off: errs.filter((e) => e > 35 && e <= 120).length, inverted: errs.filter((e) => e > 120).length, errP90: errs.length ? errs[Math.floor(errs.length * 0.9)] : 0, rollMax: Math.round(Math.max(0, ...rolls)), rollFast: rolls.filter((r) => r > 1500).length };
  }
  const elbowBad: Metrics['elbowBad'] = {};
  for (const sd of ['Left', 'Right']) {
    let high = 0, low = 0;
    for (const b of bw) {
      const Sh = b.j[J[sd + 'Arm']], E = b.j[J[sd + 'ForeArm']], H = b.j[J[sd + 'Hand']]; if (!Sh || !E || !H) continue;
      const ax = sub(H, Sh), al = len(ax); if (al < 1e-3) continue;
      if (angleAt(Sh, E, H) > 160) continue;
      const axn = ax.map((v) => v / al) as V3, e = sub(E, Sh), pe = sub(e, axn.map((v) => v * dot(e, axn)) as V3), pl = len(pe); if (pl < 1e-3) continue;
      // AUDIT 2026-09-25: the dunk probe's forward, exactly — the hip line's normal oriented by the LEFT foot (was: the mean of both
      // feet's heel→toe, which a turned-out foot drags)
      const p = pe.map((v) => v / pl); const lu = b.j[J.LeftUpLeg], ru = b.j[J.RightUpLeg], lf = b.j[J.LeftFoot], lt = b.j[J.LeftToeBase]; if (!lu || !ru || !lf || !lt) continue;
      const across = sub(ru, lu); across[1] = 0; const acl = len(across) || 1; const ac = across.map((v) => v / acl);
      let fwd: V3 = [ac[2], 0, -ac[0]]; if (dot(fwd, sub(lt, lf)) < 0) fwd = [-fwd[0], 0, -fwd[2]];
      const pf = dot(p, fwd), pu = p[1], handUp = H[1] - Sh[1];
      if (handUp > 0.15 && pf < -0.5 && pu < 0.3) high++;
      if (handUp < -0.1 && pf > 0.6) low++;
    }
    elbowBad[sd] = { high, low };
  }
  // FOOT SLIDE WHILE PLANTED — the footplant probe's contact test (low AND the lower foot AND not rising), with "low" read
  // against this body's own floor (its 5th-percentile foot height over the whole take) so a kit hero and a Meshy rival are
  // judged alike; teleports (> 0.5 m of root in a frame) skipped
  const allFoot = rec.frames.flatMap((f) => { const b = f.B[S]; return b ? [b.j[J.LeftFoot]?.[1], b.j[J.RightFoot]?.[1]].filter((y): y is number => typeof y === 'number') : []; });
  const floorY = allFoot.length > 20 ? pctl(allFoot, 0.05) : 0.06;
  const slides: number[] = [];
  for (let i = 1; i < bw.length; i++) {
    if (len(sub(bw[i].rp, bw[i - 1].rp)) > 0.5) continue;
    for (const [fi, oi] of [[J.LeftFoot, J.RightFoot], [J.RightFoot, J.LeftFoot]]) {
      const w = bw[i].j[fi], was = bw[i - 1].j[fi], other = bw[i].j[oi]; if (!w || !was) continue;
      const low = w[1] < floorY + 0.05, stance = !other || w[1] <= other[1], rising = w[1] - was[1] > 0.002;
      if (low && stance && !rising) slides.push(Math.hypot(w[0] - was[0], w[2] - was[2]));
    }
  }
  const foot = { planted: slides.length, p90Cm: r2(pctl(slides, 0.9) * 100), maxCm: r2(Math.max(0, ...slides) * 100), totalCm: r2(slides.reduce((a, b) => a + b, 0) * 100), skates: slides.filter((s) => s > 0.05).length };
  // THE BALL: which hand holds it by rig name and as drawn, the carry's drawn side, and (2a) the PATH — the most it moves in one
  // frame while this body has it (held, dribbled) or on the frame it arrives (a catch, a board): warps and snaps
  const heldF = win.filter((f) => f.bb === S && f.ball);
  const heldRig: Record<string, number> = { L: 0, R: 0 }, heldVis: Record<string, number> = { L: 0, R: 0 };
  for (const f of heldF) { const b = f.B[S]; if (f.bh) heldRig[f.bh]++; const hand = f.bh === 'L' ? b.j[J.LeftHand] : b.j[J.RightHand]; const v = hand ? visSide(b, hand) : ''; if (v) heldVis[v]++; }
  const carryF = win.filter((f) => f.ball && !f.bb && !f.br && f.B[S] && carrierIs(f, S));
  const carrySided = carryF.map((f) => visSide(f.B[S], f.ball!)).filter(Boolean);
  const mineF = (f: Frame) => !!f.ball && holderOf(f) === S;
  const path: { d: number; rel: number; t: number; catchF: boolean }[] = [];
  for (let i = 1; i < win.length; i++) {
    const f = win[i], p = win[i - 1]; if (!mineF(f) || !p.ball) continue;
    const h1 = f.B[S].j[J.Hips], h0 = p.B[S].j[J.Hips];
    path.push({ d: len(sub(f.ball!, p.ball)), rel: h1 && h0 ? len(sub(sub(f.ball!, h1), sub(p.ball, h0))) : NaN, t: f.t, catchF: !mineF(p) });
  }
  const pathMax = path.length ? path.reduce((a, x) => (x.d > a.d ? x : a), path[0]) : null;
  const relP = path.filter((x) => isFinite(x.rel)); const relMax = relP.length ? relP.reduce((a, x) => (x.rel > a.rel ? x : a), relP[0]) : null;
  const catchWarp = path.filter((x) => x.catchF).map((x) => x.d);
  const ball: Metrics['ball'] = { heldFrames: heldF.length, heldRig, heldVis, carryFrames: carryF.length, carryVisRight: carrySided.length ? r2(carrySided.filter((s) => s === 'R').length / carrySided.length) : null,
    pathMaxM: pathMax ? r3(pathMax.d) : null, pathMaxAtMs: pathMax ? Math.round(pathMax.t - A0) : null, pathP90M: path.length ? r3(pctl(path.map((x) => x.d), 0.9)) : null, pathFrames: path.length,
    pathMaxRelM: relMax ? r3(relMax.rel) : null, pathMaxRelAtMs: relMax ? Math.round(relMax.t - A0) : null, pathP90RelM: relP.length ? r3(pctl(relP.map((x) => x.rel), 0.9)) : null };
  // THE RELEASE against the jump's apex (shots / finishes / dunks): the frame the ball leaves this body's hand, released
  let release: Metrics['release'] = null; let ri = -1;
  if (/shot|finish|dunk|post|pass/.test(rec.kind)) {
    ri = win.findIndex((f, i) => i > 0 && f.t >= A0 - 100 && win[i - 1].bb === S && f.bb !== S && f.br);
    const hipsY = bw.map((b) => b.j[J.Hips]?.[1] ?? 0);
    const baseY = Math.min(...hipsY.slice(0, Math.max(1, win.findIndex((f) => f.t >= A0) + 1)));
    let ai = -1, top = -1e9; win.forEach((f, i) => { if (f.t >= A0 - 100 && hipsY[i] > top) { top = hipsY[i]; ai = i; } });
    const jumpM = r2(top - baseY);
    const clear = bw.map((b) => Math.min(b.j[J.LeftFoot]?.[1] ?? 9, b.j[J.RightFoot]?.[1] ?? 9) - floorY);
    // the flight that carries the release: searched from the anchor to 400 ms after the ball leaves (a celebration hop a second
    // later is not the shot's apex — the 3PT rack shot read "apex 1250 ms" off the dunk celebration)
    const tRel = ri > 0 ? win[ri].t : Infinity;
    let fai = -1, ftop = -1e9; win.forEach((f, i) => { if (f.t >= A0 - 100 && f.t <= tRel + 400 && clear[i] > ftop) { ftop = clear[i]; fai = i; } });
    const feetUpM = r2(ftop);
    if (ri > 0) {
      const pf = win[ri - 1]; const b = pf.B[S]; const hand = pf.bh === 'L' ? b.j[J.LeftHand] : b.j[J.RightHand];
      release = { atMs: Math.round(win[ri].t - A0), rig: pf.bh ?? '', vis: hand ? visSide(b, hand) : '', apexMs: ai >= 0 ? Math.round(win[ai].t - A0) : null, jumpM, relToApexMs: ai >= 0 && jumpM >= 0.06 ? Math.round(win[ri].t - win[ai].t) : null,
        feetUpM, feetApexMs: fai >= 0 ? Math.round(win[fai].t - A0) : null, relToFeetApexMs: fai >= 0 && feetUpM >= 0.06 ? Math.round(win[ri].t - win[fai].t) : null, airborne: clear[ri - 1] > 0.05 };
    } else release = { atMs: -1, rig: '', vis: '', apexMs: ai >= 0 ? Math.round(win[ai].t - A0) : null, jumpM, relToApexMs: null, feetUpM, feetApexMs: fai >= 0 ? Math.round(win[fai].t - A0) : null, relToFeetApexMs: null };
  }
  // WHAT THE BODY VISIBLY DID (against the clip's name)
  // the ball's side only while THIS body has it (in its hand, or on its dribble) — a ball in flight is on nobody's side
  const mine = (f: Frame) => !!f.ball && (f.bb === S || (!f.bb && !f.br && carrierIs(f, S)));
  const ballSideAt = (t: number) => { const c = win.filter((x) => mine(x) && Math.abs(x.t - t) <= 300); if (!c.length) return ''; const f = c.reduce((a, x) => (Math.abs(x.t - t) < Math.abs(a.t - t) ? x : a), c[0]); return visSide(f.B[S], f.ball!); };
  const sideStart = win.length ? ballSideAt(A0 - 80) : '', sideEnd = win.length ? ballSideAt(A0 + Math.min(rec.post, 900) - 100) : '';
  let underLegs = false, behindBack = false;
  for (const f of win) {
    if (f.t < A0 - 50 || f.t > A0 + 900 || !f.ball) continue;
    const b = f.B[S]; const kneeY = ((b.j[J.LeftLeg]?.[1] ?? 0.5) + (b.j[J.RightLeg]?.[1] ?? 0.5)) / 2; const h = b.j[J.Hips]; if (!h) continue;
    const fwd = facing(b), rt = rightOf(fwd), d = sub(f.ball, h); const lx = dot(d, rt), lz = dot(d, fwd);
    if (f.ball[1] < kneeY + 0.05 && Math.abs(lx) < 0.22 && Math.abs(lz) < 0.3) underLegs = true;
    if (lz < -0.15 && f.ball[1] > 0.45 && f.ball[1] < 1.4 && (f.bb === S || (!f.bb && !f.br))) behindBack = true;
  }
  let spin = 0; { let prev: number | null = null; for (const f of win) { if (f.t < A0 - 50 || f.t > A0 + 1000) continue; const fw = facing(f.B[S]); const y = Math.atan2(fw[0], fw[2]); if (prev !== null) { let d = y - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; spin += d; } prev = y; } }
  let latSum = 0, latN = 0;
  for (let i = 1; i < bw.length; i++) { const v = sub(bw[i].rp, bw[i - 1].rp); const s = Math.hypot(v[0], v[2]); if (s < 0.004 || s > 0.5) continue; latSum += Math.abs(dot(v, rightOf(facing(bw[i])))) / s; latN++; }
  const handOverHead = r2(Math.max(-9, ...bw.map((b) => (b.j[J.Head] ? Math.max(b.j[J.LeftHand]?.[1] ?? -9, b.j[J.RightHand]?.[1] ?? -9) - b.j[J.Head]![1] : -9))));
  const spinDeg = Math.round((spin * 180) / Math.PI);
  const verdict = [sideStart && sideEnd ? (sideStart !== sideEnd ? `ball crossed ${sideStart}→${sideEnd}` : `ball stayed ${sideStart}`) : '', underLegs ? 'under the legs' : '', behindBack ? 'behind the back' : '', Math.abs(spinDeg) >= 200 ? `turned ${spinDeg}°` : '', latN ? `sideways ${Math.round((latSum / latN) * 100)}%` : '', handOverHead > 0.1 ? `hand ${handOverHead} m over the head` : ''].filter(Boolean).join(' · ');
  const visual = { sideStart, sideEnd, crossed: !!sideStart && !!sideEnd && sideStart !== sideEnd, underLegs, behindBack, spinDeg, lateralFrac: latN ? r2(latSum / latN) : null, handOverHead, verdict };
  const clips: string[] = []; for (const b of bw) { const c = topClip(b); if (c && clips[clips.length - 1] !== c) clips.push(c); }
  const shotTypes = [...new Set(win.map((f) => String(f.s?.st ?? '')).filter(Boolean))];
  const marks = rec.marks.filter((m) => m.t >= A0 - rec.pre && m.t <= A0 + rec.post && !/-PP(-FOE)?\]/.test(m.msg)).map((m) => `${Math.round(m.t - A0)} ${m.msg.slice(0, 110)}`).slice(0, 24);

  // ── PHASE 2a: the fourteen new metrics ─────────────────────────────────────────────────────────────────────────────
  // 2. DRIBBLE CONTACT: at the top of each bounce (a local maximum of the ball's height on the dribble) the nearer palm to the ball
  let dribbleContact: Metrics['h2']['dribbleContact'] = null;
  {
    const ds: number[] = [];
    for (let i = 1; i < win.length - 1; i++) {
      const f = win[i]; if (!f.ball || f.bb || f.br || !carrierIs(f, S) || !win[i - 1].ball || !win[i + 1].ball) continue;
      if (!(f.ball[1] > win[i - 1].ball![1] && f.ball[1] >= win[i + 1].ball![1])) continue;
      const b = f.B[S]; const hs = [b.j[J.LeftHand], b.j[J.RightHand]].filter((h): h is number[] => !!h); if (!hs.length) continue;
      ds.push(Math.min(...hs.map((h) => len(sub(f.ball!, h)))));
    }
    if (carryF.length) dribbleContact = { bounces: ds.length, p50M: ds.length ? r3(pctl(ds, 0.5)) : null, p90M: ds.length ? r3(pctl(ds, 0.9)) : null };
  }
  // 3. HIP-YAW SEAM: the hips' facing from the hip line (LeftUpLeg→RightUpLeg), its sign carried frame to frame (a foot can turn out;
  // the line's normal cannot flip 180° in one frame without the body doing it); the per-frame change at every clip hand-over
  let hipYawSeam: Metrics['h2']['hipYawSeam'] = null;
  {
    const yaws: (number | null)[] = []; let prevN: V3 | null = null;
    for (const b of bw) {
      const lu = b.j[J.LeftUpLeg], ru = b.j[J.RightUpLeg]; if (!lu || !ru) { yaws.push(null); continue; }
      const ac = sub(ru, lu); ac[1] = 0; const l = Math.hypot(ac[0], ac[2]) || 1; let n: V3 = [ac[2] / l, 0, -ac[0] / l];
      const ref = prevN ?? facing(b); if (dot(n, ref) < 0) n = [-n[0], 0, -n[2]];
      prevN = n; yaws.push(Math.atan2(n[0], n[2]));
    }
    const dyaw = (i: number): number | null => { const a = yaws[i - 1], b = yaws[i]; if (a == null || b == null) return null; let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs((d * 180) / Math.PI); };
    let maxAny = 0, max = 0, at: number | null = null, clip = '', handovers = 0;
    for (let i = 1; i < bw.length; i++) {
      const d = dyaw(i); if (d == null) continue; maxAny = Math.max(maxAny, d);
      const crossed = bw[i].c.some(([n, w]) => w >= 0.5 && (bw[i - 1].c.find(([m]) => m === n)?.[1] ?? 0) < 0.5);
      const changed = topClip(bw[i]) !== topClip(bw[i - 1]);
      if (!crossed && !changed) continue;
      handovers++;
      const d2 = Math.max(d, dyaw(i + 1) ?? 0);   // the hand-over frame and the one after it (a fade's first frame)
      if (d2 > max) { max = d2; at = Math.round(win[i].t - A0); clip = `${topClip(bw[i - 1])} → ${topClip(bw[i])}`; }
    }
    if (bw.length > 2) hipYawSeam = { maxDeg: r2(max), atMs: at, clip, handovers, maxAnyDeg: r2(maxAny) };
  }
  // 4. CADENCE: foot contacts (a foot low against this body's floor), touchdowns per second while the root moves (> 0.5 m/s),
  // the same-foot stride, the root's mean speed, and the speed the feet account for (stride × same-foot cadence)
  let cadence: Metrics['h2']['cadence'] = null;
  {
    const down = (b: BodyFrame, fi: number) => { const y = b.j[fi]?.[1]; return typeof y === 'number' && y < floorY + 0.05; };
    const touch: { t: number; p: number[]; foot: number }[] = []; let movingFrames = 0, dist = 0;
    for (let i = 1; i < bw.length; i++) {
      const dt = (win[i].t - win[i - 1].t) / 1000 || VDT / 1000; const v = sub(bw[i].rp, bw[i - 1].rp); const sp2 = Math.hypot(v[0], v[2]) / dt;
      if (sp2 > 0.5 && sp2 < 12) { movingFrames++; dist += Math.hypot(v[0], v[2]); }
      for (const fi of [J.LeftFoot, J.RightFoot]) if (down(bw[i], fi) && !down(bw[i - 1], fi) && sp2 > 0.5 && sp2 < 12 && bw[i].j[fi]) touch.push({ t: win[i].t, p: bw[i].j[fi]!, foot: fi });
    }
    const strides: number[] = [];
    for (const fi of [J.LeftFoot, J.RightFoot]) { const ts = touch.filter((x) => x.foot === fi); for (let k = 1; k < ts.length; k++) strides.push(Math.hypot(ts[k].p[0] - ts[k - 1].p[0], ts[k].p[2] - ts[k - 1].p[2])); }
    const secs = (movingFrames * dtAvg) / 1000;
    const stepsPerSec = secs > 0.3 ? touch.length / secs : null, strideM = strides.length ? strides.reduce((a, b) => a + b, 0) / strides.length : null, rootMps = secs > 0.3 ? dist / secs : null;
    if (movingFrames > 0) cadence = { steps: touch.length, stepsPerSec: stepsPerSec != null ? r2(stepsPerSec) : null, strideM: strideM != null ? r2(strideM) : null, rootMps: rootMps != null ? r2(rootMps) : null, feetMps: stepsPerSec != null && strideM != null ? r2((stepsPerSec / 2) * strideM) : null, movingFrames };
  }
  // the nearest OTHER body (the other team where teams exist) at a frame
  const nearestFoe = (f: Frame): { id: string; d: number; b: BodyFrame } | null => {
    const me = f.B[S]; if (!me || !me.j[J.Hips]) return null; let best: { id: string; d: number; b: BodyFrame } | null = null;
    for (const [id, ob] of Object.entries(f.B)) { if (id === S || !ob.j[J.Hips]) continue; if ((rec.session.startsWith('1v1') || rec.session.startsWith('3v3')) && teamOf(id) === teamOf(S)) continue; const d = Math.hypot(ob.j[J.Hips]![0] - me.j[J.Hips]![0], ob.j[J.Hips]![2] - me.j[J.Hips]![2]); if (!best || d < best.d) best = { id, d, b: ob }; }
    return best;
  };
  // 5. FINISHING SIDE + 6. GUIDE HAND + 7. WRIST FLEX: at the release
  let finish: Metrics['h2']['finish'] = null, guideHand: Metrics['h2']['guideHand'] = null, wristFlex: Metrics['h2']['wristFlex'] = null;
  if (ri > 0 && release) {
    const pf = win[ri - 1], b = pf.B[S]; const relJ = pf.bh === 'L' ? J.LeftHand : J.RightHand, offJ = pf.bh === 'L' ? J.RightHand : J.LeftHand;
    const hips = b.j[J.Hips];
    if (hips) {
      const rt = rightOf(facing(b)); const rs = dot(sub(RIM, hips), rt); const rimSide = Math.abs(rs) < 0.15 ? '' : rs > 0 ? 'R' : 'L';
      const nf = nearestFoe(pf); const ds = nf && nf.d < 3 ? dot(sub(nf.b.j[J.Hips]!, hips), rt) : NaN;
      const defenderSide = isFinite(ds) ? (Math.abs(ds) < 0.15 ? '' : ds > 0 ? 'R' : 'L') : '';
      finish = { hand: release.vis, rimSide, defender: nf && nf.d < 3 ? nf.id : '', defenderM: nf ? r2(nf.d) : null, defenderSide, outsideHand: defenderSide && release.vis ? release.vis !== defenderSide : null };
    }
    const gaps: number[] = []; for (let k = Math.max(0, ri - 3); k < ri; k++) { const h = win[k].B[S].j[offJ]; if (h && win[k].ball) gaps.push(len(sub(win[k].ball!, h))); }
    const hAt = b.j[offJ]; guideHand = { minM: gaps.length ? r3(Math.min(...gaps)) : null, atReleaseM: hAt && pf.ball ? r3(len(sub(pf.ball, hAt))) : null };
    const bone = pf.bh === 'L' ? 'LeftHand' : 'RightHand'; const bi = idxOf(bone);
    if (bi >= 0) { let range = 0; const qs = win.filter((f) => f.t >= win[ri].t - 200 && f.t <= win[ri].t + 100).map((f) => f.B[S].q.slice(bi * 4, bi * 4 + 4)); for (let a = 0; a < qs.length; a++) for (let c = a + 1; c < qs.length; c++) range = Math.max(range, qAngleDeg(qs[a], qs[c])); wristFlex = { rangeDeg: r2(range), bone }; }
  }
  // 8. OVERLAP: this body's torso capsule against every other body's
  const overlap = { frames: 0, with: '', minM: null as number | null }; { const cnt: Record<string, number> = {}; let mn = Infinity;
    for (const f of win) { const me = f.B[S]; const a0 = me.j[J.Hips], a1 = me.j[J.Neck]; if (!a0 || !a1) continue; let hit = false; for (const [id, ob] of Object.entries(f.B)) { if (id === S) continue; const b0 = ob.j[J.Hips], b1 = ob.j[J.Neck]; if (!b0 || !b1) continue; const d = segDist(a0, a1, b0, b1); mn = Math.min(mn, d); if (d < 0.32) { hit = true; cnt[id] = (cnt[id] ?? 0) + 1; } } if (hit) overlap.frames++; }
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]; overlap.with = top ? top[0] : ''; overlap.minM = isFinite(mn) ? r3(mn) : null; }
  // 9. AI-ARMS: the drawn hand / arm tip against the hand bone (every body that has skinned hand vertices)
  let aiArms: Metrics['h2']['aiArms'] = null;
  { const per: Record<string, { ho: number[]; to: number[] }> = { L: { ho: [], to: [] }, R: { ho: [], to: [] } }; let any = false;
    for (const b of bw) { if (!b.dh) continue; for (const sd of ['L', 'R']) { const e = b.dh[sd]; const bone = b.j[sd === 'L' ? J.LeftHand : J.RightHand]; if (!e || !bone) continue; any = true; if (e[0]) per[sd].ho.push(len(sub(e[0], bone))); if (e[1]) per[sd].to.push(len(sub(e[1], bone))); } }
    if (any) { aiArms = {}; for (const sd of ['L', 'R']) aiArms[sd] = { handOffP50: per[sd].ho.length ? r3(pctl(per[sd].ho, 0.5)) : null, handOffP90: per[sd].ho.length ? r3(pctl(per[sd].ho, 0.9)) : null, tipOffP50: per[sd].to.length ? r3(pctl(per[sd].to, 0.5)) : null, tipOffP90: per[sd].to.length ? r3(pctl(per[sd].to, 0.9)) : null, n: Math.max(per[sd].ho.length, per[sd].to.length) }; } }
  // 10. LOOK: the face's direction against the target
  let look: Metrics['h2']['look'] = null;
  { const tgt = lookTargetOf(rec.kind); if (tgt) { const errs: number[] = [];
    for (const f of win) { const b = f.B[S]; const head = b.j[J.Head]; if (!b.hf || !head) continue; const to = tgt === 'rim' ? sub(RIM, head) : f.ball ? sub(f.ball, head) : null; if (!to || len(to) < 0.3) continue; if (tgt === 'ball' && f.ball && holderOf(f) === S) continue; errs.push(angleBetween(b.hf, to)); }
    look = { target: tgt, errP50Deg: errs.length ? Math.round(pctl(errs, 0.5)) : null, errP90Deg: errs.length ? Math.round(pctl(errs, 0.9)) : null, n: errs.length }; } }
  // 11. SHIELD: with the ball and a defender inside 1.5 m — the ball on the far side of the body, the off forearm between them
  let shield: Metrics['h2']['shield'] = null;
  { let pressured = 0, far = 0, between = 0; const who: Record<string, number> = {};
    for (const f of win) { if (!mine(f)) continue; const nf = nearestFoe(f); if (!nf || nf.d > 1.5) continue; const b = f.B[S]; const hips = b.j[J.Hips], dh = nf.b.j[J.Hips]; if (!hips || !dh) continue; pressured++; who[nf.id] = (who[nf.id] ?? 0) + 1;
      const toD = sub(dh, hips); toD[1] = 0; const bd = sub(f.ball!, hips); bd[1] = 0; if (dot(toD, bd) < 0) far++;
      // the off arm: the forearm farther from the ball; between = its segment passes within 0.35 m of the ball→defender line, inside it
      const arms = [[J.LeftForeArm, J.LeftHand], [J.RightForeArm, J.RightHand]].map(([e, h]) => ({ e: b.j[e], h: b.j[h] })).filter((a) => a.e && a.h) as { e: number[]; h: number[] }[];
      if (arms.length === 2) { const off = arms.sort((x, y) => len(sub(y.h, f.ball!)) - len(sub(x.h, f.ball!)))[0]; const mid = [(off.e[0] + off.h[0]) / 2, (off.e[1] + off.h[1]) / 2, (off.e[2] + off.h[2]) / 2]; const ps = pointSeg(mid, f.ball!, dh); if (ps.d < 0.35 && ps.t > 0.05 && ps.t < 0.95) between++; } }
    const top = Object.entries(who).sort((a, b) => b[1] - a[1])[0];
    shield = { pressured, ballFarFrac: pressured ? r2(far / pressured) : null, forearmBetweenFrac: pressured ? r2(between / pressured) : null, defender: top ? top[0] : '' }; }
  // 12. CATCH REACH: the nearer hand to the ball 100 ms (and 50 ms) before it arrives, on a ball-arrives anchor
  let catchReach: Metrics['h2']['catchReach'] = null;
  if (/catch|rebound/.test(rec.kind)) { const at = (ms: number) => { const f = win.reduce((a, x) => (Math.abs(x.t - (A0 - ms)) < Math.abs(a.t - (A0 - ms)) ? x : a), win[0]); if (!f || !f.ball || Math.abs(f.t - (A0 - ms)) > VDT) return null; const hs = [f.B[S].j[J.LeftHand], f.B[S].j[J.RightHand]].filter((h): h is number[] => !!h); return hs.length ? r3(Math.min(...hs.map((h) => len(sub(f.ball!, h))))) : null; }; catchReach = { m100Ms: at(100), m50Ms: at(50) }; }
  // 13. CELEBRATION VISIBILITY: body-local hand travel over the window, both hands
  let travel = 0; for (let i = 1; i < bw.length; i++) for (const hj of [J.LeftHand, J.RightHand]) { const a = bw[i - 1].j[hj], b = bw[i].j[hj]; if (a && b && len(sub(bw[i].rp, bw[i - 1].rp)) < 0.5) travel += len(sub(local(bw[i], b), local(bw[i - 1], a))); }
  const celebration = { handTravelM: r2(travel) };
  // 14. PACING: the release, the make (the ball through the net), and the next check (the first reset after the release) — over the
  // whole recording (its tail is longer than the window for shots since 2a)
  let pacing: Metrics['h2']['pacing'] = null;
  if (/shot|finish|dunk|post/.test(rec.kind)) {
    const relT = ri > 0 ? win[ri].t : null;
    // the make as the player sees it: the ball through (a jumper's '[..-JUICE] … make', the 3PT landing beat), the dunk's contact
    // punch / flush; failing those, the rim's decision at the release ('ring YES') — makeBy says which line it was
    const THROUGH = /-JUICE\] (jumper )?make|-JUICE\] dunk contact punch|-SHOWTIME\] flush .* made true/;
    const makeM = relT != null ? (rec.marks.find((m) => m.t >= relT && THROUGH.test(m.msg)) ?? rec.marks.find((m) => m.t >= relT - 50 && /-RIM\] ring YES/.test(m.msg))) : undefined;
    const makeT = makeM ? makeM.t : null;
    let resetT: number | null = null; if (relT != null) for (let i = 1; i < withS.length; i++) { const a = withS[i - 1].B[S].rp, b = withS[i].B[S].rp; if (withS[i].t > relT + 100 && Math.hypot(a[0] - b[0], a[2] - b[2]) > RESET_M) { resetT = withS[i].t; break; } }
    pacing = { releaseMs: relT != null ? Math.round(relT - A0) : null, makeMs: makeT != null ? Math.round(makeT - A0) : null, makeBy: makeM ? makeM.msg.slice(0, 40) : '', resetMs: resetT != null ? Math.round(resetT - A0) : null, makeToResetMs: makeT != null && resetT != null ? Math.round(resetT - makeT) : null, releaseToResetMs: relT != null && resetT != null ? Math.round(resetT - relT) : null };
  }
  // STACKED clips: two or more at weight ≥ 0.9 on one frame (Babylon averages them: each plays at half strength) — the 3PT question
  const stacked = { frames: 0, pairs: {} as Record<string, number> };
  for (const b of bw) { const full = b.c.filter((c) => c[1] >= 0.9).map((c) => clipName(c[0]).replace(/^bball_/, '')).sort(); if (full.length >= 2) { stacked.frames++; const k = full.join('+'); stacked.pairs[k] = (stacked.pairs[k] ?? 0) + 1; } }
  const h2: Metrics['h2'] = { dribbleContact, hipYawSeam, cadence, finish, guideHand, wristFlex, overlap, aiArms, look, shield, catchReach, celebration, pacing, stacked, catchWarpM: catchWarp.length ? r3(Math.max(...catchWarp)) : null };
  return {
    id: rec.action, label: rec.label, who: rec.who, kind: rec.kind, family: rec.family, session: rec.session, take: rec.take, subject: S, anchorClip: rec.anchorClip, attempt: rec.attempt ?? 1,
    frames: win.length, fps: +fs.toFixed(1), windowMs: [rec.pre, rec.post], clips, shotTypes,
    sparc: sp, sparcMean: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : NaN,
    pops, popsN: pops.length, severe: pops.filter((p) => p.degPerSec >= 3000).length, whips,
    heldFrac: held, wristStill: r2(((held.LeftHand ?? 0) + (held.RightHand ?? 0)) / 2), thoracicStill: held.Spine2 ?? 0,
    lockedElbow, lockedKnee, joints, elbowBad, foot, ball, release, visual, marks, h2,
    audit: (() => { const cl = bw.map((b) => Math.min(b.j[J.LeftFoot]?.[1] ?? 9, b.j[J.RightFoot]?.[1] ?? 9) - floorY); let fi = -1, ft = -1e9; win.forEach((f, i) => { if (f.t >= A0 - 100 && cl[i] > ft) { ft = cl[i]; fi = i; } });
      return { windowMs: [Math.round(Math.max(wS, win[0]?.t ?? wS) - A0), Math.round(Math.min(wE, win[win.length - 1]?.t ?? wE) - A0)] as [number, number], frames: win.length, resetsMs: resetsT.map((t) => Math.round(t - A0)), anchorAtReset, snaps, preMs, frozen, flight: { feetUpM: r2(ft), feetApexMs: fi >= 0 ? Math.round(win[fi].t - A0) : null, rootUpM: r2(Math.max(0, ...bw.map((b) => b.rp[1]))) } }; })(),
  };
}
/** Who has the ball this frame: the body whose hand it is parented to, or — on a dribble, where the carry places the ball in
 *  world space and it has no parent — the carrier the mode reports (1v1 possession / 3v3 carrier). '' = loose or in flight. */
function holderOf(f: Frame): string {
  if (f.bb) return f.bb;
  if (!f.ball || f.br) return '';
  const s = f.s || {};
  if (typeof s.cr === 'string') return s.cr === 'foeTeam' ? '' : s.cr;
  if (typeof s.po === 'string' && s.ca) return s.po === 'mine' ? 'me' : s.po === 'defense' ? 'foe' : '';
  return '';
}
function carrierIs(f: Frame, id: string): boolean {
  const s = f.s || {};
  if (typeof s.po === 'string') return id === 'me' ? s.po === 'mine' : id === 'foe' ? s.po === 'defense' : false;
  if (typeof s.cr === 'string') return id === 'me' ? s.cr === 'me' : id.startsWith('mate') ? s.cr === id : false;
  return id === 'me';
}
/** PHASE 2a: the animation-group weights of the subject on every frame around the anchor — the crossFade re-entrancy question
 *  (V:3pt N1: idle_stand at full weight under the 3PT shot and the follow-through; plan §3: "a prev.stop() inside a crossfade can
 *  strand a new clip at weight 0 while the old one plays untracked"). One line per frame; the header says what the shot was (the
 *  mode's own '[3PT-JUICE] make[ perfect][ money]' line) and counts the three symptoms. */
interface WeightVerdict { action: string; attempt: number; take: string; make: boolean; perfect: boolean; money: boolean; releaseMs: number | null; frames: number; idleUnderShot: number; stacked: number; stackedPairs: Record<string, number>; strandedRun: number; stranded: string[]; unweighted: string[];
  /** the scene's side: the most animatables on the Hips node in one frame (2 per clip: its rotation and position tracks), and the
   *  frames / groups with ORPHAN animatables */
  hipsAnimMax: number; orphanFrames: number; orphans: string[] }
const SHOT_CLIP = /jumpshot|pullup_gather|set_gather|shoot|follow/;
function weightVerdict(rec: Rec, m: Metrics): WeightVerdict {
  const A0 = rec.anchorT, S = rec.subject;
  const fr = rec.frames.filter((f) => f.B[S] && f.t >= A0 - 400 && f.t <= A0 + rec.post + 400);
  const nm = (n: string) => clipName(n).replace(/^bball_/, '');
  const makeM = rec.marks.find((mk) => mk.t >= A0 && /\[3PT-JUICE\] make/.test(mk.msg));
  let idleUnderShot = 0, strandedRun = 0; const runs = new Map<string, number>(); const stranded = new Set<string>(); const unweighted = new Set<string>();
  let hipsAnimMax = 0, orphanFrames = 0; const orphans = new Set<string>();
  for (const f of fr) {
    const c = f.B[S].c;
    hipsAnimMax = Math.max(hipsAnimMax, f.B[S].an ?? 0);
    if (f.B[S].ao?.length) { orphanFrames++; for (const o of f.B[S].ao!) orphans.add(nm(o[0])); }
    const idle = c.find((x) => /idle_stand/.test(nm(x[0])))?.[1] ?? 0, shot = Math.max(0, ...c.filter((x) => SHOT_CLIP.test(nm(x[0]))).map((x) => x[1]));
    if (f.t >= A0 && f.t <= A0 + rec.post && idle >= 0.9 && shot >= 0.1) idleUnderShot++;
    for (const x of c) if (x.length > 2 && x[2] === -1) unweighted.add(nm(x[0]));
    const z = new Set((f.B[S].cz ?? []).map(nm));
    for (const k of [...runs.keys()]) if (!z.has(k)) runs.delete(k);
    for (const k of z) { const r = (runs.get(k) ?? 0) + 1; runs.set(k, r); if (r >= 3) stranded.add(k); strandedRun = Math.max(strandedRun, r); }
  }
  return { action: rec.action, attempt: rec.attempt ?? 1, take: rec.take, make: !!makeM, perfect: !!makeM && / perfect/.test(makeM.msg), money: !!makeM && / money/.test(makeM.msg) || fr.some((f) => f.s?.mo === 1 && f.t >= A0 - 100 && f.t <= A0 + 100),
    releaseMs: m.release && m.release.atMs >= 0 ? m.release.atMs : null, frames: fr.length, idleUnderShot, stacked: m.h2.stacked.frames, stackedPairs: m.h2.stacked.pairs, strandedRun, stranded: [...stranded], unweighted: [...unweighted],
    hipsAnimMax, orphanFrames, orphans: [...orphans] };
}
function weightsLog(rec: Rec, m: Metrics): string {
  const A0 = rec.anchorT, S = rec.subject; const v = weightVerdict(rec, m);
  const fr = rec.frames.filter((f) => f.B[S] && f.t >= A0 - 400 && f.t <= A0 + rec.post + 400);
  const nm = (n: string) => clipName(n).replace(/^bball_/, '');
  const names = [...new Set(fr.flatMap((f) => f.B[S].c.map((c) => nm(c[0]))))];
  const lines = [`${rec.action} a${v.attempt} · ${rec.take} · subject ${S} · anchor ${rec.anchorClip} · release ${v.releaseMs ?? '-'} ms · ${v.make ? 'MAKE' : 'miss'}${v.perfect ? ' PERFECT' : ''}${v.money ? ' MONEY BALL' : ''}`,
    `idle_stand ≥ 0.9 under a shot clip ≥ 0.1 (anchor … +${rec.post} ms): ${v.idleUnderShot} frames · stacked (≥ 2 clips ≥ 0.9): ${v.stacked}${Object.keys(v.stackedPairs).length ? ' — ' + Object.entries(v.stackedPairs).map(([k, n]) => `${k} ×${n}`).join(', ') : ''}`,
    `playing at weight ≤ 0.02 for ≥ 3 frames (stranded): ${v.stranded.join(', ') || 'none'} (longest run ${v.strandedRun} frames) · never-weighted groups (w=1*): ${v.unweighted.join(', ') || 'none'}`,
    `the scene's side: at most ${v.hipsAnimMax} animatables on the Hips node in a frame · orphan animatables (running, unlisted by their group) on ${v.orphanFrames} frames${v.orphans.length ? ': ' + v.orphans.join(', ') : ''}`,
    `ms\t${names.join('\t')}\tat ~0 (playing)\tHips animatables\torphans`];
  for (const f of fr) {
    const w = new Map(f.B[S].c.map((c) => [nm(c[0]), c.length > 2 && c[2] === -1 ? '1*' : String(c[1])]));
    lines.push(`${Math.round(f.t - A0)}\t${names.map((n) => w.get(n) ?? '').join('\t')}\t${(f.B[S].cz ?? []).map(nm).join(',')}\t${f.B[S].an ?? ''}\t${(f.B[S].ao ?? []).map((o) => `${nm(o[0])}:${o[1]}×${o[2]}`).join(',')}${f.br ? '\t(released)' : f.bb === S ? '\t(held)' : ''}`);
  }
  return lines.join('\n') + '\n';
}

// ── the browser side ────────────────────────────────────────────────────────────────────────────────────────────────
interface Seg { p: Page; session: Session; errors: string[]; recs: Rec[]; boot: Record<string, unknown> }
async function boot(b: Browser, s: Session): Promise<Seg> {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch (e) {}" });
  // Math.random seeded from the first line of the page (mulberry32): the load's own rolls (a rival's body, a crowd) repeat too
  await ctx.addInitScript({ content: `(() => { let a = ${SEED >>> 0 || 1}; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })()` });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon|gamepad|Unauthorized/.test(t)) errors.push(t.slice(0, 200)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  const url = `${BASE}/dev/mode/${s.mode}?agent=1${s.qs}`;
  const w0 = Date.now();
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  let st = '';
  while (Date.now() - w0 < 300000) { st = (await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => '')) as string; if (st === 'loaded' || st === 'playing' || st === 'failed') break; await p.waitForTimeout(400); }
  if (st !== 'loaded' && st !== 'playing') throw new Error(`${url}: the mode never became ready (state "${st}")`);
  // AUDIT 2026-09-25: the clock went in the moment the mode said 'loaded' — mid-fade on some boots. A second of real time first.
  await p.waitForTimeout(Number(process.env.BOOT_SETTLE_MS ?? 1500));
  await p.evaluate(`window.__VC_CFG = ${JSON.stringify({ dt: VDT, seed: SEED, hogMs: HOG })}`);
  const clock = await p.evaluate(VCLOCK_JS) as Record<string, unknown>;
  await p.evaluate(`window.__HM_CFG = ${JSON.stringify({ dt: VDT, seed: SEED, maxFrames: 1500, hogMs: HOG, recPrep: process.env.REC_PREP !== '0', maxBodies: 16 })}`);
  const inst = await p.evaluate(PAGE_JS) as Record<string, unknown>;
  // the mode is woken IN THE PAGE (the carnival's first press too — the pick screen takes any face button) and paused again
  const started = await p.evaluate(`window.__hm.startMode({ settle: 1200 })`) as Record<string, unknown>;
  console.log(`[boot] ${s.id} ${url} ready in ${((Date.now() - w0) / 1000).toFixed(1)} s · clock ${JSON.stringify(clock)} · page ${JSON.stringify(inst)} · start ${JSON.stringify(started)}`);
  return { p, session: s, errors, recs: [], boot: { url, started, inst, clock } };
}
async function pull(p: Page): Promise<{ bodies: Record<string, string[]>; skins: Record<string, unknown>; frames: Frame[]; marks: Mark[]; errors: string[] }> {
  const first = await p.evaluate('window.__hm.pull(0, 150)') as { bodies: Record<string, string[]>; skins: Record<string, unknown>; frames: Frame[]; total: number; marks: Mark[]; errors: string[] };
  const frames = first.frames.slice();
  for (let at = frames.length; at < first.total; at += 150) { const c = await p.evaluate(`window.__hm.pull(${at}, 150)`) as { frames: Frame[] }; frames.push(...c.frames); }
  return { bodies: first.bodies, skins: first.skins, frames, marks: first.marks, errors: first.errors };
}
const CELL_W = 250, CELL_H = 440;
const recFile = (rec: Rec, ext: string, kind: 'rec' | 'sheet' | 'weights') => `${OUT}/${kind}-${rec.action}${(rec.attempt ?? 1) > 1 ? `-a${rec.attempt}` : ''}.${ext}`;
async function sheet(p: Page, rec: Rec, m: Metrics, file: string): Promise<number[]> {
  const t0 = rec.anchorT - rec.pre, t1 = rec.anchorT + rec.post;
  const picks: Frame[] = [];
  for (let k = 0; k < COLS; k++) { const t = t0 + ((t1 - t0) * k) / (COLS - 1); picks.push(rec.frames.reduce((a, f) => (Math.abs(f.t - t) < Math.abs(a.t - t) ? f : a), rec.frames[0])); }
  const af = rec.frames.reduce((a, f) => (Math.abs(f.t - rec.anchorT) < Math.abs(a.t - rec.anchorT) ? f : a), rec.frames[0]);
  const fwd = af.B[rec.subject] ? facing(af.B[rec.subject]) : [0, 0, 1];
  const cells: { input: Buffer; left: number; top: number }[] = []; const errs: number[] = [];
  for (const [row, view] of (['side', 'front'] as const).entries()) {
    for (const [col, f] of picks.entries()) {
      const r = await p.evaluate(`window.__hm.pose(${JSON.stringify(rec.bodies)}, ${JSON.stringify(f)}, ${JSON.stringify(rec.subject)}, ${JSON.stringify(view)}, ${JSON.stringify(fwd)})`) as { poseErr?: number };
      if (typeof r.poseErr === 'number') { errs.push(r.poseErr); if (r.poseErr > 0.05) console.log(`  sheet ${rec.action}: ${view} ${Math.round(f.t - rec.anchorT)} ms posed ${r.poseErr} m off its recording`); }
      const png = await p.screenshot({ clip: { x: 640 - CELL_W / 2, y: 400 - CELL_H / 2, width: CELL_W, height: CELL_H } });
      const b = f.B[rec.subject]; const top = b ? b.c.slice().sort((x, y) => y[1] - x[1]).slice(0, 2).map((c) => `${clipName(c[0]).replace(/^bball_|^dunk_/, '')}${c[1] < 0.98 ? ' ' + c[1] : ''}`).join(' / ') : '';
      const hand = f.bb === rec.subject ? ` ball:${f.bh}${b ? '/' + visSide(b, f.bh === 'L' ? b.j[J.LeftHand]! : b.j[J.RightHand]!) : ''}` : '';
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const label = `<svg width="${CELL_W}" height="${CELL_H}"><rect x="0" y="0" width="${CELL_W}" height="34" fill="rgba(0,0,0,0.72)"/><text x="4" y="14" font-family="monospace" font-size="12" fill="#ffd54a">${view} ${Math.round(f.t - rec.anchorT)} ms${esc(hand)}</text><text x="4" y="29" font-family="monospace" font-size="10" fill="#e0e0e0">${esc(top).slice(0, 40)}</text></svg>`;
      cells.push({ input: await sharp(png).composite([{ input: Buffer.from(label), top: 0, left: 0 }]).png().toBuffer(), left: col * CELL_W, top: 40 + row * CELL_H });
    }
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const rel = m.release && m.release.atMs >= 0 ? ` · release ${m.release.rig}/${m.release.vis} ${m.release.relToFeetApexMs ?? '-'} ms vs feet apex` : '';
  const title = `<svg width="${COLS * CELL_W}" height="40"><rect width="100%" height="40" fill="#101010"/><text x="8" y="26" font-family="monospace" font-size="18" fill="#fff">${esc(rec.action)} a${rec.attempt ?? 1} (${esc(rec.subject)}) · ${esc(m.clips.map((c) => c.replace(/^bball_/, '')).join(' → ')).slice(0, 150)} · SPARC ${m.sparcMean} · pops ${m.popsN}/${m.severe} · slide p90 ${m.foot.p90Cm} cm · ball path ${m.ball.pathMaxM ?? '-'} m${esc(rel)} · ${esc(m.visual.verdict).slice(0, 80)}</text></svg>`;
  await sharp({ create: { width: COLS * CELL_W, height: 40 + 2 * CELL_H, channels: 3, background: '#000' } }).composite([{ input: Buffer.from(title), top: 0, left: 0 }, ...cells]).png().toFile(file);
  return errs;
}
async function finishSegment(seg: Seg): Promise<void> {
  if (SCRUB && seg.recs.length) {
    const info = await seg.p.evaluate('window.__hm.freeze()');
    console.log(`[scrub] ${seg.session.id}: ${JSON.stringify(info)}`);
    for (const rec of seg.recs) {
      const m = measure(rec);
      const file = recFile(rec, 'png', 'sheet');
      const errs = await sheet(seg.p, rec, m, file).catch((e) => { console.log(`  sheet ${rec.action}: ${String(e).slice(0, 200)}`); return [] as number[]; });
      if (errs.length) console.log(`  sheet ${rec.action} a${rec.attempt ?? 1}: pose fidelity (mean joint error after the render) median ${pctl(errs, 0.5).toFixed(4)} m, max ${Math.max(...errs).toFixed(4)} m`);
    }
  }
  if (seg.errors.length) console.log(`[page errors ${seg.session.id}]`, [...new Set(seg.errors)].slice(0, 6));
  await seg.p.context().close();
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const allRecs: Rec[] = []; const status: Record<string, { found: number; where: string[]; searched: string[] }> = {};
for (const a of ACTS) status[a.id] = { found: AOFF[a.id] ?? 0, where: [], searched: [] };
let tip = '';
try { tip = (await import('node:child_process')).execSync('git rev-parse --short HEAD', { cwd: HERE }).toString().trim(); } catch { tip = '?'; }
/** The recording's tail: shots / finishes / dunks keep 2.5 s more so the pacing metric can see the make and the next check. */
const tailOf = (a: ActionDef) => (/shot|finish|dunk|post/.test(a.kind) ? 2500 : 400);

if (FROM_REC) {
  for (const f of fs.readdirSync(FROM_REC).filter((f) => /^rec-.*\.json$/.test(f)).sort()) { const r = JSON.parse(fs.readFileSync(`${FROM_REC}/${f}`, 'utf8')) as Rec; if (!process.env.ACTIONS || want.includes('all') || want.includes(r.action) || want.includes(r.session)) allRecs.push(r); }
  // sheets again from the recordings: a fresh page of each session (the same bodies, bound by the same ids), frozen at once
  if (SCRUB && allRecs.length) {
    const browser = await chromium.launch({ executablePath: chromiumExe(), headless: process.env.HEADLESS === '1', args: ['--window-size=1280,860', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
    for (const s of SESSIONS) {
      const recs = allRecs.filter((r) => r.session === s.id); if (!recs.length) continue;
      const seg = await boot(browser, s); seg.recs.push(...recs);
      await seg.p.evaluate('window.__hm.bind()');
      await finishSegment(seg);
    }
    await browser.close();
  }
} else {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: process.env.HEADLESS === '1', args: ['--window-size=1280,860', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  for (const s of SESSIONS) {
    const acts = ACTS.filter((a) => sessionsOf(a).includes(s.id)); if (!acts.length) continue;
    // which takes this session RUNS: the canonical ones, plus (TAKES=all) every repeat / variant; which it RECORDS: the takes some
    // wanted action names (a '*' action names them all). 3PT and the carnival are sequential nights: every take of theirs runs
    // (unrecorded if unwanted) so a later rack or the result is reached.
    const need = new Set(acts.flatMap((a) => (a.takes === '*' ? s.takes.map((t) => t.name) : a.takes.filter((n) => s.takes.some((t) => t.name === n)))));
    if (s.id === '3pt' && need.has('p_standings')) need.add('p_rest');
    if (s.id === '3pt' && need.has('p_result')) need.add('p_final');
    const sequential = s.id === '3pt' || s.id === 'carnival';
    const takes = s.takes.filter((t) => (huntNames.size && !sequential ? huntNames.has(t.name) : (t.canon || TAKES === 'all') && (need.has(t.name) || sequential || t.rec === false))).map((t) => (need.has(t.name) ? t : { ...t, rec: false }));
    if (huntNames.size && !sequential && !takes.length) continue;
    const timelines: Record<string, unknown> = {};
    let seg = await boot(browser, s);
    for (const t of takes) {
      // every wanted action of this session has its cap: the rest of the takes are not needed (a '*' action that the game never
      // draws — ai_1v1_celebrate — keeps the session running to the end, as the runners did)
      if (!sequential && acts.every((a) => status[a.id].found >= capOf(a.id))) { console.log(`[seg] ${s.id}: every action has its ${REPS} attempts — the remaining takes are skipped`); break; }
      if (await seg.p.evaluate('window.__hm.ended()')) { console.log(`[seg] ${s.id}: the game ended — sheets for this page, then a fresh one`); await finishSegment(seg); seg = await boot(browser, s); }
      // the take's dice are seeded by its NAME, not its index: adding a take to the catalogue must not reseed every take after it
      // (measured: inserting two takes turned the 3v3 dunk take's dunk into a turnover)
      const opts = { ...t, seed: SEED * 1000 + nameSeed(t.name) };
      const res = await Promise.race([
        seg.p.evaluate(`window.__hm.take(${JSON.stringify(t.name)}, ${JSON.stringify(opts)})`) as Promise<Record<string, unknown>>,
        new Promise<Record<string, unknown>>((r) => setTimeout(() => r({ name: t.name, err: `no answer in ${TAKE_WALL_MS} wall ms` }), TAKE_WALL_MS)),
      ]);
      if (t.rec === false) { console.log(`[take] ${s.id}/${t.name} (not recorded) ${JSON.stringify(res)}`); continue; }
      const data = await pull(seg.p);
      const td: TakeData = { session: s.id, take: t.name, bodies: data.bodies, frames: data.frames, marks: data.marks, meta: { ...res, seed: opts.seed, vdt: VDT, tip, url: seg.boot.url, skins: data.skins } };
      const tl = timeline(td);
      timelines[t.name] = { res, timeline: tl, marks: data.marks.filter((m) => !/-PP(-FOE)?\]/.test(m.msg)).slice(0, 80).map((m) => `${Math.round(m.t - (res.t0 as number ?? 0))} ${m.msg}`), pageErrors: data.errors };
      const hits: string[] = [];
      for (const a of acts) {
        if (a.takes !== '*' && !a.takes.includes(t.name)) continue;
        if (a.takes === '*' && a.session !== s.id && !(a.also ?? []).includes(s.id)) continue;
        status[a.id].searched.push(t.name);
        if (status[a.id].found >= capOf(a.id)) continue;
        for (const an of anchorsIn(td, a)) {
          if (status[a.id].found >= capOf(a.id)) break;
          const T = td.frames[an.i].t; const tail = tailOf(a);
          const rec: Rec = { attempt: status[a.id].found + 1, action: a.id, label: a.label, who: a.who, kind: a.kind, family: a.family, session: s.id, take: t.name, subject: an.body, anchorT: T, anchorClip: an.clip, pre: a.pre, post: a.post, bodies: td.bodies,
            frames: td.frames.filter((f) => f.t >= T - a.pre - 400 && f.t <= T + a.post + tail), marks: td.marks.filter((m) => m.t >= T - a.pre - 400 && m.t <= T + a.post + tail), meta: td.meta };
          fs.writeFileSync(recFile(rec, 'json', 'rec'), JSON.stringify(rec));
          allRecs.push(rec); seg.recs.push(rec); status[a.id].found++; status[a.id].where.push(`a${rec.attempt} ${t.name}@${Math.round(T - (res.t0 as number ?? 0))}ms ${an.body} ${an.clip}`);
          hits.push(`${a.id} a${rec.attempt}`);
        }
      }
      console.log(`[take] ${s.id}/${t.name} ${res.virtualMs ?? '?'} virtual ms in ${res.wallMs ?? '?'} wall ms · ${data.frames.length} frames · bodies ${Object.keys(data.bodies).join(',')}${res.err ? ' · ERR ' + res.err : ''}${res.prepOk === false ? ' · PREP FAILED' : ''}${res.did ? ' · ' + res.did : ''} → ${hits.join(', ') || '(no catalogue action in this take)'}`);
      console.log(`       me: ${String(tl.me ?? '').slice(0, 300)}`);
    }
    // a supplemental run (HUNT / AOFF) keeps the main run's timelines: its own go to takes-<session>-supp<k>.json
    const supp = HUNT.length || Object.keys(AOFF).length; let tf = `${OUT}/takes-${s.id}.json`;
    if (supp) { let k = 1; while (fs.existsSync(`${OUT}/takes-${s.id}-supp${k}.json`)) k++; tf = `${OUT}/takes-${s.id}-supp${k}.json`; }
    fs.writeFileSync(tf, JSON.stringify(timelines, null, 1));
    await finishSegment(seg);
  }
  await browser.close();
}

const ms = allRecs.map((r) => measure(r));
// the weights log: every 3PT shot (the crossFade question), or everything with WEIGHTS=1
const verdicts: WeightVerdict[] = [];
for (const [i, r] of allRecs.entries()) if (WEIGHTS_ALL || (r.session === '3pt' && r.kind === 'shot')) { fs.writeFileSync(recFile(r, 'txt', 'weights'), weightsLog(r, ms[i])); if (r.session === '3pt' && r.kind === 'shot') verdicts.push(weightVerdict(r, ms[i])); }
if (verdicts.length) {
  const grp = (lab: string, f: (v: WeightVerdict) => boolean) => { const vs = verdicts.filter(f); return `${lab}: ${vs.length} shots · idle_stand under the shot in ${vs.filter((v) => v.idleUnderShot > 0).length} (frames ${vs.map((v) => v.idleUnderShot).join('/') || '-'}) · stacked frames ${vs.map((v) => v.stacked).join('/') || '-'} · stranded clips in ${vs.filter((v) => v.stranded.length).length} · Hips animatables max ${vs.map((v) => v.hipsAnimMax).join('/') || '-'} · orphan animatables in ${vs.filter((v) => v.orphanFrames).length}`; };
  const txt = [`3PT animation-group weights — the crossFade re-entrancy question (V:3pt N1), ${verdicts.length} shots · tip ${tip}`,
    grp('perfect makes', (v) => v.perfect), grp('money-ball makes', (v) => v.money && v.make), grp('other makes', (v) => v.make && !v.perfect && !v.money), grp('misses', (v) => !v.make), '',
    ...verdicts.map((v) => `${v.action} a${v.attempt} ${v.take} ${v.make ? 'MAKE' : 'miss'}${v.perfect ? ' PERFECT' : ''}${v.money ? ' MONEY' : ''} · rel ${v.releaseMs ?? '-'} ms · idle under shot ${v.idleUnderShot} · stacked ${v.stacked}${Object.keys(v.stackedPairs).length ? ' (' + Object.entries(v.stackedPairs).map(([k, n]) => `${k} ×${n}`).join(', ') + ')' : ''} · stranded ${v.stranded.join(',') || '-'} (run ${v.strandedRun}) · unweighted ${v.unweighted.join(',') || '-'} · Hips animatables max ${v.hipsAnimMax} · orphans ${v.orphanFrames ? `${v.orphanFrames} frames (${v.orphans.join(',')})` : 'none'}`)];
  fs.writeFileSync(`${OUT}/weights-summary.txt`, txt.join('\n') + '\n');
}
// MERGE (default): a partial run (one session, a few actions) keeps the tag's other actions — metrics.json and status stay whole
const ranIds = new Set(ACTS.map((a) => a.id));
const merged = (() => {
  if (process.env.MERGE === '0' || FROM_REC) return ms;
  try {
    const old = JSON.parse(fs.readFileSync(`${OUT}/metrics.json`, 'utf8')) as Metrics[];
    // an action this run measured replaces its old attempts — except the AOFF ones, which this run numbered after
    const keep = (m: Metrics) => (!ranIds.has(m.id) || (AOFF[m.id] != null && (m.attempt ?? 1) <= AOFF[m.id])) && !ms.some((x) => x.id === m.id && (x.attempt ?? 1) === (m.attempt ?? 1));
    return [...old.filter(keep), ...ms];
  } catch { return ms; }
})();
fs.writeFileSync(`${OUT}/metrics.json`, JSON.stringify(merged, null, 1));
const pad = (s: string | number | null | undefined, n: number) => String(s ?? '-').padEnd(n);
console.log(`\n${pad('action', 26)}${pad('att', 4)}${pad('body', 6)}${pad('SPARC', 7)}${pad('pops', 7)}${pad('whip', 5)}${pad('elb', 5)}${pad('knee', 5)}${pad('wrist', 6)}${pad('thor', 6)}${pad('slide90', 8)}${pad('ball w/rel', 12)}${pad('held rig/vis', 14)}${pad('rel hips/feet', 14)}${pad('seam°', 6)}${pad('stack', 6)}clips`);
for (const m of ms) {
  const hr = `${m.ball.heldRig.R ? 'R' + m.ball.heldRig.R : ''}${m.ball.heldRig.L ? 'L' + m.ball.heldRig.L : ''}/${m.ball.heldVis.R ? 'R' + m.ball.heldVis.R : ''}${m.ball.heldVis.L ? 'L' + m.ball.heldVis.L : ''}`;
  console.log(`${pad(m.id, 26)}${pad(m.attempt, 4)}${pad(m.subject, 6)}${pad(m.sparcMean, 7)}${pad(`${m.popsN}/${m.severe}`, 7)}${pad(m.whips, 5)}${pad(m.lockedElbow, 5)}${pad(m.lockedKnee, 5)}${pad(m.wristStill, 6)}${pad(m.thoracicStill, 6)}${pad(m.foot.p90Cm, 8)}${pad(`${m.ball.pathMaxM ?? '-'}/${m.ball.pathMaxRelM ?? '-'}`, 12)}${pad(hr, 14)}${pad(`${m.release?.relToApexMs ?? '-'}/${m.release?.relToFeetApexMs ?? '-'}`, 14)}${pad(m.h2.hipYawSeam?.maxDeg, 6)}${pad(m.h2.stacked.frames, 6)}${m.clips.map((c) => c.replace(/^bball_/, '')).join(' → ').slice(0, 90)}`);
}
console.log('\nVISUAL vs CLIP');
for (const m of ms) console.log(`${pad(m.id, 26)}a${m.attempt} anchor ${pad(m.anchorClip, 28)} ${m.visual.verdict}${m.release && m.release.atMs >= 0 ? ` · released from rig ${m.release.rig} (drawn ${m.release.vis}) at ${m.release.atMs} ms, hips apex ${m.release.apexMs} ms (rise ${m.release.jumpM} m), feet apex ${m.release.feetApexMs ?? '-'} ms (clear ${m.release.feetUpM ?? '-'} m${m.release.airborne === false ? ', FEET DOWN at release' : ''})` : ''}${m.h2.finish ? ` · finish hand ${m.h2.finish.hand || '?'} rim ${m.h2.finish.rimSide || '-'} defender ${m.h2.finish.defender || 'none'}${m.h2.finish.defenderM != null ? ' ' + m.h2.finish.defenderM + ' m' : ''} ${m.h2.finish.outsideHand == null ? '' : m.h2.finish.outsideHand ? 'OUTSIDE hand' : 'INSIDE hand'}` : ''}${m.audit?.anchorAtReset ? ' · ANCHOR AT A RESET' : ''}${m.audit?.resetsMs.length ? ` · window cut at reset ${m.audit.resetsMs.join('/')} ms` : ''}${m.shotTypes.length ? ' · HUD ' + m.shotTypes.join('/') : ''}`);
console.log('\nPHASE 2a METRICS');
for (const m of ms) { const h = m.h2; console.log(`${pad(m.id, 26)}a${m.attempt} dribble ${h.dribbleContact ? `${h.dribbleContact.bounces} bounces p50 ${h.dribbleContact.p50M ?? '-'} m` : '-'} · cadence ${h.cadence ? `${h.cadence.stepsPerSec ?? '-'} steps/s stride ${h.cadence.strideM ?? '-'} m root ${h.cadence.rootMps ?? '-'} m/s feet ${h.cadence.feetMps ?? '-'} m/s` : '-'} · guide ${h.guideHand ? `${h.guideHand.minM ?? '-'} m` : '-'} · wrist ${h.wristFlex ? `${h.wristFlex.rangeDeg}°` : '-'} · overlap ${h.overlap.frames}${h.overlap.with ? ' with ' + h.overlap.with : ''} · arms ${h.aiArms ? Object.entries(h.aiArms).map(([k, v]) => `${k} hand ${v.handOffP50 ?? '-'} tip ${v.tipOffP50 ?? '-'}`).join(' ') : '-'} · look ${h.look ? `${h.look.target} p50 ${h.look.errP50Deg ?? '-'}° p90 ${h.look.errP90Deg ?? '-'}°` : '-'} · shield ${h.shield && h.shield.pressured ? `${h.shield.pressured} fr far ${h.shield.ballFarFrac} arm ${h.shield.forearmBetweenFrac}` : '-'} · catch ${h.catchReach ? `${h.catchReach.m100Ms ?? '-'} m` : '-'} · hands ${h.celebration?.handTravelM ?? '-'} m · pacing ${h.pacing ? `rel ${h.pacing.releaseMs ?? '-'} make ${h.pacing.makeMs ?? '-'} reset ${h.pacing.resetMs ?? '-'}` : '-'}`); }
if (!FROM_REC) {
  let all: Record<string, { found: number; where: string[]; searched: string[] }> = {};
  if (process.env.MERGE !== '0') { try { all = JSON.parse(fs.readFileSync(`${OUT}/status.json`, 'utf8')); } catch { all = {}; } }
  for (const a of ACTS) { const o = AOFF[a.id] != null ? all[a.id] : undefined; all[a.id] = { found: status[a.id].found, where: [...(o?.where ?? []), ...status[a.id].where], searched: [...new Set([...(o?.searched ?? []), ...status[a.id].searched])] }; }
  fs.writeFileSync(`${OUT}/status.json`, JSON.stringify(all, null, 1));
  const line = (a: ActionDef) => { const s = all[a.id]; if (!s) return `NOT RUN ${a.id.padEnd(26)} ${a.who.padEnd(5)} ${a.label}`; return `${s.found ? `FOUND ${String(s.found).padStart(2)}` : 'MISSING '} ${a.id.padEnd(26)} ${a.who.padEnd(5)} ${a.label}${s.found ? ` — ${s.where.join('; ')}` : ` — searched ${[...new Set(s.searched)].join(', ') || '(no take ran)'}`}`; };
  const lines = CATALOGUE.filter((a) => all[a.id]).map(line);
  const found = lines.filter((l) => l.startsWith('FOUND'));
  fs.writeFileSync(`${OUT}/status.txt`, `hoops motion probe · tip ${tip} · ${BASE} · virtual clock ${VDT.toFixed(4)} ms/frame · seed ${SEED} · REPS ${REPS} (${TAKES} takes) · ${found.length}/${lines.length} found · ${Object.values(all).reduce((n, s) => n + s.found, 0)} recordings\n\n${lines.join('\n')}\n`);
  console.log(`\n${ACTS.map(line).join('\n')}`);
}
console.log(`\n${allRecs.length} recordings → ${OUT} (virtual clock: every rendered frame = ${VDT.toFixed(3)} ms of game time; seed ${SEED}; REPS ${REPS}, ${TAKES} takes; tip ${tip})`);
