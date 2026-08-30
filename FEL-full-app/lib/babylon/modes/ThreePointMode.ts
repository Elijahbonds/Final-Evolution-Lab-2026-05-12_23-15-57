// ThreePointMode — Babylon 9 Three-Point Shootout.
//
// Ported from the react-three-fiber implementation (components/games/
// three-point-3d.tsx) so 3PT runs on the same Babylon stack as every other
// mode instead of dragging a second renderer into the bundle. The tuned
// constants are carried over VERBATIM — they came from the proven 2D shootout
// and are the reason the mechanic feels right. // TUNE(elijah)
//
// The shot is a timing mechanic: an oscillating release bar sweeps 0..1 and the
// sweet spot is SHOT_TARGET. How close the release lands to that decides the
// make. That is exactly why this mode is the Controller Link reference target —
// if a phone can hit a timing window, the transport is fast enough for anything.
//
// BENCHMARK (locked): NBA 2K9 Three-Point Contest. That means a FIELD and
// ROUNDS, not a solo time attack — the 2009 event ran six shooters through a
// qualifying round, advanced the top three, and decided it on a final round.
// The shot format was already right (5 racks x 5 balls, last ball of each rack
// is the money ball worth 2, 30 max, 60s); what was missing was the contest
// around it, so a score had nothing to be measured against but a fixed number.
//
// Controller Link contract (see lib/controller-link/schemas/registry.ts):
//   'shoot'  — release. Optional payload {power} from a tilt charge; when the
//              phone sends power we bias the arc, but the TIMING is still what
//              decides the make, so a button-only controller is not handicapped.
//   'charge' — live 0..1 wind-up, streamed for the on-screen power ring.

import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
import { applyOceanCourt } from '../visual/CourtSurface';
import { ShotArc } from '../core/BasketballCore';
import { SoundKit } from '../audio/SoundKit';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';

// ── EXACT tuned constants (verbatim from the proven 2D/R3F shootout) ──
const RACKS = 5;
const BALLS_PER_RACK = 5;
const GAME_LEN = 60;
/** 2009 field size. Top FINALISTS advance from qualifying to the final round. */
const FIELD_SIZE = 6;
const FINALISTS = 3;
const SHOT_TARGET = 0.72;          // release-bar sweet centre // TUNE(elijah)
// The real NBA three-point line is NOT a constant radius: 6.71m in the corners,
// 7.24m at the top of the arc. The racks sit ON that line, so a corner rack is a
// genuinely shorter shot than the top-of-key rack — which is the reason the top
// rack is the hard one in the real contest. A single radius flattened that away.
export const RACK_CORNER_R = 6.71;        // NBA corner three
export const RACK_TOP_R = 7.24;           // NBA top-of-arc three
export const RACK_ANGLES = [30, 60, 90, 120, 150].map((d) => (d * Math.PI) / 180);
/** Radius at a given arc angle: corner distance at the ends, top distance at 90 deg. */
export function rackRadius(angleRad: number): number {
  // sin peaks at 90 deg (top of the key) and falls to 0.5 at the 30/150 corners.
  const t = (Math.sin(angleRad) - 0.5) / 0.5;      // 0 at corners, 1 at the top
  return RACK_CORNER_R + (RACK_TOP_R - RACK_CORNER_R) * Math.max(0, Math.min(1, t));
}

/** Rim position matches VenueKit.buildCourt's hoop. */
const RIM = new Vector3(0, 3.05, -0.6);

/** Rack stations swept along the arc in FRONT of the rim (+z side). */
const RACK_POS = RACK_ANGLES.map(
  (a) => new Vector3(RIM.x + rackRadius(a) * Math.cos(a), 0, RIM.z + rackRadius(a) * Math.sin(a)),
);

