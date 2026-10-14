// FIGHT SHOTS (lane/w3-present, wave 3, 2026-10-14) — WHERE the cinematic cameras of a fight stand. Pure maths: no Babylon.
//
// The wave-1 combat pass left four cinematic moments for "wave 2 / 3 (needs foundation work)":
//   · the fighting-game INTRO of Karate VS: a walk-in, each fighter's name plate, then ROUND 1 / FIGHT;
//   · the DRAGON cut: the super move's own camera;
//   · Karate Endless's finisher on the 100th KO.
// All of them are CINEMATIC cameras, not the play camera. FOLLOW_PRESETS, the lag, the distances and every CameraDirector
// number are untouched: `combat/cinemaRig.ts` lays one of these poses over the frame the play camera has already made and
// puts the play camera's own pose back before the mode reads it again, so a cut ends exactly where the follow would be.
//
// The shapes follow scene/broadcastShots (the same conventions: a ShotPose is a position, a target and an optional lens;
// 'play' means "hand the frame back"), so the foundation's maths (smoothstep, yawDir, orbitBlend) is reused, not copied.
//
// Nothing here knows about scoring, the hit pipeline, the clocks or a number a player is timed on.

import { flatUnit, orbitBlend, smoothstep, yawDir, type ShotPose, type V3 } from '../scene/broadcastShots';

const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const clamp01 = (k: number): number => Math.max(0, Math.min(1, k));
const easeOut = (k: number): number => { const t = clamp01(k); return 1 - (1 - t) * (1 - t); };

/** A fighter's ground position. */
export interface Ground { x: number; z: number }
/** The play camera's frame, which a cinematic ends on (the rig reads it off the camera after the director wrote it). */
export interface LivePose { pos: V3; target: V3; fov: number }

// ── THE INTRO (Karate VS) ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The fight intro, seconds. FOE: a low front three-quarter on the rival walking in to his mark, his name plate up.
 * ME: the same on the player. WIDE: both on their marks from the side, then the frame eases into the play camera over
 * `outSec`. Round 1 only; the round card ("ROUND 1") and FIGHT! follow it unchanged (KarateVSMode.READY_SEC).
 */
export const FIGHT_INTRO = {
  foeSec: 1.4, meSec: 1.4, wideSec: 1.0, outSec: 0.5,
  /** How far behind its mark each fighter starts (m): a walk of a couple of strides, inside every arena (the Rooftop's half-depth is 5.25 m, the marks sit at 2.2). */
  walkM: 2.4,
  /** The walk takes this much of the fighter's shot (the rest, he stands on his mark and holds the shot). */
  walkShare: 0.85,
} as const;
export const FIGHT_INTRO_SEC = FIGHT_INTRO.foeSec + FIGHT_INTRO.meSec + FIGHT_INTRO.wideSec;
/** The walk's tree input: a walking pace (the combat tree's walk loop is below its run threshold). */
export const WALK_SPEED01 = 0.5;

export interface IntroFrame {
  /** Where each fighter stands this instant (they walk in to the marks). */
  mePos: Ground; foePos: Ground;
  /** The speed each is walking at, m/s (0 = standing): the tree's stride matching reads it. */
  meMps: number; foeMps: number;
  /** The camera, or 'play' once the intro has run. */
  shot: ShotPose | 'play';
  /** Whose name plate is up: the rival's, then the player's. */
  plate: 'foe' | 'me' | null;
  /** The plate's reveal 0..1 (in over 0.25 s, held, out over the last 0.2 s of its shot). */
  plateK: number;
  /** How closed the letterbox is, 0..1. */
  letterbox: number;
}

/** Where a fighter is `u` (0..1) of the way through its walk: from `walkM` behind the mark (away from the other) to the mark. */
export function walkPos(mark: Ground, other: Ground, u: number): Ground {
  const b = flatUnit(v(mark.x - other.x, 0, mark.z - other.z));
  const back = FIGHT_INTRO.walkM * (1 - easeOut(u));
  return { x: mark.x + b.x * back, z: mark.z + b.z * back };
}

