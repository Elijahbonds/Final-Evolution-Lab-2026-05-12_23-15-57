// MOVEMENT POLISH (2026-10-06) — the authored stepping loops step FORWARD (they moonwalked: gait.ts).
//
// Pure: each knee folds while its own thigh swings forward. On the hero rig (the GLB, NullEngine): every authored stepping loop
// sweeps its LOW foot backward under the body and carries its HIGH foot forward — the same reading on the captured `bball_mc_run`
// (a person) is the control that says the measurement is the right way round.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { gaitKnees, thighSwing } from './gait';
import { boneNode } from './boneLookup';
import { buildBaseClips } from './authored/baseClips';
import { buildGuardStep } from './authored/karate';
import { buildCarryRun } from './authored/football';
import { MOCAP_OPPONENT_CLIPS, buildMocapOpponentClip } from './authored/mocapOpponents';
import { freeRunRate } from './freeRunTree';
import { LOCO_TUNE } from './LocoBus';
import { COMBAT_STRIDE, GUARD_STEP_CEILING, RATE_MIN, combatGait } from '../core/StrideMatch';

describe('gaitKnees — the knee folds on the forward swing', () => {
  it('the more-bent knee is always the leg swinging forward, and each peaks at its fastest forward swing', () => {
    for (let k = 0; k < 64; k++) {
      const phi = (2 * Math.PI * k) / 64;
      const kn = gaitKnees(phi, 12, 14), sw = thighSwing(phi);
      if (Math.abs(sw.L - sw.R) < 1e-6) continue;
      expect(kn.L > kn.R).toBe(sw.L > sw.R);
    }
    expect(gaitKnees(0, 12, 14).L).toBeCloseTo(12 + 28);           // left thigh vertical, swinging forward: mid-swing
    expect(gaitKnees(0, 12, 14).R).toBeCloseTo(12);                // the right foot is under the body: mid-stance
    expect(gaitKnees(Math.PI, 12, 14).R).toBeCloseTo(12 + 28);
    expect(gaitKnees(Math.PI, 12, 14).L).toBeCloseTo(12);
  });
});

