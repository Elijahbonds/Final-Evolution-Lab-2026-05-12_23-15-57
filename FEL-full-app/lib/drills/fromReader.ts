// fromReader — the body reader's output as drill events (movement play, phase 9, 2026-09-24).
//
// Typed by SHAPE, not by import: lib/pose/BodyReader.ts is still being built, and the drill engine must not break when
// its types move. Anything this does not recognise maps to null (ignored), so a new event kind costs nothing.
//
// Two halves, because the reader's events do not carry everything a drill judges:
//   readerEventToDrill   its events (takeoff, land, dip, step, penultimate, punch, kick) as drill moves.
//   FrameMoves           its per-frame read (BodyRead) as the moves it has no event for: the body at REST (holds, and a
//                        squat held at the bottom), a KNEE driven to hip height, a low HOP (a pogo: the reader's jump
//                        floor is a 0.25 s flight, and a quick pogo flies less), and each foot's CONTACTS (the second
//                        foot of a landing, and a free foot coming down out of a one-foot stick, which the reader never
//                        tells as a step: a swing that spanned a flight is not a step to it).
import type { DrillBodyEvent } from './DrillRunner';
import type { Limb } from '../babylon/core/bodyTargets';
import { LEFT_HIP, LEFT_KNEE, LEFT_SHOULDER, RIGHT_HIP, RIGHT_KNEE, RIGHT_SHOULDER, type Wm } from '../pose/landmarks';

/** The fields of a BodyReader event this reads. `t` is its capture time (ms), the instant the move happened. */
export interface ReaderEventLike {
  kind: string;
  t: number;
  feet?: string;       // takeoff: 'one' | 'two'
  foot?: string;       // takeoff / step / penultimate / kick: 'L' | 'R' | 'both'
  firstFoot?: string;  // land: 'L' | 'R' | 'both'
  hand?: string;       // punch: 'L' | 'R'
}

const footLimb = (f: string | undefined): Limb | undefined =>
  f === 'L' ? 'footL' : f === 'R' ? 'footR' : f === 'both' ? 'feet' : undefined;
const handLimb = (h: string | undefined): Limb | undefined => (h === 'L' ? 'handL' : h === 'R' ? 'handR' : undefined);

/**
 * A reader event as a drill move. A landing the reader calls one-footed ('L' / 'R': the other foot more than its
 * LAND_BOTH_MS, one frame, behind) stays one-footed here; the runner pairs it with the other foot's contact from
 * FrameMoves when that came down inside LAND_PAIR_SEC.
 */
export function readerEventToDrill(ev: ReaderEventLike): DrillBodyEvent | null {
  const t = ev.t;
  switch (ev.kind) {
    case 'takeoff': {
      const limb = ev.feet === 'two' ? 'feet' : footLimb(ev.foot);
      return limb ? { kind: 'jump', limb, t } : null;
    }
    case 'land': {
      const limb = footLimb(ev.firstFoot);
      return limb ? { kind: 'land', limb, t } : null;
    }
    case 'dip': return { kind: 'squat', t };
    case 'step':
    case 'penultimate':
    case 'kick': {
      const limb = footLimb(ev.foot);
      return limb && limb !== 'feet' ? { kind: ev.kind, limb, t } : null;
    }
    case 'punch': {
      const limb = handLimb(ev.hand);
      return limb ? { kind: 'punch', limb, t } : null;
    }
    default:
      return null;   // apex, reach, strike, release, lost, found: not drill moves (presence goes through tick)
  }
}

// ── the per-frame read ───────────────────────────────────────────────────────────────────────────────────────────────

/** The fields of one BodyRead (lib/pose/BodyReader.ts) FrameMoves reads. `t` is the frame's capture time (ms). */
export interface ReaderFrameLike {
  t: number;
  tracking: boolean;
  rulers: { hipHeightM: number; mPerX: number } | null;
  /** The hip midpoint: image x (0..1) and metres above the floor. */
  hip: { x: number; heightM: number | null } | null;
  feet: { L: { heightM: number; contact: boolean }; R: { heightM: number; contact: boolean } } | null;
  knee: { L: { drive: number | null }; R: { drive: number | null } } | null;
  /** The frame's world landmarks (PoseFrame.world, metres), when the page passes them: a knee is then read against the
   *  trunk (hip flexion), not against the vertical. */
  world?: readonly Wm[] | null;
}

