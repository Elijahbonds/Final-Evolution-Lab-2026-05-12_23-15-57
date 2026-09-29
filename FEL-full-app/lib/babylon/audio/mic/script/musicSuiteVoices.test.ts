// Stoop (the Cypher) and Professor Okta (the Academy) — the shipped lines (MUSIC-SUITE P8, 2026-09-25). The moments
// contract (DANCE_MOMENTS / ACADEMY_MOMENTS in moments.ts) and the rule engine (scriptRules.lintLine) are THE MIC's
// own — this test holds Stoop and Okta to the exact same bar scripts.test.ts holds the hoops cast to, without
// touching that file or CAST (cast.ts): these two voices are not in either.
import { describe, it, expect } from 'vitest';
import { ACADEMY_MOMENTS, DANCE_MOMENTS, ALL_MOMENT_IDS } from '../moments';
import { lintLine, maxWordsFor } from '../scriptRules';
import { STOOP, STOOP_LINES, stoopLines } from './stoop';
import { OKTA, OKTA_LINES, oktaLines } from './okta';
import { clipId, estimateSec, hostCaption } from '../hostVoice';

describe('the moments contract — DANCE_MOMENTS and ACADEMY_MOMENTS', () => {
  it('every dance.* / academy.* id is in ALL_MOMENT_IDS (a typo would be silence, same as a hoops mode\'s)', () => {
    for (const m of DANCE_MOMENTS) expect(ALL_MOMENT_IDS).toContain(m.id);
    for (const m of ACADEMY_MOMENTS) expect(ALL_MOMENT_IDS).toContain(m.id);
  });
  it('adds no hoops moment and touches no hoops id', () => {
    for (const m of DANCE_MOMENTS) expect(m.id.startsWith('dance.')).toBe(true);
    for (const m of ACADEMY_MOMENTS) expect(m.id.startsWith('academy.')).toBe(true);
  });
  it('maxWordsFor answers every dance.* / academy.* moment (scriptRules knows them)', () => {
    for (const m of DANCE_MOMENTS) expect(maxWordsFor(m.id)).toBe(m.maxWords);
    for (const m of ACADEMY_MOMENTS) expect(maxWordsFor(m.id)).toBe(m.maxWords);
  });
});

describe('Stoop and Okta — every line passes THE MIC\'s rules (clean, original, gender-neutral, speakable, in budget)', () => {
  it('Stoop', () => {
    const bad: string[] = [];
    for (const l of STOOP_LINES) for (const why of lintLine(l)) bad.push(`${l.id} "${l.text}": ${why}`);
    expect(bad).toEqual([]);
  });
  it('Okta', () => {
    const bad: string[] = [];
    for (const l of OKTA_LINES) for (const why of lintLine(l)) bad.push(`${l.id} "${l.text}": ${why}`);
    expect(bad).toEqual([]);
  });
  it('line ids are unique per voice, and every id starts with its own moment (VoiceKit looks clips up by id)', () => {
    for (const lines of [STOOP_LINES, OKTA_LINES]) {
      const ids = new Set<string>();
      for (const l of lines) { expect(ids.has(l.id), l.id).toBe(false); ids.add(l.id); expect(l.id.startsWith(`${l.moment}.`)).toBe(true); }
    }
  });
});

describe('3-5 variants per moment (the task\'s own bar, and DANCE_MOMENTS/ACADEMY_MOMENTS\' own `n`)', () => {
  it('Stoop owns every dance.* moment, at least its `n`', () => {
    for (const m of DANCE_MOMENTS) {
      const n = stoopLines(m.id).length;
      expect(n, m.id).toBeGreaterThanOrEqual(m.n);
      expect(n, m.id).toBeGreaterThanOrEqual(3);
      expect(n, m.id).toBeLessThanOrEqual(5);
    }
  });
  it('Okta owns every academy.* moment, at least its `n`', () => {
    for (const m of ACADEMY_MOMENTS) {
      const n = oktaLines(m.id).length;
      expect(n, m.id).toBeGreaterThanOrEqual(m.n);
      expect(n, m.id).toBeGreaterThanOrEqual(3);
      expect(n, m.id).toBeLessThanOrEqual(5);
    }
  });
  it('no line belongs to a moment neither DANCE_MOMENTS nor ACADEMY_MOMENTS declares', () => {
    const danceIds = new Set(DANCE_MOMENTS.map((m) => m.id));
    for (const l of STOOP_LINES) expect(danceIds.has(l.moment), l.moment).toBe(true);
    const academyIds = new Set(ACADEMY_MOMENTS.map((m) => m.id));
    for (const l of OKTA_LINES) expect(academyIds.has(l.moment), l.moment).toBe(true);
  });
});

describe('captions — every voiced line gets one, for every line in both banks (not just an example)', () => {
  it('Stoop', () => {
    for (const l of STOOP_LINES) {
      const cap = hostCaption(STOOP, l, estimateSec(l.text));
      expect(cap.mic, l.id).toBe(l.text);
      expect(cap.micWho, l.id).toBe(STOOP.name);
      expect(cap.holdSec, l.id).toBeGreaterThan(0);
      expect(clipId(STOOP, l), l.id).toBe(`stoop/${l.id}`);
    }
  });
  it('Okta', () => {
    for (const l of OKTA_LINES) {
      const cap = hostCaption(OKTA, l, estimateSec(l.text));
      expect(cap.mic, l.id).toBe(l.text);
      expect(cap.micWho, l.id).toBe(OKTA.name);
      expect(cap.holdSec, l.id).toBeGreaterThan(0);
      expect(clipId(OKTA, l), l.id).toBe(`okta/${l.id}`);
    }
  });
});

describe('the cast descriptors', () => {
  it('Stoop and Okta are distinct voices from each other and from the hoops/coach/brainbrawl casts', () => {
    expect(STOOP.id).not.toBe(OKTA.id);
    const mixKey = (c: typeof STOOP | typeof OKTA): string => JSON.stringify([...c.voice.mix].sort(), null, 0) + `@${c.voice.speed}`;
    expect(mixKey(STOOP)).not.toBe(mixKey(OKTA));
  });
  it('each cast\'s group matches the bank folder its build script writes (public/audio/voice/v1/<id>/<group>.*)', () => {
    expect(STOOP.group).toBe('dance');
    expect(OKTA.group).toBe('academy');
  });
});