/** The low front three-quarter on a fighter (the walk-in hero shot): in front of him, off-axis, a lens that looks slightly up. */
function heroShot(at: Ground, toward: Ground, u: number): ShotPose {
  const f = flatUnit(v(toward.x - at.x, 0, toward.z - at.z));
  const d = yawDir(f, 0.55);
  const r = lerp(4.0, 2.9, smoothstep(u));
  return {
    pos: v(at.x + d.x * r, lerp(0.7, 1.0, smoothstep(u)), at.z + d.z * r),
    target: v(at.x, 1.3, at.z),
    fov: 0.6,
  };
}

/** The two-shot from the side: both fighters in profile at the middle of the ring, a little wider as it settles. */
function wideShot(me: Ground, foe: Ground, u: number): ShotPose {
  const mx = (me.x + foe.x) / 2, mz = (me.z + foe.z) / 2;
  const axis = flatUnit(v(foe.x - me.x, 0, foe.z - me.z));
  const side = v(-axis.z, 0, axis.x);
  const r = lerp(6.6, 7.4, smoothstep(u));
  return { pos: v(mx + side.x * r, lerp(1.5, 1.9, smoothstep(u)), mz + side.z * r), target: v(mx, 1.15, mz), fov: 0.78 };
}

/**
 * The intro `t` seconds in. `meMark` / `foeMark` are the round-start positions (they face each other); `live` is the play
 * camera's frame, which the last `outSec` eases into AROUND the middle of the ring (never through a fighter).
 */
export function fightIntroAt(t: number, meMark: Ground, foeMark: Ground, live: LivePose): IntroFrame {
  const { foeSec, meSec, wideSec, outSec, walkShare } = FIGHT_INTRO;
  const total = FIGHT_INTRO_SEC;
  // each walks in during its own shot: the rival first, the player while the camera is on him
  const foeU = clamp01(t / (foeSec * walkShare));
  const meU = clamp01((t - foeSec) / (meSec * walkShare));
  const foePos = walkPos(foeMark, meMark, foeU), mePos = walkPos(meMark, foeMark, meU);
  const dist = FIGHT_INTRO.walkM;
  // the walk is an ease-out over walkShare of the shot: its mean speed is the distance over that time (the peak is twice that)
  const foeMps = t < foeSec * walkShare ? dist / (foeSec * walkShare) : 0;
  const meMps = t >= foeSec && t < foeSec + meSec * walkShare ? dist / (meSec * walkShare) : 0;
  const frame = (shot: ShotPose | 'play', plate: IntroFrame['plate'], plateK: number, letterbox: number): IntroFrame =>
    ({ mePos, foePos, meMps, foeMps, shot, plate, plateK, letterbox });
  const plateK = (local: number, len: number): number => Math.min(clamp01(local / 0.25), clamp01((len - local) / 0.2));
  if (t >= total) return frame('play', null, 0, 0);
  const lbIn = clamp01(t / 0.2);   // the bars close over the first fifth of a second, and open with the hand-over
  if (t < foeSec) return frame(heroShot(foePos, mePos, t / foeSec), 'foe', plateK(t, foeSec), lbIn);
  if (t < foeSec + meSec) return frame(heroShot(mePos, foePos, (t - foeSec) / meSec), 'me', plateK(t - foeSec, meSec), 1);
  const u = (t - foeSec - meSec) / wideSec;
  const wide = wideShot(mePos, foePos, u);
  const outK = clamp01((t - (total - outSec)) / outSec);
  if (outK <= 0) return frame(wide, null, 0, 1);
  // hand over to the play camera: around the middle of the ring, the target and the lens eased
  const k = smoothstep(outK);
  const mid = v((mePos.x + foePos.x) / 2, 0, (mePos.z + foePos.z) / 2);
  const pos = orbitBlend(wide.pos, live.pos, mid, k);
  const tg = wide.target;
  return frame({
    pos,
    target: v(lerp(tg.x, live.target.x, k), lerp(tg.y, live.target.y, k), lerp(tg.z, live.target.z, k)),
    fov: lerp(wide.fov ?? live.fov, live.fov, k),
  }, null, 0, 1 - k);
}