/**
 * Rest = this long (ms) with the same feet on the floor and the hips still: the app's stillness bar (lib/mirror/
 * framing.ts FramingGate, lib/pose/calibrate.ts CAL_WINDOW_MS), and the hold's late grace in bodyTargets assumes it.
 */
export const REST_WINDOW_MS = 700;
/**
 * …with the hips' height spread (SD over the window, m) under this. Through the reader, the owner's stand_still reads
 * 0.3–0.46 cm over its 700 ms windows (three noise draws); a jog's hips bounce ~3 cm (BodyReader DIP_MIN_M's note), an
 * SD of ~1.1 cm.
 */
export const REST_HIP_SD_M = 0.01;
/**
 * …and their sideways spread under this (m). Sideways the owner's stand sways more (a video solve's): 0.6–2.2 cm over
 * its 700 ms windows. A shuffle keeps its hips level (it read as a rest on height alone) but moves them: a median
 * 3.8 cm over shuffle_lateral's windows.
 */
export const REST_SIDE_SD_M = 0.025;
/** A rest with the hips at least this far (m) under standing is a squat's bottom: the reader's own dip line (DIP_MIN_M). */
export const SQUAT_REST_M = 0.06;
/**
 * A knee is "up" at KNEE_UP_FLEX_DEG of hip flexion (the thigh against the trunk: 0 standing, 90 thigh square to it)
 * and can be up again once back under KNEE_DOWN_FLEX_DEG. Ours: 78° is "to hip height" with room for a thigh a little
 * under level (BodyRead.knee.drive 0.8 on an upright body); 60° (drive 0.5) is halfway back down, so the wobble at the
 * top of one drive cannot read as two.
 *
 * Read against the TRUNK from the world landmarks when the frame has them. The Wall Drive leans into the wall ("a ramp
 * from heels to head"), and BodyRead.knee.drive is measured against the vertical: at a 45° lean the standing leg and a
 * full 90° drive both put the knee 0.71 thighs under the hip (drive 0.29), so the drive never reads as up. Without
 * world points the drive stands in, as an upright body's flexion, acos(1 − drive).
 */
export const KNEE_UP_FLEX_DEG = 78;
export const KNEE_DOWN_FLEX_DEG = 60;
/** A foot leaves the floor where it crosses its own level + this (m): the reader's and the truth's REFINE_M. */
export const HOP_EDGE_M = 0.01;
/** Both feet off, by the reader's contact lines, for this many frames is a hop: one frame is inside a toe's jitter. */
export const HOP_AIR_FRAMES = 2;
/** Both feet leaving within this (ms) is a two-foot take-off: the reader's TWO_FOOT_MS. */
export const HOP_TWO_FOOT_MS = 100;
/**
 * A hop off ONE foot counts only with the other foot held up at least this long (ms) before it: longer than any swing
 * in the fixtures' running and shuffling (run_in_place ≤ 465 ms, shuffle_lateral ≤ 605 ms), so a running stride's
 * double-float is never a hop; a one-foot pogo or a balance before a bound holds the free foot up for seconds.
 */
export const ONE_FOOT_HELD_MS = 1000;
/** How far back (ms) a foot's heights are kept for its lift instant: a pogo foot reaches the contact line in < 100 ms. */
const FOOT_TRAIL_MS = 200;
/**
 * Unreadable frames shorter than this (ms) are skipped, not a loss: the reader's LOST_MS (300 ms, longer than any blink
 * of the model). A single missed frame must not end a 36-second hold's rest and restart its clock.
 */
export const FRAME_LOST_MS = 300;

export interface FrameMovesOut {
  /** hold (the rest began: t = when; depthM = the hips under standing), knee, and jump (a hop the reader may miss). */
  events: DrillBodyEvent[];
  /** Feet lifting (at the frame the contact let go) or coming down (at the touch-down instant, downInstant). */
  contacts: { t: number; limb: 'footL' | 'footR'; down: boolean }[];
  /** The rest that was reported has ended (the weight moved, or the body was lost). */
  restEnded: boolean;
}

interface RestSample { t: number; h: number; x: number; limb: Limb }

