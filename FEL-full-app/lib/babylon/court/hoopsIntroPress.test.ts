// hoops-play (2026-11-21): the press that skips the hoops broadcast intro starts play on the next frame (knob hoops.introPressPlaysOn).
// Before, the game waited out the camera's whole hand-over (INTRO.skipSec) after the press: the first stick press of every 1v1 / 3v3
// game moved the player after 383 ms (rig, three seeds; later presses 33 ms). These run the REAL CameraDirector and the real broadcast
// hook, with a stand-in mode that steps the camera itself once it is playing (as OneVOneMode / ThreeVThreeMode do).
import { afterEach, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { CameraDirector } from '../core/CameraDirector';
import { MomentumBus } from '../core/MomentumBus';
import type { ModeContext } from '../core/ModeHarness';
import { INTRO, introSec } from '../scene/broadcastShots';
import { mountHoopsBroadcast, introSkipSeen, INTRO_PRESS_PLAYS_ON } from './mount/hoopsBroadcast';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

const RIM = new Vector3(0, 3.05, 0);
const knob = (v: number): void => { setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.introPressPlaysOn', v); };
afterEach(() => resetFeelForTests());

/** `frames` frames of a mode whose first act is holdIntro; the press (the harness's skipIntro) lands before frame `pressAt` (null: none).
 *  Returns the first frame the mode played and the camera per frame. */
function play(frames: number, pressAt: number | null) {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  const cam = new FreeCamera('cam', new Vector3(0, 3, 14), scene);
  const dir = new CameraDirector(scene, cam, 'gridiron');
  const me = new Vector3(0, 0, 7.2);
  dir.snapTo(me, RIM);
  expect(dir.establish('walkIn')).toBe(true);
  const ctx = { scene, momentum: new MomentumBus(), camDirector: dir, highlight: () => Promise.resolve() } as unknown as ModeContext;
  const b = mountHoopsBroadcast(ctx, { rim: RIM, final: () => false });
  let first: number | null = null; const camAt: Vector3[] = [];
  for (let i = 0; i < frames; i++) {
    if (i === pressAt) dir.skipIntro();
    if (!b.holdIntro(me, RIM)) { if (first === null) first = i; dir.update(me, Vector3.Zero(), RIM); }   // the mode's own camera step
    camAt.push(cam.position.clone());
  }
  b.dispose(); scene.dispose(); engine.dispose();
  return { first, camAt };
}

describe('introSkipSeen (pure)', () => {
  const end = introSec('walkIn');
  it('a closed letterbox is no skip; an opening one before the walk-in tail is', () => {
    expect(introSkipSeen('walkIn', 0.5, 1)).toBe(false);
    expect(introSkipSeen('walkIn', 0.5, 0.98)).toBe(true);
    expect(introSkipSeen('walkIn', end - INTRO.outSec - 0.1, 0.9)).toBe(true);
  });
  it('the intro\'s own tail (the letterbox opening by itself) is not a skip', () => {
    expect(introSkipSeen('walkIn', end - INTRO.outSec + 0.05, 0.9)).toBe(false);
    expect(introSkipSeen('walkIn', end - 0.01, 0.02)).toBe(false);
  });
});

describe('the press that skips the intro starts play (hoops.introPressPlaysOn)', () => {
  const N = Math.ceil(introSec('walkIn') * 60) + 30;
  it('ships on', () => { expect(INTRO_PRESS_PLAYS_ON).toBe(1); });
  it('on: the mode plays two frames after the press (the skip is seen after the frame\'s own camera step)', () => {
    knob(1);
    const r = play(N, 40);
    expect(r.first).toBe(41);
  });
  it('off: the mode waits out the hand-over, as before (INTRO.skipSec after the press)', () => {
    knob(0);
    const r = play(N, 40);
    expect(r.first).toBeGreaterThanOrEqual(40 + Math.floor(INTRO.skipSec * 60) - 1);
    expect(r.first).toBeLessThanOrEqual(40 + Math.ceil(INTRO.skipSec * 60) + 2);
  });
  it('the camera eases in exactly as before: frame for frame the same with the knob on and off', () => {
    knob(1); const on = play(N, 40);
    knob(0); const off = play(N, 40);
    for (let i = 0; i < N; i++) expect(Vector3.Distance(on.camAt[i], off.camAt[i])).toBeLessThan(1e-9);
  });
  it('with no press the intro plays out and holds the mode to its end, on or off', () => {
    knob(1); const on = play(N, null);
    knob(0); const off = play(N, null);
    expect(on.first).toBe(off.first);
    expect(on.first).toBeGreaterThanOrEqual(Math.floor(introSec('walkIn') * 60) - 2);
  });
});