/** How wide the "perfect" window is around SHOT_TARGET. */
const PERFECT_BAND = 0.06;         //TUNE(elijah)
const GOOD_BAND = 0.16;            //TUNE(elijah)
/** Bar sweeps a full cycle in this many seconds. */
const BAR_PERIOD = 1.15;           //TUNE(elijah)
/** Seconds to travel between rack stations. */
const MOVE_SEC = 0.85;             //TUNE(elijah)
/** How long the standings board holds between rounds. */
const STANDINGS_SEC = 4.0;         //TUNE(elijah)

type Phase = 'move' | 'shoot' | 'flight' | 'standings' | 'done';
type Round = 'qualifying' | 'final';

export interface Shooter {
  name: string;
  score: number;
  isPlayer: boolean;
  shot: boolean;      // has posted a score this round
}

/** Fictional rivals — deliberately not real 2009 competitors, since shipping
 *  real athletes' names is a licensing question, not an engineering one. */
const RIVAL_NAMES = ['V. MARCH', 'D. OKAFOR', 'R. SOLIS', 'T. HALE', 'K. NDIAYE'];

/**
 * A rival's round score. Real 2009 scores ran ~9-19 in qualifying and ~12-19 in
 * the final, so this centres there rather than spanning the full 0-30 — a field
 * that can post 3 or 29 makes the player's own score feel arbitrary.
 * `skill` biases the centre; the triangular draw keeps extremes rare.
 */
export function simulateRival(skill: number, round: Round): number {
  const centre = (round === 'final' ? 14 : 12.5) + skill * 5;
  const spread = round === 'final' ? 3.2 : 4.0;
  const tri = (Math.random() + Math.random()) / 2;          // triangular, centred
  const raw = centre + (tri * 2 - 1) * spread * 2;
  return Math.max(3, Math.min(30, Math.round(raw)));
}

let player: SpawnedCharacter | null = null;
let ball: Mesh | null = null;
let arc: ShotArc | null = null;
let ballMat: StandardMaterial | null = null;
/** One ball-rack per station: the frame plus its five balls. */
let rackBalls: Mesh[][] = [];
let rackMeshes: Mesh[] = [];

/** Regulation ball vs the money ball. In the real contest (and in 2K9) the money
 *  ball is a different colour — seeing it coming is part of the tension, and it
 *  is the only cue that the next shot is worth double. */
const BALL_COLOR = Color3.FromHexString('#c1571f');       // leather orange
const MONEY_COLOR = Color3.FromHexString('#ffd75e');      // money-ball gold

/** Hide the balls already taken, so a rack visibly empties as it is shot. */
function syncRacks(): void {
  for (let r = 0; r < rackBalls.length; r++) {
    for (let b = 0; b < rackBalls[r].length; b++) {
      // Racks ahead stay full; the current rack empties left-to-right; racks
      // already finished stay empty.
      const taken = r < S.rack || (r === S.rack && b < S.ballIdx);
      rackBalls[r][b].isVisible = !taken;
    }
  }
}

/** Recolour the loaded ball for whichever shot is next up. */
function dressBall(): void {
  syncRacks();
  if (!ballMat) return;
  const money = isMoneyBall(S.ballIdx);
  ballMat.diffuseColor = money ? MONEY_COLOR : BALL_COLOR;
  // A touch of emissive so the money ball reads at distance under the venue grade.
  ballMat.emissiveColor = money ? MONEY_COLOR.scale(0.35) : Color3.Black();
}

// A ModeDefinition is a module singleton, so its state is shared by every
// harness instance that mounts it. In dev, React mounts twice (StrictMode /
// Fast Refresh): instance A loads, instance B loads, then A's teardown runs and
// nulls player/ball/arc out from under the LIVE instance B. update() then
// early-returns forever — the scene renders, the camera tracks, and nothing
// ever moves. Counting loads against disposals lets a stale teardown skip.
let loadCount = 0;
let disposeCount = 0;

