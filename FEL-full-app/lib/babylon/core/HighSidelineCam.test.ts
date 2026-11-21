// lane/hoops-cam (owner 2026-11-21: "When it follows it's hard to play. When it's stationary like 2k high camera angle it's easier"):
// the 1v1 HIGH SIDELINE view. What it promises: it never turns (so a stick direction always means the same court direction, and up is
// toward the rim); it trucks after the play slowly and critically damped (no overshoot, no snap); both players and the rim stay in
// frame on a wide screen and on a phone held upright; `hoops.oneVOneCam` 0 is the follow camera exactly as it shipped; SELECT / C
// switches between them with a cut.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArcRotateCamera, MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';

const knobs = new Map<string, number>();
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => (knobs.has(id) ? knobs.get(id)! : def) }));
import {
  ONEVONE_CAM, HIGH_CAM_HEIGHT_M, HIGH_CAM_DIST_M, HIGH_CAM_SIDE_DEG, HIGH_CAM_FOCUS_M, HIGH_CAM_PAN_SHARE, HIGH_CAM_PAN_SEC,
  HIGH_CAM_MARGIN, HIGH_CAM_PULL_MAX, HIGH_CAM_PUNCH, HIGH_CAM_PORTRAIT_LIFT, bottomBand, highBasis, highCamParams, highPose, highStep, highWant, project,
  type CourtFrame, type HighState, type P3,
} from './HighSidelineCam';
import { CameraDirector } from './CameraDirector';
import { INTRO } from '../scene/broadcastShots';

const COURT: CourtFrame = { rimX: 0, rimZ: -0.6, axisX: 0, axisZ: 1, side: 1 };   // OneVOneMode's ONEVONE_CAM_COURT
const RIM: P3 = { x: 0, y: 3.05, z: -0.6 };
const FOV = 0.9;   // the 1v1 lens (CameraFraming's onevone row)
const deg = (r: number) => (r * 180) / Math.PI;

afterEach(() => knobs.clear());

describe('high sideline: the shipped numbers (lane/hoops-cam, new, flagged)', () => {
  it('ships ON in 1v1, and every number is the one the lane measured', () => {
    expect(ONEVONE_CAM).toBe(1);
    expect([HIGH_CAM_HEIGHT_M, HIGH_CAM_DIST_M, HIGH_CAM_SIDE_DEG, HIGH_CAM_FOCUS_M]).toEqual([6.8, 11.2, 32, 3.8]);
    expect(HIGH_CAM_PORTRAIT_LIFT).toBe(0.34);
    expect([HIGH_CAM_PAN_SHARE, HIGH_CAM_PAN_SEC, HIGH_CAM_MARGIN, HIGH_CAM_PULL_MAX, HIGH_CAM_PUNCH]).toEqual([0.3, 0.55, 0.14, 1.6, 0.25]);
  });
  it('reads every number through its feel knob', () => {
    knobs.set('hoops.highCamHeightM', 9); knobs.set('hoops.highCamSideDeg', 60); knobs.set('hoops.highCamPullMax', 1);
    const p = highCamParams();
    expect([p.height, p.sideDeg, p.pullMax, p.dist]).toEqual([9, 60, 1, HIGH_CAM_DIST_M]);
  });
});

describe('high sideline: the view never turns, and up is toward the rim', () => {
  const p = highCamParams();
  it('the look direction is the same wherever the play is (a truck and a back-away, never a turn)', () => {
    const dir = (o: { x: number; z: number; pull: number }) => { const q = highPose(COURT, p, o); const v = new Vector3(q.target.x - q.eye.x, q.target.y - q.eye.y, q.target.z - q.eye.z); return v.normalize(); };
    const d0 = dir({ x: 0, z: 0, pull: 1 });
    for (const o of [{ x: 3, z: 1, pull: 1 }, { x: -4, z: -2, pull: 1.4 }, { x: 0.5, z: 1.5, pull: 1.6 }]) expect(Vector3.Dot(d0, dir(o))).toBeCloseTo(1, 9);
  });
  it('screen-up (the stick pushed up) points within 45° of the rim along the court, and the rim sits above the top of the key on screen', () => {
    const b = highBasis(COURT, p.sideDeg);
    const toRim = { x: -COURT.axisX, z: -COURT.axisZ };
    expect(deg(Math.acos(b.fwd.x * toRim.x + b.fwd.z * toRim.z))).toBeCloseTo(HIGH_CAM_SIDE_DEG, 6);
    expect(HIGH_CAM_SIDE_DEG).toBeLessThan(45);
    const pose = highPose(COURT, p, { x: 0, z: 0, pull: 1 });
    expect(project(pose, FOV, 16 / 9, RIM).y).toBeGreaterThan(project(pose, FOV, 16 / 9, { x: 0, y: 1, z: 6.6 }).y);
  });
  it('the eye stands high and outside the court, off the +x sideline and behind the play', () => {
    const e = highPose(COURT, p, { x: 0, z: 0, pull: 1 }).eye;
    expect(e.y).toBe(HIGH_CAM_HEIGHT_M);
    expect(e.x).toBeGreaterThan(5);
    expect(e.z).toBeGreaterThan(12);
  });
});

