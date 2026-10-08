// A3 save document (docs/ADVENTURE-PLAN.md "Data and saves"): both partner kinds round-trip, junk and corrupt documents
// are refused, an oversize one is refused, every field is sanitised, migrations walk one version at a time.
import { describe, expect, it } from 'vitest';
import { ADVENTURE_SAVE_MAX_BYTES, emptyAdventureSave, isAdventureSave, type AdventureSave, type PartnerDef } from '../contracts';
import { ADVENTURE_XP_MAX } from '../stats/level';
import {
  SAVE_MIGRATIONS, adventureSaveBytes, migrateAdventureSave, prepareAdventureSave, readAdventureSave,
  sanitizeAdventureSave, sanitizePartnerDef, withProgress,
} from './save';

const attrs = { strength: 40, speed: 55, endurance: 35, agility: 30, power: 30, flexibility: 30, recovery: 30, mental: 30 };
const creature: PartnerDef = {
  id: 'partner-1', kind: 'creature', name: 'EMBER', element: 'fire', attrs, bond: 22, moves: ['bite', 'emberdash'],
  creature: { speciesId: 'cinderpup', stage: 1, rideableAtStage: 1, flyableAtStage: 2 },
};
const character: PartnerDef = {
  id: 'partner-2', kind: 'character', name: 'NOVA', element: 'lightning', attrs: { ...attrs, mental: 70 }, bond: 5,
  moves: ['strike.light', 'strike.heavy'], character: { creatorSlotId: 's2' },
};

function fullSave(partner: PartnerDef | null): AdventureSave {
  const s = emptyAdventureSave(1_700_000_000_000);
  s.player.xp = 350;
  s.player.level = 3;
  s.player.school = { primary: 'sharp', secondary: 'flowing', mix: 0.3 };
  s.player.spells = { known: ['bolt.fire', 'mind.slow'], equipped: ['bolt.fire', null, 'mind.slow', null] };
  s.player.training = { strength: 120, mental: 40 };
  s.partner = partner;
  s.story = { chapterId: 'ch1', beatId: 'b04', flags: { metGuide: true, gems: 3, door: 'open' }, worldsVisited: ['hub', 'w1'], clearedBosses: ['w1.boss'], checkpoint: { worldId: 'w1', spawnId: 'gate' } };
  s.br = { matches: 4, wins: 1, bestPlace: 1 };
  s.settings = { mirror: true, invertFlightY: false };
  return s;
}

describe('the save round-trips', () => {
  it('with a creature partner and with a character partner (through JSON text, as the device stores it)', () => {
    for (const partner of [creature, character]) {
      const s = fullSave(partner);
      const read = readAdventureSave(JSON.stringify(s), 0);
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect(read.save).toEqual(s);
      expect(read.migrated).toBe(false);
      // and a second trip is a fixed point
      const again = readAdventureSave(JSON.stringify(read.save), 0);
      expect(again.ok && again.save).toEqual(s);
    }
  });

  it('an empty save round-trips', () => {
    const s = emptyAdventureSave(5);
    const r = readAdventureSave(JSON.stringify(s), 0);
    expect(r.ok && r.save).toEqual(s);
  });
});

