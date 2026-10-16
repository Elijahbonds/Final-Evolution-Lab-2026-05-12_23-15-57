// SkinningGuard v4 (lane/kvs-skin, 2026-10-16): Who Scene It's `char_65` was flagged as a SKINNING STALL and forced onto CPU skinning.
// Measured on the phone profile: its six sampled bones moved by exactly 0 over the 45 frames, a drawn body's by up to 0.99 — char_65 stood outside
// the portrait frame and was never drawn, and a skeleton is only prepared for a mesh the scene draws. These tests drive a REAL skeleton and a real
// `scene.render()` (tests/helpers/skinnedBody.ts), so drawn / undrawn / never-prepared are the engine's doing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKINNING_GUARD_FRAMES, SKINNING_GUARD_MAX_WATCH, SkinningGuard } from './SkinningGuard';
import { findBone } from './boneLookup';
import { makeSkinnedStage, type SkinnedStage } from '../../../tests/helpers/skinnedBody';

let st: SkinnedStage, err: ReturnType<typeof vi.spyOn>;
let n = 0;
const id = (): string => `char_t${++n}`;
/** Arm the guard on the stage's body with an advancing playhead (or a parked / absent one). */
function arm(opts: { playing?: () => boolean; frame?: () => number | undefined } = {}): string {
  const who = id(), frame = opts.frame ?? (() => st.scene.getFrameId());
  SkinningGuard.verify(st.scene, who, st.meshes, st.skeleton, opts.playing ?? (() => true), frame as () => number);
  return who;
}
const stalled = (): boolean => err.mock.calls.some((c: unknown[]) => String(c[0]).includes('SKINNING STALL'));

beforeEach(() => { SkinningGuard.reset(); st = makeSkinnedStage(); err = vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'debug').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); st.dispose(); });

describe('SkinningGuard: the harness is the engine (CONTROLS)', () => {
  it('a drawn body\'s bones follow its animated nodes, an undrawn one\'s do not', () => {
    const bone = findBone(st.skeleton, 'LeftArm')!;   // (the one way to find a bone: boneLookup; gate0-rig-tests bans the exact-match find)
    st.run(2, 0.6);
    const a = bone.getWorldMatrix().clone();
    st.run(20, 0.6, 2);
    expect(bone.getWorldMatrix().equalsWithEpsilon(a, 1e-3), 'a drawn body moves').toBe(false);
    st.placeOutOfFrame();
    st.run(2, 0.6, 22);
    const b = bone.getWorldMatrix().clone();
    st.run(20, 0.6, 24);
    expect(bone.getWorldMatrix().equalsWithEpsilon(b, 1e-3), 'an undrawn body\'s bones are not prepared: they stay').toBe(true);
    expect(st.scene.getActiveMeshes().indexOf(st.mesh)).toBe(-1);
  });
});

describe('SkinningGuard: no false alarm', () => {
  it('a healthy drawn body is left on the GPU', () => {
    arm(); st.run(SKINNING_GUARD_FRAMES + 20, 0.5);
    expect(stalled()).toBe(false);
    expect(st.mesh.computeBonesUsingShaders).toBe(true);
  });

  it('a near-still idle (a breath: the clip advances, no node moves past a hair) is not a stall (the char_65 reading of the report)', () => {
    arm(); st.run(SKINNING_GUARD_FRAMES + 20, 2e-4);
    expect(stalled()).toBe(false);
    expect(st.mesh.computeBonesUsingShaders).toBe(true);
  });

  it('a body nobody drew (past the frame of a portrait phone) is not judged — char_65 itself', () => {
    arm(); st.placeOutOfFrame();
    st.run(SKINNING_GUARD_FRAMES + 60, 0.5);      // the clip animates its nodes the whole time; its bones cannot move
    expect(stalled()).toBe(false);
    expect(st.mesh.computeBonesUsingShaders).toBe(true);
  });

  it('a seat nobody is in (the body is disabled) is not judged either', () => {
    arm(); st.hide();
    st.run(SKINNING_GUARD_FRAMES + 60, 0.5);
    expect(stalled()).toBe(false);
    expect(st.mesh.computeBonesUsingShaders).toBe(true);
  });

  it('a body that comes into view later is judged then, and a healthy one passes', () => {
    arm(); st.placeOutOfFrame();
    let f = st.run(100, 0.5);
    st.placeInFrame();
    st.run(SKINNING_GUARD_FRAMES + 20, 0.5, f);
    expect(stalled()).toBe(false);
    expect(st.mesh.computeBonesUsingShaders).toBe(true);
  });

  it('a held pose (the playhead parked: a KO, a victory freeze) and a clip that is not playing are not stalls', () => {
    arm({ frame: () => 12 }); st.scene.skeletonsEnabled = false;
    st.run(SKINNING_GUARD_FRAMES + 20, 0.5);
    expect(stalled()).toBe(false);
    st.dispose(); st = makeSkinnedStage(); err = vi.spyOn(console, 'error').mockImplementation(() => {});
    arm({ playing: () => false }); st.scene.skeletonsEnabled = false;
    st.run(SKINNING_GUARD_FRAMES + 20, 0.5);
    expect(stalled()).toBe(false);
  });

  it('stops watching a body nobody ever draws (no observer is kept for it past the cap)', async () => {
    const before = st.scene.onAfterRenderObservable.observers.length;
    arm(); st.hide();
    expect(st.scene.onAfterRenderObservable.observers.length).toBe(before + 1);
    st.run(SKINNING_GUARD_MAX_WATCH + 5, 0.5);
    await new Promise((r) => setTimeout(r, 5));   // (Babylon unregisters an observer removed during a notify on the next tick)
    expect(st.scene.onAfterRenderObservable.observers.length).toBe(before);
    expect(stalled()).toBe(false);
  }, 60_000);
});

describe('SkinningGuard: a REAL stall is still caught, and falls back to CPU skinning', () => {
  it('a drawn body whose clip is advancing and whose nodes move, but whose skeleton never follows', () => {
    arm(); st.scene.skeletonsEnabled = false;      // the mesh is drawn, the nodes animate, the skeleton is never prepared
    st.run(SKINNING_GUARD_FRAMES + 20, 0.5);
    expect(stalled()).toBe(true);
    expect(st.mesh.computeBonesUsingShaders).toBe(false);
    expect(String(err.mock.calls.find((c: unknown[]) => String(c[0]).includes('SKINNING STALL'))![0])).toContain('DRAWN frames');
  });

  it('is judged on the frames it was DRAWN: 30 drawn frames after a long absence say nothing, 50 do', () => {
    arm(); st.scene.skeletonsEnabled = false; st.placeOutOfFrame();
    let f = st.run(200, 0.5);                       // two hundred frames nobody saw: not 45 of anything that counts
    expect(stalled()).toBe(false);
    st.placeInFrame();
    f = st.run(30, 0.5, f);
    expect(stalled()).toBe(false);
    st.run(30, 0.5, f);
    expect(stalled()).toBe(true);
    expect(st.mesh.computeBonesUsingShaders).toBe(false);
  });

  it('names the body once', () => {
    const who = id();
    SkinningGuard.verify(st.scene, who, st.meshes, st.skeleton, () => true, () => st.scene.getFrameId());
    SkinningGuard.verify(st.scene, who, st.meshes, st.skeleton, () => true, () => st.scene.getFrameId());
    st.scene.skeletonsEnabled = false;
    st.run(SKINNING_GUARD_FRAMES + 20, 0.5);
    expect(err.mock.calls.filter((c: unknown[]) => String(c[0]).includes('SKINNING STALL')).length).toBe(1);
  });
});