const sdOf = (v: number[]): number => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
};
const medianOf = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** The reader's per-frame read → the drill moves it has no event for. Feed every frame, in capture order. */
export class FrameMoves {
  private win: RestSample[] = [];
  private resting = false;
  private contact: [boolean, boolean] | null = null;
  /** Each foot's recent heights (for its lift instant) and when it last left the floor (ms; null while down). */
  private trail: { t: number; h: number }[][] = [[], []];
  private offAt: (number | null)[] = [null, null];
  private air = 0;
  private kneeUp: [boolean, boolean] = [false, false];
  private kneePrev: ({ t: number; d: number } | null)[] = [null, null];
  private lostSince: number | null = null;

  /** Forget the rest (the runner saw the weight move): the next still window reports a new one. */
  breakRest(): void { this.resting = false; this.win = []; }

  feed(r: ReaderFrameLike): FrameMovesOut {
    const out: FrameMovesOut = { events: [], contacts: [], restEnded: false };
    const hipM = r.hip?.heightM ?? null;
    if (!r.tracking || !r.feet || hipM === null || !r.rulers || !r.hip) {
      // a blink is skipped; lost for longer, nothing carries over (a rest, a flight, a knee half up)
      this.lostSince ??= r.t;
      if (r.t - this.lostSince < FRAME_LOST_MS) return out;
      if (this.resting) out.restEnded = true;
      this.resting = false; this.win = [];
      this.contact = null; this.trail = [[], []]; this.offAt = [null, null]; this.air = 0;
      this.kneeUp = [false, false]; this.kneePrev = [null, null];
      return out;
    }
    this.lostSince = null;
    const feet = [r.feet.L, r.feet.R];
    const now: [boolean, boolean] = [feet[0].contact, feet[1].contact];
    const limbs: ['footL', 'footR'] = ['footL', 'footR'];

    // ── contacts and hops ──
    for (let i = 0; i < 2; i++) {
      const tr = this.trail[i];
      tr.push({ t: r.t, h: feet[i].heightM });
      while (tr.length > 2 && tr[0].t < r.t - FOOT_TRAIL_MS) tr.shift();
      // a foot already up when tracking (re)starts has been up at least since now
      if (!this.contact) { this.offAt[i] = now[i] ? null : r.t; continue; }
      if (this.contact[i] && !now[i]) {
        this.offAt[i] = liftInstant(tr, r.t);
        out.contacts.push({ t: r.t, limb: limbs[i], down: false });
      } else if (!this.contact[i] && now[i]) {
        this.offAt[i] = null;
        out.contacts.push({ t: downInstant(tr, r.t), limb: limbs[i], down: true });
      }
    }
    if (!now[0] && !now[1]) {
      this.air++;
      const [a, b] = this.offAt;
      if (this.air === HOP_AIR_FRAMES && a !== null && b !== null) {
        const last = a >= b ? 0 : 1, t = Math.max(a, b), other = Math.min(a, b);
        if (t - other <= HOP_TWO_FOOT_MS) out.events.push({ kind: 'jump', limb: 'feet', t });
        else if (t - other >= ONE_FOOT_HELD_MS) out.events.push({ kind: 'jump', limb: limbs[last], t });
      }
    } else this.air = 0;
    this.contact = now;

    // ── rest ──
    const standOn: Limb | null = now[0] && now[1] ? 'feet' : now[0] ? 'footL' : now[1] ? 'footR' : null;
    if (standOn === null) {
      if (this.resting) out.restEnded = true;
      this.resting = false; this.win = [];
    } else {
      this.win.push({ t: r.t, h: hipM, x: r.hip.x * r.rulers.mPerX, limb: standOn });
      while (this.win.length > 2 && this.win[1].t <= r.t - REST_WINDOW_MS) this.win.shift();
      const full = r.t - this.win[0].t >= REST_WINDOW_MS && this.win.length >= 3;
      const still = full && this.win.every((x) => x.limb === standOn)
        && sdOf(this.win.map((x) => x.h)) <= REST_HIP_SD_M && sdOf(this.win.map((x) => x.x)) <= REST_SIDE_SD_M;
      if (still && !this.resting) {
        this.resting = true;
        const depthM = r.rulers.hipHeightM - medianOf(this.win.map((x) => x.h));
        out.events.push({ kind: 'hold', limb: standOn, t: this.win[0].t, depthM });
      } else if (!still && this.resting) {
        this.resting = false;
        out.restEnded = true;
      }
    }

    // ── knees ──
    const kneeLimbs: ['kneeL', 'kneeR'] = ['kneeL', 'kneeR'];
    for (let i = 0; i < 2; i++) {
      const d = kneeFlexDeg(r, i === 0 ? 'L' : 'R');
      if (d === null) { this.kneePrev[i] = null; continue; }
      const p = this.kneePrev[i];
      if (!this.kneeUp[i] && d >= KNEE_UP_FLEX_DEG) {
        this.kneeUp[i] = true;
        // the crossing, between the last frame and this one
        const t = p && p.d < KNEE_UP_FLEX_DEG ? p.t + ((KNEE_UP_FLEX_DEG - p.d) / (d - p.d)) * (r.t - p.t) : r.t;
        out.events.push({ kind: 'knee', limb: kneeLimbs[i], t });
      } else if (this.kneeUp[i] && d <= KNEE_DOWN_FLEX_DEG) this.kneeUp[i] = false;
      this.kneePrev[i] = { t: r.t, d };
    }
    return out;
  }
}

