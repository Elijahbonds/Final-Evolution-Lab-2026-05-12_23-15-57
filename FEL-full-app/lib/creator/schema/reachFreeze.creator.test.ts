// REACH-FREEZE (2026-09-29): the creator's side. Spec B6 — no Reach row and no copy about gameplay effects — and the rule that an
// old save (made at 88–118 %, with a Reach) loads CLAMPED, never rejected and never reported: the player did nothing wrong.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RETIRED_VITALS, VITALS, VITAL_RANGE, normalizeVitals } from './vitals';
import { resolve } from './resolve';
import { fromStorage, toBuild, validateForSave } from './saveBuild';
import { importProfile, emptyAthleteProfile, exportProfile } from './athleteProfile';
import { COSMETIC_CLAMP } from '../../babylon/core/playFrame';
import type { RatedRow } from './types';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Words that promise a body plays differently. */
const GAMEPLAY = /\b(rim|turns?|turning|contest\w*|releases?|reach\w*|jump\w*|quick\w*|slower|faster|holds? ground|contact|carr(y|ies)|drives?|gathers?|hitbox\w*|timing|advantage|edge|sooner|further)\b/i;

describe('B6 the creator shows no Reach row and no copy about gameplay effects', () => {
  it('B6 Vitals has no Reach row', () => {
    expect(VITALS.rows.map((r) => r.id)).toEqual(['heightScale', 'buildScale', 'jerseyNumber']);
    expect(VITALS.rows.some((r) => /reach|wingspan|arm/i.test(r.label))).toBe(false);
    expect(RETIRED_VITALS).toEqual(['reachScale']);
  });

  it('B6 no Vitals row promises a gameplay effect', () => {
    for (const r of VITALS.rows) expect(GAMEPLAY.exec(r.glossary)?.[0] ?? null, r.id).toBeNull();
  });

  it('B6 the creator screens offer no Reach control', () => {
    for (const f of [...walk('app/creator'), ...walk('components/creator'), ...walk('lib/creator/editor')]) {
      expect(/label: ?['"]Reach['"]|['"]reachScale['"]/.exec(readFileSync(f, 'utf8'))?.[0] ?? null, f).toBeNull();
    }
  });

  it('B6 the rows are the cosmetic clamp, in percent (TUNE-EJ)', () => {
    expect(VITAL_RANGE).toEqual({ height: [96, 104], build: [94, 108] });
    const row = (id: string) => VITALS.rows.find((r) => r.id === id) as RatedRow;
    expect([row('heightScale').min, row('heightScale').max]).toEqual(COSMETIC_CLAMP.height.map((v) => Math.round(v * 100)));
    expect([row('buildScale').min, row('buildScale').max]).toEqual(COSMETIC_CLAMP.build.map((v) => Math.round(v * 100)));
  });
});

describe('an old save loads clamped, never rejected', () => {
  const OLD_FRAME = { heightScale: 112, buildScale: 90, reachScale: 108, bodyType: 'male', archetype: 'balanced', stance: 'tall' };

  it('clamps the frame into the new rows and drops the retired Reach on load', () => {
    const v = fromStorage({ frame: OLD_FRAME }, null);
    expect(v.vitals).toEqual({ heightScale: 104, buildScale: 94 });
    expect(v.body).toMatchObject({ stance: 'tall' });
  });

  it('saves clamped, and writes no Reach', () => {
    const build = toBuild({ vitals: { heightScale: 114, buildScale: 88, reachScale: 112 } });
    expect(build.frame.heightScale).toBe(104);
    expect(build.frame.buildScale).toBe(94);
    expect('reachScale' in build.frame).toBe(false);
  });

  it('reports nothing about an old Height, Build or Reach — and still reports a value no creator ever offered', () => {
    const old = resolve({ attributes: {}, traits: {}, look: { vitals: { heightScale: 114, buildScale: 118, reachScale: 112 } } });
    expect(old.issues.filter((i) => i.section === 'vitals')).toEqual([]);
    expect(validateForSave({ vitals: { heightScale: 88, buildScale: 118, reachScale: 92 } }, null).ok).toBe(true);
    const junk = resolve({ attributes: {}, traits: {}, look: { vitals: { heightScale: 400 } } });
    expect(junk.issues.find((i) => i.rowId === 'heightScale')?.kind).toBe('violation');
  });

  it('an imported profile file stays lossless; the creator clamps it as it loads it into the editor', () => {
    const p = emptyAthleteProfile('p1', '2026-09-29T00:00:00.000Z');
    p.vitals = { heightScale: 113, buildScale: 91, reachScale: 110, namePlate: 'BONDS' };
    const r = importProfile(exportProfile(p));
    expect(r.profile.vitals).toEqual(p.vitals);            // the file format keeps what it was given (and its checksum holds)
    expect(r.checksumMismatch).toBe(false);
    expect(normalizeVitals(r.profile.vitals)).toEqual({ heightScale: 104, buildScale: 94, namePlate: 'BONDS' });
    expect(readFileSync('app/creator/athlete/_components/athlete-creator.tsx', 'utf8')).toMatch(/vitals: normalizeVitals\(r\.profile\.vitals\)/);
  });

  it('normalizeVitals leaves the new range, the jersey and anything unknown alone', () => {
    expect(normalizeVitals({ heightScale: 100, buildScale: 107, jerseyNumber: 23, foo: 'bar' })).toEqual({ heightScale: 100, buildScale: 107, jerseyNumber: 23, foo: 'bar' });
    expect(normalizeVitals(undefined)).toEqual({});
  });
});
