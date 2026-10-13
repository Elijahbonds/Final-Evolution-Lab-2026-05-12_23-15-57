// FIREWORKS (vis-court, wave 2, 2026-10-13) — the home run's night sky.
//
// The audit (derby): "Home-run moment: fireworks over the wall". A short show of sparks and paper bursts over the outfield wall:
// a handful of shells at staggered times, each at a height and a spread round the ball's bearing, each a different colour. The
// plan is pure (a seeded layout, so a capture and its before/after agree and a test can hold its bounds); the show is stepped by
// the mode's own update (so it pauses with the mode, in a replay and a pause) and spends the shared particle budget through
// EffectsKit.burst, which trims a burst that does not fit.

import { Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { EffectsKit, type BurstKind } from '../visual/EffectsKit';

export interface Shell { delay: number; x: number; y: number; z: number; color: string; kind: BurstKind; scale: number }

const COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#ffffff'];
function h(n: number): number { const s = Math.sin(n * 91.7 + 17.3) * 43758.5453; return s - Math.floor(s); }

/**
 * Pure: the shells of one show over `at` (the wall crossing). `n` shells within 1.6 s, 14–24 m up, spread ±16 m across the line,
 * the first sooner and bigger. A phone fires fewer. `seed` varies a show from the next.
 */
export function fireworkPlan(at: { x: number; z: number }, n: number, seed = 1): Shell[] {
  const out: Shell[] = [];
  for (let i = 0; i < n; i++) {
    const r = (k: number): number => h(seed * 7.3 + i * 13.1 + k);
    out.push({
      delay: i === 0 ? 0.15 : 0.15 + (i / Math.max(1, n - 1)) * 1.45 + r(1) * 0.12,
      x: at.x + (r(2) - 0.5) * 32, y: 14 + r(3) * 10, z: at.z + 10 + r(4) * 14,
      color: COLORS[(i + Math.floor(r(5) * COLORS.length)) % COLORS.length],
      kind: i % 3 === 2 ? 'confetti' : 'sparks', scale: i === 0 ? 3.2 : 2.2 + r(6) * 1.2,
    });
  }
  return out.sort((a, b) => a.delay - b.delay);
}

export class FireworkShow {
  private pending: Shell[] = [];
  private t = 0;
  private readonly at = new Vector3();
  constructor(private readonly scene: Scene) {}

  /** Start a show (replacing one still going). */
  launch(plan: Shell[]): void { this.pending = plan.slice(); this.t = 0; }

  get live(): number { return this.pending.length; }

  /** Step by the mode's dt; fires the shells that are due. */
  update(dt: number): void {
    if (!this.pending.length) return;
    this.t += dt;
    while (this.pending.length && this.pending[0].delay <= this.t) {
      const s = this.pending.shift()!;
      this.at.set(s.x, s.y, s.z);
      EffectsKit.burst(this.scene, this.at, s.kind, s.scale, s.color);
    }
  }

  clear(): void { this.pending.length = 0; }
}