describe('corrupt and junk documents are refused, never repaired by guessing', () => {
  it.each([
    ['not JSON', '{"version":1,'],
    ['a string', '"hello"'],
    ['an array', '[1,2]'],
    ['null', 'null'],
    ['no version', JSON.stringify({ ...fullSave(null), version: undefined })],
    ['a newer version', JSON.stringify({ ...fullSave(null), version: 2 })],
    ['a negative version', JSON.stringify({ ...fullSave(null), version: -1 })],
    ['player missing', JSON.stringify({ ...fullSave(null), player: undefined })],
    ['story flags not an object', JSON.stringify({ ...fullSave(null), story: { ...fullSave(null).story, flags: [] } })],
    ['partner a string', JSON.stringify({ ...fullSave(null), partner: 'pup' })],
  ])('%s', (_n, raw) => {
    const r = readAdventureSave(raw, 0);
    expect(r.ok).toBe(false);
  });

  it('says why', () => {
    expect(readAdventureSave('{', 0)).toEqual({ ok: false, reason: 'junk' });
    expect(readAdventureSave(JSON.stringify({ ...fullSave(null), version: 2 }), 0)).toEqual({ ok: false, reason: 'version' });
    expect(readAdventureSave(JSON.stringify({ ...fullSave(null), br: null }), 0)).toEqual({ ok: false, reason: 'shape' });
  });

  it('an oversize document is refused, as text and as an object', () => {
    const big = fullSave(creature);
    big.story.flags = { pad: 'x'.repeat(200) };
    (big as unknown as { junk: string }).junk = 'y'.repeat(ADVENTURE_SAVE_MAX_BYTES);
    expect(adventureSaveBytes(big)).toBeGreaterThan(ADVENTURE_SAVE_MAX_BYTES);
    expect(readAdventureSave(JSON.stringify(big), 0)).toEqual({ ok: false, reason: 'oversize' });
    expect(readAdventureSave(big, 0)).toEqual({ ok: false, reason: 'oversize' });
    // the writer's gate: an unknown field is dropped (the clean doc fits); a save still over the cap once clean is refused
    expect(prepareAdventureSave(big, 0)).not.toBeNull();
    const huge = fullSave(creature);
    for (let i = 0; i < 256; i++) huge.story.flags[`flag_${String(i).padStart(3, '0')}_${'k'.repeat(50)}`] = 'v'.repeat(250);
    expect(prepareAdventureSave(huge, 0)).toBeNull();
  });

  it('counts the cap in UTF-8 bytes, not characters', () => {
    expect(adventureSaveBytes('a')).toBe(1);
    expect(adventureSaveBytes('é')).toBe(2);
    expect(adventureSaveBytes('€')).toBe(3);
    expect(adventureSaveBytes('😀')).toBe(4);
    expect(adventureSaveBytes({ s: 'é' })).toBe(JSON.stringify({ s: 'é' }).length + 1);
  });
});

