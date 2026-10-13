// vis-court wave 2 — the six mode files still call their hooks, hold their timed starts for the intro, never replay the moment
// that ends a match, and leave every tuned number where it was.
//
// Source-level, as the vis-party and vis-combat wiring suites are: the modes are closures over a Babylon scene and a rig, and the
// questions here ("is this call still on this path", "is this number still this number") are answered by the text.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MODES = path.join(__dirname, '..', 'modes');
const read = (f: string): string => fs.readFileSync(path.join(MODES, f), 'utf8');
const net = read('NetSportMode.ts'), prec = read('precisionModes.ts'), fb = read('FootballRushMode.ts');
const harness = fs.readFileSync(path.join(__dirname, '..', 'core', 'ModeHarness.ts'), 'utf8');
const idx = (src: string, needle: string, from = 0): number => { const i = src.indexOf(needle, from); expect(i, `missing: ${needle}`).toBeGreaterThanOrEqual(0); return i; };
/** The text of one mode's closure inside precisionModes.ts. */
const between = (a: string, b: string): string => { const i = idx(prec, a), j = idx(prec, b, i + 1); return prec.slice(i, j); };
const golf = between('export const GolfMode', 'export const DerbyMode');
const derby = between('export const DerbyMode', 'export const PenaltyMode');
const pen = prec.slice(idx(prec, 'export const PenaltyMode'));

