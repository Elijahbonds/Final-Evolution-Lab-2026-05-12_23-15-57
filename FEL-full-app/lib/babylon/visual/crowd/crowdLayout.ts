// crowdLayout — where the fans sit (w3-crowds, A9.9).
//
// A venue describes its STANDS (the painted grandstands it already has, a ballpark's bleachers, a beach's benches) as
// stepped rows; this lays seats along them, deterministically from a seed so a venue holds the same crowd every visit, with
// a few gaps so the rows read as people and not a printed pattern. Each seat then becomes a real fan (a baked-animation body,
// near) or a card (an impostor, far), by distance from where the play camera lives — the tier sets how many real fans a
// device can afford (`CROWD_TIER`), and a phone gets cards only.
//
// THE CAMERA LINE. A fan must never sit between the play camera and the play, nor behind the camera where it is never seen
// (a skinned body drawn for nobody, and the first thing a camera swing would clip through). A venue names its line — a point
// and the direction INTO the play — and every seat must be at least `margin` metres past it. Tests hold each venue to it.
//
// PURE: no Babylon import.

import type { Posture } from './crowdVat';

export type V3 = [number, number, number];

export interface StandSpec {
  /** A name for the stand (meshes and tests use it). */
  id: string;
  /** World point: the middle of the FRONT row's front edge, at that row's floor. */
  front: V3;
  /** Radians: the direction the stand FACES (the fans look this way), as a yaw (0 = +z, π/2 = +x). */
  yaw: number;
  /** Length of a row (m). */
  width: number;
  rows: number;
  /** Row step: [depth back, rise up] (m). */
  step: [number, number];
  posture: Posture;
  /** Seat spacing along a row (m). Default 0.62. */
  pitch?: number;
  /** Share of seats left empty, 0..1 (deterministic). Default 0.12. */
  gaps?: number;
  /** Lay a bench under a seated row (a stand with no seats of its own: the beach bleachers). */
  benches?: boolean;
  /** Fans only from this row back (a front wall hides the first rows' legs). Default 0. */
  firstRow?: number;
}

export interface CameraLine {
  /** A point on the line (where the play camera stands, near enough). */
  at: V3;
  /** Horizontal direction from the camera INTO the play (normalised here). */
  into: [number, number];
  /** Seats must be at least this far past the line (m). */
  margin: number;
}

export interface CrowdVenue {
  stands: StandSpec[];
  /** Where the fans look (the middle of the play). */
  focus: V3;
  camera: CameraLine;
  /** Where the play camera usually is — distance from here decides fan vs card. */
  eye: V3;
}

export interface Seat {
  stand: string;
  /** World position of the fan's feet. */
  pos: V3;
  /** Radians, the way the fan faces (toward the focus, with a little of its own). */
  yaw: number;
  posture: Posture;
  row: number;
  /** Where along its row, 0..1 (the reaction ripple). */
  along: number;
  /** 0..4: which of the five crowd bodies. */
  body: number;
  /** 0..1: the fan's own idle phase. */
  phase: number;
  /** Distance from the venue's eye (m). */
  dist: number;
}

/** What a device tier affords: real fans, then cards for the rest. A phone gets cards only (A8's phone budget). */
export const CROWD_TIER = {
  high: { fans: 400, cards: 260 },
  desktop: { fans: 300, cards: 220 },
  mobile: { fans: 0, cards: 140 },
} as const;
export type CrowdTierName = keyof typeof CROWD_TIER;
export function crowdTierOf(tier: string | undefined | null): CrowdTierName {
  return tier === 'high' || tier === 'tv' ? 'high' : tier === 'mobile' ? 'mobile' : 'desktop';
}
/** Past this distance from the eye a seat is a card even when the tier could afford a fan: a body there is a few pixels. */
export const CARD_BEYOND_M = 70;

/** Deterministic 0..1 (no state). */
export function rand01(seed: number, k: number): number {
  let t = (Math.imul(seed | 0, 2654435761) ^ Math.imul(k | 0, 1597334677)) | 0;
  t = Math.imul(t ^ (t >>> 15), 2246822519);
  t = Math.imul(t ^ (t >>> 13), 3266489917);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/** Signed distance of a point past the camera line (positive = in the play side). */
export function pastLine(p: V3, line: CameraLine): number {
  const l = Math.hypot(line.into[0], line.into[1]) || 1;
  return ((p[0] - line.at[0]) * line.into[0] + (p[2] - line.at[2]) * line.into[1]) / l;
}

/** A stand-local point (x along the row, row r) to the world. Local +z is the facing; rows climb back toward −z. */
export function standPoint(s: StandSpec, x: number, r: number): V3 {
  const [dz, dy] = s.step;
  const lz = -r * dz - dz * 0.5, ly = r * dy;
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  // yaw rotates local (x, z) → world: x' = x cos + z sin, z' = −x sin + z cos (Babylon's left-handed Y rotation)
  return [s.front[0] + x * c + lz * sn, s.front[1] + ly, s.front[2] - x * sn + lz * c];
}

/** Every seat of every stand that clears the camera line, nearest the eye first. Pure, deterministic in `seed`. */
export function layoutSeats(v: CrowdVenue, seed = 11): Seat[] {
  const out: Seat[] = [];
  let k = 0;
  for (const s of v.stands) {
    const pitch = s.pitch ?? 0.62;
    const perRow = Math.max(1, Math.floor(s.width / pitch));
    const gaps = s.gaps ?? 0.12;
    for (let r = s.firstRow ?? 0; r < s.rows; r++) {
      for (let c = 0; c < perRow; c++) {
        k++;
        if (rand01(seed, k) < gaps) continue;
        const stagger = r % 2 ? 0.25 : -0.25;
        const x = -s.width / 2 + (c + 0.5) * pitch + stagger * pitch * 0.5 + (rand01(seed, k + 50000) - 0.5) * 0.12;
        const pos = standPoint(s, x, r);
        if (pastLine(pos, v.camera) < v.camera.margin) continue;
        const toFocus = Math.atan2(v.focus[0] - pos[0], v.focus[2] - pos[2]);
        // turned most of the way toward the play, the rest square to the stand, plus a person's own angle
        const yaw = lerpAngle(s.yaw, toFocus, 0.7) + (rand01(seed, k + 90000) - 0.5) * 0.35;
        out.push({
          stand: s.id, pos, yaw, posture: s.posture, row: r, along: (c + 0.5) / perRow,
          body: Math.floor(rand01(seed, k + 130000) * 5) % 5, phase: rand01(seed, k + 170000),
          dist: Math.hypot(pos[0] - v.eye[0], pos[1] - v.eye[1], pos[2] - v.eye[2]),
        });
      }
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Split seats into real fans (nearest, up to the tier's count) and cards (the rest, up to its count). Pure. */
export function splitSeats(seats: readonly Seat[], tier: CrowdTierName, scale = 1): { fans: Seat[]; cards: Seat[] } {
  const cap = CROWD_TIER[tier];
  const maxFans = Math.round(cap.fans * Math.max(0, scale)), maxCards = Math.round(cap.cards * Math.max(0, scale));
  const fans: Seat[] = [], cards: Seat[] = [];
  for (const s of seats) {
    if (fans.length < maxFans && s.dist <= CARD_BEYOND_M) fans.push(s);
    else if (cards.length < maxCards) cards.push(s);
  }
  return { fans, cards };
}
