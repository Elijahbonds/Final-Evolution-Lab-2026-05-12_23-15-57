// GAMEPLAY-CLEAN P5 — THE HURDLE'S WAY OUT (footballTree, FOOTBALL_HURDLE_EXIT_FADE_SEC / feel `football.hurdleExitFadeSec`).
// The tree's choice (which blend, and that nothing else changed), and the measurement behind the number: the real tree on the real
// hero, headless at 60 fps — the carry, the hurdle (the stiff-arm slot playing `jump_up`) run to its natural end, the settle back
// onto the carry — over 6 carry phases at 1× and 1.4×.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const knob = vi.hoisted(() => ({ v: new Map<string, number>() }));
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => knob.v.get(id) ?? def }));
import { CharacterAnimator } from './CharacterAnimator';
import { registerAuthoredClips } from './authored';
import { sanitizeImportedGroups } from './importSanitizer';
import { boneNode } from './boneLookup';
import { FOOTBALL_HURDLE_CLIP, FOOTBALL_HURDLE_EXIT_FADE_SEC, FootballAnimTree, type FootballAnimInput } from './footballTree';

afterEach(() => knob.v.clear());

const BASE: FootballAnimInput = { presnap: false, snapped: true, isQB: false, droppingBack: false, throwing: false, runningRoute: false, carrying: true, move: null, catching: 'none', beingTackled: false, blocking: false, rushing: false };
const HURDLE: FootballAnimInput = { ...BASE, move: 'stiffArm', moveClip: FOOTBALL_HURDLE_CLIP };

// ── the tree's choice (a recording animator: what was played, with which blend) ──────────────────────────────────────────
function recorder() {
  const plays: { clip: string; fadeSec: number; onEnd?: () => void }[] = [];
  const animator = { play: (clip: string, o: { fadeSec: number; onEnd?: () => void }) => { plays.push({ clip, fadeSec: o.fadeSec, onEnd: o.onEnd }); return null; } };
  return { plays, tree: new FootballAnimTree(animator as unknown as CharacterAnimator) };
}
describe('the tree gives the hurdle its own way out, and nothing else changes', () => {
  it('the default is 0.2 s', () => { expect(FOOTBALL_HURDLE_EXIT_FADE_SEC).toBe(0.2); });
  it('the hurdle running out settles on the carry over FOOTBALL_HURDLE_EXIT_FADE_SEC', () => {
    const { plays, tree } = recorder();
    tree.update(BASE); tree.update(HURDLE);
    plays[plays.length - 1].onEnd!();                      // the hop's clip ends on its own
    expect(plays.map((p) => p.clip)).toEqual(['football_carry_run', FOOTBALL_HURDLE_CLIP, 'football_carry_run']);
    expect(plays[2].fadeSec).toBe(FOOTBALL_HURDLE_EXIT_FADE_SEC);
    expect(plays[0].fadeSec).toBe(0.1);                    // the carry from anywhere else: its own 0.1 s
  });
  it('…and so does a hurdle whose beat the mode clears before the clip ends', () => {
    const { plays, tree } = recorder();
    tree.update(BASE); tree.update(HURDLE); tree.clearBeat('stiff_arm'); tree.update(BASE);
    expect(plays[2]).toMatchObject({ clip: 'football_carry_run', fadeSec: FOOTBALL_HURDLE_EXIT_FADE_SEC });
  });
  it('the knob at 0.1 is the old blend exactly', () => {
    knob.v.set('football.hurdleExitFadeSec', 0.1);
    const { plays, tree } = recorder();
    tree.update(BASE); tree.update(HURDLE); plays[plays.length - 1].onEnd!();
    expect(plays[2].fadeSec).toBe(0.1);
  });
  it('the stiff arm itself, the juke and the spin still settle on the carry over 0.1 s; a reset forgets the hurdle', () => {
    for (const mv of [{ move: 'stiffArm', moveClip: 'football_stiff_arm' }, { move: 'juke', moveClip: 'football_juke_right' }, { move: 'spin', moveClip: 'football_spin_move' }] as Partial<FootballAnimInput>[]) {
      const { plays, tree } = recorder();
      tree.update(BASE); tree.update({ ...BASE, ...mv }); plays[plays.length - 1].onEnd!();
      expect(plays[2], JSON.stringify(mv)).toMatchObject({ clip: 'football_carry_run', fadeSec: 0.1 });
    }
    const { plays, tree } = recorder();
    tree.update(BASE); tree.update(HURDLE); tree.reset(); tree.update(BASE);
    expect(plays[2].fadeSec).toBe(0.1);
  });
});

// ── the measurement: the real tree on the real hero ────────────────────────────────────────────────────────────────────
const ARMS = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];
const ang = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
let scene: Scene, sk: Skeleton, animator: CharacterAnimator, engine: NullEngine;
beforeAll(async () => {
  engine = new NullEngine(); scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  sanitizeImportedGroups(r.animationGroups);
  animator = new CharacterAnimator(scene, r.animationGroups);
  registerAuthoredClips(animator, scene, sk);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  scene.useConstantAnimationDeltaTime = true;
}, 120_000);

const pose = () => ARMS.map((b) => (boneNode(sk, b)?.rotationQuaternion ?? Quaternion.Identity()).clone());
/** The largest one-frame arm turn over the 30 frames after the hurdle's clip runs out, for one carry phase and rate. */
function exitPeak(phaseFrames: number, speedMps: number): number {
  animator.play('idle_stand', { loop: true, fadeSec: 0, restart: true }); scene.render();
  const tree = new FootballAnimTree(animator);
  const run = { ...BASE, speedMps, dtSec: 1 / 60 }, hop = { ...HURDLE, speedMps, dtSec: 1 / 60 };
  for (let i = 0; i < 40 + phaseFrames; i++) { tree.update(run); scene.render(); }
  let n = 0; tree.update(hop); scene.render();
  while (tree.state === 'stiff_arm' && n < 200) { tree.update(hop); scene.render(); n++; }   // the hop runs out; the tree settles on the carry
  expect(tree.state).toBe('carry');
  let prev = pose(), peak = 0;
  for (let i = 0; i < 30; i++) { tree.update(hop); scene.render(); const now = pose(); peak = Math.max(peak, ...now.map((q, k) => ang(q, prev[k]))); prev = now; }
  return peak;
}
const worst = () => { let w = 0; for (const mps of [2.1, 7.7]) for (let p = 0; p < 24; p += 4) w = Math.max(w, exitPeak(p, mps)); return w; };

describe('the hurdle exit, measured on the hero (6 carry phases, the carry at 1× and at its 1.4× cap, 60 fps)', () => {
  it('the old 0.1 s blend is the hard pop the rig read (an arm over 25° a frame); the default is under 18° and at least 40 % below it', () => {
    knob.v.set('football.hurdleExitFadeSec', 0.1);
    const old = worst();
    knob.v.clear();
    const now = worst();
    console.log(`hurdle exit, worst one-frame arm turn: 0.1 s ${old.toFixed(1)}°, ${FOOTBALL_HURDLE_EXIT_FADE_SEC} s ${now.toFixed(1)}°`);
    expect(old).toBeGreaterThan(25);        // 30.9° measured; the rig read 31.1° in play
    expect(now).toBeLessThan(18);
    expect(now).toBeLessThan(old * 0.6);
  }, 170_000);
});