const S = {
  phase: 'move' as Phase,
  rack: 0,
  ballIdx: 0,
  pts: 0,
  streak: 0,
  best: 0,
  clock: GAME_LEN,
  barT: 0,
  moveT: 0,
  from: new Vector3(),
  /** Live wind-up charge streamed from a phone; 0 when playing on keys. */
  charge: 0,
  fired: false,
  // ── contest layer ──
  round: 'qualifying' as Round,
  field: [] as Shooter[],
  /** Per-rival skill 0..1, fixed for the whole contest so form is consistent. */
  skills: [] as number[],
  standingsT: 0,
  eliminated: false,
  /** Previous hero position, for the camera's velocity term. */
  prevPos: new Vector3(),
  vel: new Vector3(),
};

function resetState(): void {
  S.phase = 'move'; S.rack = 0; S.ballIdx = 0; S.pts = 0; S.streak = 0; S.best = 0;
  S.clock = GAME_LEN; S.barT = 0; S.moveT = 0; S.charge = 0; S.fired = false;
  S.from.copyFrom(RACK_POS[0]);
  S.round = 'qualifying';
  S.standingsT = 0;
  S.eliminated = false;
  S.skills = RIVAL_NAMES.map(() => 0.25 + Math.random() * 0.7);
  S.field = [
    { name: 'YOU', score: 0, isPlayer: true, shot: false },
    ...RIVAL_NAMES.slice(0, FIELD_SIZE - 1).map((name) => ({
      name, score: 0, isPlayer: false, shot: false,
    })),
  ];
}

/** Reset only the per-run shooting state, keeping contest standings. */
function resetRun(): void {
  S.phase = 'move'; S.rack = 0; S.ballIdx = 0; S.pts = 0; S.streak = 0;
  S.clock = GAME_LEN; S.barT = 0; S.moveT = 0; S.charge = 0; S.fired = false;
  S.from.copyFrom(RACK_POS[0]);
}

const standings = (): Shooter[] => [...S.field].sort((a, b) => b.score - a.score);

/** A rack's last ball is the money ball — 2 points instead of 1. */
const isMoneyBall = (i: number): boolean => i === BALLS_PER_RACK - 1;

function pushHud(ctx: ModeContext, banner?: string): void {
  ctx.setHud({
    score: S.pts,
    rack: `${Math.min(S.rack + 1, RACKS)}/${RACKS}`,
    ball: `${Math.min(S.ballIdx + 1, BALLS_PER_RACK)}/${BALLS_PER_RACK}`,
    streak: S.streak,
    clock: Math.max(0, Math.ceil(S.clock)),
    meter: S.phase === 'shoot' ? Number(S.barT.toFixed(2)) : null,
    money: isMoneyBall(S.ballIdx),
    charge: S.charge > 0.02 ? Number(S.charge.toFixed(2)) : null,
    round: S.round === 'final' ? 'FINAL' : 'QUALIFYING',
    // The bezel renders a scorecard from {name,score,line} triples, so the
    // standings board reuses the judged-contest HUD channel rather than
    // inventing a second one.
    board: S.phase === 'standings' || S.phase === 'done'
      ? standings().map((f, i) => ({
          name: f.name,
          score: f.score,
          line: S.round === 'qualifying' && i < FINALISTS ? 'ADVANCES'
            : S.round === 'final' && i === 0 ? 'CHAMPION'
            : `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}`,
        }))
      : null,
    banner: banner ?? null,
  });
}

