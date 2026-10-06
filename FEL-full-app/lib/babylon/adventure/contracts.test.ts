// The Adventure's shared contracts (docs/ADVENTURE-PLAN.md). These pins exist because three Phase A lanes code
// against the same unions at once: a value quietly added to or dropped from MOVEMENT_STATES, or a save version bumped
// without a migration, would break a lane that never touched this file. Changing a pin is a contract change: say so
// in the PR body ("contract change: …") and tell the other lanes.
import { describe, expect, it } from 'vitest';
import {
  ACTOR_KINDS, ADVENTURE_CONTRACTS_VERSION, ADVENTURE_SAVE_MAX_BYTES, ADVENTURE_SAVE_VERSION, DAMAGE_OUTCOMES, ELEMENTS,
  ELEMENT_STRONG, ELEMENT_WEAK, FLIGHT_MODES, MIND_POWERS, MOVEMENT_STATES, NEUTRAL_MOVE_INPUT, NO_FUSION, PARTNER_KINDS,
  PRQ_BANDS, SPELL_KINDS, SPELL_SHAPES, SPELL_SLOTS, createAdventureBus, elementMultiplier, emptyAdventureSave,
  flightSourceOf, fusionTierFor, isAdventureSave, neutralInput, partnerCanCarry, polylineLength, pool, spendPool,
  validateRailNetwork, wishDir, type PartnerDef, type RailNetwork,
} from './contracts';

describe('adventure contracts: the pinned unions', () => {
  it('pins the contract and save versions', () => {
    expect(ADVENTURE_CONTRACTS_VERSION).toBe(1);
    expect(ADVENTURE_SAVE_VERSION).toBe(1);
    expect(ADVENTURE_SAVE_MAX_BYTES).toBe(48 * 1024);
    expect(SPELL_SLOTS).toBe(4);
  });

  it('pins every union a lane switches on', () => {
    expect([...MOVEMENT_STATES]).toEqual(['ground', 'air', 'grind', 'wallrun', 'flight', 'riding', 'stunned', 'ko']);
    expect([...ELEMENTS]).toEqual(['fire', 'water', 'earth', 'wind', 'lightning', 'ice', 'light', 'shadow']);
    expect([...MIND_POWERS]).toEqual(['telekinesis', 'slowTime', 'barrier', 'foresight']);
    expect([...SPELL_KINDS]).toEqual(['element', 'mind', 'partner']);
    expect([...SPELL_SHAPES]).toEqual(['bolt', 'cone', 'nova', 'wall', 'zone', 'grab', 'self']);
    expect([...PARTNER_KINDS]).toEqual(['creature', 'character']);
    expect([...ACTOR_KINDS]).toEqual(['player', 'partner', 'bot', 'monster', 'boss', 'npc']);
    expect([...FLIGHT_MODES]).toEqual(['free', 'cruise']);
    expect([...DAMAGE_OUTCOMES]).toEqual(['hit', 'blocked', 'parried', 'guardBreak', 'dodged', 'iframe']);
    // The bands must stay the PRQ grade keys ModeContext.prqBand carries (lib/prq.ts prqGrade).
    expect([...PRQ_BANDS]).toEqual(['RECOVERING', 'READY', 'PRIMED', 'ELITE']);
  });
});

