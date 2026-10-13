// vis-race (visual wave 2) — the racing visuals are presentation only, and wired where the brief put them.
// Source scans, in the repo's style (a mode is a module singleton that needs a whole venue to mount): they pin that the visual
// modules import nothing from scoring or judging, that each mode opts into the broadcast kit the way the owner asked
// (intro, replay never on the final moment), and that a press that skips the sprint's intro is never graded as a stride.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(path.resolve(rel), 'utf8');
const sprint = read('lib/babylon/modes/SprintMode.ts');
const kart = read('lib/babylon/modes/VelocityKartMode.ts');
const aero = read('lib/babylon/modes/AeroAcesMode.ts');
const importsOf = (src: string): string[] => [...src.matchAll(/^import[^;]*from\s+'([^']+)'/gm)].map((m) => m[1]);

describe('the racing visual modules import nothing from scoring, judging or the race rules', () => {
  const FORBIDDEN = /feel\/|Rules|score|medal|ghost|championship|RaceField|RaceStart|kartRules|sprintRules|RaceCourse|KartModel/i;
  for (const f of ['raceMoments', 'raceStamp', 'sprintDressing', 'startLights']) {
    it(`${f}.ts`, () => {
      const bad = importsOf(read(`lib/babylon/racing/${f}.ts`)).filter((i) => FORBIDDEN.test(i));
      expect(bad).toEqual([]);
    });
  }
});

describe('the broadcast intro', () => {
  it('sprint, kart and aero all open on the walk-in; aero\'s is a getter that steps aside for its first-visit flyover', () => {
    expect(sprint).toMatch(/\n\s+intro: 'walkIn',/);
    expect(kart).toMatch(/\n\s+intro: 'walkIn',/);
    expect(aero).toMatch(/get intro\(\)[^{]*\{ return fly\.on \? undefined : 'walkIn'; \}/);
  });
  it('the sprint\'s start sequence waits for the intro, and the press that skips it is not a stride', () => {
    expect(sprint).toMatch(/if \(ctx\.camDirector\.inIntro\) \{ follow\(ctx, dt, 0\); pushHud\(ctx, dt\); return; \}/);
    expect(sprint).toMatch(/if \(ctx\.camDirector\.inIntro\) return;[^\n]*\n/);                 // onInput
    expect(sprint).toMatch(/if \(ctx\.camDirector\.inIntro\) return false;/);                   // onBody
    // …and the wait is BEFORE the race is advanced
    expect(sprint.indexOf('ctx.camDirector.inIntro) { follow')).toBeLessThan(sprint.indexOf('updateRace(ctx, dt);\n  },'));
  });
  it('the kart\'s countdown keeps its own clock under the intro (the rocket window is the owner\'s)', () => {
    const pre = kart.slice(kart.indexOf('if (!S.start.go) {'), kart.indexOf('startBeat(ctx, S.start.outcome'));
    expect(pre).toMatch(/stepStart\(S\.start, dt, S\.input\.throttle >= 0\.5\)/);
    expect(pre).not.toMatch(/inIntro/);
  });
});

describe('replays: rare, paced, and never of the final moment', () => {
  it('the kart and the plane opt in, record the whole field, and ask only through the pacer', () => {
    expect(kart).toMatch(/\n\s+replay: true,\n\s+replayBodies: \(\) => \(kart \? \[kart, \.\.\.rivalKarts\] : \[\]\),/);
    expect(aero).toMatch(/\n\s+replay: true,\n\s+replayBodies: \(\) => \(player \? \[player\.root, \.\.\.rivalPlanes\.map/);
    expect(kart).toMatch(/overtake\.step\(place, race\.time,/);
    expect(aero).toMatch(/killCue\.arm\(/);
  });
  it('ctx.highlight is called in one place per mode — the end of update(), under the due flag — never from finish() or the end card', () => {
    for (const [name, src] of [['kart', kart], ['aero', aero]] as const) {
      expect(src.match(/ctx\.highlight\?\./g) ?? [], name).toHaveLength(1);
      const at = src.indexOf('ctx.highlight?.');
      expect(src.slice(src.lastIndexOf('if (replayDue) {', at), at), name).toMatch(/replayDue = false;/);
      // not inside finish()
      const fin = src.indexOf('function finish(');
      const indent = /^ */.exec(src.slice(src.lastIndexOf('\n', fin) + 1))![0];
      const finEnd = src.indexOf(`\n${indent}}\n`, fin);   // the function's own closing brace, at its own indent
      expect(at > fin && at < finEnd, `${name}: highlight inside finish()`).toBe(false);
    }
  });
  it('the sprint asks for NO replay: its photo finish is the final moment, and the d-pad cannot skip one', () => {
    expect(sprint).not.toMatch(/highlight|replay: true/);
  });
  it('the aero kill replay is shot on the victim', () => {
    expect(aero).toMatch(/focus: killVictim/);
  });
});

describe('ground marks go through the shared decal pool', () => {
  it('the kart lays tyre marks and the sprint lays foot prints and scuffs — via raceStamp, never a pool of its own', () => {
    expect(kart).toMatch(/stampDecal\(ctx\.scene, 'tyre'/);
    expect(sprint).toMatch(/stampDecal\(ctx\.scene, 'foot'/);
    expect(sprint).toMatch(/stampDecal\(ctx\.scene, 'scuff'/);
    expect(`${sprint}${kart}${aero}`).not.toMatch(/mountGroundDecals|new GroundDecals/);
  });
});
