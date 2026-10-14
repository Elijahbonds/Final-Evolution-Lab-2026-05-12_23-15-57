// vis-hoops-court — the carnival's fair, its marquee and the mount the mode calls.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { installOffscreenShim, recordingCtx, allFinite } from '../../../tests/helpers/canvasShim';
import type { ModeContext } from '../core/ModeHarness';

let travel = true;
vi.mock('../../a11y/reducedMotion', () => ({ motionPolicy: () => ({ travel }) }));
const bursts: { kind: string; at: { x: number; y: number; z: number }; scale: number }[] = [];
vi.mock('../visual/EffectsKit', () => ({ EffectsKit: { burst: (_s: unknown, at: Vector3, kind: string, scale = 1) => { bursts.push({ kind, at: { x: at.x, y: at.y, z: at.z }, scale }); } } }));

import { CAROUSEL_TURN_S, POLE_H, WHEEL_TURN_S, carnivalPlan, clearOfHub, mountCarnivalSet, paintSign, paintStripes, sagPoints } from './carnivalSet';
import { CHASE_HZ, MARQUEE_H, MARQUEE_SIZE, MARQUEE_W, borderPoints, chasePhase, marqueeLines, mountMarquee, paintMarquee } from './carnivalMarquee';
import { CANNONS, mountCarnivalFx, showSize } from './mount/carnivalFx';
import { fixtureRole } from '../scene/FixtureLights';
import { GLOW_MESH, GLOW_MATERIAL } from '../scene/EmissiveGlow';

beforeAll(() => installOffscreenShim());
afterEach(() => { travel = true; bursts.length = 0; });

function rig() {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  new FreeCamera('cam', new Vector3(0, 3, -8), scene);
  return { scene, frame: (n: number) => { for (let i = 0; i < n; i++) scene.render(); } };
}

describe('the cord between two poles', () => {
  it('has n + 1 points, ends where it was hung, and sags by `sag` at the middle', () => {
    const pts = sagPoints({ x: 0, y: 4, z: 0 }, { x: 0, y: 4, z: 10 }, 0.8, 10);
    expect(pts.length).toBe(11);
    expect(pts[0]).toEqual({ x: 0, y: 4, z: 0 }); expect(pts[10]).toEqual({ x: 0, y: 4, z: 10 });
    expect(pts[5].y).toBeCloseTo(4 - 0.8, 6);
    for (const p of pts) expect(p.y).toBeLessThanOrEqual(4 + 1e-9);
  });
  it('a sloping cord still ends at both poles', () => {
    const pts = sagPoints({ x: 0, y: 5, z: 0 }, { x: 4, y: 3, z: 0 }, 0.5, 4);
    expect(pts[0].y).toBe(5); expect(pts[4].y).toBe(3);
  });
});

describe('the fair\'s plan', () => {
  const plan = carnivalPlan('desktop');
  it('leaves the party-goers\' spots and the podium alone', () => {
    const all = [...plan.poles, ...plan.booths, ...plan.tents, plan.carousel, plan.wheel, ...plan.balloons];
    for (const p of all) expect(clearOfHub(p), JSON.stringify(p)).toBe(true);
  });
  it('every strand hangs between two of its own poles, at the pole tops', () => {
    for (const s of plan.strands) for (const e of [s.from, s.to]) {
      expect(plan.poles.some((p) => Math.abs(p.x - e.x) < 1e-9 && Math.abs(p.z - e.z) < 1e-9), JSON.stringify(e)).toBe(true);
      expect(e.y).toBe(POLE_H);
    }
  });
  it('the wheel stands inside the dome (280 m) and is big enough to read at that range; the booths face the hub camera', () => {
    expect(Math.hypot(plan.wheel.x, plan.wheel.z) + plan.wheel.r).toBeLessThan(250);
    expect(plan.wheel.r).toBeGreaterThanOrEqual(10);
    for (const b of plan.booths) expect(Math.cos(b.yaw)).toBeLessThan(0);   // yaw π: opened toward −z
  });
  it('a phone gets fewer bulbs, three booths and no balloons', () => {
    const p = carnivalPlan('mobile');
    expect(p.strands[0].bulbs).toBeLessThan(plan.strands[0].bulbs);
    expect(p.booths.length).toBe(3); expect(p.balloons.length).toBe(0);
  });
  it('the turns are slow: a wheel a minute, a carousel a half', () => { expect(WHEEL_TURN_S).toBeGreaterThanOrEqual(45); expect(CAROUSEL_TURN_S).toBeGreaterThanOrEqual(15); });
});

