// IMPROVE (2026-10-06, 1v1 #9 #17) — the stride smoothing steps on the frame's real dt when the mode passes it (and on 1/60 exactly as
// before when it does not), and a FootPlant keeps ONE after-animations observer for its life.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BasketballAnimTree, type AnimTreeInput } from './basketballTree';

const run: AnimTreeInput = {
  speed01: 0.7, crossover: false, hasBall: true, shooting: false, dunking: false,
  driving: false, defending: false, bracing: false, staggered: false, nearestDefender: 9,
};

/** A tree on a fake animator; returns the playback scale it was last told for the running loop. */
function rig() {
  const scales: number[] = [];
  const tree = new BasketballAnimTree({ play: () => {}, setPlaybackScale: (_c: string, r: number) => { scales.push(r); } } as never);
  return { tree, scales };
}

describe('#9 the stride rate smooths on the frame it was given', () => {
  it('without dtSec the step is 1/60 — byte-identical to before (a mode that does not pass it is unchanged)', () => {
    const a = rig(), b = rig();
    a.tree.update({ ...run, speedMps: 2 }); b.tree.update({ ...run, speedMps: 2, dtSec: 1 / 60 });
    a.tree.update({ ...run, speedMps: 6 }); b.tree.update({ ...run, speedMps: 6, dtSec: 1 / 60 });
    expect(a.scales.at(-1)).toBe(b.scales.at(-1));
  });
  it('a 30 fps frame closes twice the gap of a 60 fps frame (it used to close the same, at half speed)', () => {
    const at60 = rig(), at30 = rig();
    for (const r of [at60, at30]) r.tree.update({ ...run, speedMps: 2, dtSec: 1 / 60 });
    const start = at60.scales.at(-1)!;
    at60.tree.update({ ...run, speedMps: 6, dtSec: 1 / 60 });
    at30.tree.update({ ...run, speedMps: 6, dtSec: 1 / 30 });
    const moved60 = at60.scales.at(-1)! - start, moved30 = at30.scales.at(-1)! - start;
    expect(moved60).toBeGreaterThan(0);
    expect(moved30 / moved60).toBeCloseTo(2, 5);
  });
});

describe('#17 one FootPlant observer', () => {
  const src = readFileSync(path.join(__dirname, 'basketballTree.ts'), 'utf8');
  const cls = src.slice(src.indexOf('export class FootPlant'), src.indexOf('/** DEFENSE-LOOK (2026-09-17): is this body moving AWAY'));
  it('is added once (on the first plant), gated on the lock, and removed only by dispose', () => {
    expect(cls.match(/onAfterAnimationsObservable\.add\(/g)?.length).toBe(1);
    expect(cls).toMatch(/this\.obs \?\?= this\.mesh\.getScene\(\)\.onAfterAnimationsObservable\.add\(this\.pinLeg\)/);
    expect(cls).toMatch(/private pinLeg = \(\): void => \{\n\s*const l = this\.lock;\n\s*if \(!l\) return;/);
    const release = cls.slice(cls.indexOf('  release(): void {'), cls.indexOf('  get active()'));
    expect(release).not.toMatch(/onAfterAnimationsObservable\.remove/);
    const dispose = cls.slice(cls.indexOf('  dispose(): void {'));
    expect(dispose).toMatch(/onAfterAnimationsObservable\.remove\(this\.obs\)/);
  });
});
