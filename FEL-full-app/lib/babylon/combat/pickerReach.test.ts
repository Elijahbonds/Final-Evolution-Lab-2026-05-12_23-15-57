// EVERY PICKER PROMISE IS KEPT BY A MODE (2026-09-13).
//
// The gap this closes, which I shipped myself an hour earlier: BootSplash listed five modes in STYLE_MODES
// and only three of them read a style. The two that did not were `showdown` and `karate` — and `karate` is
// KarateEndlessMode, the flagship the owner's ask literally named ("for the karate modes allow them to select
// their fighting style"). The picker rendered, the pick was stored, and the fight ignored it.
//
// Nothing catches that. The types are fine, every unit test is green, the screen looks right, and the mode
// boots clean — the only symptom is that the game does not change, which is invisible unless you already
// suspect it. So it is checked structurally: the lists on the splash are the contract, and a mode named there
// has to reach the layer that reads the pick.
//
// This is a source scan, and it uses the SAFE comment stripper on purpose (lib/testing/sourceScan): a regex
// stripper once ate live code here and left three guards passing vacuously against empty offender lists.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';
import { ARSENAL } from './arsenal';
import { SCHOOLS } from './schools';

const ROOT = path.resolve(__dirname, '../../..');
const SPLASH = path.join(ROOT, 'components/games/boot-splash.tsx');
const MODES_DIR = path.join(ROOT, 'lib/babylon/modes');

/** Pull a `new Set([...])` literal off the splash, so the test reads the SAME list the screen renders. */
function setLiteral(src: string, name: string): string[] {
  const m = new RegExp(`const ${name}\\s*=\\s*new Set\\(\\[([^\\]]*)\\]`).exec(src);
  if (!m) throw new Error(`${name} not found on the splash — if it was renamed, this test must follow it`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** Every mode file, by the `modeId` it declares. */
function modesById(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of fs.readdirSync(MODES_DIR)) {
    if (!f.endsWith('.ts') || f.includes('.test.')) continue;
    const src = stripComments(fs.readFileSync(path.join(MODES_DIR, f), 'utf8'));
    for (const m of src.matchAll(/modeId:\s*'([^']+)'/g)) {
      // A file may name sub-ids for its spawned characters ('duel-me'); the mode's own id is the one that
      // sits beside a mood or a camPreset in the ModeDefinition.
      //
      // `get mood()` counts. The racing modes read their mood through a getter (the map has to be picked
      // before the mood is known), and a pattern that only accepted `mood:` stopped recognising them as
      // modes at all — this guard reported "velocitykart: no mode file declares this modeId" for a mode
      // that plainly does.
      if (/modeId:\s*'[^']+',\s*(get\s+)?(mood|camPreset)/.test(m[0] + src.slice(m.index ?? 0, (m.index ?? 0) + 120))) {
        out.set(m[1], f);
      }
    }
  }
  return out;
}

const splash = stripComments(fs.readFileSync(SPLASH, 'utf8'));
const byId = modesById();

/** Does this mode file (directly) reach a style/weapon reader? */
function reads(file: string, needles: RegExp): boolean {
  return needles.test(stripComments(fs.readFileSync(path.join(MODES_DIR, file), 'utf8')));
}