/** What OneVOneMode hands the view: the hero's feet and head, the rival's feet and head, the rim (the last is let go first). */
const mustOf = (me: P3, foe: P3): P3[] => [{ ...me, y: 0 }, { ...me, y: 1.9 }, { ...foe, y: 0 }, { ...foe, y: 1.9 }, RIM];
/** Every hero spot on a 0.5 m grid of the half court (inside the arc and well past it), with the rival in four guarding spots. */
function sweep(aspect: number): { bodies: number; withRim: number; n: number } {
  const p = highCamParams();
  let n = 0, bodies = 0, withRim = 0;
  // on screen by 3 %, and the feet above the bottom band (the touch deck on a phone held upright), by 2 % of slack
  const band = -1 + 2 * bottomBand(aspect, p) - 0.04;
  const inFrame = (pose: ReturnType<typeof highPose>, q: P3) => { const s = project(pose, FOV, aspect, q); return s.ahead && Math.abs(s.x) <= 0.97 && s.y <= 0.97 && s.y >= (q.y < 0.5 ? band : -0.97); };
  for (let x = -6.5; x <= 6.5; x += 0.5) for (let z = 0.5; z <= 9.5; z += 0.5) for (const [ox, oz] of [[0.9, -1.2], [-0.9, -1.2], [1.2, 0.6], [0, -2]]) {
    const me = { x, y: 1, z }, foe = { x: Math.max(-7.2, Math.min(7.2, x + ox)), y: 1, z: Math.max(0.5, z + oz) };
    const pose = highPose(COURT, p, highWant(COURT, p, { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, mustOf(me, foe), FOV, aspect));
    const body = (q: P3) => inFrame(pose, { ...q, y: 0 }) && inFrame(pose, { ...q, y: 1.9 });
    n++;
    if (body(me) && body(foe)) { bodies++; if (inFrame(pose, RIM)) withRim++; }
  }
  return { bodies: bodies / n, withRim: withRim / n, n };
}

describe('high sideline: both players and the rim stay in frame (pure sweep of the half court)', () => {
  it('desktop 16:9 and a phone on its side: both bodies, head to feet, and the rim, everywhere on the grid', () => {
    for (const a of [16 / 9, 844 / 390]) { const r = sweep(a); expect(r.bodies, `aspect ${a}`).toBe(1); expect(r.withRim, `aspect ${a}`).toBe(1); }
  });
  it('a phone held upright, feet above the touch buttons: both bodies in 97.5% of spots (the misses are past the arc on a wing), the rim too in 93% (it backs away to fit, up to 1.6×); with the browser bar (390 × 663) 99.5%', () => {
    const r = sweep(390 / 844);
    expect(r.bodies).toBeGreaterThanOrEqual(0.975);
    expect(r.withRim).toBeGreaterThanOrEqual(0.93);
    const r2 = sweep(390 / 663);
    expect(r2.withRim).toBeGreaterThanOrEqual(0.995);
  });
  it('the margin is kept: the fitted truck holds the hero inside 1 − margin of the half frame', () => {
    const p = highCamParams(), a = 390 / 844;
    const me = { x: -6, y: 1, z: 3 }, foe = { x: -5.1, y: 1, z: 1.8 };
    const pose = highPose(COURT, p, highWant(COURT, p, { x: -5.55, z: 2.4 }, mustOf(me, foe), FOV, a));
    expect(Math.abs(project(pose, FOV, a, me).x)).toBeLessThanOrEqual(1 - HIGH_CAM_MARGIN + 1e-6);
  });
});

describe('high sideline: the truck is critically damped', () => {
  const run = (want: { x: number; z: number; pull: number }, dt: number, sec: number) => {
    let s: HighState = { x: 0, z: 0, pull: 1, vx: 0, vz: 0, vp: 0 }; const xs: number[] = [];
    for (let i = 0, n = Math.round(sec / dt); i < n; i++) { s = highStep(s, want, dt, HIGH_CAM_PAN_SEC); xs.push(s.x); }
    return xs;
  };
  it('a step in the play never overshoots, moves every frame toward it, and settles', () => {
    const xs = run({ x: 3, z: 0, pull: 1 }, 1 / 60, 4);
    for (let i = 1; i < xs.length; i++) { expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] - 1e-12); expect(xs[i]).toBeLessThanOrEqual(3 + 1e-9); }
    expect(xs[xs.length - 1]).toBeGreaterThan(2.97);
  });
  it('slow and soft: a 3 m step moves under 3 cm in the first frame and peaks under 2.5 m/s', () => {
    const xs = run({ x: 3, z: 0, pull: 1 }, 1 / 60, 3);
    expect(xs[0]).toBeLessThan(0.03);
    let peak = 0; for (let i = 1; i < xs.length; i++) peak = Math.max(peak, (xs[i] - xs[i - 1]) * 60);
    expect(peak).toBeLessThan(2.5);
  });
  it('frame-rate independent: a 30 fps phone lands where a 60 fps desktop does', () => {
    const a = run({ x: 2, z: -1, pull: 1.3 }, 1 / 60, 1), b = run({ x: 2, z: -1, pull: 1.3 }, 1 / 30, 1);
    expect(b[b.length - 1]).toBeCloseTo(a[a.length - 1], 6);
  });
});