describe('the painters', () => {
  it('draw finite numbers', () => {
    const a = recordingCtx(); paintStripes(a, 64, 32, '#f00', '#fff'); expect(a.calls.length).toBeGreaterThan(5); expect(allFinite(a.calls)).toBe(true);
    const b = recordingCtx(); paintSign(b, 256, 80, 'RING TOSS', '#ffd166'); expect(allFinite(b.calls)).toBe(true);
    const c = recordingCtx(); paintMarquee(c, MARQUEE_W, MARQUEE_H, { title: 'STANDINGS', rows: [{ name: 'YOU', score: 24 }, { name: 'RIVAL', score: 18 }], footer: 'YOU TAKE SLAM RUSH' }); expect(allFinite(c.calls)).toBe(true);
  });
});

describe('the built fair', () => {
  it('names the bulbs and the wheel the way the rig reads them, and nothing is pickable', () => {
    const { scene } = rig();
    const before = scene.meshes.length;
    const h = mountCarnivalSet(scene, { tier: 'desktop' });
    const plan = carnivalPlan('desktop');
    const bulbs = scene.meshes.filter((m) => /^bb_bulb_carn_/.test(m.name));
    expect(bulbs.length).toBe(plan.strands.length + 1);   // a mesh a strand, and the carousel's ring
    for (const m of bulbs) { expect(fixtureRole(m.name, m.material?.name)).toBe('bulb'); expect(GLOW_MESH.test(m.name)).toBe(true); expect(GLOW_MATERIAL.test(m.material!.name)).toBe(true); }
    const rim = scene.getMeshByName('bb_wheel_marquee_carn')!;
    expect(rim).toBeTruthy(); expect(GLOW_MESH.test(rim.name)).toBe(true);
    for (const m of h.meshes) expect(m.isPickable, m.name).toBe(false);
    h.dispose();
    expect(scene.meshes.length).toBe(before);
  });
  it('a strand\'s bulb mesh is local to its middle: the fixture light lands where the strand hangs', () => {
    const { scene } = rig();
    const h = mountCarnivalSet(scene, { tier: 'desktop' });
    const plan = carnivalPlan('desktop');
    const s = plan.strands[0];
    const m = scene.getMeshByName('bb_bulb_carn_0')!;
    const p = m.computeWorldMatrix(true).getTranslation();
    expect(p.x).toBeCloseTo((s.from.x + s.to.x) / 2, 1);
    expect(p.z).toBeCloseTo((s.from.z + s.to.z) / 2, 1);
    expect(p.y).toBeGreaterThan(2); expect(p.y).toBeLessThan(POLE_H);
    h.dispose();
  });
  it('the whole fair goes with the hub', () => {
    const { scene } = rig();
    const h = mountCarnivalSet(scene, { tier: 'desktop' });
    h.setEnabled(false);
    for (const m of h.meshes) if (m.parent) expect(m.isEnabled(), m.name).toBe(false);
    h.setEnabled(true);
    expect(scene.getMeshByName('carn_poles')!.isEnabled()).toBe(true);
    h.dispose();
  });
  it('the wheel and the carousel turn', () => {
    const { scene, frame } = rig();
    const h = mountCarnivalSet(scene, { tier: 'desktop' });
    const wheel = scene.getTransformNodeByName('carn_wheel_pivot')!, car = scene.getTransformNodeByName('carn_carousel')!;
    frame(60);
    expect(wheel.rotation.z).toBeCloseTo((Math.PI * 2 / WHEEL_TURN_S) * 1, 1);
    expect(car.rotation.y).toBeCloseTo((Math.PI * 2 / CAROUSEL_TURN_S) * 1, 1);
    h.dispose();
  });
  it('under reduced motion the wheel, the carousel and the balloons hold still', () => {
    const { scene, frame } = rig();
    const h = mountCarnivalSet(scene, { tier: 'desktop', calm: () => true });
    const wheel = scene.getTransformNodeByName('carn_wheel_pivot')!, car = scene.getTransformNodeByName('carn_carousel')!;
    frame(120);
    expect(wheel.rotation.z).toBe(0); expect(car.rotation.y).toBe(0);
    h.dispose();
  });
  it('a phone builds without balloons', () => {
    const { scene } = rig(); const h = mountCarnivalSet(scene, { tier: 'mobile' });
    expect(scene.getMeshByName('carn_court_balloon')).toBeNull();
    h.dispose();
  });
});

