// IMPROVE (2026-10-06): Velocity Kart's owner-picked items that live in the mode's wiring and its host. The rules are
// tested in kartRules.test.ts, the shortcut / variants / merged kerbs in racing/kartCircuits.improve.test.ts, the field's
// windowed fix in racing/RivalDriver.kartWindow.test.ts, the sparks in racing/speedFx.sparks.test.ts, and the scene's
// draws / casters / bodies in VelocityKartMode.census.test.ts. The mode needs a scene and a world to run, so these pin the
// wiring in the source — each names the regression it stops coming back.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { stripComments } from '@/lib/testing/sourceScan';

const SRC = stripComments(readFileSync(resolve(__dirname, 'VelocityKartMode.ts'), 'utf-8'));
const HOST = stripComments(readFileSync(resolve(__dirname, '../../../components/games/velocity-kart-babylon.tsx'), 'utf-8'));
const SPLASH = stripComments(readFileSync(resolve(__dirname, '../../../components/games/boot-splash.tsx'), 'utf-8'));
const UPDATE = SRC.slice(SRC.indexOf('update(ctx: ModeContext, dt: number): void {'), SRC.indexOf('dispose(): void {'));
const FIELD = SRC.slice(SRC.indexOf('function tickField('), SRC.indexOf('function fillLanes('));

