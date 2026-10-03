import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SHELF_LEDE, SHELF_MODE_COUNT, FAMILIES, OFF_SHELF, familyById, familyOf, shelvedModes } from './families';
import { MODE_INFO } from '@/lib/game-data';
import { ENABLED_BABYLON_MODES } from '@/lib/babylon/modes/registry';

const KNOWN = new Set(Object.keys(MODE_INFO as Record<string, unknown>));
const ROOT = process.cwd();

const BABYLON_MODE_INFO_KEYS: Record<string, string> = {
  dunk: 'dunkContest',
  karate: 'karateEndless',
  football: 'football',
  skateboard: 'skateboarding',
  snowboard_slalom: 'snowboarding',
  surf: 'surfing',
  tennis: 'tennis',
  tiebreak: 'tiebreak',
  derby: 'baseball',
  penalty: 'soccer',
  golf: 'golf',
  onevone: 'hoops1v1',
  threevthree: 'hoops3v3',
  carnival: 'carnival',
  karate_vs: 'karateVersus',
  mixedcombat: 'mixedcombat',
  dunkduel: 'dunkduel',
  sprint: 'sprint',
  showdown: 'showdown',
  duel: 'duel',
  volleyball: 'volleyball',
  dance: 'dance',
  who_scene_it: 'whoSceneIt',
  freerun: 'freerun',
  threepoint: 'threePoint',
  bigair: 'bigAir',
  aeroaces: 'aeroAces',
  velocitykart: 'velocityKart',
  brainbrawl: 'brainBrawl',
};

function pageForHref(href: string): string {
  const path = href.replace(/[?#].*$/, '');
  return path === '/' ? join(ROOT, 'app/page.tsx') : join(ROOT, 'app', path.slice(1), 'page.tsx');
}

describe('the mode shelf', () => {
  it('every shelved mode is a mode that exists', () => {
    const ghosts = shelvedModes().filter((m) => !KNOWN.has(m));
    expect(ghosts, 'families name modes MODE_INFO does not have').toEqual([]);
  });

  it('EVERY mode is either on a shelf or off it FOR A STATED REASON — nothing is merely lost', () => {
    const shelved = new Set(shelvedModes());
    const unplaced = [...KNOWN].filter((m) => !shelved.has(m) && !(m in OFF_SHELF));
    expect(unplaced, 'modes with no family and no reason to be off the shelf').toEqual([]);
  });

  it('a mode belongs to exactly one family — a shelf with two homes is not a shelf', () => {
    const seen = new Map<string, string>();
    for (const f of FAMILIES) {
      for (const m of f.modes) {
        expect(seen.has(m), `${m} is in both ${seen.get(m)} and ${f.id}`).toBe(false);
        seen.set(m, f.id);
      }
    }
  });

  it('no family is a dumping ground, and none is a single lonely mode', () => {
    for (const f of FAMILIES) {
      expect(f.modes.length, `${f.id} has ${f.modes.length}`).toBeGreaterThanOrEqual(3);
      expect(f.modes.length, `${f.id} has ${f.modes.length} — too many to scan`).toBeLessThanOrEqual(8);
    }
  });

  it('every family says what it is, in words a person would use', () => {
    for (const f of FAMILIES) {
      expect(f.label.length, f.id).toBeGreaterThan(2);
      expect(f.blurb.length, f.id).toBeGreaterThan(15);
      expect(f.accent, f.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('every off-shelf reason is a real sentence — the list cannot become a junk drawer', () => {
    for (const [mode, why] of Object.entries(OFF_SHELF)) {
      expect(KNOWN.has(mode), `${mode} is off the shelf but does not exist`).toBe(true);
      expect(why.length, mode).toBeGreaterThan(20);
    }
  });

  it('every internal catalogue href resolves to a page — shelf links cannot go dark', () => {
    const dark = Object.entries(MODE_INFO)
      .filter(([, info]) => info.href.startsWith('/'))
      .filter(([, info]) => !existsSync(pageForHref(info.href)))
      .map(([mode, info]) => `${mode} -> ${info.href}`);
    expect(dark).toEqual([]);
  });

  it('every enabled Babylon mode has a catalogue door on the play shelf', () => {
    const shelved = new Set(shelvedModes());
    const missingMapping = [...ENABLED_BABYLON_MODES]
      .filter((registryKey) => !(registryKey in BABYLON_MODE_INFO_KEYS));
    expect(missingMapping, 'enabled Babylon modes missing MODE_INFO mapping').toEqual([]);

    const staleMapping = Object.keys(BABYLON_MODE_INFO_KEYS)
      .filter((registryKey) => !ENABLED_BABYLON_MODES.has(registryKey));
    expect(staleMapping, 'MODE_INFO mappings for no-longer-enabled Babylon modes').toEqual([]);

    const hidden = Object.entries(BABYLON_MODE_INFO_KEYS)
      .filter(([, modeInfoKey]) => !KNOWN.has(modeInfoKey) || !shelved.has(modeInfoKey))
      .map(([registryKey, modeInfoKey]) => `${registryKey} -> ${modeInfoKey}`);
    expect(hidden, 'enabled Babylon modes absent from the player shelf').toEqual([]);
  });

  it('looks up both ways', () => {
    expect(familyOf('dunkContest')?.id).toBe('hoops');
    expect(familyOf('velocityKart')?.id).toBe('racing');
    // HOTFIX (2026-09-24): the racers are keyed by their session keys now; an old spelling still finds the shelf
    expect(familyOf('velocitykart')?.id).toBe('racing');
    expect(familyOf('aeroaces')?.id).toBe('racing');
    expect(familyOf('musicAcademy')?.id).toBe('craft');
    expect(familyOf('mirror')).toBeNull();          // off the shelf on purpose
    expect(familyById('board')?.label).toBe('Board');
    expect(familyById('nope')).toBeNull();
  });
});

describe('the shelf describes itself', () => {
  it('counts what is actually on it', () => {
    // This is here because the page said "twenty-eight modes" while the shelf carried thirty-three. A number on
    // screen that describes the data has to be read from the data, or it is a lie with a shelf life.
    expect(SHELF_MODE_COUNT).toBe(FAMILIES.reduce((n, f) => n + f.modes.length, 0));
    expect(SHELF_MODE_COUNT).toBeGreaterThan(25);
  });

  it('puts both real numbers in the line the page prints', () => {
    expect(SHELF_LEDE).toContain(String(SHELF_MODE_COUNT));
    expect(SHELF_LEDE).toContain(String(FAMILIES.length));
  });

  it('hard-codes no count anywhere in the copy', () => {
    expect(SHELF_LEDE).not.toMatch(/twenty|thirty|seven families/i);
  });
});