// ── THE DRAGON CUT (Karate VS) ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The DRAGON's own camera, seconds. WINDUP: a low angle on the attacker's torso, pushing in as the fist comes back. IMPACT: a
 * profile of both fighters from the side as the blow lands. OUT: the frame eases into the play camera. The windup is the
 * swing's STARTUP (the mode passes the real number: the DRAGON's `startupMs`), so the cut and the blow stay in step.
 */
export const DRAGON_CUT = { impactSec: 0.62, outSec: 0.4, /** a windup shorter than this still gets a beat of low angle */ minWindupSec: 0.25 } as const;

export interface DragonCut {
  /** The attacker and the defender (ground), and which side of the line the profile is shot from (+1 / −1). */
  atk: Ground; def: Ground; side: number;
  /** Seconds from the swing's start to the blow landing. */
  windupSec: number;
  /** When true the cut starts at the blow (the rival's DRAGON: the player must read the telegraph on the play camera). */
  impactOnly?: boolean;
}

/** Total length of a cut, seconds. */
export function dragonCutSec(c: Pick<DragonCut, 'windupSec' | 'impactOnly'>): number {
  return (c.impactOnly ? 0 : Math.max(DRAGON_CUT.minWindupSec, c.windupSec)) + DRAGON_CUT.impactSec + DRAGON_CUT.outSec;
}

/** The cut `t` seconds in (positions are read live: the fighters move). 'play' once it has run. */
export function dragonCutAt(t: number, c: DragonCut, live: LivePose): { shot: ShotPose | 'play'; letterbox: number } {
  const total = dragonCutSec(c);
  if (t >= total) return { shot: 'play', letterbox: 0 };
  const wind = c.impactOnly ? 0 : Math.max(DRAGON_CUT.minWindupSec, c.windupSec);
  const f = flatUnit(v(c.def.x - c.atk.x, 0, c.def.z - c.atk.z));
  const lb = Math.min(clamp01(t / 0.12), clamp01((total - t) / DRAGON_CUT.outSec));
  if (t < wind) {
    // low, over the attacker's back shoulder (135 degrees round from his front), closing on him: the fist comes back toward the lens and the
    // defender stands beyond him in the frame, never between the lens and the attacker (a front-side camera put the defender's shoulder across the shot)
    const u = wind > 0 ? t / wind : 1;
    const d = yawDir(f, 2.35 * c.side);
    const r = lerp(3.3, 2.5, smoothstep(u));
    return {
      shot: { pos: v(c.atk.x + d.x * r, lerp(0.5, 0.8, u), c.atk.z + d.z * r), target: v(c.atk.x + f.x * 0.9, 1.2, c.atk.z + f.z * 0.9), fov: lerp(0.7, 0.55, smoothstep(u)) },
      letterbox: lb,
    };
  }
  const ti = t - wind;
  const mx = (c.atk.x + c.def.x) / 2, mz = (c.atk.z + c.def.z) / 2;
  const right = v(-f.z * c.side, 0, f.x * c.side);
  const impact: ShotPose = {
    pos: v(mx + right.x * 5.4, 1.35, mz + right.z * 5.4),
    target: v(mx, 1.2, mz),
    fov: 0.74,
  };
  if (ti < DRAGON_CUT.impactSec) {
    const u = ti / DRAGON_CUT.impactSec;
    // a slow push-in on the profile: the cut holds the moment, it does not drift off it
    const push = 1 - 0.06 * smoothstep(u);
    return { shot: { pos: v(impact.target.x + (impact.pos.x - impact.target.x) * push, impact.pos.y, impact.target.z + (impact.pos.z - impact.target.z) * push), target: impact.target, fov: impact.fov }, letterbox: lb };
  }
  const k = smoothstep((ti - DRAGON_CUT.impactSec) / DRAGON_CUT.outSec);
  const mid = v(mx, 0, mz);
  return {
    shot: {
      pos: orbitBlend(impact.pos, live.pos, mid, k),
      target: v(lerp(impact.target.x, live.target.x, k), lerp(impact.target.y, live.target.y, k), lerp(impact.target.z, live.target.z, k)),
      fov: lerp(impact.fov ?? live.fov, live.fov, k),
    },
    letterbox: lb,
  };
}

