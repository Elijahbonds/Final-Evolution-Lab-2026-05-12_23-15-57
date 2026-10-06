// SET LENGTH (IMPROVE 2026-10-06): volleyball's short set to 15 — the pick, the scorer it builds, and the two places the
// promise has to be kept (the splash offers it, the mode reads it), checked structurally the way pickerReach does.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';
import { readSetLength, setLengthOf, setLengthsFor, setLengthLabel, SET_LENGTHS, SET_LENGTH_MODES, TENNIS_MATCH_LENGTHS } from './setLength';
import { VolleyScore, TennisScore } from '../core/RallyCore';
import { FIELD_DEPTH } from '@/lib/field-depth';

const ROOT = path.resolve(__dirname, '../../..');
const src = (p: string) => stripComments(fs.readFileSync(path.join(ROOT, p), 'utf8'));

describe('the set length pick', () => {
  it('reads the url first, only for volleyball, and defaults to the full set', () => {
    expect(readSetLength('volleyball', '?set=15')).toBe('short');
    expect(readSetLength('volleyball', '?set=short')).toBe('short');
    expect(readSetLength('volleyball', '?set=25')).toBe('full');
    expect(readSetLength('volleyball', '')).toBe('full');
    expect(readSetLength('tennis', '?set=15')).toBe('full');
    expect(SET_LENGTHS.map((l) => l.id)).toEqual(['full', 'short']);
  });

  it('the full set is still the field-depth length; the short one is to 15 with the same +5 cap headroom', () => {
    expect(setLengthOf('full').target).toBe(FIELD_DEPTH.volleyballPoints);
    expect(setLengthOf('full').cap).toBe(30);
    expect(setLengthOf('short').target).toBe(15);
    expect(setLengthOf('short').cap).toBe(20);
  });

  it('a short set ends at 15 by two, and the cap still stops a deuce run', () => {
    const s = setLengthOf('short');
    const a = new VolleyScore(s.target, s.cap);
    for (let i = 0; i < 14; i++) expect(a.award(0)).toBe('point');
    expect(a.award(0)).toBe('set');                      // 15-0
    const b = new VolleyScore(s.target, s.cap);
    for (let i = 0; i < 14; i++) { b.award(0); b.award(1); }   // 14-14
    expect(b.award(0)).toBe('point');                    // 15-14: not by two
    b.award(1);                                          // 15-15
    for (let i = 0; i < 4; i++) { b.award(0); b.award(1); }   // 19-19
    expect(b.award(0)).toBe('set');                      // 20: the cap
  });

  it('the splash offers it and NetSportMode reads it (a pick nobody reads is a broken promise)', () => {
    // test changed (IMPROVE 2026-10-06, Tennis #5): tennis offers a quick match through the same pick, so it is listed
    expect(SET_LENGTH_MODES).toEqual(['volleyball', 'tennis']);
    const splash = src('components/games/boot-splash.tsx');
    expect(splash).toMatch(/SET_LENGTH_MODES\.includes\(props\.modeId\)/);
    expect(splash).toMatch(/setLengthsFor\(props\.modeId\)\.map/);   // each mode's own chips, not volleyball's for both
    const net = src('lib/babylon/modes/NetSportMode.ts');
    expect(net).toMatch(/setLengthOf\(readSetLength\(o\.modeId\), o\.modeId\)/);
    expect(net).toMatch(/new VolleyScore\(setLen\.target, setLen\.cap\)/);
    expect(net).toMatch(/new TennisScore\(setLen\.target\)/);
  });
});

describe('Tennis #5: the quick match', () => {
  it('tennis answers to its own numbers: 3 is a quick match, 6 the full one; volleyball\'s 15 is not a tennis length', () => {
    expect(readSetLength('tennis', '?set=3')).toBe('short');
    expect(readSetLength('tennis', '?set=short')).toBe('short');
    expect(readSetLength('tennis', '?set=6')).toBe('full');
    expect(readSetLength('tennis', '?set=15')).toBe('full');
    expect(readSetLength('volleyball', '?set=3')).toBe('full');
    expect(setLengthsFor('tennis')).toBe(TENNIS_MATCH_LENGTHS);
    expect(setLengthsFor('volleyball')).toBe(SET_LENGTHS);
    expect([setLengthLabel('tennis'), setLengthLabel('volleyball')]).toEqual(['MATCH', 'SET']);
  });

  it('the full match is still the field-depth six games; the quick one is first to three', () => {
    expect(setLengthOf('full', 'tennis').target).toBe(FIELD_DEPTH.tennisGames);
    expect(setLengthOf('short', 'tennis').target).toBe(3);
    const t = new TennisScore(setLengthOf('short', 'tennis').target);
    let r = 'point', points = 0;
    while (r !== 'match') { r = t.award(0); points++; }
    expect(t.games).toEqual([3, 0]);
    expect(points).toBe(12);
  });

  it('every length a mode offers has a distinct url value, and the volleyball lengths did not move', () => {
    for (const m of SET_LENGTH_MODES) { const ps = setLengthsFor(m).map((l) => l.param); expect(new Set(ps).size).toBe(ps.length); }
    expect(SET_LENGTHS.map((l) => [l.target, l.cap, l.param])).toEqual([[25, 30, '25'], [15, 20, '15']]);
  });

  it('a scored tennis run plays the full match whatever was picked', () => {
    for (const p of ['story=tennis.boss', 'arena=m1', 'mp=ABC', 'c=xyz']) expect(readSetLength('tennis', `?${p}&set=3`)).toBe('full');
  });
});

describe('a scored run always plays the full set', () => {
  it('story, arena, async-challenge and challenge-link runs ignore a short pick (their goals were measured to 25)', () => {
    for (const p of ['story=sandPit.boss', 'arena=m1', 'mp=ABC', 'c=xyz']) {
      expect(readSetLength('volleyball', `?${p}&set=15`)).toBe('full');
    }
    expect(readSetLength('volleyball', '?agent=1&set=15')).toBe('short');   // a QA run is not a scored one
  });
});
