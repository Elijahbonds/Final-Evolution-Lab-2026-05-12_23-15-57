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
// Controller Link contract (see lib/controller-link/schemas/registry.ts):
//   'shoot'  — release. Optional payload {power} from a tilt charge; when the
//              phone sends power we bias the arc, but the TIMING is still what
//              decides the make, so a button-only controller is not handicapped.
//   'charge' — live 0..1 wind-up, streamed for the on-screen power ring.

import { MeshBuilder, Vector3 } from '@babylonjs/core';
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
const WIN_PTS = 18;
const SHOT_TARGET = 0.72;          // release-bar sweet centre // TUNE(elijah)
const RACK_R = 6.75;               // 3-point arc radius
const RACK_ANGLES = [30, 60, 90, 120, 150].map((d) => (d * Math.PI) / 180);

/** Rim position matches VenueKit.buildCourt's hoop. */
const RIM = new Vector3(0, 3.05, -0.6);

/** Rack stations swept along the arc in FRONT of the rim (+z side). */
const RACK_POS = RACK_ANGLES.map(
  (a) => new Vector3(RIM.x + RACK_R * Math.cos(a), 0, RIM.z + RACK_R * Math.sin(a)),
);

/** How wide the "perfect" window is around SHOT_TARGET. */
const PERFECT_BAND = 0.06;         //TUNE(elijah)
const GOOD_BAND = 0.16;            //TUNE(elijah)
/** Bar sweeps a full cycle in this many seconds. */
const BAR_PERIOD = 1.15;           //TUNE(elijah)
/** Seconds to travel between rack stations. */
const MOVE_SEC = 0.85;             //TUNE(elijah)

type Phase = 'move' | 'shoot' | 'flight' | 'done';

let player: SpawnedCharacter | null = null;
let ball: Mesh | null = null;
let arc: ShotArc | null = null;

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
};

function resetState(): void {
  S.phase = 'move'; S.rack = 0; S.ballIdx = 0; S.pts = 0; S.streak = 0; S.best = 0;
  S.clock = GAME_LEN; S.barT = 0; S.moveT = 0; S.charge = 0; S.fired = false;
  S.from.copyFrom(RACK_POS[0]);
}

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
    charge: S.charge > 0.02 ? Number(S.charge.toFixed(2)) : null,
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

  if (made) {
    ctx.juice.scorePop(RIM.clone(), perfect ? `PERFECT +${worth}` : `+${worth}`,
      perfect ? '#22d3ee' : '#ffd75e');
    ctx.feel.impact(perfect ? 0.5 : 0.3);
    SoundKit.play('score');
  } else {
    SoundKit.play('miss');
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
    if (S.rack >= RACKS) { finish(ctx); return; }
    S.from.copyFrom(player?.root.position ?? RACK_POS[0]);
    S.moveT = 0;
    S.phase = 'move';
    return;
  }
  S.barT = Math.random() * Math.PI;   // desync the bar so it can't be memorised
  S.phase = 'shoot';
}

function finish(ctx: ModeContext): void {
  if (S.phase === 'done') return;
  S.phase = 'done';
  ctx.end(S.pts >= WIN_PTS ? 'win' : 'complete', S.pts, {
    points: S.pts, bestStreak: S.best, racks: S.rack,
  });
}

export const ThreePointMode: ModeDefinition = {
  modeId: 'threepoint',
  mood: 'goldenHour',
  camPreset: 'hoops',

  async load(ctx: ModeContext): Promise<void> {
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
    ball.position.copyFrom(RACK_POS[0]).addInPlace(new Vector3(0, 1.9, 0));
    ctx.objectiveRef.current = ball.position;

    arc = new ShotArc();

    S.from.copyFrom(RACK_POS[0]);
    pushHud(ctx, 'RACK 1');
  },

  onInput(ctx: ModeContext, e: FelInput): void {
    if (S.phase === 'done') return;

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

    S.clock -= dt;
    if (S.clock <= 0) { finish(ctx); return; }

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

    pushHud(ctx);
  },

  dispose(): void {
    player?.dispose(); player = null;
    ball?.dispose(); ball = null;
    arc = null;
  },
};