// ── THE FINISHER (Karate Endless, the 100th KO) ─────────────────────────────────────────────────────────────────────

/**
 * The 100th KO's camera, seconds. IN: the frame leaves the Hundred camera's pose round the fighter (no cut). ORBIT: a slow
 * half-turn round the fighter and the body that just fell, rising a little. OUT: back into the Hundred camera's frame.
 */
// (proof rig, a wave-1 horde round: at 4.8 m and 1.5 m the lens sat among the pursuers' shoulders; it stands back and up, looking down over the crowd)
export const FINISHER = { inSec: 0.35, orbitSec: 2.3, outSec: 0.55, sweepRad: 2.3, r0: 5.8, r1: 4.8, h0: 2.8, h1: 3.8, fov: 0.62 } as const;
export const FINISHER_SEC = FINISHER.inSec + FINISHER.orbitSec + FINISHER.outSec;

export interface FinisherCut {
  /** The fighter and the body that fell (ground); the shot frames the pair. */
  me: Ground; fallen: Ground;
  /** The bearing (radians, atan2(z, x) about the fighter) the orbit begins at — the play camera's own, so the first frame is continuous. */
  startBearing: number;
  /** +1 / −1: which way round. */
  spin: number;
}

export function finisherAt(t: number, c: FinisherCut, live: LivePose): { shot: ShotPose | 'play'; letterbox: number } {
  if (t >= FINISHER_SEC) return { shot: 'play', letterbox: 0 };
  const { inSec, orbitSec, outSec } = FINISHER;
  const focus = v(lerp(c.me.x, c.fallen.x, 0.4), 0, lerp(c.me.z, c.fallen.z, 0.4));
  const orbitPose = (u: number): ShotPose => {
    const ang = c.startBearing + c.spin * FINISHER.sweepRad * smoothstep(u);
    const r = lerp(FINISHER.r0, FINISHER.r1, smoothstep(u)), h = lerp(FINISHER.h0, FINISHER.h1, smoothstep(u));
    return { pos: v(c.me.x + Math.cos(ang) * r, h, c.me.z + Math.sin(ang) * r), target: v(focus.x, 1.15, focus.z), fov: FINISHER.fov };
  };
  const lb = Math.min(clamp01(t / inSec), clamp01((FINISHER_SEC - t) / outSec));
  const about = v(c.me.x, 0, c.me.z);
  if (t < inSec) {
    const k = smoothstep(t / inSec), o = orbitPose(0);
    return { shot: { pos: orbitBlend(live.pos, o.pos, about, k), target: v(lerp(live.target.x, o.target.x, k), lerp(live.target.y, o.target.y, k), lerp(live.target.z, o.target.z, k)), fov: lerp(live.fov, o.fov ?? live.fov, k) }, letterbox: lb };
  }
  if (t < inSec + orbitSec) return { shot: orbitPose((t - inSec) / orbitSec), letterbox: lb };
  const k = smoothstep((t - inSec - orbitSec) / outSec), o = orbitPose(1);
  return { shot: { pos: orbitBlend(o.pos, live.pos, about, k), target: v(lerp(o.target.x, live.target.x, k), lerp(o.target.y, live.target.y, k), lerp(o.target.z, live.target.z, k)), fov: lerp(o.fov ?? live.fov, live.fov, k) }, letterbox: lb };
}

/** The bearing of the camera about a subject, atan2(z, x), for the finisher's start. */
export function bearingAbout(cam: V3, subject: Ground): number { return Math.atan2(cam.z - subject.z, cam.x - subject.x); }