describe('the broadcast opt-ins', () => {
  it('every court mode opts into the intro and the replay, and names its cast', () => {
    expect(net).toMatch(/intro: 'walkIn'/); expect(net).toMatch(/replay: true/); expect(net).toMatch(/replayCast:/);
    expect(golf).toMatch(/intro: 'establish'/); expect(golf).toMatch(/replay: true/); expect(golf).toMatch(/replayCast:/);
    expect(derby).toMatch(/intro: 'walkIn'/); expect(derby).toMatch(/replay: true/); expect(derby).toMatch(/replayCast:/);
    expect(pen).not.toMatch(/\n\s+intro: '/); expect(pen).toMatch(/replay: true/); expect(pen).toMatch(/replayCast:/);
    expect(fb).toMatch(/intro: 'walkIn'/); expect(fb).toMatch(/replay: true/);   // football's own, from the foundation
  });
  it('the harness reads the cast only for a mode that asked for replays, once, after load', () => {
    const i = idx(harness, 'def.replayCast?.(ctx)');
    expect(harness.slice(i - 80, i)).toMatch(/def\.replay \?/);
    expect(harness.match(/replayCast\?\.\(ctx\)/g)!.length).toBe(1);
  });
});

describe('a timed start waits for the intro (it never plays a serve, a pitch or a shot clock for a player who is watching a crane)', () => {
  it('net sports: the first serve', () => { expect(net).toMatch(/if \(!ctx\.camDirector\.inIntro\) restSec -= dt;/); });
  it('derby: the first pitch', () => { expect(derby).toMatch(/if \(throwIn > 0 && !ctx\.camDirector\.inIntro\)/); });
  it('penalty: the breakaway’s shot clock', () => { expect(pen).toMatch(/if \(!ctx\.camDirector\.inIntro\) brk\.clock -= dt;/); });
});

describe('never the replay of the moment that ends the match', () => {
  it('net sports: the replay is asked after the match branch has returned', () => {
    const award = idx(net, 'function awardPoint'), matchEnd = idx(net, "if (result === 'match' || result === 'set')", award), ret = idx(net, 'return;', matchEnd), ask = idx(net, 'pacer.offer(', award);
    expect(ask).toBeGreaterThan(ret);
  });
  it('golf: not the card-closing hole', () => { expect(golf).toMatch(/golfPacer\.offer\(rel < 0, \{ final: round >= TOTAL/); });
  it('derby: not the round’s last pitch, and not a round the outs have ended', () => { expect(derby).toMatch(/replayWanted = !roundOver && derbyPacer\.offer\(true, \{ final: round >= TOTAL/); });
  it('penalty: not a kick that decides the shootout', () => { expect(pen).toMatch(/shootoutState\(goals, themGoals, round, themKicks\)\.phase === 'decided'/); });
  it('every replay is skipped under reduced motion', () => {
    for (const [name, src] of [['net', net], ['golf', golf], ['derby', derby], ['penalty', pen]] as const) expect(src, name).toMatch(/!motionPolicy\(\)\.travel/);
  });
  it('a replay is held back from state the mode changes next (the next hole, the next pitch)', () => {
    expect(golf).toMatch(/void replayed\.then\(closeHole\)/);
    // the derby asks in the branch that schedules the next pitch (the mode clock — and so that timer — holds while a replay plays)
    const ask = idx(derby, 'if (replayWanted) { replayWanted = false; void ctx.highlight'), nextPitch = idx(derby, 'timers.later(() => { pending = false; if (!ended) pitch(ctx); }, 800)');
    expect(ask).toBeLessThan(nextPitch);
    // the penalty asks last in resolveKick, so a replay puts the bodies back as the frame left them
    const resolve = idx(pen, 'function resolveKick'), betweenKicks = idx(pen, 'betweenKicks = true;   // HOTFIX (2026-09-24): the result beat takes no kick input', resolve), fx = idx(pen, 'kickFx(ctx, scored, saved', resolve);
    expect(fx).toBeGreaterThan(betweenKicks);
  });
});

describe('the visuals are fed and never feed back', () => {
  it('golf: the tracer starts at the strike, follows the flight and reads the carry from the sim’s own first touch', () => {
    expect(golf).toMatch(/tracer\?\.start\(ball\.position\)/); expect(golf).toMatch(/tracer\.push\(ball\.position\)/); expect(golf).toMatch(/sim\.carryPoint/);
  });
  it('derby: the card reads the launch the swing made and the distance the game computed', () => {
    expect(derby).toMatch(/launchVel = \{ x: flight\.vel\.x, y: flight\.vel\.y, z: flight\.vel\.z \}/); expect(derby).toMatch(/exitRead\(launchVel, distFt\)/);
  });
  it('football: the lines read the mode’s own scrimmage and distance; a touchdown lights the jets', () => {
    expect(fb).toMatch(/courtFx\?\.update\(dt, \{ los: lineOfScrimmage, firstDown: lineOfScrimmage \+ toGo \* YARD \}\)/); expect(fb).toMatch(/courtFx\?\.touchdown\(\)/);
  });
  it('the court modules write no score, rule or HUD number (the mode files assign nothing from them)', () => {
    for (const src of [net, prec, fb]) expect(src).not.toMatch(/(?:score|goals|themGoals|homers|strokes|pts)\s*[+\-]?=\s*[^=]*(?:fx|tracer|readout|jumbo|goalNet|flares|courtFx)\./);
  });
});

describe('no tuned number moved', () => {
  it('the rally: block cooldown, rally cap, the foe’s feet', () => {
    expect(net).toMatch(/const BLOCK_COOLDOWN_SEC = 7;/); expect(net).toMatch(/const RALLY_CAP_SEC = 24;/); expect(net).toMatch(/const FOE_FOOT_BASE = 1\.6, FOE_FOOT_SKILL = 3\.0;/);
    expect(net).toMatch(/const CAM_PAN_FRAC = 0\.35;/); expect(net).toMatch(/const CAM_PAN_M = 2\.6;/);
  });
  it('golf: the preview, the putt range, the cup, the par card, the swing stick', () => {
    expect(prec).toMatch(/export const PUTT_RANGE_M = 9;/); expect(prec).toMatch(/export const HOLED_M = 0\.75;/); expect(prec).toMatch(/export const GOLF_PAR = \[3, 4, 4, 3, 5\] as const;/);
    expect(prec).toMatch(/const PREVIEW_SEC = 1\.8;/); expect(prec).toMatch(/export const SWING_STICK = 0\.6;/); expect(prec).toMatch(/export const GOLF_PUTT_METER_RATE = 2\.6;/);
  });
  it('derby: the plate coverage, the release, the camera', () => {
    expect(prec).toMatch(/export const PCI_PURE_M = 0\.16;/); expect(prec).toMatch(/export const PCI_MISS_M = 0\.78;/); expect(prec).toMatch(/const PITCH_RELEASE_SEC = 0\.52;/);
    expect(derby).toMatch(/const BATTING_CAM = new Vector3\(-1\.75, 1\.85, -3\.4\);/); expect(derby).toMatch(/const PITCHER_VIEW = new Vector3\(0, 1\.45, 18\);/);
  });
  it('penalty: the contact, the keeper’s reach, the shootout length', () => {
    expect(prec).toMatch(/const KICK_CONTACT_SEC = 0\.45;/); expect(pen).toMatch(/const KEEPER_REACH = 0\.9;/); expect(pen).toMatch(/const SD_CAP = 5;/);
  });
  it('football: the truck, the breakaway, the style chain', () => {
    expect(fb).toMatch(/const TRUCK_WINDOW_SEC = 0\.5;/); expect(fb).toMatch(/const TRUCK_COOLDOWN_SEC = 2\.5;/); expect(fb).toMatch(/const BREAKAWAY_SPEED_MULT = 1\.25;/); expect(fb).toMatch(/const STYLE_CHAIN_PTS = 25;/);
  });
});
