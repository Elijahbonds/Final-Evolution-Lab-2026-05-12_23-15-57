// IMPROVE (2026-10-06, Big Air items 1 / 2 / 8 / 10) — the jump the air session is ridden on, and what it judges.
//   1  the kicker IS at launchZ: the run-up climbs its ramp and the rider leaves from the lip's height;
//   2  the landing is a pitched slope: an air lands ON it (above y 0), and short of it (the table) or past it (the flat
//      run-out) is never better than sketchy;
//   8  so the run-up is a speed decision: the bare slope stops just short of the landing's window, strides reach it,
//      a measured boost stays in it, a flat-out boost overshoots;
//  10  the same rotation landed again pays its repeat's share; the other direction is a new trick.
import { describe, expect, it } from 'vitest';
import { makeBigAirSession, makeBigAirSkin, BIG_AIR_TUNING, BIG_AIR_HILL } from './big-air-skin';
import { AirSessionCore, rotationKey } from './air-session-core';
import { hillSurface, sweetBand } from './air-hill';
import { feelConfig } from '../index';
import { makeVaultSession } from './vault-skin';

const DT = 1 / 60;
const surf = hillSurface(BIG_AIR_HILL, BIG_AIR_TUNING.launchZ);

interface Play { strides?: boolean; boost?: number; turns?: number; dir?: 1 | -1; stick?: boolean }
/** One attempt to its landing: stride / boost the run-up, start the spin at take-off, plant it at `turns`, stomp ~100 ms out. */
function attempt(core: AirSessionCore, p: Play = {}): { predicted: number | null } {
  let started = false, planted = false, stuck = false, predicted: number | null = null;
  const n0 = core.state.attempts.length;
  for (let i = 0; i < 60 * 30 && core.state.attempts.length === n0; i++) {
    const s = core.state;
    core.boostK = s.phase === 'Run' ? (p.boost ?? 0) : 0;
    if (s.phase === 'Run' && p.strides !== false && i % 16 === 0) core.runTap(i % 32 === 0 ? 'L' : 'R', 'good');
    core.step(DT);
    if (core.state.phase !== 'Air') continue;
    if (predicted === null) predicted = core.predictTouchdown()!.z;
    if (!started && (p.turns ?? 1) > 0) { core.setSpinDir(p.dir ?? 1); core.trick(); started = true; continue; }
    if (started && !planted && Math.abs(core.airTrick.rotation) >= (p.turns ?? 1) - 0.01) { core.trick(); planted = true; }
    const clear = core.state.pos.y - core.surface.y(core.state.pos.z);
    if (p.stick && planted && !stuck && core.state.vy < 0 && clear <= -core.state.vy * 0.1) { core.stick(); stuck = true; }
  }
  // the land beat, back to the next run-up
  for (let i = 0; i < 120 && core.state.phase === 'Land'; i++) core.step(DT);
  return { predicted };
}

describe('the hill (air-hill)', () => {
  it('puts the lip at launchZ, the table at deckY, the landing between the knuckle and the run-out', () => {
    const L = BIG_AIR_TUNING.launchZ;
    expect(surf.y(L)).toBeCloseTo(BIG_AIR_HILL.lipY);
    expect(surf.y(L + BIG_AIR_HILL.kickerLen)).toBeCloseTo(0);
    expect(surf.y(L + BIG_AIR_HILL.kickerLen / 2)).toBeCloseTo(BIG_AIR_HILL.lipY / 2);
    expect(surf.y(L - 5)).toBe(0);                                         // the gap
    expect(surf.y(BIG_AIR_HILL.knuckleZ + 1)).toBe(BIG_AIR_HILL.deckY);    // the table
    const mid = (BIG_AIR_HILL.knuckleZ + surf.bottomZ) / 2;
    expect(surf.y(mid)).toBeCloseTo(BIG_AIR_HILL.deckY / 2);
    expect(surf.zone(mid)).toBe('sweet');
    expect(surf.zone(BIG_AIR_HILL.knuckleZ - 0.5)).toBe('knuckle');        // the knuckle's roll
    expect(surf.zone(surf.bottomZ - 1)).toBe('flat');
    expect(surf.y(surf.bottomZ - 1)).toBe(0);
  });
});