describe('adventure contracts: input', () => {
  it('the neutral input is frozen and neutralInput() is a fresh mutable copy', () => {
    expect(Object.isFrozen(NEUTRAL_MOVE_INPUT)).toBe(true);
    const a = neutralInput(), b = neutralInput();
    a.move.x = 1; a.jump = true;
    expect(b.move.x).toBe(0);
    expect(NEUTRAL_MOVE_INPUT.move.x).toBe(0);
    expect(b.magicSlot).toBeNull();
  });

  it('wishDir is camera-relative: stick forward goes where the camera looks, stick right to its right', () => {
    const fwd0 = wishDir({ move: { x: 0, y: 1 }, camYaw: 0 });
    expect(fwd0.x).toBeCloseTo(0); expect(fwd0.z).toBeCloseTo(1); expect(fwd0.mag).toBeCloseTo(1);
    const right0 = wishDir({ move: { x: 1, y: 0 }, camYaw: 0 });
    expect(right0.x).toBeCloseTo(1); expect(right0.z).toBeCloseTo(0);
    // Camera turned to look down +x: forward is +x, its right is −z (left-handed, +y up).
    const fwd90 = wishDir({ move: { x: 0, y: 1 }, camYaw: Math.PI / 2 });
    expect(fwd90.x).toBeCloseTo(1); expect(fwd90.z).toBeCloseTo(0);
    const right90 = wishDir({ move: { x: 1, y: 0 }, camYaw: Math.PI / 2 });
    expect(right90.x).toBeCloseTo(0); expect(right90.z).toBeCloseTo(-1);
  });

  it('wishDir keeps a half-tilt at half speed and clamps a diagonal to 1', () => {
    expect(wishDir({ move: { x: 0, y: 0.5 }, camYaw: 1 }).mag).toBeCloseTo(0.5);
    const diag = wishDir({ move: { x: 1, y: 1 }, camYaw: 0 });
    expect(Math.hypot(diag.x, diag.z)).toBeCloseTo(1);
    expect(wishDir({ move: { x: 0, y: 0 }, camYaw: 0 })).toEqual({ x: 0, z: 0, mag: 0 });
  });
});

