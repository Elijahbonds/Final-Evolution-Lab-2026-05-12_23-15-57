// AGE-SCREEN: the year list, the four outcomes, the copy, and who is allowed to write User.dobYear.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGE_INVALID, AGE_QUESTION, AGE_TURN_AWAY, ageScreenOutcome, birthYearOptions } from './ageScreen';

const APP = join(__dirname, '..', '..');
const NOW = new Date(Date.UTC(2026, 5, 15));
const THIS_YEAR = NOW.getFullYear();

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** A prisma write of User.dobYear (data: { dobYear }), not a select and not a type. */
function writesDobYear(src: string): boolean {
  return /(?:\bcreate|\bupdate|\bupdateMany|\bupsert)\s*\([\s\S]{0,600}?data\s*:\s*\{[^}]*\bdobYear\s*:/.test(src);
}

describe('birthYearOptions', () => {
  it('starts at this year, ends at 1900, strictly descending, no gaps', () => {
    const years = birthYearOptions(NOW);
    expect(years[0]).toBe(THIS_YEAR);
    expect(years[years.length - 1]).toBe(1900);
    for (let i = 1; i < years.length; i++) expect(years[i - 1] - years[i]).toBe(1);
    expect(new Set(years).size).toBe(years.length);
  });
});

describe('ageScreenOutcome', () => {
  const at = (gap: number) => THIS_YEAR - gap;
  it('blocks thisYear−12 and thisYear−13 (under 13, including the year that turns 13)', () => {
    expect(ageScreenOutcome(at(12), NOW)).toBe('blocked');
    expect(ageScreenOutcome(at(13), NOW)).toBe('blocked');
    expect(ageScreenOutcome(2013, NOW)).toBe('blocked');
  });
  it('calls a gap of 14, 15, 17 and 18 a teen', () => {
    for (const gap of [14, 15, 17, 18]) expect(ageScreenOutcome(at(gap), NOW)).toBe('teen');
  });
  it('calls a gap of 19, and 1990, an adult', () => {
    expect(ageScreenOutcome(at(19), NOW)).toBe('adult');
    expect(ageScreenOutcome(1990, NOW)).toBe('adult');
  });
  it('rejects 1899, next year, a fraction, a string and null', () => {
    expect(ageScreenOutcome(1899, NOW)).toBe('invalid');
    expect(ageScreenOutcome(THIS_YEAR + 1, NOW)).toBe('invalid');
    expect(ageScreenOutcome(2000.5, NOW)).toBe('invalid');
    expect(ageScreenOutcome('1990', NOW)).toBe('invalid');
    expect(ageScreenOutcome(null, NOW)).toBe('invalid');
  });
});

describe('copy', () => {
  it('contains no digit and none of the cutoff words', () => {
    const banned = ['13', '18', 'old enough', 'kid', 'child', 'parent', 'adult', 'minor', 'under', 'over'];
    for (const line of [AGE_QUESTION, AGE_TURN_AWAY, AGE_INVALID]) {
      expect(line).not.toMatch(/\d/);
      for (const word of banned) expect(line.toLowerCase()).not.toContain(word);
    }
  });
});

describe('STATIC', () => {
  it('only the allowed files write dobYear under app/ and lib/', () => {
    const allowed = new Set([
      'app/api/signup/route.ts',
      'app/api/account/birth-year/route.ts',
      'lib/health/intake.ts',
      'app/api/v1/camp/consent/route.ts',
    ]);
    const writers: string[] = [];
    for (const root of ['app', 'lib']) {
      for (const file of filesUnder(join(APP, root))) {
        const rel = file.slice(APP.length + 1);
        if (rel.startsWith('app/dev/')) continue;
        if (writesDobYear(readFileSync(file, 'utf8'))) writers.push(rel);
      }
    }
    expect(writers.sort()).toEqual([...allowed].sort());
  });

  it('none of this lane\'s files imports next/font/google or names a Google font host', () => {
    const lane = [
      'lib/privacy/ageScreen.ts', 'lib/privacy/u13LockLog.ts', 'components/age-step.tsx', 'app/age/page.tsx',
      'app/api/account/birth-year/route.ts', 'app/signup/page.tsx', 'components/auth-form.tsx',
      'app/api/signup/route.ts', 'lib/health/intake.ts', 'lib/screen/config.ts', 'docs/LANES.md',
    ];
    for (const rel of lane) {
      const src = readFileSync(join(APP, rel), 'utf8');
      expect(src).not.toMatch(/next\/font\/google|fonts\.(googleapis|gstatic)\.com/);
    }
  });
});
