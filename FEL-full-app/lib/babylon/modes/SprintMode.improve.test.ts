// IMPROVE (2026-10-06): Sprint's owner-picked items that live in the mode's wiring and its host (the rules are tested in
// sprintRules.test.ts, the core's changes in lib/feel/cores/sprint-core.improve.test.ts). The mode needs a scene and
// bodies to run, so these pin the wiring in the source — each names the regression it stops coming back.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = readFileSync(resolve(__dirname, 'SprintMode.ts'), 'utf-8');
const HOST = readFileSync(resolve(__dirname, '../../../components/games/sprint-babylon.tsx'), 'utf-8');
const VENUE = readFileSync(resolve(__dirname, '../visual/VenueKit.ts'), 'utf-8');
const strip = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
const code = strip(SRC);

describe('SprintMode wiring (IMPROVE 2026-10-06)', () => {
  it('#1 #5 the core is built with a random SET hold and its sounds wired (the gun is the start, not the whistle)', () => {
    expect(code).toMatch(/makeSprintRace\(undefined, \{\s*setHoldMs: \(\) => randomSetHoldMs\(\),\s*onSensory: playSensory,/);
    expect(code).not.toMatch(/phase === 'Go'\) \{[^\n]*SoundKit\.play\('whistle'\)/);
    expect(code).toContain('e === SPRINT_SENSORY.perfectStep');
    expect(code).toContain('e === SPRINT_SENSORY.gun');
  });
  it('#2 an off-beat stride is told which way to correct', () => {
    expect(code).toContain('cadenceCall(core.lastErrorMs)');
  });
  it('#3 #4 #8 #10 the host draws the metronome, the hint, the false starts, the pacer gap and the sub-13 gap', () => {
    expect(HOST).toContain('<SprintMetronome');
    expect(HOST).toContain('hud.hint');
    expect(HOST).toContain('hud.falseStarts');
    expect(HOST).toContain('hud.gap');
    expect(HOST).toContain('hud.sub13');
    expect(code).toMatch(/gap: raced \? gapLabel\(dist - S\.rivalDist\) : null/);
  });
  it('#6 the rival runs the pacer curve, not a constant speed', () => {
    expect(code).not.toMatch(/const RIVAL_SPEED|RIVAL_SPEED \* dt/);
    expect(code).toContain('S.rivalDist = pacerDistance(S.rivalT, RIVAL_TIME_S, RACE_DIST);');
  });
  it('#7 the tape starts a run-out and the result waits for it (update no longer returns dead on S.done)', () => {
    expect(code).toContain('if (S.done) { if (S.runout !== null) runOut(ctx, dt); return; }');
    expect(code).toContain('S.pendingEnd = () => ctx.end(outcome, score, stats);');
    expect(code).not.toMatch(/function finish\([^)]*\): void \{[^}]*ctx\.end\(won/);
  });
  it('#9 #10 PB splits and the PB marker; the pace light runs a WIN_TIME race', () => {
    expect(code).toContain('saveSprintPbIfFaster(RACE_DIST,');
    expect(code).toContain('pbDistanceAt(S.pb, S.rivalT * 1000)');
    expect(code).toContain('pacerDistance(S.rivalT, WIN_TIME, RACE_DIST)');
  });
  it('#11 DIP NOW is called when the window opens; #12 repeat false starts cost time', () => {
    expect(code).toMatch(/RACE_DIST - st\.distanceM <= DIP_WINDOW_M\) \{\s*S\.dipCalled = true;/);
    expect(code).toContain('+ falseStartPenaltyS(core?.state.falseStarts ?? 0)');
  });
  it('#13 a speed FOV kick, on the mode\'s own lens', () => {
    expect(code).toContain('stepSpeedFov(S.fov ?? S.baseFov, S.baseFov, speed, SPRINT_TUNING.maxSpeed, dt, { gain: SPRINT_FOV_GAIN })');
  });
  it('#14 the HUD is gated (no unconditional push every frame)', () => {
    expect(code).toContain('if (!force && !hudDue(S.hudKey, key, S.hudAge)) return;');
    expect(code).not.toMatch(/pushHud\(ctx\);/);
  });
  it('#16 #18 one merged tick mesh on one material, and dispose releases ticks, materials and finishMat', () => {
    expect(code).not.toContain('`laneMat_${m}`');
    expect(code).toContain('Mesh.MergeMeshes(tickList, true, true');
    for (const s of ['ticks?.dispose()', 'tickMat?.dispose()', 'finishMat?.dispose()', 'paceLight?.dispose()', 'pbMarker?.dispose()']) expect(code).toContain(s);
  });
  it('#17 the straight is a repeated tile with two painted ends, not one ~256 × 3333 canvas', () => {
    expect(strip(VENUE)).not.toContain('th = Math.round(256 * len / width)');
    expect(strip(VENUE)).toContain('paintTrackTile(ctx, W, H,');
    expect(strip(VENUE)).toContain('trackTex.wrapV = Texture.WRAP_ADDRESSMODE');
  });
  it('#19 runner and rival spawn in parallel; #20 the camera velocity is a scratch vector', () => {
    expect(code).toMatch(/\[runner, rival\] = await Promise\.all\(\[/);
    expect(code).not.toContain('new Vector3(0, 0, -st.speed)');
    expect(code).toContain('camVel.set(0, 0, -speed)');
  });
});
