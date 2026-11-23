// lane/hoops-cam (owner 2026-11-21: "When it follows it's hard to play. When it's stationary like 2k high camera angle it's easier"):
// the 1v1 HIGH SIDELINE view. What it promises: it never turns (so a stick direction always means the same court direction, and up is
// toward the rim); it trucks after the play slowly and critically damped (no overshoot, no snap); both players and the rim stay in
// frame on a wide screen and on a phone held upright; `hoops.oneVOneCam` 0 is the follow camera exactly as it shipped; SELECT / C
// switches between them with a cut.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArcRotateCamera, Mesh, MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';

const knobs = new Map<string, number>();
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => (knobs.has(id) ? knobs.get(id)! : def) }));
import {
  ONEVONE_CAM, HIGH_CAM_HEIGHT_M, HIGH_CAM_DIST_M, HIGH_CAM_SIDE_DEG, HIGH_CAM_FOCUS_M, HIGH_CAM_PAN_SHARE, HIGH_CAM_PAN_SEC,
  HIGH_CAM_MARGIN, HIGH_CAM_PULL_MAX, HIGH_CAM_PUNCH, HIGH_CAM_PORTRAIT_LIFT, HIGH_CAM_ZOOM_MAX, HIGH_CAM_ROOM_ON, HIGH_CAM_LEAD_SEC, leadPoints, THREEVTHREE_CAM, bottomBand, highEyeBox, highRoom, highBasis, highCamParams, highFits, highPose, highStep, highWant, project,
  teamCourt, teamFrame, type CourtFrame, type HighState, type P3,
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
  // the lens as the fit set it (phase 8: it may widen on an upright phone; 1 elsewhere)
  let lens = FOV;
  const inFrame = (pose: ReturnType<typeof highPose>, q: P3) => { const s = project(pose, lens, aspect, q); return s.ahead && Math.abs(s.x) <= 0.97 && s.y <= 0.97 && s.y >= (q.y < 0.5 ? band : -0.97); };
  for (let x = -6.5; x <= 6.5; x += 0.5) for (let z = 0.5; z <= 9.5; z += 0.5) for (const [ox, oz] of [[0.9, -1.2], [-0.9, -1.2], [1.2, 0.6], [0, -2]]) {
    const me = { x, y: 1, z }, foe = { x: Math.max(-7.2, Math.min(7.2, x + ox)), y: 1, z: Math.max(0.5, z + oz) };
    const w = highWant(COURT, p, { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, mustOf(me, foe), FOV, aspect);
    const pose = highPose(COURT, p, w); lens = FOV * (w.zoom ?? 1);
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
  it('online 1v1 (lane/online-play #680): on the page that DRAWS the shared game, and through the possession swap both ways, the view stays on screen, never turns and settles', () => {
    // The call pattern of lib/net/play.ts: the running page's mode calls update(me, vel, rim) and, on its own reset, snapTo; a drawing
    // page's mode returns early and net.play.frame() calls update(hero, camVel, objective) with the bodies written from the shared
    // world — 30 Hz snapshots interpolated on the local clock, and a NEW AUTHOR (the swap) empties the buffer, so the bodies land on
    // the new spots in one frame and no snapTo runs. One director per page; the high view is armed on both (OneVOneMode.load).
    for (const [w, h] of [[1280, 720], [390, 844]] as const) {
      const { scene, engine, cam, dir } = rig(w, h);
      const me = new Vector3(0, 0, 5), foe = new Vector3(0.9, 0, 2);
      dir.setHighView({ court: COURT, on: () => true, frame: () => ({ play: { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, must: mustOf({ x: me.x, y: 1, z: me.z }, { x: foe.x, y: 1, z: foe.z }) }) });
      dir.snapTo(me, RIM_V);
      const look0 = cam.getTarget().subtract(cam.position).normalize();
      const onScreen = () => { const pose = { eye: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, target: { x: cam.getTarget().x, y: cam.getTarget().y, z: cam.getTarget().z } };
        return [0, 1.9].every((y) => Math.abs(project(pose, FOV, w / h, { x: me.x, y, z: me.z }).x) < 0.95); };
      let prev = cam.position.clone(), jumps = 0, offAfterSwap = 0;
      const step = () => { const d = Vector3.Distance(prev, cam.position); if (d > 0.5) jumps++; prev = cam.position.clone();
        expect(Vector3.Dot(cam.getTarget().subtract(cam.position).normalize(), look0)).toBeCloseTo(1, 6); };
      // 1. my ball, this page runs it: a drive to the right wing
      for (let i = 0; i < 60; i++) { me.x += 4 / 60; me.z -= 1 / 60; foe.set(me.x - 0.5, 0, me.z - 1.1); dir.update(me, new Vector3(4, 0, -1), RIM_V); step(); }
      // 2. a turnover: handOff — no snapTo here; the new author's first world puts me at the check-up (CHECK_ME) and him out top
      me.set(0, 0, 7.2); foe.set(0, 0, 9.2);
      for (let i = 0; i < 150; i++) {
        // his drive, as 30 Hz snapshots interpolated on this page's 60 Hz clock (net.play.frame: camVel from the hero's moves)
        if (i > 20) { const k = Math.floor((i - 20) / 2) * 2 / 60; foe.set(-1.5 * Math.min(1, k), 0, 9.2 - 7 * Math.min(1, k)); me.set(foe.x + 0.4, 0, foe.z - 1.0); }
        dir.update(me, Vector3.Zero(), RIM_V); step();
        if (i >= 1 && !onScreen()) offAfterSwap++;
      }
      // 3. the ball back: takeOver on this page — resetPositions (my check, top of the key) and the mode's snapTo, then its own updates
      me.set(0, 0, 5); foe.set(0.9, 0, 2);
      dir.snapTo(me, RIM_V); step();
      for (let i = 0; i < 120; i++) { dir.update(me, Vector3.Zero(), RIM_V); step(); if (!onScreen()) offAfterSwap++; }
      // settled: still bodies, a still camera
      const before = cam.position.clone(); dir.update(me, Vector3.Zero(), RIM_V);
      expect(Vector3.Distance(before, cam.position)).toBeLessThan(0.002);
      expect(offAfterSwap).toBe(0);
      expect(jumps).toBeLessThanOrEqual(2);   // at most a cut at each swap (when the new spots are off screen), never a back-and-forth
      scene.dispose(); engine.dispose();
    }
  });
  it('the eye is never inside a prop, even a sparse one its line of sight passes through untouched (a palm crown of fronds)', () => {
    const { scene, engine, cam, dir } = rig();
    const me = new Vector3(0, 0, 5);
    dir.setHighView({ court: COURT, on: () => true, frame: () => ({ play: { x: 0.5, z: 4 }, must: mustOf({ x: 0, y: 1, z: 5 }, { x: 0.9, y: 1, z: 3 }) }) });
    dir.snapTo(me, RIM_V);
    const open = cam.position.clone();
    // two fronds at opposite corners of a 4 m crown centred on the eye: the crown's box holds the eye, the ray to it touches neither
    const f1 = MeshBuilder.CreateBox('palm_frond_a', { size: 0.6 }, scene); f1.position = open.add(new Vector3(1.7, 1.7, 1.7));
    const f2 = MeshBuilder.CreateBox('palm_frond_b', { size: 0.6 }, scene); f2.position = open.add(new Vector3(-1.7, -1.7, -1.7));
    const crown = Mesh.MergeMeshes([f1, f2], true)!; crown.name = 'palm_crown'; crown.computeWorldMatrix(true); crown.refreshBoundingInfo();
    const look = cam.getTarget().subtract(cam.position).normalize();
    for (let i = 0; i < 240; i++) dir.update(me, Vector3.Zero(), RIM_V);
    const bb = crown.getBoundingInfo().boundingBox, e = cam.position;
    const inBox = e.x > bb.minimumWorld.x && e.x < bb.maximumWorld.x && e.y > bb.minimumWorld.y && e.y < bb.maximumWorld.y && e.z > bb.minimumWorld.z && e.z < bb.maximumWorld.z;
    expect(inBox).toBe(false);
    expect(Vector3.Dot(cam.getTarget().subtract(cam.position).normalize(), look)).toBeCloseTo(1, 6);   // in along its look, never turned
    scene.dispose(); engine.dispose();
  });
  it('a tight venue box (Canopy Court on an upright phone): the eye comes in along its look to stay inside, and the hero stays on screen', () => {
    // Rig (2026-11-21): the box clamp trucked the whole view sideways at its edge and the hero went off the right of the screen.
    // phase 8: this is the venue's box itself, so the court's room is off here (`hoops.highCamRoomOn` 0, the view as hoops-cam shipped it);
    // the room's own test is below
    knobs.set('hoops.highCamRoomOn', 0);
    const { scene, engine, cam, dir } = rig(390, 844);
    dir.setBounds({ minX: -9, maxX: 8, minZ: -6, maxZ: 17.1, minY: 0 });
    const me = new Vector3(0, 0, 6), foe = new Vector3(0.6, 0, 4.8);
    dir.setHighView({ court: COURT, on: () => true, frame: () => ({ play: { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, must: mustOf({ x: me.x, y: 1, z: me.z }, { x: foe.x, y: 1, z: foe.z }) }) });
    dir.snapTo(me, RIM_V);
    const look = cam.getTarget().subtract(cam.position).normalize();
    let off = 0;
    for (let i = 0; i < 240; i++) {
      if (i < 120) { me.x -= 3 / 60; me.z += 2 / 60; } foe.set(me.x + 0.6, 0, me.z - 1.2);   // out to the far wing, deep
      dir.update(me, Vector3.Zero(), RIM_V);
      const pose = { eye: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, target: { x: cam.getTarget().x, y: cam.getTarget().y, z: cam.getTarget().z } };
      if (![0, 1.9].every((y) => Math.abs(project(pose, cam.fov, 390 / 844, { x: me.x, y, z: me.z }).x) < 0.97)) off++;   // the lens as set (phase 8: it may widen)
      expect(cam.position.x).toBeLessThanOrEqual(8 - 1.2 + 1e-6); expect(cam.position.z).toBeLessThanOrEqual(17.1 - 1.2 + 1e-6);
      expect(Vector3.Dot(cam.getTarget().subtract(cam.position).normalize(), look)).toBeCloseTo(1, 6);
    }
    expect(off).toBe(0);
    scene.dispose(); engine.dispose();
  });
});

// ── lane/improve-camera, phase 8 (2026-11-22): the lens may widen to fit; the same view offered to 3v3 behind its own knob ──
/** Canopy Court's eye box (CameraDirector: the venue shell's box, less BOUNDS_MARGIN; the rig's eye never passed z 15.9 there). */
const CANOPY_BOX = { minX: -7.8, maxX: 6.8, minZ: -4.8, maxZ: 15.9 };
/** Defending deep past the arc (the rig's Canopy run, upright phone): the rival with the ball out round the check (1v1's CHECK_FOE is
 *  z 9.2), me between him and the rim, beaten to either side, or caught level with him on the far wing. */
function deepDefence(): Array<{ me: P3; foe: P3 }> {
  const out: Array<{ me: P3; foe: P3 }> = [];
  for (let fx = -1.5; fx <= 1.5; fx += 0.5) for (let fz = 7.5; fz <= 9.5; fz += 0.5) for (const [ox, oz] of [[0, -1.2], [0, -2], [0.5, -2.5], [-2.5, -1.5], [2.5, -1.5], [-2.5, 0]]) {
    out.push({ foe: { x: fx, y: 1, z: fz }, me: { x: Math.max(-7.2, Math.min(7.2, fx + ox)), y: 1, z: fz + oz } });
  }
  return out;
}
const UPRIGHT = 390 / 844, LENS = 0.8;   // the rig's lens on the phone tier

describe('phase 8: the lens widens to fit when the venue stops the eye backing away (Canopy Court, a phone held upright)', () => {
  it('the shipped number, and its knob reads through; 1 = the lens never widens', () => {
    expect(HIGH_CAM_ZOOM_MAX).toBe(1.6);
    expect(highCamParams().zoomMax).toBe(1.6);
    knobs.set('hoops.highCamZoomMax', 1);
    expect(highCamParams().zoomMax).toBe(1);
  });
  it('at 1, every want on the half-court grid keeps the authored lens (the view exactly as hoops-cam shipped it)', () => {
    knobs.set('hoops.highCamZoomMax', 1);
    const p = highCamParams();
    for (const a of [16 / 9, 844 / 390, UPRIGHT]) for (const { me, foe } of deepDefence()) {
      expect(highWant(COURT, p, { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, mustOf(me, foe), LENS, a, CANOPY_BOX).zoom).toBe(1);
    }
  });
  it('a wide screen and a phone on its side never widen it, at Canopy or anywhere on the grid', () => {
    const p = highCamParams();
    for (const a of [16 / 9, 844 / 390]) {
      for (const { me, foe } of deepDefence()) expect(highWant(COURT, p, { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, mustOf(me, foe), LENS, a, CANOPY_BOX).zoom).toBe(1);
      for (let x = -6.5; x <= 6.5; x += 1) for (let z = 0.5; z <= 9.5; z += 1) {
        const me = { x, y: 1, z }, foe = { x: x + 0.9, y: 1, z: Math.max(0.5, z - 1.2) };
        expect(highWant(COURT, p, { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, mustOf(me, foe), LENS, a).zoom).toBe(1);
      }
    }
  });
  it('defending deep past the arc at Canopy, upright: both bodies and the rim fit in 98% of spots (was 26%: the rim off the side), widened at most 1.6×, the look unchanged', () => {
    const fitAll = (zoomMax: number) => {
      knobs.set('hoops.highCamZoomMax', zoomMax);
      const p = highCamParams(); let ok = 0, n = 0, zmax = 1;
      for (const { me, foe } of deepDefence()) {
        const w = highWant(COURT, p, { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, mustOf(me, foe), LENS, UPRIGHT, CANOPY_BOX);
        n++; if (highFits(COURT, p, w, mustOf(me, foe), LENS, UPRIGHT)) ok++;
        zmax = Math.max(zmax, w.zoom ?? 1);
        const pose = highPose(COURT, p, w), f = { x: pose.target.x - pose.eye.x, y: pose.target.y - pose.eye.y, z: pose.target.z - pose.eye.z };
        const rest = highPose(COURT, p, { x: 0, z: 0, pull: 1 }), g = { x: rest.target.x - rest.eye.x, y: rest.target.y - rest.eye.y, z: rest.target.z - rest.eye.z };
        expect((f.x * g.x + f.y * g.y + f.z * g.z) / (Math.hypot(f.x, f.y, f.z) * Math.hypot(g.x, g.y, g.z))).toBeCloseTo(1, 9);   // never turned
        expect(pose.eye.z).toBeLessThanOrEqual(CANOPY_BOX.maxZ + 1e-6);
      }
      return { share: ok / n, zmax };
    };
    const before = fitAll(1), after = fitAll(HIGH_CAM_ZOOM_MAX);
    expect(before.share).toBeLessThan(0.3);
    expect(after.share).toBeGreaterThanOrEqual(0.98);   // the misses: caught level on the far wing, 4+ m past the arc
    expect(after.zmax).toBeLessThanOrEqual(HIGH_CAM_ZOOM_MAX + 1e-9);
  });
  it('the lens widens only as far as the fit needs: a play inside the arc keeps the authored lens on the same upright phone', () => {
    const p = highCamParams();
    const me = { x: 0, y: 1, z: 5 }, foe = { x: 0.9, y: 1, z: 2 };
    expect(highWant(COURT, p, { x: 0.45, z: 3.5 }, mustOf(me, foe), LENS, UPRIGHT, CANOPY_BOX).zoom).toBe(1);
  });
  it('the spring carries the lens: no step, and it settles on the want', () => {
    let s: HighState = { x: 0, z: 0, pull: 1, vx: 0, vz: 0, vp: 0 };
    const zs: number[] = [];
    for (let i = 0; i < 240; i++) { s = highStep(s, { x: 0, z: 0, pull: 1, zoom: 1.3 }, 1 / 60, HIGH_CAM_PAN_SEC); zs.push(s.zoom!); }
    expect(zs[0] - 1).toBeLessThan(0.01);
    for (let i = 1; i < zs.length; i++) expect(zs[i]).toBeGreaterThanOrEqual(zs[i - 1] - 1e-12);
    expect(zs[zs.length - 1]).toBeCloseTo(1.3, 2);
    expect(Math.max(...zs)).toBeLessThanOrEqual(1.3 + 1e-9);
  });
  it('in the director at Canopy, upright, held to the venue box: walking out to the check deep past the arc the lens widens, the look never turns, the rim stays on screen; back inside, the lens comes home', () => {
    const run = (zoomMax: number) => {
      knobs.set('hoops.highCamZoomMax', zoomMax); knobs.set('hoops.highCamRoomOn', 0);   // the lens alone (the room, below, is the first remedy)
      const { scene, engine, cam, dir } = rig(390, 844); cam.fov = LENS;
      dir.setBounds({ minX: -9, maxX: 8, minZ: -6, maxZ: 17.1, minY: 0 });
      const me = new Vector3(0, 0, 5), foe = new Vector3(0.9, 0, 2);
      dir.setHighView({ court: COURT, on: () => true, frame: () => ({ play: { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, must: mustOf({ x: me.x, y: 1, z: me.z }, { x: foe.x, y: 1, z: foe.z }) }) });
      dir.snapTo(me, RIM_V);
      const look = cam.getTarget().subtract(cam.position).normalize();
      let rimOff = 0, fovMax = cam.fov;
      for (let i = 0; i < 720; i++) {
        // out to the check (the rival 9.5 m out with the ball, me on the left wing, deep), hold, and back in
        const k = i < 120 ? i / 120 : i < 300 ? 1 : Math.max(0, 1 - (i - 300) / 120);
        foe.set(0.9 - 1.1 * k, 0, 2 + 7.5 * k); me.set(-2.6 * k, 0, 5 + 2.4 * k);
        dir.update(me, Vector3.Zero(), RIM_V);
        expect(Vector3.Dot(cam.getTarget().subtract(cam.position).normalize(), look)).toBeCloseTo(1, 6);
        const pose = { eye: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, target: { x: cam.getTarget().x, y: cam.getTarget().y, z: cam.getTarget().z } };
        const r = project(pose, cam.fov, 390 / 844, RIM);
        if (i >= 150 && i < 300 && !(Math.abs(r.x) < 0.97 && Math.abs(r.y) < 0.97)) rimOff++;
        fovMax = Math.max(fovMax, cam.fov);
      }
      const end = cam.fov;
      scene.dispose(); engine.dispose();
      return { rimOff, fovMax, end };
    };
    const off = run(1), on = run(HIGH_CAM_ZOOM_MAX);
    expect(off.fovMax).toBe(LENS);                       // 1: the lens never moves
    expect(off.rimOff).toBeGreaterThan(30);              // …and the rim is off the side at the check
    expect(on.rimOff).toBe(0);
    expect(on.fovMax).toBeGreaterThan(LENS * 1.05);
    expect(on.fovMax).toBeLessThanOrEqual(LENS * HIGH_CAM_ZOOM_MAX + 1e-6);
    expect(on.end).toBeCloseTo(LENS, 3);                 // back inside the arc: the authored lens (the spring settles in ~4 s)
  });
});

describe('phase 8: the court room (`hoops.highCamRoomOn` 1): a small venue box no longer holds the eye on the court', () => {
  it('the room is 3-Point\'s camera box at the same courts (x ±17, z −8..22), and only ever widens a venue box (none stays none)', () => {
    expect(HIGH_CAM_ROOM_ON).toBe(1);
    expect(highRoom(COURT)).toEqual({ minX: -17, maxX: 17, minZ: expect.closeTo(-8, 9), maxZ: expect.closeTo(22, 9) });
    expect(highEyeBox(null, COURT, true, 1.2)).toBeNull();
    expect(highEyeBox(CANOPY_BOX, COURT, false, 1.2)).toBe(CANOPY_BOX);
    const wide = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };
    expect(highEyeBox(wide, COURT, true, 1.2)).toEqual(wide);
    const b = highEyeBox(CANOPY_BOX, COURT, true, 1.2)!;
    expect([b.minX, b.maxX, b.minZ, b.maxZ].map((v) => Math.round(v * 10) / 10)).toEqual([-15.8, 15.8, -6.8, 20.8]);
  });
  it('defending deep past the arc at Canopy, upright, with the room: both bodies and the rim fit in every spot, 9 in 10 at the authored lens', () => {
    const p = highCamParams(), box = highEyeBox(CANOPY_BOX, COURT, true, 1.2);
    let ok = 0, n = 0, lens1 = 0;
    for (const { me, foe } of deepDefence()) {
      const w = highWant(COURT, p, { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, mustOf(me, foe), LENS, UPRIGHT, box);
      n++; if (highFits(COURT, p, w, mustOf(me, foe), LENS, UPRIGHT)) ok++;
      if (w.zoom === 1) lens1++;
    }
    expect(ok / n).toBe(1);
    expect(lens1 / n).toBeGreaterThanOrEqual(0.85);   // 188 of 210 (2026-11-22): the rest are past pullMax, caught level on the far wing
  });
  it('in the director at Canopy, upright: a drive into the +x corner keeps the hero on screen (the venue box held the eye on the court and lost him), and the eye stays in the room', () => {
    const run = (room: number) => {
      knobs.set('hoops.highCamRoomOn', room);
      const { scene, engine, cam, dir } = rig(390, 844); cam.fov = LENS;
      dir.setBounds({ minX: -8, maxX: 8, minZ: -1.9, maxZ: 17.1, minY: 0 });   // basketball_h2h's 16 × 19 venue_ground (Canopy, Blossom)
      const me = new Vector3(0, 0, 5), foe = new Vector3(0.9, 0, 2);
      dir.setHighView({ court: COURT, on: () => true, frame: () => ({ play: { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, must: mustOf({ x: me.x, y: 1, z: me.z }, { x: foe.x, y: 1, z: foe.z }) }) });
      dir.snapTo(me, RIM_V);
      const look = cam.getTarget().subtract(cam.position).normalize();
      let off = 0, maxX = -Infinity;
      for (let i = 0; i < 300; i++) {
        if (i < 90) { me.x += 6.9 / 90; me.z -= 4.75 / 90; }   // to (6.9, 0.25): the rig's drive, the hero on the +x baseline corner
        foe.set(me.x - 2.5, 0, Math.max(0.3, me.z + 0.3));
        dir.update(me, Vector3.Zero(), RIM_V);
        expect(Vector3.Dot(cam.getTarget().subtract(cam.position).normalize(), look)).toBeCloseTo(1, 6);
        const pose = { eye: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, target: { x: cam.getTarget().x, y: cam.getTarget().y, z: cam.getTarget().z } };
        if (i >= 30 && ![0, 1.9].every((y) => Math.abs(project(pose, cam.fov, UPRIGHT, { x: me.x, y, z: me.z }).x) < 0.97)) off++;
        maxX = Math.max(maxX, cam.position.x);
        expect(cam.position.x).toBeLessThanOrEqual(17 - 1.2 + 1e-6); expect(cam.position.z).toBeLessThanOrEqual(22 - 1.2 + 1e-6);
      }
      scene.dispose(); engine.dispose();
      return { off, maxX };
    };
    const before = run(0), after = run(1);
    expect(before.maxX).toBeLessThanOrEqual(8 - 1.2 + 1e-6);
    expect(before.off).toBeGreaterThan(20);
    expect(after.off).toBe(0);
    expect(after.maxX).toBeGreaterThan(8 - 1.2);
  });
});

describe('phase 8: the lead and the off switches', () => {
  it('the lead: each moving point once more, leadSec ahead at its velocity (capped at a sprint), after the rest; still points add nothing', () => {
    expect(HIGH_CAM_LEAD_SEC).toBe(0.35);
    const prev: P3[] = [], out: P3[] = [];
    const a = [{ x: 0, y: 0, z: 5 }, RIM];
    expect(leadPoints(a, prev, 1 / 60, 0.35, out)).toBe(a);   // no history yet
    const b = [{ x: 0.1, y: 0, z: 5 }, RIM];                 // 6 m/s across
    const l = leadPoints(b, prev, 1 / 60, 0.35, out);
    expect(l.length).toBe(3); expect(l[2].x).toBeCloseTo(0.1 + 6 * 0.35, 9); expect(l[2].z).toBeCloseTo(5, 9);
    const c = [{ x: 3.1, y: 0, z: 5 }, RIM];                 // a 3 m jump in a frame: led at 9 m/s, not 180
    expect(leadPoints(c, prev, 1 / 60, 0.35, out)[2].x).toBeCloseTo(3.1 + 9 * 0.35, 9);
    expect(leadPoints(c, prev, 1 / 60, 0, out)).toBe(c);     // 0: the points as given
  });
  it('all three at their off values (room 0, lens 1, lead 0): the eye path of the view exactly as hoops-cam shipped it (recorded from that code)', () => {
    knobs.set('hoops.highCamRoomOn', 0); knobs.set('hoops.highCamZoomMax', 1); knobs.set('hoops.highCamLeadSec', 0);
    // Canopy's box, upright: a drive to the +x corner, then out to the check; [frame, eye x y z, target x y z, fov] from the untouched code
    const GOLDEN: number[][] = [[0,6.071433719,6.8,12.794704749,0.13633796,1,3.296566072,0.8],[59,6.8,5.294898961,8.697587673,2.405062654,1,1.664217685,0.8],[119,6.8,5.831100388,9.714680755,1.856371823,1,1.803221885,0.8],[179,6.765460115,6.29882658,14.044847662,1.343211293,1,5.367435647,0.8],[239,5.595782309,6.228584171,15.890032233,0.245412008,1,7.327649898,0.8],[299,5.507267488,6.152629577,15.898919368,0.234620944,1,7.460921044,0.8],[359,5.503848933,6.150926437,15.899818925,0.2329452,1,7.464609682,0.8]];
    const { scene, engine, cam, dir } = rig(390, 844); cam.fov = 0.8;
    dir.setBounds({ minX: -8, maxX: 8, minZ: -1.9, maxZ: 17.1, minY: 0 });
    const me = new Vector3(0, 0, 5), foe = new Vector3(0.9, 0, 2);
    dir.setHighView({ court: COURT, on: () => true, frame: () => ({ play: { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, must: mustOf({ x: me.x, y: 1, z: me.z }, { x: foe.x, y: 1, z: foe.z }) }) });
    dir.snapTo(me, RIM_V);
    const got: number[][] = [];
    for (let i = 0; i < 360; i++) {
      if (i < 90) { me.x += 6.9 / 90; me.z -= 4.75 / 90; } else if (i < 200) { me.x -= 7.9 / 110; me.z += 7.4 / 110; }
      foe.set(i < 90 ? me.x - 2.5 : me.x + 0.4, 0, i < 90 ? Math.max(0.3, me.z + 0.3) : me.z + 1.6);
      dir.update(me, Vector3.Zero(), RIM_V);
      if (i % 60 === 59 || i === 0) got.push([i, cam.position.x, cam.position.y, cam.position.z, cam.getTarget().x, cam.getTarget().y, cam.getTarget().z, cam.fov]);
    }
    scene.dispose(); engine.dispose();
    expect(got.length).toBe(GOLDEN.length);
    got.forEach((r, i) => r.forEach((v, k) => expect(v, `frame ${r[0]} field ${k}`).toBeCloseTo(GOLDEN[i][k], 6)));
  });
  it('the defaults on that drive (the rival following without a jump): the old view lost something for 7 frames in 10; the defaults for under 1 in 10', () => {
    const run = () => {
      const { scene, engine, cam, dir } = rig(390, 844); cam.fov = 0.8;
      dir.setBounds({ minX: -8, maxX: 8, minZ: -1.9, maxZ: 17.1, minY: 0 });
      const me = new Vector3(0, 0, 5), foe = new Vector3(-2.5, 0, 5.3);
      dir.setHighView({ court: COURT, on: () => true, frame: () => ({ play: { x: (me.x + foe.x) / 2, z: (me.z + foe.z) / 2 }, must: mustOf({ x: me.x, y: 1, z: me.z }, { x: foe.x, y: 1, z: foe.z }) }) });
      dir.snapTo(me, RIM_V);
      let off = 0;
      for (let i = 0; i < 360; i++) {
        if (i < 90) { me.x += 6.9 / 90; me.z -= 4.75 / 90; } else if (i < 200) { me.x -= 7.9 / 110; me.z += 7.4 / 110; }
        const k = Math.max(0, Math.min(1, (i - 90) / 40));   // his spot beside me eases from the corner side to behind me
        foe.set(me.x - 2.5 + 2.9 * k, 0, Math.max(0.3, me.z + 0.3 + 1.3 * k));
        dir.update(me, Vector3.Zero(), RIM_V);
        const pose = { eye: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, target: { x: cam.getTarget().x, y: cam.getTarget().y, z: cam.getTarget().z } };
        const pts = [...mustOf({ x: me.x, y: 1, z: me.z }, { x: foe.x, y: 1, z: foe.z })];
        if (!pts.every((q) => { const s2 = project(pose, cam.fov, UPRIGHT, q); return s2.ahead && Math.abs(s2.x) < 0.97 && Math.abs(s2.y) < 0.97; })) off++;
      }
      scene.dispose(); engine.dispose();
      return off;
    };
    knobs.set('hoops.highCamRoomOn', 0); knobs.set('hoops.highCamZoomMax', 1); knobs.set('hoops.highCamLeadSec', 0);
    const before = run();
    knobs.clear();
    const after = run();
    // 2026-11-22: 257 of 360 frames with something off screen → 29 (the rest: both sprinting straight at the eye, the rival's head
    // at the right edge for half a second)
    expect(before).toBeGreaterThan(200);
    expect(after).toBeLessThan(before / 8);
  });
});

describe('phase 8: the high view for 3v3 (`hoops.threeVThreeCam`, ships 0: the owner\'s feel call)', () => {
  it('ships OFF', () => { expect(THREEVTHREE_CAM).toBe(0); });
  it('the team frame: the play is the middle of all six, the points are every body feet then head in order (the hero first), the rim last', () => {
    const bodies = [{ x: 0, z: 6 }, { x: -4.8, z: 5.8 }, { x: 4.8, z: 5.8 }, { x: -1, z: 4 }, { x: 1, z: 4 }, { x: 0, z: 2 }];
    const fr = teamFrame(RIM, () => bodies, (b) => b)();
    expect(fr.must.length).toBe(13);
    expect(fr.must[0]).toEqual({ x: 0, y: 0, z: 6 }); expect(fr.must[1]).toEqual({ x: 0, y: 1.9, z: 6 });
    expect(fr.must[12]).toEqual(RIM);
    expect(fr.play.x).toBeCloseTo(0, 9); expect(fr.play.z).toBeCloseTo((6 + 5.8 + 5.8 + 4 + 4 + 2) / 6, 9);
    expect(teamCourt(RIM)).toEqual(COURT);
  });
  /** 3v3 spreads: the opening set, a drive with the help in, the ball swung to the wing, a post-up, the rebound scrum, the far corner. */
  const SETS: Array<Array<[number, number]>> = [
    [[0, 6], [-4.8, 5.8], [4.8, 5.8], [-1.2, 4.2], [1.2, 4.2], [0, 2.4]],
    [[1.5, 3], [-5, 6.5], [5.5, 5], [1, 2], [-1.5, 3], [3.5, 4.5]],
    [[-6.2, 5], [0, 7.5], [5.5, 2], [-5.2, 4], [-1, 5.5], [4, 2.5]],
    [[2, 1.2], [-4, 6.5], [5.8, 4], [1.6, 0.6], [-2.5, 5], [4.6, 3.5]],
    [[0.5, 1.5], [-1.5, 2.5], [2.5, 2.8], [0, 0.8], [-0.8, 1.8], [1.5, 1.2]],
    [[6.5, 0.8], [-6.5, 0.8], [0, 7.8], [5.6, 1.2], [-5.6, 1.4], [0.5, 6.6]],
  ];
  it('desktop and a phone on its side: all six, head to feet, and the rim on screen in every set; upright, too (it widens)', () => {
    const p = highCamParams();
    for (const [a, fov] of [[16 / 9, 0.8], [844 / 390, 0.8], [UPRIGHT, LENS]] as const) for (const set of SETS) {
      const bodies = set.map(([x, z]) => ({ x, z }));
      const fr = teamFrame(RIM, () => bodies, (b) => b)();
      const w = highWant(COURT, p, fr.play, fr.must, fov, a);
      expect(highFits(COURT, p, w, fr.must, fov, a), `aspect ${a.toFixed(2)} set ${SETS.indexOf(set)}`).toBe(true);
    }
  });
  function drive3(knob: number | null, armed: boolean) {
    if (knob !== null) knobs.set('hoops.threeVThreeCam', knob);
    const { engine, scene, cam, dir } = rig();
    const bodies = SETS[0].map(([x, z]) => new Vector3(x, 0, z));
    if (armed) dir.setTeamHighView(RIM, () => bodies, (b) => b);
    dir.snapTo(bodies[0], RIM_V);
    const poses: Array<{ pos: Vector3; fwd: Vector3 }> = [];
    path().forEach((f) => {
      bodies[0].copyFrom(f.me); bodies[3].copyFrom(f.foe);
      dir.update(f.me, f.vel, RIM_V);
      poses.push({ pos: cam.position.clone(), fwd: cam.getTarget().subtract(cam.position).normalize() });
    });
    scene.dispose(); engine.dispose();
    return poses;
  }
  it('0 (the default): the 3v3 follow camera exactly as it shipped (every frame equal to a director the view was never armed on)', () => {
    const off = drive3(null, true), none = drive3(null, false);
    expect(off.length).toBe(none.length);
    off.forEach((f, i) => { expect(f.pos.x).toBeCloseTo(none[i].pos.x, 9); expect(f.pos.y).toBeCloseTo(none[i].pos.y, 9); expect(f.pos.z).toBeCloseTo(none[i].pos.z, 9); expect(Vector3.Dot(f.fwd, none[i].fwd)).toBeCloseTo(1, 9); });
  });
  it('1: the look never turns through the drive, where the follow turns', () => {
    const hi = drive3(1, true), fol = drive3(null, false);
    const turn = (ps: typeof hi) => Math.max(...ps.map((q) => deg(Math.acos(Math.min(1, Vector3.Dot(q.fwd, ps[0].fwd))))));
    expect(turn(hi)).toBeLessThan(0.01);
    expect(turn(fol)).toBeGreaterThan(5);
  });
});
