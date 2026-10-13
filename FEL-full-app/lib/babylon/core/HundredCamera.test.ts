// Karate Endless camera (owner playtest 2026-10-08: "camera is still wonky and needs to zoom out a little") — the regression.
//
// MEASURED before the fix (Playwright on the running rig, three scripted bots, ~100 s each, desktop / phone portrait / landscape):
// foes within 5 m of the fighter not fully framed 22 % (desktop) to 70 % (portrait); the fighter off-screen for up to 110 frames; the camera
// 5.1 m out in every frame including a horde; a single frame moving the camera up to 2.2 m and the view up to 35 degrees.
//
// This plays SCRIPTED CROWDED WAVES through the real CameraDirector + the new HundredCamera a frame at a time at 60 Hz, on three screens, and
// holds the same numbers the rig did: how much of the incoming crowd is framed, that the fighter is always framed, and that no frame moves the
// camera more than a follow can. The OLD camera (preset flip, raw facing, nearest-foe aim, the 1.18 pull) is run through the same scripts as a
// control: it has to fail them, so the thresholds are known to bite.
import { afterEach, describe, expect, it } from 'vitest';
import { Matrix, MeshBuilder, NullEngine, Scene, TargetCamera, Vector3 } from '@babylonjs/core';
import { CameraDirector, FOLLOW_PRESETS, HUNDRED_CAM_PULL } from './CameraDirector';
import {
  CROWD_CLOSE_PER_SEC, CROWD_OPEN_PER_SEC, FACING_MAX_RATE, HundredCamera, MAX_CAM_DISTANCE, MAX_CAM_STEP, PORTRAIT_PULL_MAX,
  aspectPull, crowdTarget, limitCameraStep, lensWiden, type Foe,
} from './HundredCamera';
import { CROWDCLEAR_MIN_SURROUNDED, CROWDCLEAR_RADIUS } from './OnslaughtCore';