/** A side's hip flexion (deg): against the trunk from the world points, else an upright body's from the drive. */
function kneeFlexDeg(r: ReaderFrameLike, side: 'L' | 'R'): number | null {
  const w = r.world;
  if (w && w.length > RIGHT_KNEE) {
    const hip = w[side === 'L' ? LEFT_HIP : RIGHT_HIP], knee = w[side === 'L' ? LEFT_KNEE : RIGHT_KNEE];
    const sh = { x: (w[LEFT_SHOULDER].x + w[RIGHT_SHOULDER].x) / 2, y: (w[LEFT_SHOULDER].y + w[RIGHT_SHOULDER].y) / 2, z: (w[LEFT_SHOULDER].z + w[RIGHT_SHOULDER].z) / 2 };
    const hp = { x: (w[LEFT_HIP].x + w[RIGHT_HIP].x) / 2, y: (w[LEFT_HIP].y + w[RIGHT_HIP].y) / 2, z: (w[LEFT_HIP].z + w[RIGHT_HIP].z) / 2 };
    const a = { x: sh.x - hp.x, y: sh.y - hp.y, z: sh.z - hp.z };               // the trunk, up
    const b = { x: knee.x - hip.x, y: knee.y - hip.y, z: knee.z - hip.z };      // the thigh
    const la = Math.hypot(a.x, a.y, a.z), lb = Math.hypot(b.x, b.y, b.z);
    if (la > 0 && lb > 0) {
      const cos = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb)));
      return 180 - (Math.acos(cos) * 180) / Math.PI;
    }
  }
  const d = r.knee ? r.knee[side].drive : null;
  if (d === null || !Number.isFinite(d)) return null;
  return (Math.acos(Math.max(-1, Math.min(1, 1 - d))) * 180) / Math.PI;
}

/**
 * When a foot left the floor (ms): where its height crossed its level + HOP_EDGE_M between the last frame on the floor
 * and the next, the truth's own rule; its level is the lowest of its recent heights. The frame the contact line let go
 * on is 1–2 frames late for a pogo foot, which reaches the line (5 cm) 35–70 ms after it leaves.
 */
function liftInstant(tr: { t: number; h: number }[], fallback: number): number {
  return crossing(tr, fallback, (a, b, edge) => a <= edge && b > edge);
}

/**
 * When a foot came down (ms): where it crossed its level + HOP_EDGE_M on the way down, the rule the reader stamps a
 * landing by (its downAt), so a landing's two feet are compared like with like against LAND_PAIR_SEC. The frame the
 * contact line (3.5 cm) caught it on is up to a frame (33 ms) late.
 */
function downInstant(tr: { t: number; h: number }[], fallback: number): number {
  return crossing(tr, fallback, (a, b, edge) => a > edge && b <= edge);
}

function crossing(tr: { t: number; h: number }[], fallback: number, is: (a: number, b: number, edge: number) => boolean): number {
  if (tr.length < 2) return fallback;
  const edge = Math.min(...tr.map((x) => x.h)) + HOP_EDGE_M;
  for (let k = tr.length - 1; k > 0; k--) {
    const a = tr[k - 1], b = tr[k];
    if (is(a.h, b.h, edge)) return a.t + ((edge - a.h) / (b.h - a.h)) * (b.t - a.t);
  }
  return fallback;
}