describe('VelocityKartMode wiring (IMPROVE 2026-10-06)', () => {
  it('#1 #14 on-road is the painted half-width off the frame\'s fix — no default-width onTrack, no distToTrack walk a frame', () => {
    expect(UPDATE).toMatch(/onRoad = circuit && f0 \? onRoadByFix\(f0, state\.pos\.x, state\.pos\.z\) \|\| !!cut0 : onTrack\(state\.pos, course\)/);
    expect(SRC).toMatch(/Math\.hypot\(x - f\.point\.x, z - f\.point\.z\) <= circuit\.halfWidth/);
    expect(SRC.match(/onTrack\(/g)?.length).toBe(1);   // the circuit-less fallback only
    expect(SRC).not.toMatch(/onTrack\(state\.pos, course\)\s*\|\|/);
  });

  it('#2 the host draws the delta, the PB chased, the cup, the way back to the road, the shield and the draft', () => {
    for (const k of ['hud.delta', 'hud.chasing', 'hud.cup', 'hud.trackCue', 'hud.draft', 'hud.shield']) expect(HOST).toContain(k);
  });

  it('#3 the ghost kart is built from the best race, driven by its clock, recorded with yaw', () => {
    expect(SRC).toMatch(/ghostMesh = bestGhost \? buildGhostKart\(ctx\) : null/);
    expect(UPDATE).toMatch(/ghostAtTime\(bestGhost, race\.time \* 1000\)/);
    expect(UPDATE).toMatch(/yaw: Math\.round\(state\.heading \* 100\) \/ 100/);
    expect(SRC).toMatch(/'__kart_ghost'/);   // off the caster list
  });

  it('#4 the race pays kartScore (place + clock), not the clock alone', () => {
    expect(SRC).toMatch(/const sc = kartScore\(\{ finished: race\.finished, place, timeSec: race\.time, goldSec: course\.gold \}\)/);
    expect(SRC).not.toMatch(/Math\.round\(Math\.max\(0, course\.gold \* 2 - race\.time\) \* 10\)/);
  });

  it('#5 a rival\'s item is weighted by its own place', () => {
    expect(FIELD).toMatch(/weightedItemKind\(racerPlace\(r\.dist, playerDist, rivals, i\), rivals\.length \+ 1, Math\.random\)/);
    expect(SRC).not.toMatch(/ITEM_KINDS\[Math\.floor\(Math\.random\(\)/);
  });

  it('#6 the incoming shell is computed each frame and drawn on its side with the hop cue', () => {
    expect(FIELD).toMatch(/threat = S\.done \? null : incomingThreat\(missiles, PLAYER_ID, state\.pos, state\.heading, state\.speed\)/);
    expect(HOST).toMatch(/<ThreatWarning words=\{hud\.threat\} side=\{hud\.threatSide\} now=\{!!hud\.threatHop\}/);
  });

  it('#7 X on the ground hops, and a hopping kart\'s hit point is lifted clear', () => {
    expect(SRC).toMatch(/tryHop\(hop, !S\.air\.airborne, state\.speed\)/);
    expect(SRC).toMatch(/state\.pos\.y \+ 0\.6 \+ \(hopClear\(hop\) \? HOP\.clearLift : 0\)/);
    expect(UPDATE).toMatch(/KART_RIDE_Y \+ bob \+ hopY/);
  });

  it('#8 the shortcut is road, slides, is never pulled back from, and nothing stands on it', () => {
    expect(UPDATE).toMatch(/const pull = cut \? 0 : edgeReturn\(/);
    expect(UPDATE).toMatch(/looseSlip\(state\.steerAt, dt\)/);
    expect(UPDATE).toMatch(/const roadY = onCut \? onCut\.y : at\.point\.y/);
    expect(SRC).toMatch(/buildTrackside\(ctx\.scene, course, c && c\.shortcuts\.length \? \(x, z\) => clearOfShortcuts\(c, x, z, SHORTCUT_CLEAR\)/);
  });

  it('#9 the map: outline once, dots at the HUD\'s rate, drawn by the shared component', () => {
    expect(SRC).toMatch(/ctx\.setHud\(\{ mapPath: mapOutline, mapCut \}\)/);
    expect(SRC).toMatch(/hud\.mapMe = /);
    expect(HOST).toContain('<RaceCourseMap hud={hud}');
  });

  it('#11 the banner is ranked: a shell fired at you and WRONG WAY are threats, a checkpoint or a bump is info', () => {
    expect(SRC).toMatch(/FIRED — HOP OR SWERVE`, 0\.9, BANNER_PRIO\.threat\)/);
    expect(SRC).toMatch(/say\('WRONG WAY', 0\.8, BANNER_PRIO\.threat\)/);
    expect(SRC).toMatch(/'CHECKPOINT', finalLap \? 1\.2 : 0\.7, res\.lap \? BANNER_PRIO\.event : BANNER_PRIO\.info\)/);
    expect(SRC).toMatch(/say\(`BUMPED \$\{r\.name\}`, 0\.5\)/);
    expect(SRC).not.toMatch(/S\.banner\b/);
  });

  it('#12 the variant is read at mount; the splash offers GP and MIRROR and reloads', () => {
    expect(SRC).toMatch(/circuit = kartCircuitVariant\(course\.id, variant\) \?\? kartCircuitById\(course\.id\)/);
    expect(SRC).toMatch(/ghostKey = kartGhostKey\(course\.id, vKey\)/);
    expect(SRC).toMatch(/if \(cup && race\.finished && !vKey\)/);
    expect(SPLASH).toMatch(/GRAND PRIX · 3 LAPS/);
    expect(SPLASH).toMatch(/u\.searchParams\.set\('mirror'/);
  });

  it('#13 one windowed fix for the player per step; the field, the shells and the camera read fixes too', () => {
    expect(UPDATE).not.toMatch(/locate\(circuit\.line, state\.pos\.x, state\.pos\.z\)/);
    expect(UPDATE).toMatch(/playerDist = lapProgress\(playerFix\.dist,/);
    expect(FIELD).not.toMatch(/locate\(/);
    expect(FIELD).toMatch(/surfaceFromFix\(drv\.fix, circuit\.halfWidth\)/);
    expect(FIELD).toMatch(/surfaceFromFix\(locateNear\(circuit\.line, m\.pos\.x, m\.pos\.z, f\), circuit\.halfWidth\)/);
    expect(SRC).toMatch(/groundAt: circ \? \(x, z\) => Math\.max\(surfaceFromFix\(locateNear\(circ\.line, x, z, camFix\)/);
  });

  it('#15 the sparks and the grid revving are persistent emitters, not a burst per frame', () => {
    expect(UPDATE).toMatch(/sparks\?\.update\(S\.mini\.tier\)/);
    expect(UPDATE).not.toMatch(/EffectsKit\.burst\(ctx\.scene, state\.pos\.clone\(\), 'sparks', 0\.45/);
    expect(UPDATE).not.toMatch(/EffectsKit\.burst\(ctx\.scene, state\.pos\.clone\(\), 'dust'\);/);
  });

  it('#16 no per-frame spreads or rebuilt lists in the field step', () => {
    expect(FIELD).not.toMatch(/\[\.\.\.missiles, \.\.\.mines\]/);
    expect(FIELD).not.toMatch(/others\.filter\(/);
    expect(FIELD).not.toMatch(/rivals\.map\(\(r\) => \(\{ dist: r\.dist, lateral: r\.lane/);
  });

  it('#17 the HUD is gated: discrete changes at once, the rest at 10 Hz', () => {
    expect(SRC).toMatch(/if \(!force && !hudDue\(hudKey, key, hudSince\)\) return;/);
    expect(UPDATE).toMatch(/pushHud\(ctx, dt\)/);
  });

  it('#18 #19 #20 the field wears one instanced LOD body; primitives and per-rival paint go once it is on', () => {
    expect(SRC).toMatch(/dressVehicle\(ctx\.scene, rk, 'kart', 'rival', \{ hide: prims, y: KART_GROUND_Y, lod: true, instance: true \}\)/);
    expect(SRC).toMatch(/for \(const m of prims\) if \(!m\.isDisposed\(\)\) m\.dispose\(\)/);
    expect(SRC).toMatch(/rivalWheelSets\[i\] = \[\]/);
    expect(SRC).toMatch(/for \(const m of prims\) if \(m !== steerWheel && !m\.isDisposed\(\)\) m\.dispose\(\)/);   // the hands keep their wheel
    expect(SRC).toMatch(/VenueKit\.paint\(ctx\.scene, 'rival_tyre'/);
    expect(FIELD).toMatch(/if \(ws && ws\.length\)/);
  });
});