/** Release the loaded ball, grading on how close the bar was to the sweet spot. */
function fire(ctx: ModeContext, power?: number): void {
  if (S.phase !== 'shoot' || S.fired || !player || !ball || !arc) return;
  S.fired = true;

  const err = Math.abs(S.barT - SHOT_TARGET);
  // A tilt charge nudges the odds but never replaces timing — a phone player and
  // a keyboard player are judged on the same window.
  const powerBonus = typeof power === 'number' ? (1 - Math.abs(power - 0.75)) * 0.05 : 0;
  const made = err < PERFECT_BAND || (err < GOOD_BAND && Math.random() < 0.55 + powerBonus);
  const perfect = err < PERFECT_BAND;

  const worth = isMoneyBall(S.ballIdx) ? 2 : 1;
  if (made) {
    S.pts += worth;
    S.streak += 1;
    S.best = Math.max(S.best, S.streak);
  } else {
    S.streak = 0;
  }

  // 'jumpshot' is a real registered clip; SPORT_CLIP has no shooting alias.
  player.animator.play('jumpshot', { speedRatio: 1.05 });
  ball.position.copyFrom(player.root.position).addInPlace(new Vector3(0, 1.9, 0));
  arc.start(ball.position.clone(), RIM, made, 'jumper');
  S.phase = 'flight';

  const money = isMoneyBall(S.ballIdx);
  if (made) {
    ctx.juice.scorePop(RIM.clone(), perfect ? `PERFECT +${worth}` : `+${worth}`,
      perfect ? '#22d3ee' : '#ffd75e');
    ctx.feel.impact(perfect ? 0.5 : 0.3);
    SoundKit.play('score');
    // Phase 7/8 — a money ball IS the crowd moment in this event, and a hot
    // streak is the other one. Landing them identically to a routine make is
    // what made the run read flat. Camera punch + exposure flash + crowd.
    if (money || S.streak >= 4) {
      SoundKit.play('crowdCheer');
      ctx.camDirector.pulse(money ? 0.7 : 0.45, 0.45);       //TUNE(elijah)
      ctx.lights.flashBeat();
    }
  } else {
    SoundKit.play('miss');
    // Bricking the double-value ball deserves the groan.
    if (money) SoundKit.play('crowdGroan');
  }
  S.charge = 0;
  pushHud(ctx, made ? (perfect ? 'PERFECT' : 'GOOD') : 'MISS');
}

function advanceBall(ctx: ModeContext): void {
  S.ballIdx += 1;
  S.fired = false;
  if (S.ballIdx >= BALLS_PER_RACK) {
    S.ballIdx = 0;
    S.rack += 1;
    if (S.rack >= RACKS) { endRun(ctx); return; }
    S.from.copyFrom(player?.root.position ?? RACK_POS[0]);
    S.moveT = 0;
    S.phase = 'move';
    return;
  }
  S.barT = Math.random() * Math.PI;   // desync the bar so it can't be memorised
  S.phase = 'shoot';
  dressBall();
}

/** The player's run for this round is over — post the score, run the field. */
function endRun(ctx: ModeContext): void {
  if (S.phase === 'done' || S.phase === 'standings') return;

  const me = S.field.find((f) => f.isPlayer);
  if (me) { me.score = S.pts; me.shot = true; }

  // Rivals shoot "at the same time" as far as the player is concerned. Only
  // those still in the contest post a score.
  S.field.forEach((f, i) => {
    if (f.isPlayer || f.shot) return;
    f.score = simulateRival(S.skills[i - 1] ?? 0.5, S.round);
    f.shot = true;
  });

  S.phase = 'standings';
  S.standingsT = 0;
  pushHud(ctx, S.round === 'qualifying' ? 'QUALIFYING RESULTS' : 'FINAL RESULTS');
}

/** Called once the standings board has been shown long enough to read. */
function afterStandings(ctx: ModeContext): void {
  const board = standings();
  const me = board.findIndex((f) => f.isPlayer);
  const myScore = board[me]?.score ?? 0;

  if (S.round === 'final') {
    const won = me === 0;
    S.phase = 'done';
    ctx.end(won ? 'win' : 'complete', myScore, {
      points: myScore, bestStreak: S.best, place: me + 1, round: 2,
    });
    return;
  }

  // Qualifying: top three advance, exactly as the 2009 event ran.
  if (me >= FINALISTS) {
    S.eliminated = true;
    S.phase = 'done';
    ctx.end('complete', myScore, {
      points: myScore, bestStreak: S.best, place: me + 1, round: 1,
    });
    return;
  }

  // Advance: the field shrinks to the finalists and everyone shoots again.
  S.round = 'final';
  S.field = board.slice(0, FINALISTS).map((f) => ({ ...f, score: 0, shot: false }));
  S.skills = S.field.map(() => 0.35 + Math.random() * 0.6);
  resetRun();
  pushHud(ctx, 'FINAL ROUND');
}

