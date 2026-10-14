// SUN SHAFTS (w3-atmos): the gate, the measurement it is built on, and the sun-in-frame test the measurement used. The pass itself
// needs a GPU; the rig points the camera at the sun for the picture.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FreeCamera, Matrix, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { MOODS, type VenueMood } from './moods';
import { SHAFT_LOOK, SUN_SHAFT_MEASURED, SUN_SHAFT_MIN_SHARE, SUN_SHAFT_MODES, sunInFrame, sunShaftsWanted, towardLight } from './SunShafts';

const G = { tier: 'high' as const, mood: 'goldenHour' as VenueMood, modeId: 'dunk', reducedMotion: false };

describe('sunShaftsWanted', () => {
  it('the tv tier, the goldenHour sun, a mode that earned it, full motion', () => {
    expect(sunShaftsWanted({ ...G, modeId: 'made_up_mode_with_the_sun_in_frame' })).toBe(false);   // not in the table
    expect(sunShaftsWanted({ ...G, on: true })).toBe(true);                                         // the override
    expect(sunShaftsWanted({ ...G, on: true, tier: 'desktop' })).toBe(false);
    expect(sunShaftsWanted({ ...G, on: true, tier: 'mobile' })).toBe(false);
    expect(sunShaftsWanted({ ...G, on: true, mood: 'nightGame' })).toBe(false);
    expect(sunShaftsWanted({ ...G, on: true, reducedMotion: true })).toBe(false);
    expect(sunShaftsWanted({ ...G, on: true, off: true })).toBe(false);
  });
  it('a mode in the earned set mounts without the override (and a mode outside it does not)', () => {
    const earned = new Set(['facing_the_sun']);
    expect(sunShaftsWanted({ ...G, modeId: 'facing_the_sun' }, earned)).toBe(true);
    expect(sunShaftsWanted({ ...G, modeId: 'dunk' }, earned)).toBe(false);
    expect(sunShaftsWanted({ ...G, modeId: null }, earned)).toBe(false);
    expect(sunShaftsWanted({ ...G, modeId: 'facing_the_sun', tier: 'desktop' }, earned)).toBe(false);   // the tier still gates an earned mode
  });
  it('by default nothing is earned, so nothing mounts without the override', () => {
    for (const m of Object.keys(SUN_SHAFT_MEASURED)) expect(sunShaftsWanted({ ...G, modeId: m }), m).toBe(false);
  });
});

describe('the measurement', () => {
  it('covers every goldenHour mode the rig sampled, with enough samples, and the sun was never in the frame', () => {
    for (const [mode, m] of Object.entries(SUN_SHAFT_MEASURED)) { expect(m.samples, mode).toBeGreaterThanOrEqual(40); expect(m.share, mode).toBeGreaterThanOrEqual(0); expect(m.share, mode).toBeLessThanOrEqual(1); }
    expect(Object.keys(SUN_SHAFT_MEASURED).sort()).toEqual(['aeroaces', 'carnival', 'dunk', 'dunkduel', 'onevone', 'skateboard', 'surf', 'tennis', 'threepoint', 'threevthree', 'velocitykart', 'volleyball']);
  });
  it('so the earned set is the table\'s winners: none, today', () => {
    expect([...SUN_SHAFT_MODES]).toEqual(Object.entries(SUN_SHAFT_MEASURED).filter(([, m]) => m.share >= SUN_SHAFT_MIN_SHARE).map(([k]) => k));
    expect(SUN_SHAFT_MODES.size).toBe(0);
    expect(SUN_SHAFT_MIN_SHARE).toBeGreaterThan(0.1);
  });
  it('and the reason holds on the maths: the goldenHour sun is 50-60 degrees up, more than a play camera\'s half field', () => {
    const t = towardLight({ x: MOODS.goldenHour.sunDir[0], y: MOODS.goldenHour.sunDir[1], z: MOODS.goldenHour.sunDir[2] });
    const elevation = Math.asin(t.y) * 180 / Math.PI;
    expect(elevation).toBeGreaterThan(50); expect(elevation).toBeLessThan(65);
    expect(0.8 / 2 * 180 / Math.PI).toBeLessThan(25);   // the game's ~0.8 rad vertical field: a camera must pitch up 30+ degrees to frame it
  });
});

