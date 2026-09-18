// freeRunCourse — the course of Free Run as pieces (A+ mission #10, rebuilt 2026-09-18 for the parkour racer).
//
// THREE LANES, all the way down +Z, on a 20 m slab: the LOW lane (x −6: obstacles to vault, bars to slide under, loose
// hazards to kick), the MID lane (x 0: rails to grind, springboards, speed gates, the spillway slopes to surf) and the
// HIGH lane (x +6, 3.5 m up: walls to run and vector-rebound between, ledges to cat-leap, roofs, grapple anchors). A
// track (nexus/freeRunTracks.ts) strings SECTIONS of those together; the tier widens the gaps. Pure data first (tested),
// meshes built from it by the mode with static Havok aggregates so nothing falls through.

import type { Tier } from '../core/FreeRunCore';
import { FREERUN_TRACKS, type FreeRunTrack, type SectionKind } from '../nexus/freeRunTracks';

export type PieceKind =
  | 'ground' | 'gap' | 'vault' | 'bar' | 'wall' | 'ledge' | 'roof' | 'start' | 'finish' | 'checkpoint'
  | 'rail' | 'spring' | 'gate' | 'anchor' | 'hazard' | 'slope';

export type Lane = 'low' | 'mid' | 'high';

export interface Piece {
  kind: PieceKind;
  /** Centre of the box. */
  x: number; y: number; z: number;
  /** Full extents. */
  w: number; h: number; d: number;
  route?: Lane;
  /** Checkpoint order (checkpoints only). */
  index?: number;
  /** Speed gates: the tier of speed that opens it (FreeRunFlow.gateOpen). */
  gateTier?: 1 | 2 | 3;
  /** Slopes: pitch in radians about x (negative = descending along +z). */
  pitch?: number;
  /** Walls: which way the runnable face points (+1 = toward +x, −1 = toward −x). */
  face?: 1 | -1;
}

export const SLAB_W = 20;
export const LANE_X: Record<Lane, number> = { low: -6, mid: 0, high: 6 };
export const HIGH_Y = 3.5;

class Builder {
  p: Piece[] = [];
  z = 0;
  cps = 0;
  constructor(private tier: Tier) {}
  get gapW(): number { return 2.2 + this.tier.id * 0.5; }
  slab(len: number): void { this.p.push({ kind: 'ground', x: 0, y: -0.5, z: this.z + len / 2, w: SLAB_W, h: 1, d: len }); this.z += len; }
  checkpoint(): void { this.cps++; this.p.push({ kind: 'checkpoint', x: 0, y: 1.6, z: this.z - 1, w: SLAB_W, h: 3.2, d: 0.3, index: this.cps }); }
  vault(lane: Lane, dz: number, w = 4): void { this.p.push({ kind: 'vault', x: LANE_X[lane], y: 0.5, z: this.z + dz, w, h: 1.0, d: 1.2, route: lane }); }
  bar(lane: Lane, dz: number, w = 6): void { this.p.push({ kind: 'bar', x: LANE_X[lane], y: 1.25, z: this.z + dz, w, h: 0.3, d: 0.3, route: lane }); }
  hazard(lane: Lane, dz: number, dx = 0): void { this.p.push({ kind: 'hazard', x: LANE_X[lane] + dx, y: 0.45, z: this.z + dz, w: 0.9, h: 0.9, d: 0.9, route: lane }); }
  rail(lane: Lane, dz: number, len: number, y = 1.0): void { this.p.push({ kind: 'rail', x: LANE_X[lane], y, z: this.z + dz + len / 2, w: 0.2, h: 0.2, d: len, route: lane }); }
  spring(lane: Lane, dz: number): void { this.p.push({ kind: 'spring', x: LANE_X[lane], y: 0.15, z: this.z + dz, w: 2.2, h: 0.3, d: 2.2, route: lane }); }
  gate(lane: Lane, dz: number, gateTier: 1 | 2 | 3, y = 1.6): void { this.p.push({ kind: 'gate', x: LANE_X[lane], y, z: this.z + dz, w: 6, h: 3.2, d: 0.3, route: lane, gateTier }); }
  /** A wall on the high line: run it head-on, or rebound off it at an angle. `face` is the side the runner uses. */
  wall(dz: number, len: number, x = 6.5, face: 1 | -1 = -1): void { this.p.push({ kind: 'wall', x, y: 2, z: this.z + dz + len / 2, w: 0.6, h: 4, d: len, route: 'high', face }); }
  ledge(dz: number, len = 4): void { this.p.push({ kind: 'ledge', x: LANE_X.high, y: HIGH_Y, z: this.z + dz, w: 3.5, h: 0.4, d: len, route: 'high' }); }
  roof(dz: number, len: number, y = HIGH_Y): void { this.p.push({ kind: 'roof', x: LANE_X.high, y, z: this.z + dz + len / 2, w: 4.5, h: 0.4, d: len, route: 'high' }); }
  anchor(lane: Lane, dz: number, y = 7.5): void { this.p.push({ kind: 'anchor', x: LANE_X[lane], y, z: this.z + dz, w: 0.5, h: 0.5, d: 0.5, route: lane }); }
  gap(width: number): void { this.p.push({ kind: 'gap', x: 0, y: -3, z: this.z + width / 2, w: SLAB_W, h: 0.2, d: width }); this.z += width; }
  /** A HILL on the mid lane: up over `len` by `rise`, then down the other side — you carry the climb and SURF the descent. (A dip
   *  would put the surface under the slab the other lanes stand on; a hill stands on it.) In Babylon a box's +z end goes DOWN
   *  under a positive rotation.x, so the climb is −pitch and the descent +pitch. */
  spillway(len: number, rise: number): void {
    const pitch = Math.atan2(rise, len);
    this.p.push({ kind: 'slope', x: LANE_X.mid, y: rise / 2 - 0.3, z: this.z + len / 2, w: 8, h: 0.6, d: Math.hypot(len, rise), route: 'mid', pitch: -pitch });
    this.p.push({ kind: 'slope', x: LANE_X.mid, y: rise / 2 - 0.3, z: this.z + len + len / 2, w: 8, h: 0.6, d: Math.hypot(len, rise), route: 'mid', pitch });
    this.slab(len * 2);
  }