// ── the director: the knob, the switch, and the follow untouched at 0 ──
function rig(w = 1280, h = 720) {
  const engine = new NullEngine({ renderWidth: w, renderHeight: h, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });
  const scene = new Scene(engine);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const cam = new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene); cam.fov = FOV;
  const dir = new CameraDirector(scene, cam, 'hoops');
  dir.leadEase = false; dir.leadEaseHoopsKnob = true;   // as ModeHarness sets 1v1
  return { engine, scene, cam, dir };
}
const RIM_V = new Vector3(0, 3.05, -0.6);
/** A drive, a crossover and a cut back, with the rival shading: the hero's path and velocity per frame. */
function path(): Array<{ me: Vector3; foe: Vector3; vel: Vector3 }> {
  const out: Array<{ me: Vector3; foe: Vector3; vel: Vector3 }> = []; const me = new Vector3(0, 0, 6);
  for (let i = 0; i < 180; i++) {
    const vel = i < 60 ? new Vector3(4, 0, -2) : i < 90 ? new Vector3(-5, 0, -1) : i < 120 ? new Vector3(0, 0, 3) : new Vector3(3, 0, -4);
    me.addInPlace(vel.scale(1 / 60));
    out.push({ me: me.clone(), foe: me.add(new Vector3(0.6, 0, -1.1)), vel });
  }
  return out;
}
function drive(armed: boolean, toggleAt = -1) {
  const { engine, scene, cam, dir } = rig();
  let foe = new Vector3(0.9, 0, 2), meNow = new Vector3(0, 0, 5);
  if (armed) dir.setHighView({ court: COURT, on: () => (knobs.get('hoops.oneVOneCam') ?? ONEVONE_CAM) >= 0.5, frame: () => ({ play: { x: (meNow.x + foe.x) / 2, z: (meNow.z + foe.z) / 2 }, must: mustOf({ x: meNow.x, y: 1, z: meNow.z }, { x: foe.x, y: 1, z: foe.z }) }) });
  dir.snapTo(meNow, RIM_V);
  const poses: Array<{ pos: Vector3; fwd: Vector3 }> = [];
  path().forEach((f, i) => {
    meNow = f.me; foe = f.foe;
    if (i === toggleAt) dir.toggle();
    dir.update(f.me, f.vel, RIM_V);
    poses.push({ pos: cam.position.clone(), fwd: cam.getTarget().subtract(cam.position).normalize() });
  });
  scene.dispose(); engine.dispose();
  return poses;
}

