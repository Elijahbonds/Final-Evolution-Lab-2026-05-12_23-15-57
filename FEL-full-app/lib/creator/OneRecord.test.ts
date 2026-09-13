// ONE CANONICAL RECORD — the rule, enforced on the source (2026-09-13).
//
// Mission: "one canonical record. No mode may persist its own parallel profile."
//
// A unit test of CreatorRecord cannot enforce that, because the violation is somewhere else: it is a mode
// that quietly keeps its own. So this reads the SOURCE, the same way NoPlaceholderBodies.test.ts does, and
// for the same reason — a rule about what the code is allowed to do is cheaper and far more reliable to
// enforce on the code than on a running game.
//
// What is allowed and what is not:
//   · a PREFERENCE (which deck, which venue, which track) is a setting, not a profile. Those stay.
//   · a PROFILE (what this person does, how often, how long, where they have been) has exactly one home.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SEARCH = ['lib/babylon/modes', 'lib/babylon/core', 'lib/babylon/music', 'lib/courts'];

function tsFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.'))
    .map((f) => path.join(abs, f));
}

/** Words that mean "this stored thing is a profile". */
const PROFILE_KEY = /localStorage\.setItem\(\s*[`'"][^`'"]*(profile|engagement|history|activity|sessions|visits|places|creator)/i;

/**
 * Strip comments before matching.
 *
 * The first run of this failed on CheckIn.ts's own sentence "There is no watchPosition in this module" —
 * a rule about what the CODE does must not be satisfiable or breakable by prose, in either direction.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('no mode keeps its own profile', () => {
  it('nothing outside lib/creator writes a profile-shaped key to storage', () => {
    const offenders: string[] = [];
    for (const dir of SEARCH) {
      for (const file of tsFiles(dir)) {
        const src = code(fs.readFileSync(file, 'utf8'));
        for (const line of src.split('\n')) {
          if (PROFILE_KEY.test(line)) offenders.push(`${path.relative(ROOT, file)}: ${line.trim().slice(0, 90)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the canonical record has exactly one storage key, and it lives in its own module', () => {
    const src = code(fs.readFileSync(path.join(ROOT, 'lib/creator/CreatorRecord.ts'), 'utf8'));
    const keys = [...src.matchAll(/localStorage\.(setItem|getItem|removeItem)\(\s*([A-Z_]+)/g)].map((m) => m[2]);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('CREATOR_RECORD_KEY');
  });

  it('COURTS WRITES THROUGH emit() AND NOTHING ELSE', () => {
    // the mission names this dependency explicitly; the check is that Courts never reaches storage itself
    const src = code(fs.readFileSync(path.join(ROOT, 'lib/courts/CheckIn.ts'), 'utf8'));
    expect(src).not.toMatch(/localStorage/);
    expect(src).not.toMatch(/fetch\(|axios|XMLHttpRequest/);
    expect(src).toMatch(/emit/);
  });

  it('COURTS NEVER STORES OR TRANSMITS A COORDINATE', () => {
    const src = code(fs.readFileSync(path.join(ROOT, 'lib/courts/CheckIn.ts'), 'utf8'));
    // the only geolocation call in the module is the single foreground getCurrentPosition
    expect((src.match(/getCurrentPosition/g) ?? []).length).toBe(1);
    expect(src).not.toMatch(/watchPosition/);            // no background tracking, ever
    // and the fix never leaves the function it was created in
    expect(src).not.toMatch(/setItem\([^)]*lat|JSON\.stringify\([^)]*fix/i);
  });

  it('the harness is the one place a session is recorded', () => {
    const src = code(fs.readFileSync(path.join(ROOT, 'lib/babylon/core/ModeHarness.ts'), 'utf8'));
    expect((src.match(/emitCreator\(\{ kind: 'session'/g) ?? []).length).toBe(1);
    // every mode goes through runMode, so one call site covers all of them and no mode has to remember
    const modeFiles = tsFiles('lib/babylon/modes');
    const modesEmitting = modeFiles.filter((f) => /emitCreator|CreatorRecord/.test(code(fs.readFileSync(f, 'utf8'))));
    expect(modesEmitting.map((f) => path.basename(f))).toEqual([]);
  });
});

describe('the record is reachable from one import, by everyone who needs it', () => {
  it('exports the emit contract the other missions were told to depend on', async () => {
    const mod = await import('./CreatorRecord');
    for (const fn of ['emit', 'apply', 'readRecord', 'writeRecord', 'forgetRecord', 'estimates', 'places', 'hasPublicPresence']) {
      expect(typeof (mod as Record<string, unknown>)[fn], fn).toBe('function');
    }
  });

  it('and a way for the person to delete all of it', async () => {
    const mod = await import('./CreatorRecord');
    expect(typeof mod.forgetRecord).toBe('function');
  });
});