  section(kind: SectionKind): void {
    const g = this.gapW;
    switch (kind) {
      case 'alley': {
        this.vault('low', 3); this.hazard('low', 8, -1.2); this.hazard('low', 8.9, 0.6); this.bar('low', 13);
        this.rail('mid', 5, 9);
        this.wall(1, 12); this.ledge(15);
        this.slab(18); break;
      }
      case 'shaft': {
        // two facing walls 5 m apart on the high lane: run into one at an angle, rebound to the other, and again
        this.wall(0, 16, 3.4, 1); this.wall(0, 16, 8.6, -1);
        this.spring('mid', 7); this.bar('low', 9);
        this.slab(18); break;
      }
      case 'straight': {
        this.rail('mid', 2, 14, 1.0); this.gate('mid', 20, 2);
        this.hazard('low', 6, -1); this.hazard('low', 12, 1); this.vault('low', 17);
        this.roof(2, 18);
        this.slab(24); break;
      }
      case 'gaps': {
        this.slab(4);
        const n = this.tier.gaps;
        for (let i = 0; i < n; i++) {
          if (i === Math.floor(n / 2)) this.anchor('mid', g / 2 + 0.5);
          this.gap(g);
          this.slab(5);
          this.ledge(-2.5);
        }
        break;
      }
      case 'spillway': {
        this.hazard('low', 6, 0); this.hazard('low', 14, -1);
        this.roof(0, 24);
        this.spillway(12, 4);
        break;
      }
      case 'stacks': {
        // container roofs: a low stack, a gap, a high stack, a gate on the top; springboards in the mid lane to reach them
        this.roof(0, 8, HIGH_Y); this.roof(11, 8, HIGH_Y + 2.5); this.gate('high', 15, 3, HIGH_Y + 2.5 + 1.8);
        this.spring('mid', 2); this.spring('mid', 10);
        this.vault('low', 5); this.vault('low', 13);
        this.slab(20); break;
      }
      case 'canyon': {
        this.wall(0, 26, 3.4, 1); this.wall(0, 26, 8.6, -1);
        this.spring('mid', 4); this.spring('mid', 12); this.spring('mid', 20);
        this.vault('low', 7); this.vault('low', 16);
        this.slab(28); break;
      }
      case 'chokepoint': {
        // the walls close in on the mid lane: everyone comes through here
        this.p.push({ kind: 'wall', x: -3.2, y: 2, z: this.z + 7, w: 0.6, h: 4, d: 12, route: 'mid', face: 1 });
        this.p.push({ kind: 'wall', x: 3.2, y: 2, z: this.z + 7, w: 0.6, h: 4, d: 12, route: 'mid', face: -1 });
        this.bar('mid', 4, 6); this.vault('mid', 9, 4);
        this.slab(14); break;
      }
    }
  }
}

