// THE MIC (2026-09-24): the shipped scripts — every voice has one, every line passes the rules (clean, original, gender-neutral,
// speakable, inside its moment's window), every voice owes its counts, and every moment a mode asks for exists.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CAST } from './cast';
import { ALL_MOMENT_IDS, COACH_MOMENTS, CROWD_MOMENTS, PLAYER_MOMENTS } from './moments';
import { lintLine, shortfalls, type ScriptFile } from './scriptRules';

const DIR = join(__dirname, 'script');
const scripts = new Map<string, ScriptFile>();
for (const c of CAST) { const p = join(DIR, `${c.id}.json`); if (existsSync(p)) scripts.set(c.id, JSON.parse(readFileSync(p, 'utf8')) as ScriptFile); }

describe('the scripts', () => {
  it('every voice in the cast has one', () => {
    for (const c of CAST) expect(scripts.has(c.id), c.id).toBe(true);
  });
  it('every line passes the rules, and ids are unique per voice', () => {
    const bad: string[] = [];
    for (const [cast, f] of scripts) {
      const ids = new Set<string>();
      for (const l of f.lines) {
        for (const why of lintLine(l)) bad.push(`${cast} ${l.moment} "${l.text}": ${why}`);
        expect(ids.has(l.id!), `${cast} ${l.id}`).toBe(false); ids.add(l.id!);
      }
    }
    expect(bad).toEqual([]);
  });
  it('every MC and the sidekick meet their counts; the crowd, the players and the coach theirs', () => {
    for (const c of CAST) {
      const f = scripts.get(c.id); if (!f) continue;
      if (c.role === 'mc' || c.role === 'side') expect(shortfalls(f, c.role), c.id).toEqual([]);
      if (c.role === 'coach') for (const m of COACH_MOMENTS) expect(f.lines.filter((l) => l.moment === m.id).length, `${c.id} ${m.id}`).toBeGreaterThanOrEqual(m.n);
      if (c.role === 'crowd') for (const m of CROWD_MOMENTS) expect(f.lines.filter((l) => l.moment === m.id).length, `${c.id} ${m.id}`).toBeGreaterThanOrEqual(m.n);
      if (c.role === 'player') {
        const kind = ['cass', 'ty', 'pilot', 'zo', 'stack'].includes(c.id) ? 'rival' : 'hooper';
        for (const m of PLAYER_MOMENTS.filter((x) => x.who === kind)) expect(f.lines.filter((l) => l.moment === m.id).length, `${c.id} ${m.id}`).toBeGreaterThanOrEqual(m.n);
      }
    }
  });
  it('every moment a mode sends to the mic exists (a typo would be silence)', () => {
    const modes = join(__dirname, '../../modes');
    const known = new Set([...ALL_MOMENT_IDS, 'stinger']);
    const bad: string[] = [];
    for (const f of readdirSync(modes).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
      const src = readFileSync(join(modes, f), 'utf8');
      if (!src.includes('ModeMic')) continue;
      for (const m of src.matchAll(/moment:\s*'([a-z.]+)'/g)) if (!known.has(m[1])) bad.push(`${f}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });
});
