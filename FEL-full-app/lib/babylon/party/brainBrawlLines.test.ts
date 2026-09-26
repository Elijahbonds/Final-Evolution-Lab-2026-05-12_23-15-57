// BRAINBRAWL-POLISH-2 (2026-09-24): the lines must match the game. The eye's findings, as checks:
//   N5 — "Not MEMORY, not MEMORY…" on a spin where MEMORY had been played and only LOGIC could land;
//   N6 — "I knew that!" in the WRONG pool (a boast on a wrong pick);
//   N9 — "Round two of the brains" said on round ONE of a replayed match.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';
import { HOST_LINES, SEAT_LINES, spinLines, hostLines, pickFrom } from './brainBrawlLines';
import { CATEGORIES, freshClaims, mulberry32, spinWheel, wheelPool, type Category } from '../core/BrainBrawlCore';

const named = (line: string): Category[] => CATEGORIES.filter((c) => line.includes(c));

describe('Brain Brawl lines — they match the game (POLISH-2)', () => {
  it('N5: a spin line only names a category the wheel can still land on, and dreads one only while another could come up', () => {
    const rnd = mulberry32(11);
    let lines = 0;
    for (let trial = 0; trial < 400; trial++) {
      // a random solo state: some categories played (pseudo-claimed by seat 0)
      const claims = freshClaims();
      for (const c of CATEGORIES) if (rnd() < 0.5) claims[c] = 0;
      const pool = wheelPool(claims, 0);
      for (const line of spinLines(pool, rnd)) {
        lines++;
        for (const c of named(line)) expect(pool, `"${line}" with ${pool.join('/')} landable`).toContain(c);
        if (/^Not /.test(line)) expect(pool.length).toBeGreaterThan(1);
      }
    }
    expect(lines).toBeGreaterThan(1000);
  });

  it('N5: the eye\'s round five — only LOGIC can land — never hears MEMORY', () => {
    const claims = freshClaims();
    for (const c of CATEGORIES) if (c !== 'LOGIC') claims[c] = 0;   // four played
    const pool = wheelPool(claims, 0);
    expect(pool).toEqual(['LOGIC']);
    for (let s = 1; s < 50; s++) for (const line of spinLines(pool, mulberry32(s))) {
      expect(line).not.toMatch(/MEMORY|COMPUTE|ANALYZE|IDENTIFY/);
      expect(line).not.toMatch(/^Not /);
    }
    // and the wheel agrees: it lands on the one the line names
    for (let s = 1; s < 50; s++) expect(spinWheel(mulberry32(s), claims, 0).category).toBe('LOGIC');
  });

  it('N5: wheelPool is what spinWheel draws from (a duel spinner never lands a category they hold)', () => {
    const claims = freshClaims(); claims.LOGIC = 1; claims.MEMORY = 0;
    const pool = wheelPool(claims, 1);
    expect(pool).not.toContain('LOGIC');
    for (let s = 1; s < 300; s++) expect(pool).toContain(spinWheel(mulberry32(s), claims, 1).category);
    const all = freshClaims(); for (const c of CATEGORIES) all[c] = 0;
    expect(wheelPool(all, 0)).toEqual([...CATEGORIES]);   // holds all five: the whole wheel
  });

  it('N6: a wrong answer never says "I knew that!"', () => {
    expect(SEAT_LINES.wrong).not.toContain('I knew that!');
    for (const l of SEAT_LINES.wrong) expect(l).not.toMatch(/knew/i);
    expect(SEAT_LINES.wrong.length).toBeGreaterThanOrEqual(4);
  });

  it('N9: the rematch opener names no round', () => {
    const again = hostLines('again');
    expect(again.length).toBeGreaterThanOrEqual(2);
    for (const l of again) expect(l.text).not.toMatch(/round|two|second/i);
  });

  it('N9: two rematch openers in a row are never the same line — REPLAY keeps the no-repeat memory', () => {
    const again = hostLines('again');
    for (let s = 1; s < 200; s++) {
      const rnd = mulberry32(s);
      let last = pickFrom(again, rnd);
      for (let m = 0; m < 6; m++) { const next = pickFrom(again, rnd, last); expect(next.id).not.toBe(last.id); last = next; }
    }
    // restartMatch empties the bubbles, the pops and the caption, never lastSaid: 'again' is only said as a rematch's
    // opener, so its entry is the only thing that keeps the next one different (review: cleared, one opener in three repeated)
    const mode = stripComments(fs.readFileSync(path.resolve(__dirname, '../modes/BrainBrawlMode.ts'), 'utf8'));
    const at = mode.indexOf('restartMatch = (S: St): void => {');
    expect(at).toBeGreaterThan(-1);
    const restart = mode.slice(at, mode.indexOf('begin(S.ctx, S);', at));
    expect(restart).toContain("S.say.forEach((b) => { b.t = 0; b.text = ''; });");
    expect(restart).not.toMatch(/lastSaid\.(clear|delete)/);
    expect(mode).toContain('S.lastSaid.get(moment)');
  });

  it('host line ids are unique and keyed by moment (the voice bank looks clips up by id)', () => {
    const ids = HOST_LINES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of HOST_LINES) expect(l.id.startsWith(`${l.moment}.`)).toBe(true);
    expect(pickFrom(['a', 'b'], () => 0, 'a')).toBe('b');   // never the same line twice in a row
  });
});
