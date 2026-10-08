// IMPROVE (2026-10-06): Free Run's owner-picked items that live in the mode's wiring (the rules are tested in
// FreeRunCore / freeRunCourse / FreeRunSplits). The mode needs Havok and a scene to run, so these pin the wiring in the
// source — each one names the regression it stops coming back.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = readFileSync(resolve(__dirname, 'FreeRunMode.ts'), 'utf-8');
const HOST = readFileSync(resolve(__dirname, '../../../components/games/freerun-babylon.tsx'), 'utf-8');
const code = SRC.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('FreeRunMode wiring (IMPROVE 2026-10-06)', () => {
  it('#1 a landing is judged on the rotation spun, and the spin holds at one rotation', () => {
    expect(code).toContain('trickRotationComplete(S.trick, S.trickSpun)');
    expect(code).not.toContain('trickCompletes(S.trick, S.airSec)');
    expect(code).toContain('Math.max(0, trickTotalRad(t) - S.trickSpun)');
  });
  it('#2 an A in the air is buffered and replayed on the landing', () => {
    expect(code).toContain('S.aBufferAt = S.clock;');
    expect(code).toMatch(/S\.clock - S\.aBufferAt <= A_BUFFER_SEC\) \{ S\.aBufferAt = -9; FreeRunMode\.onInput\(ctx, A_PRESS\)/);
  });
  it('#3 the slide release is live (no `&& false`), through slideEnds', () => {
    expect(code).not.toContain('&& false');
    expect(code).toContain('slideEnds(S.slideSec, S.slideByLt, S.ltHeld)');
  });
  it('#4 #5 the pick screen picks the track and rebuilds the preview', () => {
    expect(code).toContain('FREERUN_TRACKS[(i + step + FREERUN_TRACKS.length) % FREERUN_TRACKS.length]');
    expect(code).toMatch(/S\.pickSec = 0;\s*buildCourse\(ctx, S\);/);
  });
  it('#6 one banner channel on the mode clock: no setTimeout clears the banner', () => {
    expect(code).not.toMatch(/setTimeout\(\(\) => ctx\.setHud\(\{ banner/);
    expect(code).toContain('S.bannerUntil = S.clock + ms / 1000');
    expect(code).toContain('tickBanner(ctx, S);');
  });
  it('#7 #8 #9 the trick fill, the gate need and the PB split reach the HUD and the host draws them', () => {
    for (const k of ['trickPct', 'gateReq', 'pbSplit']) { expect(code).toContain(`${k}:`); expect(HOST).toContain(`hud.${k}`); }
  });
  it('#10 coyote and the fov baseline are per scene', () => {
    expect(code).not.toMatch(/^\s*const coyote = new Coyote\(\)/m);
    expect(code).not.toMatch(/^let baseFov/m);
    expect(code).toContain('S.coyote.update(');
  });
  it('#11 #12 steering is a rate, and the ground heading is rate-limited at speed', () => {
    expect(code).not.toMatch(/Vector3\.Lerp\(S\.heading, w, 0\.\d+\)/);
    expect(code).toContain('groundTurnRate(S.speed)');
  });
  it('#13 #15 the course is built once per track and tier, its paint disposed, its static boxes merged and frozen', () => {
    expect(code).toContain('if (S.builtKey === courseKey(S)) return;');
    expect(code).toContain('for (const m of S.mats) m.dispose();');
    expect(code).toContain('Mesh.MergeMeshes(list, false, true, target)');
    expect(code).toContain('freezeWorldMatrix()');
  });
  it('#14 #16 #17 no scene ray picks, no whole-course scans, no per-frame Vector3 in the physics step', () => {
    expect(code).not.toContain('pickWithRay');
    expect(code).not.toContain('courseLength(S.pieces)');
    const update = SRC.slice(SRC.indexOf('update(ctx: ModeContext, dt: number) {'), SRC.indexOf('dispose() {\n      setTimeout'));
    expect(update.length).toBeGreaterThan(5000);
    expect(update).not.toContain('S.pieces.entries()');
    expect(update).not.toContain('S.pieces.some(');
    const step = SRC.slice(SRC.indexOf('── the physics step ──'), SRC.indexOf('cc.integrate(dt, support, V_ZERO)'));
    expect(step.length).toBeGreaterThan(1000);
    expect(step).not.toContain('new Vector3(');
  });
  it('#18 #19 the four bodies spawn in parallel; far rival rigs park', () => {
    expect(code).toContain('await Promise.all([');
    expect(code).toContain('rig.char.animator.park()');
  });
});
