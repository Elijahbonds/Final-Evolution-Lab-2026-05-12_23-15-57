// A3 partner definitions and creature evolution (docs/ADVENTURE-PLAN.md A3): the species table agrees with the
// Evolution Garden, both partner kinds are created, and a creature evolves at the Garden's thresholds into a mount and
// then a flyer (contracts.partnerCanCarry).
import { describe, expect, it } from 'vitest';
import { SPECIES } from '@/lib/babylon/core/EvolutionGarden';
import { COMPANION_MOVES } from '@/lib/babylon/core/FusionColosseum';
import { PRQ_ATTRS } from '@/lib/prq';
import { ELEMENTS, partnerCanCarry } from '../contracts';
import {
  ADVENTURE_SPECIES, ADVENTURE_SPECIES_TABLE, CHARACTER_PARTNER_MOVES, createCharacterPartner, createCreaturePartner,
  partnerFormLabel, partnerGear, speciesById,
} from './defs';
import { ADVENTURE_TRAINING_SCALE, companionOf, trainCreature, trainingEventsFor } from './evolution';

describe('the species table', () => {
  it('extends every Garden species, with matching stage counts, a real element, a ride and a fly stage', () => {
    expect(Object.keys(ADVENTURE_SPECIES_TABLE).sort()).toEqual(SPECIES.map((s) => s.id).sort());
    for (const s of ADVENTURE_SPECIES) {
      expect(s.stages).toBe(s.garden.stages.length);
      expect(ELEMENTS).toContain(s.element);
      expect(s.rideableAtStage).not.toBeNull();
      expect(s.flyableAtStage).toBe(s.stages - 1);
      expect(s.rideableAtStage!).toBeLessThanOrEqual(s.flyableAtStage!);
      expect(s.moves).toEqual(COMPANION_MOVES[s.id].map((m) => m.id));
      expect(s.label).toMatch(/^\[TUNE\]/);   // still the Garden's placeholder
    }
    expect(speciesById('dragon')).toBeNull();
  });
});

describe('creating a partner', () => {
  it('a creature: stage 0, the Garden\'s starting body, its moves and its element; never carries at stage 0', () => {
    const p = createCreaturePartner({ id: 'pt', speciesId: 'cinderpup' })!;
    expect(p).toMatchObject({ kind: 'creature', element: 'fire', bond: 0, name: 'PUP', moves: ['bite', 'emberdash'] });
    expect(p.creature).toEqual({ speciesId: 'cinderpup', stage: 0, rideableAtStage: 1, flyableAtStage: 2 });
    expect(p.attrs).toMatchObject({ strength: 40, speed: 55, endurance: 35, agility: 30 });
    expect(Object.keys(p.attrs).sort()).toEqual([...PRQ_ATTRS].sort());
    expect(partnerCanCarry(p)).toEqual({ ride: false, fly: false });
    expect(createCreaturePartner({ id: 'pt', speciesId: 'dragon' })).toBeNull();
    expect(createCreaturePartner({ id: 'pt', speciesId: 'gardenite', name: 'moss!!' })!.name).toBe('MOSS');
  });

  it('a character: a Creator slot id, the element the player picks, a baseline body; it never carries a rider', () => {
    const p = createCharacterPartner({ id: 'pt', creatorSlotId: 's2', element: 'shadow', name: 'Rook' });
    expect(p).toMatchObject({ kind: 'character', name: 'ROOK', element: 'shadow', character: { creatorSlotId: 's2' }, bond: 0 });
    expect(p.moves).toEqual([...CHARACTER_PARTNER_MOVES]);
    expect(Object.values(p.attrs).every((v) => v === 50)).toBe(true);
    expect(partnerCanCarry(p)).toEqual({ ride: false, fly: false });
    expect(partnerGear(p)).toEqual({});
    expect(partnerFormLabel(p)).toBe('ROOK');
  });
});