describe('adventure contracts: pools, elements, partner, flight', () => {
  it('spendPool spends all or nothing', () => {
    const p = pool(100, 30);
    expect(spendPool(p, 40)).toBe(false);
    expect(p.cur).toBe(30);
    expect(spendPool(p, 30)).toBe(true);
    expect(p.cur).toBe(0);
    expect(spendPool(p, -1)).toBe(false);
    expect(pool(50, 80).cur).toBe(50);
  });

  it('element advantage is a ring plus light/shadow, and the inverse is the weak multiplier', () => {
    expect(elementMultiplier('fire', 'ice')).toBe(ELEMENT_STRONG);
    expect(elementMultiplier('ice', 'fire')).toBe(ELEMENT_WEAK);
    expect(elementMultiplier('light', 'shadow')).toBe(ELEMENT_STRONG);
    expect(elementMultiplier('shadow', 'light')).toBe(ELEMENT_STRONG);
    expect(elementMultiplier('fire', 'fire')).toBe(1);
    expect(elementMultiplier(null, 'fire')).toBe(1);
    expect(elementMultiplier('fire', 'earth')).toBe(1);
    // Every element is strong against exactly one other, so no element is strictly best.
    for (const a of ELEMENTS) {
      expect(ELEMENTS.filter((d) => elementMultiplier(a, d) === ELEMENT_STRONG)).toHaveLength(1);
    }
  });

  const creature = (stage: number): PartnerDef => ({
    id: 'p1', kind: 'creature', name: 'PARTNER', element: 'wind', bond: 0, moves: [],
    attrs: { strength: 30, speed: 30, endurance: 30, agility: 30, power: 30, flexibility: 30, recovery: 30, mental: 30 },
    creature: { speciesId: 'placeholder-flyer', stage, rideableAtStage: 1, flyableAtStage: 2 },
  });

  it('a creature carries from its rideable stage and flies from its flyable stage; a character never carries', () => {
    expect(partnerCanCarry(creature(0))).toEqual({ ride: false, fly: false });
    expect(partnerCanCarry(creature(1))).toEqual({ ride: true, fly: false });
    expect(partnerCanCarry(creature(2))).toEqual({ ride: true, fly: true });
    const ch: PartnerDef = { ...creature(2), kind: 'character', creature: undefined, character: { creatorSlotId: 's2' } };
    expect(partnerCanCarry(ch)).toEqual({ ride: false, fly: false });
  });

  it('flight comes only from fusion or a flying mount', () => {
    expect(flightSourceOf({ fusion: { ...NO_FUSION }, ridingId: null }, true)).toBeNull();
    expect(flightSourceOf({ fusion: { ...NO_FUSION, active: true, grantsFlight: true }, ridingId: null }, false)).toBe('fusion');
    expect(flightSourceOf({ fusion: { ...NO_FUSION }, ridingId: 'p1' }, false)).toBeNull();
    expect(flightSourceOf({ fusion: { ...NO_FUSION }, ridingId: 'p1' }, true)).toBe('mount');
  });

  it('bond sets the fusion tier', () => {
    expect([0, 9, 10, 39, 40, 74, 75, 100].map(fusionTierFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('adventure contracts: rails', () => {
  const net = (): RailNetwork => ({
    id: 'sandbox',
    segments: [
      { id: 'a', points: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 10 }], speedBias: 0, switches: [{ atM: 5, windowM: 1, side: 1, toSegment: 'b', toAtM: 5 }] },
      { id: 'b', points: [{ x: 3, y: 1, z: 0 }, { x: 3, y: 1, z: 10 }], speedBias: 2, switches: [], prev: null, next: null },
    ],
  });

  it('measures a polyline', () => {
    expect(polylineLength([{ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }, { x: 3, y: 4, z: 2 }])).toBeCloseTo(7);
  });

  it('a valid network validates clean', () => {
    expect(validateRailNetwork(net())).toEqual([]);
  });

  it('names each authoring error', () => {
    const n = net();
    n.segments[0].switches.push({ atM: 50, windowM: 1, side: -1, toSegment: 'b', toAtM: 2 });
    n.segments[0].switches.push({ atM: 2, windowM: 1, side: -1, toSegment: 'zz', toAtM: 2 });
    n.segments[1].next = 'nowhere';
    n.segments.push({ id: 'c', points: [{ x: 0, y: 0, z: 0 }], speedBias: 0, switches: [] });
    const errs = validateRailNetwork(n);
    expect(errs.some((e) => e.includes('off the rail'))).toBe(true);
    expect(errs.some((e) => e.includes('unknown segment zz'))).toBe(true);
    expect(errs.some((e) => e.includes('unknown segment nowhere'))).toBe(true);
    expect(errs.some((e) => e.includes('c: needs at least 2 points'))).toBe(true);
  });
});

describe('adventure contracts: the bus', () => {
  it('delivers in order, unsubscribes, and isolates a throwing handler', () => {
    const errors: unknown[] = [];
    const bus = createAdventureBus((e) => errors.push(e));
    const seen: string[] = [];
    bus.on('xp', () => { throw new Error('a lane bug'); });
    const off = bus.on('xp', (p) => seen.push(`a:${p.amount}`));
    bus.on('xp', (p) => seen.push(`b:${p.amount}`));
    bus.emit('xp', { actorId: 'me', amount: 5, source: 'combat' });
    off();
    bus.emit('xp', { actorId: 'me', amount: 7, source: 'trick' });
    expect(seen).toEqual(['a:5', 'b:5', 'b:7']);
    expect(errors).toHaveLength(2);
    bus.emit('ko', { actorId: 'x', byId: null });   // no subscriber: a no-op, not a throw
  });
});

describe('adventure contracts: the save', () => {
  it('an empty save is a valid v1 save, with every spell slot empty', () => {
    const s = emptyAdventureSave(1_700_000_000_000);
    expect(isAdventureSave(s)).toBe(true);
    expect(s.version).toBe(1);
    expect(s.player.spells.equipped).toEqual([null, null, null, null]);
    expect(s.partner).toBeNull();
    expect(JSON.stringify(s).length).toBeLessThan(ADVENTURE_SAVE_MAX_BYTES);
  });

  it('rejects another version, a missing section, and junk', () => {
    const s = emptyAdventureSave(1);
    expect(isAdventureSave({ ...s, version: 2 })).toBe(false);
    expect(isAdventureSave({ ...s, story: undefined })).toBe(false);
    expect(isAdventureSave({ ...s, updatedAt: Number.NaN })).toBe(false);
    expect(isAdventureSave({ ...s, partner: 'cat' })).toBe(false);
    expect(isAdventureSave(null)).toBe(false);
    expect(isAdventureSave([])).toBe(false);
    expect(isAdventureSave(JSON.parse(JSON.stringify(s)))).toBe(true);
  });
});