describe('high sideline in the director (CameraDirector.setHighView)', () => {
  it('hoops.oneVOneCam 0: the follow camera exactly as it shipped (every frame equal to a director the view was never armed on)', () => {
    knobs.set('hoops.oneVOneCam', 0);
    const off = drive(true), none = drive(false);
    expect(off.length).toBe(none.length);
    off.forEach((f, i) => { expect(f.pos.x).toBeCloseTo(none[i].pos.x, 9); expect(f.pos.y).toBeCloseTo(none[i].pos.y, 9); expect(f.pos.z).toBeCloseTo(none[i].pos.z, 9); expect(Vector3.Dot(f.fwd, none[i].fwd)).toBeCloseTo(1, 9); });
  });
  it('1 (the default): the look never turns through a drive, a crossover and a cut, where the follow turns tens of degrees', () => {
    const hi = drive(true), fol = drive(false);
    const turn = (ps: typeof hi) => Math.max(...ps.map((p) => deg(Math.acos(Math.min(1, Vector3.Dot(p.fwd, ps[0].fwd))))));
    expect(turn(hi)).toBeLessThan(0.01);
    expect(turn(fol)).toBeGreaterThan(10);
    // and it moves far less: the eye's path length over the same 3 s
    const len = (ps: typeof hi) => ps.slice(1).reduce((s, p, i) => s + Vector3.Distance(p.pos, ps[i].pos), 0);
    expect(len(hi)).toBeLessThan(len(fol) * 0.5);
  });
  it('SELECT / C switches to the follow and back for the run, each a cut (no chase across the court)', () => {
    const ps = drive(true, 60);
    const jump = Vector3.Distance(ps[60].pos, ps[59].pos);
    expect(jump).toBeGreaterThan(3);   // a cut, not a lerp
    const fol = drive(false);
    expect(Vector3.Distance(ps[61].pos, fol[61].pos)).toBeLessThan(4);   // on the follow's own framing straight away
  });
  it('the toggle is the old follow/fixed debug switch everywhere the view is not armed (and with the knob at 0)', () => {
    const { scene, engine, cam, dir } = rig();
    expect(dir.mode).toBe('follow'); dir.toggle(); expect(dir.mode).toBe('fixed'); dir.toggle(); expect(dir.mode).toBe('follow');
    knobs.set('hoops.oneVOneCam', 0);
    dir.setHighView({ court: COURT, on: () => (knobs.get('hoops.oneVOneCam') ?? 1) >= 0.5, frame: () => ({ play: { x: 0, z: 5 }, must: [RIM] }) });
    dir.toggle(); expect(dir.mode).toBe('fixed'); dir.toggle();
    knobs.delete('hoops.oneVOneCam');
    expect(dir.highActive).toBe(true); dir.toggle(); expect(dir.highActive).toBe(false); expect(dir.mode).toBe('follow');
    void cam; scene.dispose(); engine.dispose();
  });
  it('never sits inside or behind scenery: a palm crown on its line of sight pulls the eye in along its look (no turn)', () => {
    const { scene, engine, cam, dir } = rig();
    const frame = () => ({ play: { x: 0.5, z: 4 }, must: mustOf({ x: 0, y: 1, z: 5 }, { x: 0.9, y: 1, z: 3 }) });
    dir.setHighView({ court: COURT, on: () => true, frame });
    dir.snapTo(new Vector3(0, 0, 5), RIM_V);
    const open = cam.position.clone(), look = cam.getTarget().subtract(cam.position).normalize();
    // a 3 m crown two thirds of the way out to the eye
    const crown = MeshBuilder.CreateBox('palm_crown', { size: 3 }, scene);
    crown.position = Vector3.Lerp(cam.getTarget(), open, 0.66); crown.computeWorldMatrix(true);
    for (let i = 0; i < 240; i++) dir.update(new Vector3(0, 0, 5), Vector3.Zero(), RIM_V);
    const t = cam.getTarget(), d = Vector3.Distance(cam.position, t);
    expect(d).toBeLessThan(Vector3.Distance(open, t) * 0.66 - 1);   // in front of the crown
    expect(Vector3.Dot(cam.getTarget().subtract(cam.position).normalize(), look)).toBeCloseTo(1, 6);   // the same look
    scene.dispose(); engine.dispose();
  });
  it('a possession reset glides when the new spots are on screen, and cuts when they are not (the check-up, deep past the arc)', () => {
    const { scene, engine, cam, dir } = rig();
    let me = { x: 0, z: 5 }, foe = { x: 0.9, z: 2 };
    dir.setHighView({ court: COURT, on: () => true, frame: () => ({ play: { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, must: mustOf({ ...me, y: 1 }, { ...foe, y: 1 }) }) });
    const at = (m: { x: number; z: number }) => new Vector3(m.x, 0, m.z);
    dir.snapTo(at(me), RIM_V);
    for (let i = 0; i < 120; i++) dir.update(at(me), Vector3.Zero(), RIM_V);
    // a small reset: the bodies a metre over — glides (the eye moves a few centimetres this frame)
    let before = cam.position.clone(); me = { x: 1, z: 5 }; foe = { x: 1.9, z: 2 };
    dir.snapTo(at(me), RIM_V);
    expect(Vector3.Distance(before, cam.position)).toBeLessThan(0.1);
    for (let i = 0; i < 120; i++) dir.update(at(me), Vector3.Zero(), RIM_V);
    // the check-up: the rival 10.5 m out, the hero at 8.5 — off the bottom from here, so a cut
    before = cam.position.clone(); me = { x: 0, z: 8.5 }; foe = { x: 0, z: 10.5 };
    dir.snapTo(at(me), RIM_V);
    expect(Vector3.Distance(before, cam.position)).toBeGreaterThan(0.5);
    scene.dispose(); engine.dispose();
  });
  it('a phone held upright: a hero sprinting across the court at 7 m/s never leaves the frame (the edge push slides the truck with him)', () => {
    const { scene, engine, cam, dir } = rig(390, 844);
    expect(engine.getRenderWidth() / engine.getRenderHeight()).toBeLessThan(0.5);
    const me = new Vector3(4, 0, 5); const foe = { x: 4.8, z: 3.8 };
    dir.setHighView({ court: COURT, on: () => true, frame: () => ({ play: { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, must: mustOf({ x: me.x, y: 1, z: me.z }, { x: foe.x, y: 1, z: foe.z }) }) });
    dir.snapTo(me, RIM_V);
    let worst = 0;
    for (let i = 0; i < 70; i++) {
      me.x -= 7 / 60; foe.x = me.x + 0.6;
      dir.update(me, new Vector3(-7, 0, 0), RIM_V);
      const pose = { eye: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, target: { x: cam.getTarget().x, y: cam.getTarget().y, z: cam.getTarget().z } };
      for (const y of [0, 1.9]) worst = Math.max(worst, Math.abs(project(pose, FOV, 390 / 844, { x: me.x, y, z: me.z }).x));
    }
    expect(worst).toBeLessThan(0.95);
    scene.dispose(); engine.dispose();
  });
  it('after the broadcast intro is skipped by a press that moves the player at once (hoops-play `hoops.introPressPlaysOn` 1): the hand-over lands on the high view and settles there', () => {
    // With the knob on, the press that skips the intro also starts play: the mode's own update steps the director through the hand-over
    // (INTRO.skipSec) with the player already running. The director is called the same way either way; this is that call sequence.
    const { scene, engine, cam, dir } = rig();
    const me = new Vector3(0, 0, 5); let foe = { x: 0.9, z: 2 };
    dir.setHighView({ court: COURT, on: () => true, frame: () => ({ play: { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, must: mustOf({ x: me.x, y: 1, z: me.z }, { x: foe.x, y: 1, z: foe.z }) }) });
    dir.snapTo(me, RIM_V);
    expect(dir.establish('walkIn')).toBe(true);
    for (let i = 0; i < 60; i++) dir.update(me, Vector3.Zero(), RIM_V);   // a second of the crane
    expect(dir.inIntro).toBe(true);
    dir.skipIntro();   // the press
    const vel = new Vector3(3, 0, -4); let prev = cam.position.clone(), worstStep = 0, frames = 0;
    while (dir.inIntro && frames < 120) {   // the player drives during the hand-over
      me.addInPlace(vel.scale(1 / 60)); foe = { x: me.x + 0.6, z: me.z - 1.1 };
      dir.update(me, vel, RIM_V); frames++;
      worstStep = Math.max(worstStep, Vector3.Distance(prev, cam.position)); prev = cam.position.clone();
    }
    expect(dir.inIntro).toBe(false);
    expect(frames).toBeLessThanOrEqual(Math.ceil(INTRO.skipSec * 60) + 2);   // the hand-over takes its own time, no longer
    // …and from the first frame after it the camera IS the high view: its look never turns again while the play goes on
    const look0 = cam.getTarget().subtract(cam.position).normalize();
    for (let i = 0; i < 90; i++) {
      me.addInPlace(vel.scale(1 / 60)); foe = { x: me.x + 0.6, z: me.z - 1.1 };
      dir.update(me, vel, RIM_V);
      worstStep = Math.max(worstStep, Vector3.Distance(prev, cam.position)); prev = cam.position.clone();
      expect(Vector3.Dot(cam.getTarget().subtract(cam.position).normalize(), look0)).toBeCloseTo(1, 6);
    }
    // the high view's own look (screen-up toward the rim): the court's fixed direction, whatever the intro left behind
    const want = highPose(COURT, highCamParams(), { x: 0, z: 0, pull: 1 });
    const wl = new Vector3(want.target.x - want.eye.x, want.target.y - want.eye.y, want.target.z - want.eye.z).normalize();
    expect(Vector3.Dot(look0, wl)).toBeCloseTo(1, 6);
    expect(worstStep).toBeLessThan(2.5);   // an eased hand-over (an orbit, not a cut across the court)
    scene.dispose(); engine.dispose();
  });
  it('a phone held upright, a row of tall posts off the sideline, the check-up reset: one cut, then no jump (the scenery cap no longer feeds back into the fit)', () => {
    // A GUARD, not a reproduction: the rig (hoops-cam, after the #678 merge) measured the truck jumping ~3 m and back over three frames at
    // the check-up — the cap was read at the wanted spot, the refit moved that spot, and a hard step moved the view. This synthetic row
    // of posts passes on the old director too (checked); the rig re-run is the measurement. It holds the shape: one cut, then no jump.
    const { scene, engine, cam, dir } = rig(390, 844);
    for (let z = -10; z <= 28; z += 3.5) { const p = MeshBuilder.CreateBox('post', { width: 0.2, height: 7, depth: 0.2 }, scene); p.position.set(7.5, 3.5, z); p.computeWorldMatrix(true); }
    let me = { x: 2.3, z: 0.2 }, foe = { x: 1.2, z: 0.4 };
    dir.setHighView({ court: COURT, on: () => true, frame: () => ({ play: { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, must: mustOf({ ...me, y: 1 }, { ...foe, y: 1 }) }) });
    const at = (m: { x: number; z: number }) => new Vector3(m.x, 0, m.z);
    dir.snapTo(at(me), RIM_V);
    for (let i = 0; i < 90; i++) dir.update(at(me), Vector3.Zero(), RIM_V);
    me = { x: 0, z: 7.2 }; foe = { x: 0, z: 9.2 };
    dir.snapTo(at(me), RIM_V);   // the reset: a cut is allowed here
    let prev = cam.position.clone(), worst = 0;
    for (let i = 0; i < 120; i++) { dir.update(at(me), Vector3.Zero(), RIM_V); worst = Math.max(worst, Vector3.Distance(prev, cam.position)); prev = cam.position.clone(); }
    expect(worst).toBeLessThan(0.5);
    scene.dispose(); engine.dispose();
  });
  it('a reset the mode makes without a snapTo (the bodies put 7 m away in one frame) is cut to when the new spots are off screen', () => {
    const { scene, engine, cam, dir } = rig(390, 844);
    let me = { x: 6, z: 0.4 }, foe = { x: 5.2, z: 0.6 };
    dir.setHighView({ court: COURT, on: () => true, frame: () => ({ play: { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, must: mustOf({ ...me, y: 1 }, { ...foe, y: 1 }) }) });
    const at = (m: { x: number; z: number }) => new Vector3(m.x, 0, m.z);
    dir.snapTo(at(me), RIM_V);
    for (let i = 0; i < 90; i++) dir.update(at(me), Vector3.Zero(), RIM_V);
    me = { x: 0, z: 7.2 }; foe = { x: 0, z: 9.2 };   // the check-up, no snapTo
    dir.update(at(me), Vector3.Zero(), RIM_V);
    const pose = { eye: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, target: { x: cam.getTarget().x, y: cam.getTarget().y, z: cam.getTarget().z } };
    for (const y of [0, 1.9]) expect(Math.abs(project(pose, FOV, 390 / 844, { x: me.x, y, z: me.z }).x)).toBeLessThan(0.95);   // on screen on the very next frame
    scene.dispose(); engine.dispose();
  });
});