describe('the marquee', () => {
  it('chases: the two sets take turns, CHASE_HZ times a second', () => {
    expect(chasePhase(0)).toBe(0); expect(chasePhase(1 / CHASE_HZ + 0.01)).toBe(1); expect(chasePhase(2 / CHASE_HZ + 0.01)).toBe(0);
  });
  it('the border points run round the sign, clockwise from the top-left, and stay on the border', () => {
    const { w, h } = MARQUEE_SIZE; const pts = borderPoints(w, h, 40);
    expect(pts.length).toBe(40); expect(pts[0]).toEqual({ x: -w / 2, y: h / 2 });
    for (const p of pts) { expect(Math.abs(p.x)).toBeLessThanOrEqual(w / 2 + 1e-9); expect(Math.abs(p.y)).toBeLessThanOrEqual(h / 2 + 1e-9); expect(Math.abs(p.x) > w / 2 - 1e-9 || Math.abs(p.y) > h / 2 - 1e-9).toBe(true); }
    expect(pts[10].y).toBeCloseTo(h / 2 - (pts[10].x > w / 2 - 1e-9 ? 0 : 0), 0);
  });
  it('says what it was told: the title, the first two rows, the footer — and adds nothing', () => {
    expect(marqueeLines({ title: 'STANDINGS', rows: [{ name: 'YOU', score: 24 }, { name: 'RIVAL', score: 18 }, { name: 'X', score: 1 }], footer: 'TIE' })).toEqual(['STANDINGS', 'YOU  24', 'RIVAL  18', 'TIE']);
    expect(marqueeLines({ title: 'GAME NIGHT', rows: [] })).toEqual(['GAME NIGHT']);
  });
  it('under reduced motion the chasers hold on one set (three swaps a second is a flash)', () => {
    const { scene } = rig();
    const m = mountMarquee(scene, { at: { x: 0, y: 6.4, z: 21 }, yaw: 0, tier: 'desktop', calm: () => true });
    const a = scene.getMeshByName('bb_wheel_marquee_a')!;
    const lum = (): number => { const e = (a.material as unknown as { emissiveColor: { r: number; g: number; b: number } }).emissiveColor; return e.r + e.g + e.b; };
    const l0 = lum(); for (let i = 0; i < 20; i++) m.update(0.2);
    expect(lum()).toBe(l0);
    m.dispose();
  });
  it('mounts a face, a frame and two chaser sets whose brightness swaps', () => {
    const { scene } = rig();
    const m = mountMarquee(scene, { at: { x: 0, y: 6.4, z: 21 }, yaw: 0, tier: 'desktop' });
    const a = scene.getMeshByName('bb_wheel_marquee_a')!, b = scene.getMeshByName('bb_wheel_marquee_b')!;
    expect(a && b).toBeTruthy(); expect(GLOW_MESH.test(a.name)).toBe(true); expect(GLOW_MATERIAL.test(a.material!.name)).toBe(true);
    const lum = (mesh: typeof a): number => { const e = (mesh.material as unknown as { emissiveColor: { r: number; g: number; b: number } }).emissiveColor; return e.r + e.g + e.b; };
    const l0 = [lum(a), lum(b)];
    m.update(1 / CHASE_HZ + 0.01);
    const l1 = [lum(a), lum(b)];
    expect(Math.sign(l0[0] - l0[1])).toBe(-Math.sign(l1[0] - l1[1]));
    m.show({ title: 'STANDINGS', rows: [{ name: 'YOU', score: 3 }] });
    for (const mesh of m.meshes) expect(mesh.isPickable).toBe(false);
    m.dispose();
  });
});

function fakeCtx(scene: Scene, over: { mood?: string; intro?: boolean; phase?: string } = {}) {
  let inIntro = over.intro ?? false; let ended = 0, updated = 0;
  const ctx = {
    scene, phase: () => over.phase ?? 'playing', lights: { mood: over.mood ?? 'goldenHour' },
    camDirector: { get inIntro() { return inIntro; }, update: () => { updated++; }, endIntro: () => { inIntro = false; ended++; } },
  } as unknown as ModeContext;
  return { ctx, counts: () => ({ ended, updated }) };
}