describe('THE SPLASH ONLY OFFERS WHAT A MODE ACTUALLY READS', () => {
  it('every mode in STYLE_MODES reads the style pick', () => {
    const offenders: string[] = [];
    for (const id of setLiteral(splash, 'STYLE_MODES')) {
      const file = byId.get(id);
      if (!file) { offenders.push(`${id}: no mode file declares this modeId`); continue; }
      if (!reads(file, /readBlend|hordeStyle|styleAttacks|styleMoveset|readLoadout/)) {
        offenders.push(`${id} (${file}): the splash offers a FIGHTING STYLE picker, nothing reads it`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every mode in WEAPON_MODES reads the weapon pick', () => {
    const offenders: string[] = [];
    for (const id of setLiteral(splash, 'WEAPON_MODES')) {
      const file = byId.get(id);
      if (!file) { offenders.push(`${id}: no mode file declares this modeId`); continue; }
      if (!reads(file, /readWeapon|readLoadout/)) {
        offenders.push(`${id} (${file}): the splash offers a WEAPON picker, nothing reads it`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every mode in TIER_MODES reads the difficulty pick', () => {
    // The guard that caught me writing this very list wrong: the first draft of TIER_MODES named all
    // eighteen modes with an opponent, and sixteen of them read nothing — a difficulty picker that changed
    // the opponent in two games and decorated the screen in the rest.
    const offenders: string[] = [];
    for (const id of setLiteral(splash, 'TIER_MODES')) {
      const file = byId.get(id);
      if (!file) { offenders.push(`${id}: no mode file declares this modeId`); continue; }
      if (!reads(file, /readProfile|readTier|profileFor/)) {
        offenders.push(`${id} (${file}): the splash offers a DIFFICULTY picker, nothing reads it`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('and the racing modes read their map and their vehicle', () => {
    for (const [id, file] of [['velocitykart', 'VelocityKartMode.ts'], ['aeroaces', 'AeroAcesMode.ts']] as const) {
      const src = stripComments(fs.readFileSync(path.join(MODES_DIR, file), 'utf8'));
      expect(src, `${id} map`).toMatch(/readCourse/);
      expect(src, `${id} vehicle`).toMatch(/readKart|readPlane|readVehicle/);
    }
  });
});

describe('THE PICK IS READ AFTER THE PAGE EXISTS, NEVER WHEN THE REGISTRY IS BUILT', () => {
  // The measured bug: a pick read in the mode factory body runs during Next's SSR, where there is no window
  // and no URL, so every choice resolved to the default — `?weapon=staff` gave the STAFF TO THE OPPONENT,
  // because Mixed Combat derives the foe's loadout as the opposite of the player's. It looks completely
  // correct in the source. The rule is LEXICAL — a reader must not be evaluated while the factory is being
  // evaluated — so that is what is checked, not where the call happens to sit in the file.
  const READERS = /\b(readBlend|readWeapon|readCourse|readKart|readPlane|readVehicle|readLoadout|readProfile|readTier)\s*\(/;

  it('NO MODE READS A PICK AT FACTORY TOP LEVEL', () => {
    // "before load()" is the wrong rule and my first version of this test used it: it flagged three readers
    // that sit inside helper functions DECLARED above load() and CALLED from it, which are perfectly safe
    // because a function body is not evaluated until it runs. The rule that matters is lexical — a reader
    // must not be evaluated while the factory itself is being evaluated. So: safe if it is nested inside some
    // function (brace depth >= 2 puts it inside one), or if its own statement is an arrow body.
    const files = [
      'KarateEndlessMode.ts', 'KarateVSMode.ts', 'ShowdownMode.ts', 'DuelMode.ts', 'MixedCombatMode.ts',
      'VelocityKartMode.ts', 'AeroAcesMode.ts', 'FootballRushMode.ts',
    ];
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(fs.readFileSync(path.join(MODES_DIR, f), 'utf8'));
      for (const m of src.matchAll(new RegExp(READERS.source, 'g'))) {
        const at = m.index ?? 0;
        const before = src.slice(0, at);
        const depth = (before.match(/\{/g)?.length ?? 0) - (before.match(/\}/g)?.length ?? 0);
        if (depth >= 2) continue;                                  // inside a function of some kind
        const stmtFrom = Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'), before.lastIndexOf('}'));
        const stmt = src.slice(stmtFrom + 1, at);
        if (/=>|function\b|\bget\s+\w+\s*\(/.test(stmt)) continue;   // an arrow body, or the mood getter
        const line = before.split('\n').length;
        offenders.push(`${f}:${line} reads a pick at factory top level — ${src.slice(stmtFrom + 1, at + 40).trim().slice(0, 70)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the racing modes read their mood through a GETTER, which is the sanctioned exception', () => {
    // a plain `mood:` value is evaluated when the definition is built, so every map would light for the first
    for (const f of ['VelocityKartMode.ts', 'AeroAcesMode.ts']) {
      const src = stripComments(fs.readFileSync(path.join(MODES_DIR, f), 'utf8'));
      expect(src, f).toMatch(/get mood\(\)/);
      expect(src, f).not.toMatch(/^\s*mood:\s*'/m);
    }
  });
});

describe('the picker lists are honest about themselves', () => {
  it('every id on the splash names a mode that exists', () => {
    for (const name of ['STYLE_MODES', 'WEAPON_MODES', 'TIER_MODES']) {
      for (const id of setLiteral(splash, name)) {
        expect(byId.has(id), `${name} lists '${id}', which no mode declares`).toBe(true);
      }
    }
  });

  it('the splash renders a chip for every ready weapon and every ready school', () => {
    // not a count — the screen maps over readyWeapons()/readySchools(), so the guarantee is that it uses the
    // registry rather than a second hand-written list that can drift out of step
    expect(splash).toMatch(/readyWeapons\(\)\.map/);
    expect(splash).toMatch(/readySchools\(\)\.map/);
    expect(ARSENAL.length).toBeGreaterThan(1);
    expect(SCHOOLS.length).toBeGreaterThan(1);
  });
});