describe('sanitising every field', () => {
  it('clamps, dedupes, caps and drops what does not belong', () => {
    const raw = {
      ...fullSave(creature),
      updatedAt: 7,
      extra: 'dropped',
      player: {
        level: 999, xp: 1e12, school: { primary: 'nope', secondary: 'sharp', mix: 9 },
        spells: { known: ['a', 'a', 'b', 42, '<script>', 'x'.repeat(65)], equipped: ['a', 'a', 'zzz', 'b', 'b', 'c'] },
        training: { strength: -5, speed: 1e9, notAnAttr: 50, mental: 'lots' },
      },
      story: {
        chapterId: 'ch 1', beatId: null, flags: { ok: true, n: Number.NaN, s: 'x'.repeat(300), 'bad key': 1, obj: {} },
        worldsVisited: ['w1', 'w1', 'w2'], clearedBosses: 'boss', checkpoint: { worldId: 'w1' },
      },
      br: { matches: 3, wins: 9, bestPlace: 40 },
      settings: { mirror: 'yes', invertFlightY: true },
    };
    const s = sanitizeAdventureSave(raw as never, 0);
    expect(isAdventureSave(s)).toBe(true);
    expect((s as unknown as Record<string, unknown>).extra).toBeUndefined();
    expect(s.player.xp).toBe(ADVENTURE_XP_MAX);
    expect(s.player.level).toBe(50);   // level re-derived from XP
    expect(s.player.school).toEqual({ primary: 'straight', secondary: 'sharp', mix: 1 });
    expect(s.player.spells.known).toEqual(['a', 'b']);
    expect(s.player.spells.equipped).toEqual(['a', null, null, 'b']);   // only known, each once, four slots
    expect(s.player.training).toEqual({ speed: 5000 });
    expect(s.story.chapterId).toBeNull();
    expect(s.story.flags).toEqual({ ok: true });
    expect(s.story.worldsVisited).toEqual(['w1', 'w2']);
    expect(s.story.clearedBosses).toEqual([]);
    expect(s.story.checkpoint).toBeNull();
    expect(s.br).toEqual({ matches: 3, wins: 3, bestPlace: 16 });
    expect(s.settings).toEqual({ mirror: false, invertFlightY: true });
  });

  it('a creature\'s ride and fly stages come from its species, never from the document', () => {
    const forged = sanitizePartnerDef({ ...creature, creature: { speciesId: 'cinderpup', stage: 0, rideableAtStage: 0, flyableAtStage: 0, xp: 12.5 } });
    expect(forged?.creature).toEqual({ speciesId: 'cinderpup', stage: 0, rideableAtStage: 1, flyableAtStage: 2, xp: 12.5 });
    expect(sanitizePartnerDef({ ...creature, creature: { ...creature.creature, stage: 9 } })?.creature?.stage).toBe(2);
  });

  it('refuses a partner it cannot place: an unknown species, no slot, a bad element or kind; cleans its name', () => {
    expect(sanitizePartnerDef({ ...creature, creature: { ...creature.creature, speciesId: 'dragon' } })).toBeNull();
    expect(sanitizePartnerDef({ ...character, character: {} })).toBeNull();
    expect(sanitizePartnerDef({ ...character, element: 'plasma' })).toBeNull();
    expect(sanitizePartnerDef({ ...character, kind: 'pet' })).toBeNull();
    expect(sanitizePartnerDef({ ...character, name: '<b>nova!!</b>' })?.name).toBe('BNOVAB');
    expect(sanitizePartnerDef({ ...character, name: '' })?.name).toBe('PARTNER');
    expect(sanitizePartnerDef({ ...character, bond: 500, attrs: { strength: 900 } })).toMatchObject({ bond: 100, attrs: { strength: 100, speed: 50 } });
    // a save with an unplaceable partner keeps the rest, with no partner
    const s = readAdventureSave(JSON.stringify({ ...fullSave(null), partner: { ...creature, creature: { speciesId: 'dragon', stage: 0 } } }), 0);
    expect(s.ok && s.save.partner).toBeNull();
  });
});

describe('migrations', () => {
  it('ships no step yet (version 1 is the first), and walks injected steps one version at a time', () => {
    expect(Object.keys(SAVE_MIGRATIONS)).toEqual([]);
    const v0 = { version: 0, updatedAt: 3, lvl: 4, exp: 400 };
    const steps = {
      0: (d: Record<string, unknown>) => {
        const s = emptyAdventureSave(d.updatedAt as number);
        s.player.xp = d.exp as number;
        return s as unknown as Record<string, unknown>;
      },
    };
    const m = migrateAdventureSave(v0, steps);
    expect(m?.migrated).toBe(true);
    const r = readAdventureSave(JSON.stringify(v0), 0, steps);
    expect(r.ok && r.migrated).toBe(true);
    expect(r.ok && r.save.player).toMatchObject({ xp: 400, level: 3 });
    // no path: refused
    expect(readAdventureSave(JSON.stringify(v0), 0)).toEqual({ ok: false, reason: 'version' });
    // a step that does not land on the next version: refused
    expect(migrateAdventureSave(v0, { 0: () => ({ version: 7 }) })).toBeNull();
  });
});

describe('withProgress', () => {
  it('folds the systems\' progress into a copy and leaves the original alone', () => {
    const s = fullSave(creature);
    const evolved: PartnerDef = { ...creature, bond: 40, creature: { ...creature.creature!, stage: 2 } };
    const next = withProgress(s, { player: { xp: 500, training: { power: 10 } }, partner: evolved });
    expect(next.player).toMatchObject({ xp: 500, level: 4, training: { power: 10 } });
    expect(next.partner?.creature?.stage).toBe(2);
    expect(s.player.xp).toBe(350);
    evolved.bond = 99;
    expect(next.partner?.bond).toBe(40);   // a copy
  });
});