describe('Big Air on the hill', () => {
  it('climbs the kicker on the run-up and leaves from the lip', () => {
    const core = makeBigAirSession();
    let onRamp = 0;
    while (core.state.phase === 'Run') {
      core.step(DT);
      if (core.state.phase === 'Run' && core.state.pos.z < BIG_AIR_TUNING.launchZ + BIG_AIR_HILL.kickerLen) onRamp = Math.max(onRamp, core.state.pos.y);
    }
    expect(onRamp).toBeGreaterThan(0.5);
    expect(core.state.pos.y).toBeGreaterThan(BIG_AIR_HILL.lipY - 0.01);   // first air frame: off the lip, going up
    expect(core.state.vy).toBeGreaterThan(0);
  });

  it('measures the landing as a speed window: the bare slope short of it, the cap inside it, a flat-out boost past it', () => {
    const band = sweetBand(BIG_AIR_TUNING, feelConfig.gravity, BIG_AIR_HILL)!;
    expect(band).not.toBeNull();
    const coast = makeBigAirSession(); while (coast.state.phase === 'Run') coast.step(DT);
    expect(coast.state.launchSpeed).toBeLessThan(band[0]);                       // strides are needed …
    expect(BIG_AIR_TUNING.maxRunSpeed).toBeGreaterThan(band[0]);                 // … and enough
    expect(BIG_AIR_TUNING.maxRunSpeed).toBeLessThan(band[1]);                    // a measured boost still lands
    expect(BIG_AIR_TUNING.maxRunSpeed * 1.4).toBeGreaterThan(band[1]);           // full boost overshoots
    expect(band[1] - band[0]).toBeGreaterThan(2.5);                              // a window, not a knife edge
  });

  it('a strided run lands ON the slope (above y 0) and keeps a clean grade; the prediction at take-off is where it lands', () => {
    const core = makeBigAirSession();
    const { predicted } = attempt(core, { turns: 1 });
    const a = core.state.attempts[0];
    expect(a.zone).toBe('sweet');
    expect(a.grade).toBe('clean');
    expect(core.state.lastJudged).toBe('clean');
    expect(predicted).not.toBeNull();
    expect(surf.zone(predicted!)).toBe('sweet');
  });

  it('predictTouchdown at take-off is within a metre of the real touchdown (a 120 Hz forecast of a 60 Hz flight)', () => {
    const core = makeBigAirSession();
    let pred: number | null = null;
    for (let i = 0; i < 2000 && core.state.attempts.length === 0; i++) {
      if (core.state.phase === 'Run' && i % 16 === 0) core.runTap('L', 'good');
      core.step(DT);
      if (core.state.phase === 'Air' && pred === null) pred = core.predictTouchdown()!.z;
    }
    expect(core.state.phase).toBe('Land');
    expect(core.state.pos.y).toBeGreaterThan(0.5);                 // on the landing slope, not the flat
    expect(Math.abs(core.state.pos.z - pred!)).toBeLessThan(1);
    expect(core.predictTouchdown()).toBeNull();                    // only in the air
  });

  it('a coasted run knuckles on the table and a flat-out boost overshoots to the flat: a clean plant is capped at sketchy', () => {
    const short = makeBigAirSession();
    attempt(short, { strides: false, turns: 1, stick: true });
    expect(short.state.attempts[0].zone).toBe('knuckle');
    expect(short.state.lastJudged).toBe('stuck');
    expect(short.state.attempts[0].grade).toBe('sketchy');

    const long = makeBigAirSession();
    attempt(long, { boost: 1, turns: 1 });
    expect(long.state.attempts[0].zone).toBe('flat');
    expect(long.state.lastJudged).toBe('clean');
    expect(long.state.attempts[0].grade).toBe('sketchy');
    const t = BIG_AIR_TUNING;
    expect(long.state.attempts[0].pts).toBe(Math.round((t.basePoints + t.pointsPerRotation) * t.gradePoints.sketchy));
  });

  it('pays a repeated rotation its repeat share, and the other direction in full', () => {
    const core = makeBigAirSession();
    attempt(core, { turns: 1, dir: 1 });
    attempt(core, { turns: 1, dir: 1 });
    attempt(core, { turns: 1, dir: -1 });
    const [a, b, c] = core.state.attempts;
    expect([a.grade, b.grade, c.grade]).toEqual(['clean', 'clean', 'clean']);
    expect([a.repeat, b.repeat, c.repeat]).toEqual([0, 1, 0]);
    expect(b.pts).toBe(Math.round(a.pts * BIG_AIR_TUNING.repeatDecay![1]));
    expect(c.pts).toBe(a.pts);
    expect(rotationKey(1.02)).toBe('FS1');
    expect(rotationKey(-0.98)).toBe('BS1');
  });

  it('a crash lands nothing, so the same rotation after it is still new', () => {
    const core = new AirSessionCore(makeBigAirSkin());
    // a spin left running at touchdown off the half turn crashes: start it and never plant
    let started = false;
    for (let i = 0; i < 2000 && core.state.attempts.length === 0; i++) {
      if (core.state.phase === 'Run' && i % 16 === 0) core.runTap('L', 'good');
      core.step(DT);
      if (core.state.phase === 'Air' && !started) { core.trick(); started = true; }
    }
    for (let i = 0; i < 120 && core.state.phase === 'Land'; i++) core.step(DT);
    if (core.state.attempts[0].grade !== 'crash') return;   // (it happened to land on a half turn — nothing to pin)
    attempt(core, { turns: Math.round(Math.abs(core.state.attempts[0].rotations) * 2) / 2 || 1 });
    expect(core.state.attempts[1].repeat).toBe(0);
  });

  it('a skin with no hill keeps the flat: the vault never leaves y 0 on its run-up and every landing zone is the landing', () => {
    const v = makeVaultSession();
    for (let i = 0; i < 3000 && v.state.attempts.length === 0; i++) {
      if (v.state.phase === 'Run' && i % 15 === 0) v.runTap(i % 30 === 0 ? 'L' : 'R', 'perfect');
      v.step(DT);
      if (v.state.phase === 'Run') expect(v.state.pos.y).toBe(0);
    }
    expect(v.state.attempts.length).toBe(1);
    expect(v.state.attempts[0].zone).toBe('sweet');
    expect(v.state.pos.y).toBe(0);
  });
});
