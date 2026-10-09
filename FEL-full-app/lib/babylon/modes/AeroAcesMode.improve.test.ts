// IMPROVE (2026-10-06): Aero Aces' owner-picked items that live in the mode's wiring and its host (the rules are tested
// in aeroAcesRules.test.ts, the windowed locate in racing/lineWindow.test.ts, the planes' paint, primitives, instancing
// and LOD in racing/toyPlane.improve.test.ts). The mode needs a scene, a pilot GLB and a world to run, so these pin the
// wiring in the source — each names the regression it stops coming back.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { stripComments } from '@/lib/testing/sourceScan';

const SRC = stripComments(readFileSync(resolve(__dirname, 'AeroAcesMode.ts'), 'utf-8'));
const HOST = stripComments(readFileSync(resolve(__dirname, '../../../components/games/aero-aces-babylon.tsx'), 'utf-8'));
const DRIVER = stripComments(readFileSync(resolve(__dirname, '../racing/RivalDriver.ts'), 'utf-8'));
const RAW = readFileSync(resolve(__dirname, 'AeroAcesMode.ts'), 'utf-8');
/** The per-frame body: update() up to dispose(). */
const UPDATE = SRC.slice(SRC.indexOf('update(ctx: ModeContext, dt: number): void {'), SRC.indexOf('dispose(): void {'));