/** The pieces of a track at a tier: the start gate, its sections with a checkpoint every second one, the finish. */
export function trackPieces(track: FreeRunTrack, tier: Tier): Piece[] {
  const b = new Builder(tier);
  b.p.push({ kind: 'start', x: 0, y: 1.6, z: 1.5, w: 8, h: 3.2, d: 0.3 });
  b.slab(8);
  track.sections.forEach((s, i) => { b.section(s); if (i % 2 === 1) { b.slab(4); b.checkpoint(); } });
  b.slab(10);
  b.p.push({ kind: 'finish', x: 0, y: 1.6, z: b.z - 1.5, w: SLAB_W, h: 3.2, d: 0.3 });
  return b.p;
}

/** The default course (the first track) — kept for the callers that only know a tier. */
export function coursePieces(tier: Tier, track: FreeRunTrack = FREERUN_TRACKS[0]): Piece[] {
  return trackPieces(track, tier);
}

export function courseLength(pieces: readonly Piece[]): number {
  const f = pieces.find((q) => q.kind === 'finish');
  return f ? f.z : 0;
}

export function checkpoints(pieces: readonly Piece[]): Piece[] {
  return pieces.filter((q) => q.kind === 'checkpoint').sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/** Respawn point after a fall: the last checkpoint passed (or the start), on the ground, centred. */
export function respawnFor(pieces: readonly Piece[], lastCheckpoint: number): { x: number; y: number; z: number } {
  const cp = checkpoints(pieces).find((q) => q.index === lastCheckpoint);
  return cp ? { x: 0, y: 0, z: cp.z + 1 } : { x: 0, y: 0, z: 3 };
}

/** Is a point over a gap (and below the ground) — the fall test the mode runs each frame. */
export function overGap(pieces: readonly Piece[], x: number, z: number): boolean {
  return pieces.some((q) => q.kind === 'gap' && Math.abs(x - q.x) <= q.w / 2 && Math.abs(z - q.z) <= q.d / 2);
}

/** Which lane a position sits in. The high line is the +X shelf above 2.5 m; the low lane is −x; the mid lane between. */
export function laneAt(x: number, y: number): Lane { return x > 3 && y > 2.5 ? 'high' : x < -3 ? 'low' : 'mid'; }
export function routeAt(x: number, y: number): 'high' | 'low' { return laneAt(x, y) === 'high' ? 'high' : 'low'; }

/** The rail under (x, z) whose top a body at `y` could land on, if any. */
export function railAt(pieces: readonly Piece[], x: number, y: number, z: number, reach = 0.55): Piece | null {
  for (const q of pieces) {
    if (q.kind !== 'rail') continue;
    if (Math.abs(x - q.x) > reach || Math.abs(z - q.z) > q.d / 2) continue;
    const top = q.y + q.h / 2;
    if (y >= top - 0.15 && y <= top + 0.9) return q;
  }
  return null;
}

/** The spring pad under (x, z), if standing on one. */
export function springAt(pieces: readonly Piece[], x: number, z: number): Piece | null {
  return pieces.find((q) => q.kind === 'spring' && Math.abs(x - q.x) <= q.w / 2 && Math.abs(z - q.z) <= q.d / 2) ?? null;
}

/** The gate ahead inside `ahead` metres on the runner's lane, if any. */
export function gateAhead(pieces: readonly Piece[], x: number, z: number, ahead = 3): Piece | null {
  return pieces.find((q) => q.kind === 'gate' && Math.abs(x - q.x) <= q.w / 2 + 0.5 && q.z - z > -0.2 && q.z - z <= ahead) ?? null;
}

/** The nearest hazard inside reach ahead of (x, z), if any. */
export function hazardAhead(pieces: readonly Piece[], x: number, z: number, reach = 1.6): Piece | null {
  let best: Piece | null = null, bd = Infinity;
  for (const q of pieces) { if (q.kind !== 'hazard') continue; const dz = q.z - z; if (dz < -0.3 || dz > reach || Math.abs(q.x - x) > 1.2) continue; if (dz < bd) { bd = dz; best = q; } }
  return best;
}
