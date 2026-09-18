import { describe, expect, it } from 'vitest';
import { allBoardTricks, SKATE_TRICKS, SNOW_TRICKS } from './BoardTricks';
import { trickPose, trickSeconds, GRAB_SPECS } from './TrickPose';

const by = (id: string) => allBoardTricks().find((t) => t.id === id)!;
const D = Math.PI / 180;
const end = (id: string) => trickPose(by(id), trickSeconds(by(id)) + 0.01);
const mid = (id: string) => trickPose(by(id), trickSeconds(by(id)) / 2);

describe('a trick is recognised by its shape', () => {
  it('a KICKFLIP rolls the deck one way, a HEELFLIP the other, and the rider does not turn', () => {
    expect(end('kickflip').boardRoll).toBeCloseTo(360 * D);
    expect(end('heelflip').boardRoll).toBeCloseTo(-360 * D);
    expect(end('kickflip').bodyYaw).toBe(0);
    expect(mid('kickflip').tuck01).toBeGreaterThan(0.8);
  });

  it('a SHUV-IT turns the deck flat under a rider who stays put; a 360 FLIP does both to the deck', () => {
    expect(end('shuvit').boardYaw).toBeCloseTo(180 * D);
    expect(end('shuvit').bodyYaw).toBe(0);
    expect(end('tre').boardYaw).toBeCloseTo(360 * D);
    expect(end('tre').boardRoll).toBeCloseTo(360 * D);
  });

  it('a body SPIN is caught at its angle, not wherever the air ran out', () => {
    expect(end('fs360').bodyYaw).toBeCloseTo(360 * D);
    expect(trickPose(by('fs360'), 5).bodyYaw).toBeCloseTo(360 * D);
    expect(end('snow720').bodyYaw).toBeCloseTo(720 * D);
  });

  it('a CORK / RODEO tips over and comes back upright to land', () => {
    expect(Math.abs(mid('rodeo').bodyTilt)).toBeGreaterThan(150 * D);
    expect(Math.abs(end('rodeo').bodyTilt)).toBeLessThan(1 * D);
    expect(Math.abs(mid('cork720').bodyTilt)).toBeGreaterThan(90 * D);
  });

  it('every trick completes inside its own air budget', () => {
    for (const t of allBoardTricks()) if (t.kind === 'air') expect(trickSeconds(t), t.id).toBeLessThanOrEqual(Math.max(0.25, t.airSec));
  });
});

describe('the grabs are different pictures', () => {
  it('indy, melon, method, stalefish and japan each differ in hand, edge or tweak', () => {
    const shapes = ['indy', 'melon', 'method', 'stalefish', 'japan'] as const;
    const keys = shapes.map((s) => { const g = GRAB_SPECS[s]; return `${g.hand}|${g.edge}|${Math.round(g.tweakRoll * 10)}|${Math.round(g.tweakPitch * 10)}|${g.along}`; });
    expect(new Set(keys).size).toBe(shapes.length);
    expect(GRAB_SPECS.indy.hand).toBe('back');
    expect(GRAB_SPECS.indy.edge).toBe('toe');
    expect(GRAB_SPECS.melon.hand).toBe('front');
    expect(GRAB_SPECS.melon.edge).toBe('heel');
  });

  it('a held grab tweaks and lifts the deck; releasing lets it go', () => {
    const melon = by('melon');
    const held = trickPose(melon, 0.3, true);
    expect(held.grab?.weight).toBe(1);
    expect(held.boardLift).toBeGreaterThan(0.2);
    expect(trickPose(melon, 0.6, false, 0.2).grab).toBeNull();
  });

  it('a flip-into-grab waits for the deck to come round before the hand takes it', () => {
    const t = { ...SKATE_TRICKS.find((x) => x.id === 'kickflip')!, grab: 'indy' as const };
    expect(trickPose(t, 0.1).grab).toBeNull();
    expect(trickPose(t, trickSeconds(t)).grab?.weight).toBeCloseTo(1);
  });

  it('every grab shape in the tables has a spec', () => {
    for (const t of [...SKATE_TRICKS, ...SNOW_TRICKS]) if (t.grab !== 'none') expect(GRAB_SPECS[t.grab], t.id).toBeDefined();
  });
});