describe('the authored stepping loops on the hero rig sweep the planted foot BACKWARD', () => {
  let scene: Scene; let sk: Skeleton; let root: TransformNode;
  const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
  beforeAll(async () => {
    const engine = new NullEngine();
    (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
    scene = new Scene(engine); scene.useConstantAnimationDeltaTime = true;
    new FreeCamera('c', new Vector3(0, 1, -3), scene);
    const b64 = readFileSync(process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb').toString('base64');
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
    for (const g of r.animationGroups) g.stop();
    sk = r.skeletons[0];
    root = r.meshes[0] as unknown as TransformNode;
    root.rotation = new Vector3(0, 0, 0); root.scaling.setAll(1);   // CharacterLibrary.spawn's root: yaw 0 faces +z
    for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
  }, 60_000);

  /** Two cycles in place: each foot's mean velocity along +z (the travel) in its lower 40% of heights (stance) and the rest (swing). */
  const sweep = (g: AnimationGroup) => {
    for (const x of scene.animationGroups) x.stop();
    for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
    const dur = (g.to - g.from) / (g.targetedAnimations[0]?.animation.framePerSecond ?? 60);
    g.start(true, 1, g.from, g.to, false);
    const tr: Record<string, { h: number; z: number }[]> = { LeftFoot: [], RightFoot: [] };
    for (let i = 0; i < Math.round(2 * dur * 60); i++) {
      scene.render();
      for (const f of ['LeftFoot', 'RightFoot']) { const n = boneNode(sk, f)!; n.computeWorldMatrix(true); const p = n.getAbsolutePosition(); tr[f].push({ h: p.y, z: p.z }); }
    }
    g.stop();
    return Object.fromEntries(Object.entries(tr).map(([f, xs]) => {
      const cut = [...xs].map((s) => s.h).sort((a, b) => a - b)[Math.floor(xs.length * 0.4)];
      let st = 0, ns = 0, sw = 0, nw = 0;
      for (let i = 1; i < xs.length; i++) { const v = (xs[i].z - xs[i - 1].z) * 60; if (xs[i].h <= cut) { st += v; ns++; } else { sw += v; nw++; } }
      return [f, { stance: st / ns, swing: sw / nw }];
    })) as Record<string, { stance: number; swing: number }>;
  };

  it('control: a captured run (bball_mc_run) reads stance back, swing forward', () => {
    const g = buildMocapOpponentClip(scene, sk, MOCAP_OPPONENT_CLIPS.find((c) => c.name === 'bball_mc_run')!)!;
    const s = sweep(g);
    for (const f of ['LeftFoot', 'RightFoot']) { expect(s[f].stance).toBeLessThan(-0.5); expect(s[f].swing).toBeGreaterThan(0.5); }
  });

  it('walk, run, the guard step and the carry run step forward (they moonwalked)', () => {
    const base = buildBaseClips(scene, sk);
    const clips: [string, AnimationGroup][] = [
      ['walk', base.find((g) => g.name === 'walk')!], ['run', base.find((g) => g.name === 'run')!],
      ['karate_guard_step', buildGuardStep(scene, sk)!], ['football_carry_run', buildCarryRun(scene, sk)!],
    ];
    for (const [name, g] of clips) {
      const s = sweep(g);
      for (const f of ['LeftFoot', 'RightFoot']) {
        expect(s[f].stance, `${name} ${f} stance`).toBeLessThan(-0.1);
        expect(s[f].swing, `${name} ${f} swing`).toBeGreaterThan(0.1);
      }
    }
  });
});

describe('the stride references follow the fixed loops', () => {
  it('free run paces its ground gaits on the loco references; choreography keeps its rate', () => {
    expect(freeRunRate('run', LOCO_TUNE.runRef)).toBeCloseTo(1);
    expect(freeRunRate('walk', LOCO_TUNE.walkRef)).toBeCloseTo(1);
    expect(freeRunRate('wallrun', LOCO_TUNE.runRef * 1.2)).toBeCloseTo(1.2);
    expect(freeRunRate('run', 7)!).toBeGreaterThan(freeRunRate('run', 4)!);
    for (const s of ['jump', 'air', 'tuck', 'land_clean', 'land_sketchy', 'bail', 'floor', 'get_up', 'celebrate', 'slide', 'idle'] as const) expect(freeRunRate(s, 5)).toBeNull();
  });
  it('the combat gait split did not move when the guard step\'s reference did', () => {
    expect(GUARD_STEP_CEILING).toBeCloseTo(1.11, 2);
    expect(combatGait(1.0)).toBe('step'); expect(combatGait(1.2)).toBe('run');
    // the guard step's band: the ceiling is reachable at a rate the clip can play, and the slowest rate is not far under it
    expect(GUARD_STEP_CEILING / COMBAT_STRIDE.walk).toBeLessThan(1.85);
    expect(RATE_MIN * COMBAT_STRIDE.walk).toBeLessThan(GUARD_STEP_CEILING);
  });
});

describe('TurnSlew — a turn that winds up and settles', () => {
  it('a stick reversal starts and ends its turn gently, arrives without overshoot, and is frame-rate independent', async () => {
    const { TurnSlew, stepYaw, wrapYaw } = await import('./LocoBus');
    const run = (dt: number) => {
      const t = new TurnSlew(); let yaw = 0, prevStep = 0, maxJump = 0, frames = 0;
      while (Math.abs(wrapYaw(Math.PI - yaw)) > 1e-4 && frames < 600) {
        const next = t.step(yaw, Math.PI - 1e-3, dt, 10, 60); const st = wrapYaw(next - yaw);
        maxJump = Math.max(maxJump, Math.abs(st - prevStep)); prevStep = st; yaw = next; frames++;
        if (Math.abs(wrapYaw(Math.PI - 1e-3 - yaw)) < 1e-6) break;
      }
      return { maxJump, sec: frames * dt, yaw };
    };
    const a = run(1 / 60), b = run(1 / 30);
    expect(a.yaw).toBeCloseTo(Math.PI - 1e-3, 4);
    expect(a.maxJump).toBeLessThan((60 / 3600) + 1e-9 + 0.002);   // the rate changes at most accel·dt² a frame (1°/frame² at 60 rad/s²)
    // the slew at the same top rate: the whole rate in one frame
    expect(Math.abs(stepYaw(0, Math.PI - 1e-3, 1 / 60, 10))).toBeCloseTo(10 / 60);
    expect(Math.abs(a.sec - b.sec)).toBeLessThan(1 / 30 + 1e-9);
    expect(a.sec).toBeLessThan(0.6);   // 180° still turns in about half a second (the slew: 0.31 s)
  });
});

describe('combatTree — a hit reads its weight', () => {
  it('a light hit snaps quicker than a medium, a heavy holds longer; the same flinch clip', async () => {
    const { chooseCombatClip } = await import('./combatTree');
    const base = { speed01: 0, dashing: false, hasWeapon: false, striking: null, blocking: false, parryFlash: false, guardImpactFlash: false, down: false, out: false, ulting: false } as const;
    const l = chooseCombatClip({ ...base, hitBy: 'light' }), m = chooseCombatClip({ ...base, hitBy: 'medium' }), h = chooseCombatClip({ ...base, hitBy: 'heavy' });
    expect(l.clip).toBe(m.clip); expect(h.clip).toBe(m.clip);
    expect(l.speedRatio ?? 1).toBeGreaterThan(m.speedRatio ?? 1);
    expect(h.speedRatio ?? 1).toBeLessThan(m.speedRatio ?? 1);
    expect(h.fadeSec).toBeGreaterThan(l.fadeSec);
  });
});