describe('the carnival\'s celebrations', () => {
  it('a card turning is a volley from both cannons', () => {
    const { scene } = rig(); const f = fakeCtx(scene); const fx = mountCarnivalFx(f.ctx);
    fx.reveal();
    expect(bursts.map((b) => b.kind)).toEqual(['confetti', 'confetti']);
    expect(bursts.map((b) => [b.at.x, b.at.y, b.at.z])).toEqual(CANNONS.map((c) => [c[0], c[1], c[2]]));
    fx.dispose();
  });
  it('an event the PLAYER took is a volley or two; one the rival took, or a tie, is nothing', () => {
    const { scene } = rig(); const f = fakeCtx(scene); const fx = mountCarnivalFx(f.ctx);
    fx.eventResult(1); fx.eventResult(-1); expect(bursts.length).toBe(0);
    fx.eventResult(0); expect(bursts.length).toBe(4);
    fx.dispose();
  });
  it('fireworks between events only when the sky is dark', () => {
    const run = (mood: string): number => {
      const { scene, frame } = rig(); const f = fakeCtx(scene, { mood }); const fx = mountCarnivalFx(f.ctx);
      bursts.length = 0; fx.eventResult(0); const volleys = bursts.length; frame(60 * 3);
      const total = bursts.length; fx.dispose(); return total - volleys;
    };
    expect(run('goldenHour')).toBe(0);
    expect(run('nightGame')).toBeGreaterThan(3);
  });
  it('the champion\'s finale fires the show whatever the hour; a runner-up\'s finale does not (by day)', () => {
    const run = (won: boolean): number => {
      const { scene, frame } = rig(); const f = fakeCtx(scene); const fx = mountCarnivalFx(f.ctx);
      bursts.length = 0; fx.finale(won); frame(60 * 3); const n = bursts.length; fx.dispose(); return n;
    };
    expect(run(true)).toBeGreaterThan(showSize('finale', 'desktop'));
    expect(run(false)).toBe(0);
  });
  it('no fireworks in reduced motion', () => {
    travel = false;
    const { scene, frame } = rig(); const f = fakeCtx(scene, { mood: 'nightGame' }); const fx = mountCarnivalFx(f.ctx);
    bursts.length = 0; fx.finale(true); frame(60 * 3);
    expect(bursts.length).toBe(6);   // the three volleys only (two cannons each)
    fx.dispose();
  });
  it('a pause freezes the show', () => {
    const { scene, frame } = rig(); const f = fakeCtx(scene, { mood: 'nightGame', phase: 'paused' }); const fx = mountCarnivalFx(f.ctx);
    fx.eventResult(0); const n = bursts.length; frame(60 * 3);
    expect(bursts.length).toBe(n);
    fx.dispose();
  });
  it('a finale is bigger than an event\'s show, and a phone fires fewer shells', () => {
    expect(showSize('finale', 'desktop')).toBeGreaterThan(showSize('event', 'desktop'));
    expect(showSize('event', 'mobile')).toBeLessThan(showSize('event', 'desktop'));
  });
});

describe('the intro\'s camera', () => {
  const sub = new Vector3(0, 1.2, 0), obj = new Vector3(0, 1.2, 3.5);
  it('is stepped while an intro runs on the pick screen and the first card', () => {
    const { scene } = rig(); const f = fakeCtx(scene, { intro: true }); const fx = mountCarnivalFx(f.ctx);
    expect(fx.stepIntro(sub, obj, true)).toBe(true);
    expect(f.counts()).toEqual({ ended: 0, updated: 1 });
    fx.dispose();
  });
  it('is ended the moment an event takes the floor (it drives its own camera)', () => {
    const { scene } = rig(); const f = fakeCtx(scene, { intro: true }); const fx = mountCarnivalFx(f.ctx);
    expect(fx.stepIntro(sub, obj, false)).toBe(false);
    expect(f.counts()).toEqual({ ended: 1, updated: 0 });
    fx.dispose();
  });
  it('endIntro() hands the frame back before an event builds (an intro ended AFTER would restore the hub\'s pose over the event\'s); with none running it is a no-op', () => {
    const { scene } = rig(); const f = fakeCtx(scene, { intro: true }); const fx = mountCarnivalFx(f.ctx);
    fx.endIntro(); expect(f.counts().ended).toBe(1);
    fx.endIntro(); expect(f.counts().ended).toBe(1);
    fx.dispose();
  });
  it('with no intro it does nothing (the camera director is never touched)', () => {
    const { scene } = rig(); const f = fakeCtx(scene); const fx = mountCarnivalFx(f.ctx);
    expect(fx.stepIntro(sub, obj, true)).toBe(false);
    expect(f.counts()).toEqual({ ended: 0, updated: 0 });
    fx.dispose();
  });
});