describe('creature evolution (through the Garden\'s trainFromEvent)', () => {
  it('evolves at the Garden\'s thresholds: stage 1 at 25 training XP, stage 2 at 50, one stage at a time', () => {
    const def = createCreaturePartner({ id: 'pt', speciesId: 'cinderpup' })!;
    const c = companionOf(def)!;
    const perHit = 1.0 * ADVENTURE_TRAINING_SCALE * 2;   // cinderpup's combat bias (power, rate 1.0) × the scale × the Garden's 2
    let hits = 0;
    const stages: number[] = [];
    while (def.creature!.stage < 2 && hits < 1000) {
      const r = trainCreature(def, c, { modeFamily: 'combat', quality01: 1 });
      hits++;
      if (r.evolved) stages.push(hits);
    }
    // float sums of 0.2 may land a hit either side of the exact threshold
    expect(stages).toHaveLength(2);
    expect(Math.abs(stages[0] - 25 / perHit)).toBeLessThanOrEqual(1);
    expect(Math.abs(stages[1] - 50 / perHit)).toBeLessThanOrEqual(1);
    // a stage is a chapter of play, not one fight (the Garden was tuned per session; the Adventure fires per hit)
    expect(stages[0]).toBeGreaterThanOrEqual(100);
    expect(def.creature!.stage).toBe(2);
    expect(def.attrs.power).toBeGreaterThan(30);
    expect((def.creature as { xp?: number }).xp).toBeGreaterThanOrEqual(50);
    // a family the species is not biased to trains nothing
    const before = { ...def.attrs };
    expect(trainCreature(def, c, { modeFamily: 'rhythm', quality01: 1 }).gained).toBe(0);
    expect(def.attrs).toEqual(before);
  });

  it('becomes rideable at its ride stage and flyable at its fly stage (partnerCanCarry)', () => {
    const def = createCreaturePartner({ id: 'pt', speciesId: 'strideraptor' })!;
    const c = companionOf(def)!;
    const carry: string[] = [];
    let last = '';
    for (let i = 0; i < 2000 && def.creature!.stage < 2; i++) {
      trainCreature(def, c, { modeFamily: 'board', quality01: 1 });
      const k = JSON.stringify(partnerCanCarry(def));
      if (k !== last) { carry.push(`${def.creature!.stage}:${k}`); last = k; }
    }
    expect(carry).toEqual([
      '0:{"ride":false,"fly":false}',
      '1:{"ride":true,"fly":false}',
      '2:{"ride":true,"fly":true}',
    ]);
    expect(partnerGear(def)).toEqual({ hp: 40 });
    expect(partnerFormLabel(def)).toBe('Skyraptor');
  });

  it('a saved creature resumes where it was (stage and training XP carried by the def)', () => {
    const def = createCreaturePartner({ id: 'pt', speciesId: 'cinderpup' })!;
    const c = companionOf(def)!;
    for (let i = 0; i < 100; i++) trainCreature(def, c, { modeFamily: 'combat', quality01: 1 });
    const again = companionOf(JSON.parse(JSON.stringify(def)))!;
    expect(again.stage).toBe(c.stage);
    expect(again.xp).toBeCloseTo(c.xp, 2);
    expect(companionOf(createCharacterPartner({ id: 'x', creatorSlotId: 's1', element: 'fire' }))).toBeNull();
  });

  it('maps the party\'s Adventure events to Garden families, and nothing else', () => {
    const party = (id: string | null) => id === 'p' || id === 'q';
    const boss = (id: string) => id === 'boss';
    const dmg = (src: string, tgt: string, outcome: 'hit' | 'blocked' = 'hit') => ({ tSec: 0, sourceId: src, targetId: tgt, amount: 15, source: 'strike' as const, element: null, outcome, staminaDamage: 0, poiseDamage: 0, staggerSec: 0, launch: false, knockback: null });
    expect(trainingEventsFor('damage', dmg('q', 'm'), party, boss)).toEqual([{ modeFamily: 'combat', quality01: 0.5 }]);
    expect(trainingEventsFor('damage', dmg('m', 'q'), party, boss)).toEqual([]);
    expect(trainingEventsFor('damage', dmg('p', 'm', 'blocked'), party, boss)).toEqual([]);
    expect(trainingEventsFor('rail:trick', { actorId: 'p', trick: 't', points: 50 }, party, boss)).toEqual([{ modeFamily: 'board', quality01: 0.5 }]);
    expect(trainingEventsFor('homing', { actorId: 'p', targetId: 'm', hit: false }, party, boss)).toEqual([]);
    expect(trainingEventsFor('spell:cast', { actorId: 'q', spellId: 's', element: 'fire' }, party, boss)[0].modeFamily).toBe('precision');
    expect(trainingEventsFor('mirror:move', { actorId: 'p', kind: 'punch', quality01: 0.7 }, party, boss)).toEqual([{ modeFamily: 'rhythm', quality01: 0.7 }]);
    expect(trainingEventsFor('ko', { actorId: 'boss', byId: 'p' }, party, boss)).toHaveLength(5);
    expect(trainingEventsFor('ko', { actorId: 'm', byId: 'p' }, party, boss)).toEqual([]);
    expect(trainingEventsFor('level', { actorId: 'p', level: 2 }, party, boss)).toEqual([]);
  });
});