// ── the pure half ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('HundredCamera — the numbers', () => {
  it('pulls back on a narrow screen, never on a wide one, and never past its ceiling', () => {
    expect(aspectPull(16 / 9)).toBe(1);
    expect(aspectPull(1)).toBe(1);
    expect(aspectPull(390 / 844)).toBeGreaterThan(1.2);
    expect(aspectPull(0.1)).toBe(PORTRAIT_PULL_MAX);
    expect(aspectPull(0.4)).toBeGreaterThan(aspectPull(0.6));
  });

  it('a crowd is pressure: nothing for a duel, full for a ring of bodies, more for nearer bodies', () => {
    const hero = { x: 0, z: 0 };
    expect(crowdTarget(hero, []).target).toBe(0);
    expect(crowdTarget(hero, [{ x: 2, z: 0 }]).target).toBe(0);   // one body at arm's length is a duel
    const ring = (n: number, r: number): Foe[] => Array.from({ length: n }, (_, i) => ({ x: Math.cos((i / n) * 6.28) * r, z: Math.sin((i / n) * 6.28) * r }));
    expect(crowdTarget(hero, ring(10, 3)).target).toBe(1);
    expect(crowdTarget(hero, ring(10, 6)).target).toBeLessThan(crowdTarget(hero, ring(10, 3)).target + 1e-9);
    expect(crowdTarget(hero, ring(6, 7)).target).toBeGreaterThan(0);   // a horde at 7 m already counts — the old test needed THREE inside 2.6 m
    expect(crowdTarget(hero, ring(10, 20)).target).toBe(0);
  });

  it('declared cut: the first frame after reset() IS the inputs, nothing eased from before', () => {
    const cam = new HundredCamera();
    cam.update(1 / 60, { x: 0, z: 0 }, { x: 0, z: 1 }, [], 1.78);
    cam.reset();
    const f = cam.update(1 / 60, { x: 5, z: 5 }, { x: 1, z: 0 }, [{ x: 7, z: 5 }], 1.78);
    expect(f.facing.x).toBeCloseTo(1, 3); expect(f.facing.z).toBeCloseTo(0, 3);
  });

  it('the facing it hands the director is always a unit vector (the facing-follow contract) and never NaN, even for a zero facing', () => {
    const cam = new HundredCamera();
    for (const facing of [{ x: 0, z: 1 }, { x: 0, z: 0 }, { x: 3, z: 4 }, { x: -1e-9, z: 0 }]) {
      const f = cam.update(1 / 60, { x: 1, z: 2 }, facing, [{ x: 3, z: 3 }], 0.46);
      expect(Math.hypot(f.facing.x, f.facing.z)).toBeCloseTo(1, 6);
      for (const v of [f.focus.x, f.focus.z, f.distance, f.height, f.lag]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('the crowd shot opens at most CROWD_OPEN_PER_SEC and closes at most CROWD_CLOSE_PER_SEC — a threshold flicker cannot pump it', () => {
    const cam = new HundredCamera();
    const hero = { x: 0, z: 0 };
    const horde: Foe[] = Array.from({ length: 10 }, (_, i) => ({ x: Math.cos(i) * 3, z: Math.sin(i) * 3 }));
    let prev = cam.update(1 / 60, hero, { x: 0, z: 1 }, [], 1.78).crowd01;
    let maxUp = 0, maxDown = 0, lo = 9, hi = -9;
    for (let i = 0; i < 600; i++) {
      // the foes flicker in and out every other frame (the 'surrounded' test sitting on its threshold)
      const c = cam.update(1 / 60, hero, { x: 0, z: 1 }, i % 2 ? horde : [], 1.78).crowd01;
      maxUp = Math.max(maxUp, c - prev); maxDown = Math.max(maxDown, prev - c); prev = c;
      if (i >= 300) { lo = Math.min(lo, c); hi = Math.max(hi, c); }
    }
    expect(maxUp).toBeLessThanOrEqual(CROWD_OPEN_PER_SEC / 60 + 1e-9);
    expect(maxDown).toBeLessThanOrEqual(CROWD_CLOSE_PER_SEC / 60 + 1e-9);
    expect(hi - lo, 'swing of crowd01 over the last 5 s of a 30 Hz flicker').toBeLessThan(0.05);   // the old preset flip swung the whole shot
  });

  it('the aim point never jumps: when the crowd swaps sides in one frame the focus eases over (it used to snap to the new nearest foe)', () => {
    const cam = new HundredCamera();
    const hero = { x: 0, z: 0 };
    const right: Foe[] = [{ x: 3, z: 0 }, { x: 3.5, z: 1 }, { x: 3, z: -1 }];
    const left: Foe[] = right.map((f) => ({ x: -f.x, z: f.z }));
    let prev = cam.update(1 / 60, hero, { x: 0, z: 1 }, right, 1.78).focus;
    let worst = 0;
    for (let i = 0; i < 180; i++) {
      const fo = cam.update(1 / 60, hero, { x: 0, z: 1 }, i < 90 ? right : left, 1.78).focus;
      if (i > 0) worst = Math.max(worst, Math.hypot(fo.x - prev.x, fo.z - prev.z));
      prev = fo;
    }
    expect(worst, 'largest one-frame move of the aim point (m) across a side swap').toBeLessThan(0.25);   // measured 0.19; unsmoothed it is the whole swap (~4 m)
  });

  it('a 180-degree turn of the fighter swings the camera heading no faster than FACING_MAX_RATE', () => {
    const cam = new HundredCamera();
    cam.update(1 / 60, { x: 0, z: 0 }, { x: 0, z: 1 }, [], 1.78);
    let prevAng = 0, worst = 0;
    for (let i = 0; i < 120; i++) {
      const f = cam.update(1 / 60, { x: 0, z: 0 }, { x: 0, z: -1 }, [], 1.78);   // facing flipped to the opposite direction, held
      const ang = Math.atan2(f.facing.x, f.facing.z);
      let d = Math.abs(ang - prevAng); if (d > Math.PI) d = 2 * Math.PI - d;
      if (i > 0) worst = Math.max(worst, d);
      prevAng = ang;
    }
    expect(worst).toBeLessThanOrEqual(FACING_MAX_RATE / 60 + 1e-6);
  });

  it('the pull stays inside its limits: distance <= MAX_CAM_DISTANCE, wider on a phone in portrait, wider again in a horde', () => {
    const horde: Foe[] = Array.from({ length: 12 }, (_, i) => ({ x: Math.cos(i) * 3.5, z: Math.sin(i) * 3.5 }));
    const settle = (foes: Foe[], aspect: number) => { const c = new HundredCamera(); let f = c.update(1 / 60, { x: 0, z: 0 }, { x: 0, z: 1 }, foes, aspect); for (let i = 0; i < 300; i++) f = c.update(1 / 60, { x: 0, z: 0 }, { x: 0, z: 1 }, foes, aspect); return f; };
    const duelWide = settle([], 1.78), hordeWide = settle(horde, 1.78), duelPortrait = settle([], 0.46), hordePortrait = settle(horde, 0.46);
    expect(hordeWide.distance).toBeGreaterThan(duelWide.distance * 1.4);
    expect(duelPortrait.distance).toBeGreaterThan(duelWide.distance * 1.2);
    expect(hordePortrait.distance).toBeLessThanOrEqual(MAX_CAM_DISTANCE);
    expect(hordePortrait.distance).toBeGreaterThanOrEqual(hordeWide.distance);
    expect(duelWide.distance).toBeCloseTo(FOLLOW_PRESETS.fightShoulder.distance, 4);   // a duel on a wide screen is exactly the shoulder shot
    expect(hordeWide.distance).toBeCloseTo(FOLLOW_PRESETS.fightCrowd.distance, 4);     // a full horde is exactly the crowd shot
  });

  it('limitCameraStep: moves the camera at most MAX_CAM_STEP a frame (scaled by dt), keeps the direction, and leaves a normal step alone', () => {
    const prev = { x: 0, y: 2, z: 0 };
    const small = { x: 0.3, y: 2, z: 0 };
    expect(limitCameraStep(prev, small, 1 / 60)).toBe(false);
    expect(small.x).toBe(0.3);
    const big = { x: 3, y: 2, z: 4 };   // 5 m in one frame
    expect(limitCameraStep(prev, big, 1 / 60)).toBe(true);
    expect(Math.hypot(big.x - prev.x, big.y - prev.y, big.z - prev.z)).toBeCloseTo(MAX_CAM_STEP, 6);
    expect(big.x / big.z).toBeCloseTo(0.75, 6);   // the same heading
    const slow = { x: 3, y: 2, z: 4 };            // a 4x slower frame may move 4x as far
    limitCameraStep(prev, slow, 4 / 60);
    expect(Math.hypot(slow.x, slow.z)).toBeCloseTo(MAX_CAM_STEP * 4, 6);
  });

  it('opens the lens on a narrow screen only, and by a little', () => {
    expect(lensWiden(16 / 9)).toBe(1);
    expect(lensWiden(390 / 844)).toBeGreaterThan(1.1);
    expect(lensWiden(390 / 844)).toBeLessThanOrEqual(1.25);
    expect(lensWiden(0.05)).toBe(1.25);
  });

  it('pins the pull: 1.34 on both shots (CAM-FIXES, owner 2026-10-08 "zoom out a little"; was 1.18)', () => {
    expect(HUNDRED_CAM_PULL).toBe(1.34);
    expect(FOLLOW_PRESETS.fightShoulder.distance).toBeCloseTo(4.0 * 1.34, 5);
    expect(FOLLOW_PRESETS.fightCrowd.distance).toBeCloseTo(6.4 * 1.34, 5);
  });
});

// ── the scripted crowded waves, through the real director ───────────────────────────────────────────────────────────────────────────────
const VIEWS = [
  { name: 'desktop', w: 1280, h: 720 },
  { name: 'phone portrait', w: 390, h: 844 },
  { name: 'phone landscape', w: 844, h: 390 },
] as const;
type ScriptName = 'circle' | 'dime' | 'rush' | 'edge';
const SCRIPTS: ScriptName[] = ['circle', 'dime', 'rush', 'edge'];
const FOV = 0.8;
const ARENA_HALF = 15;   // the karate dojo mat's floor half-extent (arenas: 12 x ARENA_SCALE 1.25)
const INCOMING_R = 3.5;    // a foe this close to the fighter is "incoming": it has to be in the picture
const MARGIN = 0.03;

const engines: NullEngine[] = [];
afterEach(() => { while (engines.length) engines.pop()!.dispose(); });

interface Run { heroOut: number; foeFrames: number; foeNotFramed: number; foeCut: number; maxJump: number; maxYawDeg: number; maxCamDist: number; frames: number }

/** A deterministic crowded wave: 12 bodies close to a ring round the fighter, one KO'd (and a fresh body spawned at the edge) every 0.9 s. */
function runScript(script: ScriptName, view: { w: number; h: number }, which: 'new' | 'old'): Run {
  const engine = new NullEngine({ renderWidth: view.w, renderHeight: view.h });
  engine.getDeltaTime = () => 1000 / 60;
  engines.push(engine);
  const scene = new Scene(engine);
  MeshBuilder.CreateGround('venue_ground', { width: ARENA_HALF * 2, height: ARENA_HALF * 2 }, scene);
  // the dojo's walls: the director's occlusion probe sees these (wall_*), and a camera pinned against one is where its whisker choice can flip
  for (const [n, x, z, w, d] of [['wall_n', 0, 15, 30, 0.4], ['wall_s', 0, -15, 30, 0.4], ['wall_e', 15, 0, 0.4, 30], ['wall_w', -15, 0, 0.4, 30]] as const) {
    const wall = MeshBuilder.CreateBox(n, { width: w, height: 4, depth: d }, scene); wall.position.set(x, 2, z);
  }
  const camera = new TargetCamera('cam', new Vector3(0, 3, -8), scene);
  camera.fov = FOV; scene.activeCamera = camera;
  const dir = new CameraDirector(scene, camera, 'fightShoulder');
  dir.setBounds({ minX: -ARENA_HALF, maxX: ARENA_HALF, minZ: -ARENA_HALF, maxZ: ARENA_HALF, minY: 0 });
  const hundred = new HundredCamera();
  const aspect = view.w / view.h;
  const dt = 1 / 60;

  let rng = 12345; const rnd = () => { rng = (rng * 1664525 + 1013904223) % 4294967296; return rng / 4294967296; };
  const hero = new Vector3(0, 0, 0); let yaw = 0, ko = 0;
  const foes: Vector3[] = []; const slot: number[] = [];
  const spawn = (i: number) => { const a = rnd() * 6.2832; foes[i] = new Vector3(Math.cos(a) * 9, 0, Math.sin(a) * 9); slot[i] = (i / 12) * 6.2832 + rnd() * 0.3; };
  for (let i = 0; i < 12; i++) spawn(i);
  const facingOf = (y: number) => new Vector3(Math.sin(y), 0, Math.cos(y));
  dir.snapTo(hero, hero.add(facingOf(yaw)));
  scene.render();

  const project = (p: Vector3) => {
    const s = Vector3.Project(p, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(view.w, view.h));
    return { x: s.x / view.w, y: s.y / view.h, ok: s.z > 0 && s.z < 1 };
  };
  const framed = (p: { x: number; y: number; ok: boolean }, m: number) => p.ok && p.x > m && p.x < 1 - m && p.y > m && p.y < 1 - m;
  const touches = (p: { x: number; y: number; ok: boolean }) => p.ok && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1;

  const out: Run = { heroOut: 0, foeFrames: 0, foeNotFramed: 0, foeCut: 0, maxJump: 0, maxYawDeg: 0, maxCamDist: 0, frames: 0 };
  let prevCam = camera.position.clone(); let prevYaw: number | null = null;
  let camCrowd = false;
  const N = 60 * 14;
  for (let f = 0; f < N; f++) {
    const t = f * dt;
    // the fighter
    if (script === 'circle') { const a = t * 1.1; const nx = Math.cos(a) * 3.2, nz = Math.sin(a) * 3.2; yaw = Math.atan2(nx - hero.x, nz - hero.z); hero.set(nx, 0, nz); }
    else if (script === 'edge') { hero.set(9.3, 0, 0); yaw = Math.PI / 2 + Math.sin(t * 1.7) * 1.4; }   // pinned on the ring's edge, facing out and sweeping round
    else if (script === 'dime') { yaw = Math.floor(t / 0.9) % 2 === 0 ? 0 : Math.PI; hero.set(0, 0, 0); }   // the facing flips 180 degrees every 0.9 s, instantly
    else { const dirx = Math.floor(t / 2.4) % 2 === 0 ? 1 : -1; hero.x = Math.max(-9.3, Math.min(9.3, hero.x + dirx * 4.5 * dt)); hero.z = Math.sin(t) * 2; yaw = dirx > 0 ? Math.PI / 2 : -Math.PI / 2; }
    // the crowd: each body closes on its own slot of a ring round the fighter (1.6 .. 4.8 m), one KO'd every 0.9 s
    if (f > 0 && f % 54 === 0) { let best = 0, bd = 1e9; foes.forEach((p, i) => { const d = Vector3.Distance(p, hero); if (d < bd) { bd = d; best = i; } }); spawn(best); ko++; }
    foes.forEach((p, i) => { const r = 1.6 + (i % 4) * 1.05; const tx = hero.x + Math.cos(slot[i]) * r, tz = hero.z + Math.sin(slot[i]) * r; const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, 2.4 * dt); p.x += (dx / d) * step; p.z += (dz / d) * step; });

    const facing = facingOf(yaw);
    if (which === 'new') {
      const shot = hundred.update(dt, hero, { x: facing.x, z: facing.z }, foes, aspect);
      if (Math.abs(shot.fov - camera.fov) > 0.002) dir.setBaseFov(shot.fov);
      dir.tuneFollow({ distance: shot.distance, height: shot.height, lag: shot.lag, pitchCapDeg: shot.pitchCapDeg, pitchFloorDeg: shot.pitchFloorDeg });
      const before = camera.position.clone();
      dir.update(hero, new Vector3(shot.facing.x, 0, shot.facing.z), new Vector3(shot.focus.x, 0, shot.focus.z));
      if (limitCameraStep(before, camera.position, dt)) camera.setTarget(camera.getTarget());   // the mode's own guard against a wall-probe snap
    } else {
      // THE OLD CAMERA, as it shipped: a preset flip when 3 bodies are inside 2.6 m, raw facing, the nearest body as the aim, pull 1.18
      let near = 0; for (const p of foes) if (Vector3.Distance(p, hero) <= CROWDCLEAR_RADIUS) near++;
      const surrounded = near >= CROWDCLEAR_MIN_SURROUNDED;
      if (f === 0 || surrounded !== camCrowd) { camCrowd = surrounded; dir.setPreset(camCrowd ? 'fightCrowd' : 'fightShoulder'); dir.tuneFollow({ distance: (camCrowd ? 6.4 : 4.0) * 1.18 }); }
      let nearest = foes[0], nd = 1e9; for (const p of foes) { const d = Vector3.Distance(p, hero); if (d < nd) { nd = d; nearest = p; } }
      dir.update(hero, facing, nearest);
    }
    scene.render();

    if (f < 90) { prevCam = camera.position.clone(); prevYaw = null; continue; }   // settle: the declared cut at the start is not a jump
    out.frames++;
    const jump = Vector3.Distance(camera.position, prevCam); prevCam = camera.position.clone();
    out.maxJump = Math.max(out.maxJump, jump);
    out.maxCamDist = Math.max(out.maxCamDist, Math.hypot(camera.position.x - hero.x, camera.position.z - hero.z));   // horizontal, like the distance it limits
    const tg = camera.getTarget(); const yawNow = Math.atan2(tg.x - camera.position.x, tg.z - camera.position.z);
    if (prevYaw !== null) { let d = Math.abs(yawNow - prevYaw); if (d > Math.PI) d = 2 * Math.PI - d; out.maxYawDeg = Math.max(out.maxYawDeg, (d * 180) / Math.PI); }
    prevYaw = yawNow;
    if (!framed(project(hero), MARGIN) || !framed(project(hero.add(new Vector3(0, 1.8, 0))), MARGIN)) out.heroOut++;
    for (const p of foes) {
      if (Vector3.Distance(p, hero) > INCOMING_R) continue;
      out.foeFrames++;
      const feet = project(p), head = project(p.add(new Vector3(0, 1.8, 0)));
      if (!(framed(feet, MARGIN) && framed(head, MARGIN))) { out.foeNotFramed++; if (touches(feet) || touches(head)) out.foeCut++; }
    }
  }
  void ko;
  if (process.env.CAM_CAL) console.log(`CAL ${which} ${script} ${view.w}x${view.h} heroOut ${out.heroOut} notFramed ${(100 * out.foeNotFramed / out.foeFrames).toFixed(1)}% cut ${(100 * out.foeCut / out.foeFrames).toFixed(1)}% maxJump ${out.maxJump.toFixed(3)} maxYaw ${out.maxYawDeg.toFixed(2)} maxDist ${out.maxCamDist.toFixed(2)}`);
  return out;
}

describe('The Hundred camera — scripted crowded waves through the real director', () => {
  for (const view of VIEWS) {
    for (const script of SCRIPTS) {
      it(`${script}: the fighter stays framed, the incoming crowd is framed, and no frame jumps — ${view.name}`, () => {
        const r = runScript(script, view, 'new');
        // the fighter: never out of the frame
        expect(r.heroOut, 'frames with the fighter outside the viewport margin').toBe(0);
        // the incoming crowd (foes inside 3.5 m, the melee ring): measured 1.7-2.4 % not fully framed on a wide screen (the old camera: 7-30 %),
        // 16-27 % on a phone in portrait (the old: 51-72 %) — a lens 11 degrees wide to a side cannot hold a ring, and the numbers say so
        const portrait = view.name === 'phone portrait';
        expect(r.foeNotFramed / r.foeFrames, 'share of incoming foe-frames not fully framed').toBeLessThan(portrait ? 0.35 : 0.05);
        expect(r.foeCut / r.foeFrames, 'share of incoming foe-frames cut by an edge').toBeLessThan(portrait ? 0.1 : 0.05);
        // no snaps: a follow moves a camera ~0.3-0.4 m a frame at the wide shot and the mode's guard holds it to MAX_CAM_STEP; a cut moves it metres
        // (the old camera: 1.4-1.7 m, 13-42 degrees)
        expect(r.maxJump, 'largest one-frame camera move (m)').toBeLessThanOrEqual(MAX_CAM_STEP + 1e-6);
        expect(r.maxYawDeg, 'largest one-frame turn of the view (deg)').toBeLessThan(4.5);
        // the commanded distance is capped at MAX_CAM_DISTANCE; the camera may TRAIL a sprinting fighter by its follow lag and the 0.65 m shoulder offset
        expect(r.maxCamDist, 'the camera never stands farther (on the ground) than the limit plus its follow trail').toBeLessThanOrEqual(MAX_CAM_DISTANCE + 0.8);
      });
    }
  }
});

describe('The Hundred camera — control: the OLD camera fails the same scripts (so the thresholds bite)', () => {
  it('preset flip + raw facing + nearest-foe aim + 1.18 pull: cut-off foes, snaps, or a fighter out of frame, on at least 3 of the 4 scripts per screen', () => {
    for (const view of VIEWS) {
      let bad = 0;
      for (const script of SCRIPTS) {
        const r = runScript(script, view, 'old');
        if (r.heroOut > 0 || r.foeNotFramed / r.foeFrames >= (view.name === 'phone portrait' ? 0.35 : 0.05) || r.maxJump > MAX_CAM_STEP + 1e-6 || r.maxYawDeg >= 4.5) bad++;
      }
      expect(bad, `old camera on ${view.name}`).toBeGreaterThanOrEqual(3);
    }
  });
});