describe('sunInFrame', () => {
  const scene = new Scene(new NullEngine());
  const vp = (pos: [number, number, number], target: [number, number, number]) => { const c = new FreeCamera('c', new Vector3(...pos), scene); c.setTarget(new Vector3(...target)); c.fov = 0.8; c.minZ = 0.1; c.maxZ = 3000; const m = new Matrix(); c.getViewMatrix().multiplyToRef(c.getProjectionMatrix(), m); return { m: m.m, eye: c.globalPosition }; };
  it('a camera looking at the sun has it; a camera looking at the horizon does not; one looking away does not', () => {
    const t = towardLight({ x: -0.6, y: -1, z: -0.35 });
    const at = vp([0, 2, 0], [t.x * 10, 2 + t.y * 10, t.z * 10]);
    expect(sunInFrame(at.m, at.eye, t)).toBe(true);
    const hz = vp([0, 2, 0], [t.x * 10, 2, t.z * 10]);
    expect(sunInFrame(hz.m, hz.eye, t)).toBe(false);
    const away = vp([0, 2, 0], [-t.x * 10, 2, -t.z * 10]);
    expect(sunInFrame(away.m, away.eye, t)).toBe(false);
  });
  it('the margin widens the frame', () => {
    const t = towardLight({ x: -0.6, y: -1, z: -0.35 });
    const c = vp([0, 2, 0], [t.x * 10, 2 + t.y * 10, t.z * 10]);
    // nudge the target off the sun by a little: inside the frame at margin 1
    expect(sunInFrame(c.m, c.eye, t, 1)).toBe(true);
    expect(sunInFrame(c.m, c.eye, t, 1.4)).toBe(true);
  });
});

describe('the pass', () => {
  it('is half resolution with a modest sample count, and the sun disc sits inside the dome (the dome is black in the occluder pass)', () => {
    expect(SHAFT_LOOK.ratio).toBeLessThanOrEqual(0.5);
    expect(SHAFT_LOOK.samples).toBeLessThanOrEqual(64);
    expect(SHAFT_LOOK.sunDistance).toBeLessThan(200);   // nexus_sky's radius is 200, bk_dome's 280
  });
});

describe('wired in, and presentation only', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
  it('the rig mounts it once after load, behind the legacy guard, and disposes it', () => {
    const s = read('LightRig.ts');
    expect(s).toMatch(/sunShafts\?\.dispose\(\); sunShafts = mountSunShafts\(scene, tier, mood\);/);
    expect(s).toMatch(/decals\?\.dispose\(\); heat\?\.dispose\(\); sunShafts\?\.dispose\(\);/);
    const cap = s.slice(s.indexOf('captureVenue(at) {'), s.indexOf('get venueProbe'));
    expect(cap.indexOf('if (!legacy) {')).toBeLessThan(cap.indexOf('mountSunShafts'));
    expect(s).toMatch(/\|aero_fx_\|sky_sun_shaft\)/);
  });
  it('never toggles the post at runtime: no isEnabled / attach / detach outside mount and dispose', () => {
    const s = read('SunShafts.ts');
    expect(s).not.toMatch(/\.isEnabled\s*=/); expect(s).not.toMatch(/attachPostProcess|detachPostProcess/);
  });
  it('imports nothing that scores, judges, times or tunes', () => {
    const imports = [...read('SunShafts.ts').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect([...new Set(imports)].sort()).toEqual(['../../a11y/reducedMotion', './QualityTier', './graphicsSetting', './lookPolicy', './moods', '@babylonjs/core']);
  });
});