/**
 * Pure round resolution — the 2K9 contest rule, isolated from scene state so it
 * can be proved without a renderer. Qualifying advances the top FINALISTS; the
 * final is won outright by the leader.
 */
export function resolveRound(field: Shooter[], round: Round): {
  board: Shooter[];
  place: number;
  advances: boolean;
  champion: boolean;
} {
  const board = [...field].sort((a, b) => b.score - a.score);
  const place = board.findIndex((f) => f.isPlayer) + 1;
  return {
    board,
    place,
    advances: round === 'qualifying' && place >= 1 && place <= FINALISTS,
    champion: round === 'final' && place === 1,
  };
}

export const ThreePointMode: ModeDefinition = {
  modeId: 'threepoint',
  mood: 'goldenHour',
  camPreset: 'hoops',

  async load(ctx: ModeContext): Promise<void> {
    loadCount += 1;
    resetState();

    VenueKit.buildCourt(ctx.scene, 'venice');
    applyOceanCourt(ctx.scene, 'venice');

    player = await CharacterLibrary.spawn(ctx.scene, '', {
      position: RACK_POS[0].clone(),
      startClip: 'idle_stand',
      modeId: 'threepoint',
    });
    neverBindPose(player.animator, 'idle_stand');
    installSafePlay(player.animator, 'threepoint');
    ctx.groundLock.track(player.root, player.skeleton);
    ctx.heroRef.current = player.root;

    ball = MeshBuilder.CreateSphere('tp_ball', { diameter: 0.24, segments: 16 }, ctx.scene);
    ballMat = new StandardMaterial('tp_ballMat', ctx.scene);
    ball.material = ballMat;
    dressBall();
    ball.position.copyFrom(RACK_POS[0]).addInPlace(new Vector3(0, 1.9, 0));
    // The objective is the RIM, not the ball. The 'hoops' preset frames hero and
    // objective together (fitTwo), so pointing this at the ball — which sits in
    // the shooter's own hands — gave it two coincident points and the framing
    // degenerated to a view of the boardwalk with neither player nor hoop in it.
    ctx.objectiveRef.current = RIM;

    // Phase 6 / Concept Lock D3 — the racks belong ON the court. 2K9 shows them,
    // and without them nothing tells the player where the balls are, how many are
    // left, or which one is the money ball until it is already in their hands.
    rackBalls = [];
    rackMeshes = [];
    for (let r = 0; r < RACKS; r++) {
      const at = RACK_POS[r];
      const stand = MeshBuilder.CreateBox(`rack_${r}`, { width: 0.9, height: 0.12, depth: 0.34 }, ctx.scene);
      // Sit the rack just outside the arc so the shooter is never inside it.
      const outward = at.subtract(RIM).normalize();
      stand.position.copyFrom(at).addInPlace(outward.scale(0.75));
      stand.position.y = 0.62;
      const standMat = new StandardMaterial(`rackMat_${r}`, ctx.scene);
      standMat.diffuseColor = Color3.FromHexString('#2b3038');
      stand.material = standMat;
      rackMeshes.push(stand);

      const balls: Mesh[] = [];
      for (let b = 0; b < BALLS_PER_RACK; b++) {
        const bm = MeshBuilder.CreateSphere(`rack_${r}_ball_${b}`, { diameter: 0.2, segments: 10 }, ctx.scene);
        bm.position.copyFrom(stand.position);
        bm.position.x += (b - (BALLS_PER_RACK - 1) / 2) * 0.21;
        bm.position.y += 0.16;
        const m = new StandardMaterial(`rack_${r}_ballMat_${b}`, ctx.scene);
        const money = isMoneyBall(b);
        m.diffuseColor = money ? MONEY_COLOR : BALL_COLOR;
        if (money) m.emissiveColor = MONEY_COLOR.scale(0.3);
        bm.material = m;
        balls.push(bm);
      }
      rackBalls.push(balls);
      rackMeshes.push(...balls);
    }

    arc = new ShotArc();

    S.from.copyFrom(RACK_POS[0]);
    S.prevPos.copyFrom(player.root.position);

    // ModeHarness constructs the CameraDirector but does NOT drive it — each
    // mode owns its own framing. Without these calls the camera stays at its
    // construction default (0, 3, -8), which sits behind the hoop looking out
    // at the boardwalk: no shooter, no rim, no shot arc in frame.
    ctx.camDirector.snapTo(player.root.position, RIM);
    pushHud(ctx, 'RACK 1');
  },

  onInput(ctx: ModeContext, e: FelInput): void {
    if (S.phase === 'done' || S.phase === 'standings') return;

    // Phone tilt wind-up streams in as the right trigger (see modeBridge).
    if (e.t === 'trigger' && e.side === 'R') {
      S.charge = e.value;
      return;
    }
    // A press is the release: keyboard Space, touch SHOOT, or a phone flick all
    // arrive here identically because they all normalise to FelInput.
    if (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B')) {
      fire(ctx, S.charge > 0.02 ? S.charge : undefined);
    }
  },

  update(ctx: ModeContext, dt: number): void {
    if (S.phase === 'done' || !player || !ball || !arc) return;

    // Standings board holds for a beat so the result is readable before the
    // final round starts (or the contest ends).
    if (S.phase === 'standings') {
      S.standingsT += dt;
      if (S.standingsT >= STANDINGS_SEC) afterStandings(ctx);
      return;
    }

    S.clock -= dt;
    if (S.clock <= 0) { endRun(ctx); return; }

    if (S.phase === 'move') {
      S.moveT = Math.min(1, S.moveT + dt / MOVE_SEC);
      const target = RACK_POS[Math.min(S.rack, RACKS - 1)];
      // Ease so the jog into the rack reads as deliberate rather than a snap.
      const k = S.moveT * S.moveT * (3 - 2 * S.moveT);
      player.root.position = Vector3.Lerp(S.from, target, k);
      player.animator.play(k < 1 ? 'run' : 'idle_stand', { loop: true });
      ball.position.copyFrom(player.root.position).addInPlace(new Vector3(0, 1.9, 0));
      if (S.moveT >= 1) {
        S.phase = 'shoot';
        S.fired = false;
        S.barT = Math.random() * Math.PI;
        dressBall();
        pushHud(ctx, `RACK ${S.rack + 1}`);
      }
    } else if (S.phase === 'shoot') {
      // Triangle sweep 0..1..0 — a sine would linger at the extremes and make
      // the sweet spot easier at the top of the arc than the bottom.
      S.barT = (S.barT + dt / BAR_PERIOD) % 1;
      ball.position.copyFrom(player.root.position).addInPlace(new Vector3(0, 1.9, 0));
      // Face the rim while loaded.
      player.root.lookAt(new Vector3(RIM.x, player.root.position.y, RIM.z));
    } else if (S.phase === 'flight') {
      const r = arc.step(dt, ball.position);
      if (r !== 'flying') advanceBall(ctx);
    }

    // Camera follows the shooter, framed against the rim (the 'hoops' preset
    // fits both). Velocity is derived rather than tracked so the lookAhead term
    // leads the jog between racks.
    if (dt > 0) {
      S.vel.copyFrom(player.root.position).subtractInPlace(S.prevPos).scaleInPlace(1 / dt);
      S.prevPos.copyFrom(player.root.position);
    }
    ctx.camDirector.update(player.root.position, S.vel, RIM);

    pushHud(ctx);
  },

  dispose(): void {
    disposeCount += 1;
    // A newer instance has already loaded — this teardown belongs to an older
    // one and must not touch the live objects.
    if (disposeCount < loadCount) return;
    player?.dispose(); player = null;
    ball?.dispose(); ball = null;
    ballMat?.dispose(); ballMat = null;
    for (const m of rackMeshes) m.dispose();
    rackMeshes = []; rackBalls = [];
    arc = null;
  },
};
