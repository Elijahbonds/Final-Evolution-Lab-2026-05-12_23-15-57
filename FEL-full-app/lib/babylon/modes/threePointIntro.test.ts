// 3-Point's broadcast intro (owner, 2026-10-14): the 60 s clock waits for it; any press skips it; reduced motion has none.
// The hold runs on the REAL CameraDirector (NullEngine, 60 fps), stepped the way the mode's update steps it; the mode's
// wiring (its one-line hooks) is read off the source, as the other 3-Point wiring tests do.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { CameraDirector } from '../core/CameraDirector';
import { INTRO, introSec } from '../scene/broadcastShots';
import { THREE_POINT_INTRO, holdForIntro } from './threePointIntro';

afterEach(() => vi.unstubAllGlobals());

const GAME_LEN = 60;   // ThreePointMode's (module-private): the length is not this pass's, only the start
const DT = 1 / 60;
const RIM = new Vector3(0, 3.05, 13.5);

/**
 * A shootout's opening `frames` frames, the way ThreePointMode.update runs them: the hold first; if it holds, the frame
 * ends there; otherwise the clock ticks and the play camera follows. `press(i)` = the harness's skip on that frame.
 * Returns the clock after each frame and whether the intro was on screen.
 */
function opening(frames: number, opts: { press?: number } = {}) {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  const cam = new FreeCamera('cam', new Vector3(0, 3, -8), scene);
  const dir = new CameraDirector(scene, cam, 'hoops');
  const shooter = new Vector3(-6.7, 0, 1.1);
  dir.snapTo(shooter, RIM);
  const armed = dir.establish(THREE_POINT_INTRO);   // the harness, on the wake
  let clock = GAME_LEN;
  const out: { clock: number; intro: boolean }[] = [];
  for (let i = 0; i < frames; i++) {
    if (i === opts.press && dir.inIntro) dir.skipIntro();
    if (!holdForIntro(dir, shooter, RIM)) {
      clock -= DT;
      dir.update(shooter, Vector3.Zero(), RIM);
    }
    out.push({ clock, intro: dir.inIntro });
  }
  scene.dispose(); engine.dispose();
  return { armed, out };
}

const INTRO_FRAMES = Math.ceil(introSec(THREE_POINT_INTRO) * 60);

describe("3-Point's broadcast intro holds the clock", () => {
  it('the clock does not tick while the intro is on screen, and runs from the frame it ends', () => {
    const { armed, out } = opening(INTRO_FRAMES + 120);
    expect(armed).toBe(true);
    const lastIntro = out.map((f) => f.intro).lastIndexOf(true);
    expect(lastIntro).toBeGreaterThan(INTRO_FRAMES - 10);          // the whole crane and the player shot played
    // the frame the intro ends on is the intro's too (the hold stepped the director into play on it)
    for (let i = 0; i <= lastIntro + 1; i++) expect(out[i].clock).toBe(GAME_LEN);
    // from the next frame on, a full 60 s clock, a frame a frame: nothing of it was spent on the crane
    expect(out[lastIntro + 2].clock).toBeCloseTo(GAME_LEN - DT, 6);
    const ticked = out.length - 2 - lastIntro;
    expect(out[out.length - 1].clock).toBeCloseTo(GAME_LEN - ticked * DT, 6);
  });

  it('a press skips it: the clock starts once the skip has eased into the play camera (INTRO.skipSec), not at the end of the crane', () => {
    const PRESS = 20;
    const { out } = opening(INTRO_FRAMES + 60, { press: PRESS });
    const lastIntro = out.map((f) => f.intro).lastIndexOf(true);
    expect(lastIntro).toBeGreaterThanOrEqual(PRESS);
    expect(lastIntro).toBeLessThanOrEqual(PRESS + Math.ceil(INTRO.skipSec * 60) + 1);
    expect(out[lastIntro + 1].clock).toBe(GAME_LEN);
    expect(out[lastIntro + 2].clock).toBeCloseTo(GAME_LEN - DT, 6);
    expect(out[out.length - 1].clock).toBeCloseTo(GAME_LEN - (out.length - 2 - lastIntro) * DT, 6);
  });

  it('reduced motion: no intro, the clock runs from the first frame as before', () => {
    vi.stubGlobal('window', { location: { search: '?motion=reduce' }, addEventListener() {}, removeEventListener() {} });
    const { armed, out } = opening(30);
    expect(armed).toBe(false);
    expect(out.every((f) => !f.intro)).toBe(true);
    expect(out[0].clock).toBeCloseTo(GAME_LEN - DT, 6);
    expect(out[29].clock).toBeCloseTo(GAME_LEN - 30 * DT, 6);
  });

  it('with no intro the hold never holds (and never touches the camera)', () => {
    let updates = 0;
    expect(holdForIntro({ inIntro: false, update: () => { updates++; } }, Vector3.Zero(), RIM)).toBe(false);
    expect(updates).toBe(0);
    expect(holdForIntro({ inIntro: true, update: () => { updates++; } }, Vector3.Zero(), RIM)).toBe(true);
    expect(updates).toBe(1);   // under the intro the director is stepped (it drives the crane) by the hold itself
  });
});

describe('the mode wires it with one-line hooks', () => {
  const mode = readFileSync('lib/babylon/modes/ThreePointMode.ts', 'utf8');
  const update = mode.slice(mode.indexOf('  update(ctx: ModeContext, dt: number): void {'));
  const onInput = mode.slice(mode.indexOf('  onInput(ctx: ModeContext, e: FelInput): void {'));
  const onBody = mode.slice(mode.indexOf('  onBody(ctx: ModeContext, ev: BodyEvent'));

  it('the definition opens on the intro', () => {
    expect(mode).toMatch(/\n  intro: THREE_POINT_INTRO,/);
    expect(THREE_POINT_INTRO).toBe('walkIn');
  });

  it('update holds before the clock ticks, and returns', () => {
    const hold = update.indexOf('if (holdForIntro(ctx.camDirector, player.root.position, RIM)) {');
    expect(hold).toBeGreaterThan(0);
    expect(update.slice(hold, update.indexOf('\n', hold))).toMatch(/return; \}/);
    expect(hold).toBeLessThan(update.indexOf('S.clock -= dt;'));
    expect(hold).toBeLessThan(update.indexOf('stepFlights(ctx, dt);'));
  });

  it('the press that skips the intro is never a shot (input and body)', () => {
    expect(onInput.split('\n')[1]).toMatch(/^\s+if \(ctx\.camDirector\.inIntro\) return;/);
    expect(onBody.split('\n')[1]).toMatch(/^\s+if \(ctx\.camDirector\.inIntro\) return false;/);
  });

  it('the #220 corner camera and the trees\' fade are untouched; the helper imports nothing from scoring or judging', () => {
    expect(mode).toMatch(/widenCamBounds\(ctx\.camDirector\);/);
    expect(mode).toMatch(/ctx\.camDirector\.update\(player\.root\.position, S\.vel, RIM\);\n\s+updateFadeLeaves\(ctx, dt\);/);
    const helper = readFileSync('lib/babylon/modes/threePointIntro.ts', 'utf8');
    const imports = helper.split('\n').filter((l) => /^import /.test(l));
    expect(imports.every((l) => /'@babylonjs\/core'|'\.\.\/scene\/broadcastShots'/.test(l))).toBe(true);
  });
});