describe('AeroAcesMode wiring (IMPROVE 2026-10-06)', () => {
  it('#1 the ghost: loaded per circuit, recorded through the race, saved only if faster, flown and the delta shown', () => {
    expect(SRC).toContain('loadGhost(aeroGhostKey(circuit.course.id))');
    expect(SRC).toMatch(/ghostRec\.sample\(\{/);
    expect(SRC).toMatch(/saveIfFaster\(g\)/);
    expect(SRC).toMatch(/ghostAtTime\(ghostBest, race\.time \* 1000\)/);
    expect(SRC).toMatch(/deltaMs\(ghostBest, raceProgress\(/);
    expect(HOST).toContain('hud.pb');
  });
  it('#2 a rival\'s balloon is weighted by its own place, not drawn uniformly', () => {
    expect(UPDATE).toMatch(/weightedItemKind\(racerPlace\(r\.dist, pDist, rivals, i\), rivals\.length \+ 1, Math\.random\)/);
    expect(SRC).not.toMatch(/ITEM_KINDS\[Math\.floor\(Math\.random\(\)/);
  });
  it('#3 the missile warning is computed every frame and drawn on its side with the roll cue', () => {
    expect(UPDATE).toContain('S.threat = incomingThreat(missiles, PLAYER_ID, flight.pos, flight.heading, flight.speed)');
    expect(HOST).toContain('hud.threatSide');
    expect(HOST).toContain('hud.threatRoll');
  });
  it('#4 one ranked banner: no raw slot writes, the fire warning and WRONG WAY outrank the chatter, the result outranks all', () => {
    expect(SRC).not.toMatch(/S\.banner\s*=|S\.bannerT/);
    expect(SRC).toContain('new BannerSlot()');
    expect(SRC).toMatch(/FIRED — ROLL TO DODGE`, 0\.9, BANNER_PRIO\.threat\)/);
    expect(SRC).toMatch(/say\('WRONG WAY', 0\.8, BANNER_PRIO\.threat\)/);
    expect(SRC).toMatch(/OUT OF TIME — \$\{ordinal\(place\)\}`, 2\.4, BANNER_PRIO\.final\)/);
    expect(SRC).toMatch(/say\(`BUMPED \$\{r\.name\}`, 0\.5\)/);   // chatter stays at the bottom rank
  });
  it('#5 the host draws shield, speed, slipstream and the next ring', () => {
    for (const f of ['hud.shield', 'hud.speed', 'hud.draft', 'hud.toGate']) expect(HOST).toContain(f);
  });
  it('#6 the course strip: the outline sent once, the dots with the HUD, the host draws it', () => {
    expect(SRC).toContain('ctx.setHud({ mapPath: mapPath(circuit.line, frame) })');
    expect(SRC).toMatch(/hud\.mapMe = /);
    expect(SRC).toMatch(/hud\.mapField = /);
    expect(HOST).toContain('<CourseMap hud={hud} />');
  });
  it('#7 RIVAL_PACE and its comment agree, with the re-measurement under phase 5', () => {
    expect(SRC).toMatch(/const RIVAL_PACE = 1\.10;/);
    expect(RAW).toMatch(/1\.10 \(BOARD-RACE W5[\s\S]*RE-MEASURED UNDER PHASE 5[\s\S]*const RIVAL_PACE = 1\.10;/);
  });
  it('#8 the score is aeroScore — place, bananas, stunts, the best chain, the medal — and the best chain resets per race', () => {
    expect(SRC).toMatch(/const sc = aeroScore\(\{ place, finished: race\.finished, bananas: S\.bananas, stunts: S\.stunts, bestChain: S\.bestChain, medal \}\)/);
    expect(SRC).toMatch(/sc\.total, \{/);
    expect(SRC).not.toMatch(/placePts \+ S\.bananas \* 10/);
    expect(SRC).toMatch(/chain: emptyChain\(\), hug: noHug\(\), bestChain: 0,/);
  });
  it('#9 the neutral-stick roll no longer alternates on the stunt count', () => {
    expect(SRC).not.toMatch(/S\.stunts % 2/);
    expect(SRC).toContain('neutralRoll(S.threat?.lateral ?? alongsideLateral())');
  });
  it('#10 wrong way / no progress runs the recovery net and the respawn sweeps nothing', () => {
    expect(UPDATE).toMatch(/stepRecover\(S\.recover, dt, \{ wrongWay: backwards, dist: playerDist\(\), exempt: !!flight\.stunt \|\| flight\.spinT > 0 \}\)/);
    expect(UPDATE).toMatch(/if \(rc\.respawn\) \{[\s\S]*prevPos\.copyFrom\(flight\.pos\);[\s\S]*ctx\.camDirector\.snapTo/);
  });
  it('#11 the flyover runs before the beats, as an authored (suspended) shot, and A or X skips it', () => {
    expect(UPDATE).toMatch(/flyoverPose\(circuit\.line, fly\.t\)/);
    expect(UPDATE).toContain('ctx.camDirector.suspended = true');
    expect(UPDATE).toMatch(/fly\.on \? \{ state: S\.start, beatChanged: false, wentGo: false \} : stepStart\(/);
    expect(SRC).toMatch(/if \(fly\.on && e\.t === 'button' && e\.pressed && \(e\.btn === 'A' \|\| e\.btn === 'X'\)\) \{ endFlyover\(ctx\)/);
    expect(SRC).toMatch(/ctx\.camDirector\.suspended = false;/);
  });
  it('#12 #13 the player\'s place on the line is fixed once a frame (windowed) and the field\'s driver windows too', () => {
    expect(UPDATE.match(/locate\(circuit\.line/g) ?? []).toHaveLength(0);
    expect((UPDATE.match(/fixPlayer\(\)/g) ?? []).length).toBeLessThanOrEqual(2);   // the frame's fix, and a respawn's
    expect(SRC).toMatch(/if \(distMemo === null\) fixPlayer\(\);/);
    expect(SRC).toMatch(/gapLine\(gaps\(\), flight\.speed\)/);
    expect(DRIVER).toMatch(/locateNear\(line, x, z, fix\)/);
  });
  it('#14 the HUD is gated: a discrete change at once, the rest at 10 Hz, and the frame loop passes dt', () => {
    expect(SRC).toMatch(/if \(!force && !hudDue\(hudKey, key, hudSince\)\) return;/);
    expect(UPDATE).toMatch(/pushHud\(ctx, dt\);\s*\},?\s*$/);
  });
  it('#15 no per-frame list building in the field step', () => {
    expect(UPDATE).not.toMatch(/rivals\.filter\(/);
    expect(UPDATE).not.toMatch(/rivalKits\.map\(/);
    expect(UPDATE).not.toMatch(/rivals\.map\(/);
    expect(UPDATE).not.toMatch(/const targets: Target\[\] = \[/);
  });
  it('#16 #17 #20 the primitives are dropped when a body is on; the field wears the instanced LOD body', () => {
    expect(SRC).toMatch(/pl\.dropPrimitives\(\)/);
    expect(SRC).toMatch(/dressVehicle\(scene, rp\.root, 'plane', 'rival', \{ hide: rp\.parts, lod: true, instance: true \}\)[^\n]*rp\.dropPrimitives\(\)/);
  });
  it('#19 the world and the pilot load together, the identity still before the spawn', () => {
    expect(SRC).toMatch(/await Promise\.allSettled\(\[\s*buildAeroWorld\(ctx\.scene, circuit\),\s*resolveRaceIdentity\(\)\.then\(\(\) => CharacterLibrary\.spawn\(/);
    expect(SRC).not.toMatch(/world = await buildAeroWorld/);
  });
});
