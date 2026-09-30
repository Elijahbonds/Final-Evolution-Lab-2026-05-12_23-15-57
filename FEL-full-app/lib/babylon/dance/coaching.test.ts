// MUSIC-SUITE P9 (2026-09-29): the rush / drag line and the per-song best grades (dance/coaching.ts).

import { describe, it, expect } from 'vitest';
import {
  timingLean, POCKET_MS, RECALIBRATE_MS, MIN_LEAN_HITS, parseGradeBook, recordBest, withBest, GRADES_KEY, leanTag,
} from './coaching';
import { proofLineFor } from '@/lib/proofLine';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DancePerformance } from '../core/DanceCore';
import { pickBanner, trackById } from '../core/danceTracks';

const n = (count: number, v: number) => Array.from({ length: count }, () => v);

describe('rush / drag: the hits\' signed mean offset, in plain words', () => {
  it('rushing, dragging, in the pocket', () => {
    expect(timingLean(n(10, -34))).toEqual({ meanMs: -34, hits: 10, lean: 'rush', line: 'You rushed: 34 ms early on average. Let the beat come to you.' });
    expect(timingLean(n(10, 28))).toMatchObject({ meanMs: 28, lean: 'drag', line: 'You dragged: 28 ms late on average. Get on top of the beat.' });
    expect(timingLean([...n(6, -20), ...n(6, 18)])).toMatchObject({ meanMs: -1, lean: 'pocket', line: 'In the pocket: your hits averaged 1 ms from the beat.' });
    expect(timingLean(n(8, POCKET_MS))!.lean).toBe('pocket');
    expect(timingLean(n(8, POCKET_MS + 1))!.lean).toBe('drag');
  });

  it('a big steady lean points at the calibration (it is more likely the device than the dancer)', () => {
    expect(timingLean(n(9, -(RECALIBRATE_MS + 5)))!.line).toContain('recalibrate: /play/calibrate');
    expect(timingLean(n(9, RECALIBRATE_MS))!.line).not.toContain('recalibrate');
  });

  it('too few hits say nothing; non-finite offsets are dropped', () => {
    expect(timingLean(n(MIN_LEAN_HITS - 1, -50))).toBeNull();
    expect(timingLean([...n(MIN_LEAN_HITS - 1, -50), NaN, Infinity])).toBeNull();
    expect(timingLean([...n(MIN_LEAN_HITS, -50), NaN])!.hits).toBe(MIN_LEAN_HITS);
  });

  it('reads the judge\'s own signed deltas: a player 60 ms late on every step drags by ~60', () => {
    const p = new DancePerformance(60);
    p.setRoutine(Array.from({ length: 10 }, (_, i) => ({ clipId: 'dance_toprock_basic', beat: i, holdBeats: 1, mirrored: false })));
    const deltas: number[] = [];
    p.onJudged = (l, _pts, _c, _s, d) => { if (l !== 'MISS' && typeof d === 'number') deltas.push(d); };
    p.start(0);
    for (let i = 0; i < 10; i++) { p.update(i + 0.06); p.hit(i + 0.06); }
    const lean = timingLean(deltas)!;
    expect(lean.lean).toBe('drag');
    expect(lean.meanMs).toBe(60);
  });
});

describe('per-song best grades', () => {
  it('a song keeps its BEST accuracy; the grade is derived, never trusted from storage', () => {
    let book = parseGradeBook(null);
    expect(book).toEqual({});
    book = recordBest(book, 'warmup', 0.72);
    expect(book.warmup).toEqual({ accuracy: 0.72, grade: 'B' });
    const same = recordBest(book, 'warmup', 0.6);
    expect(same).toBe(book);                                   // nothing improved: the same object (no write)
    book = recordBest(book, 'warmup', 0.96);
    expect(book.warmup.grade).toBe('S');
    book = recordBest(book, 'battle', 1.4);                     // clamped
    expect(book.battle).toEqual({ accuracy: 1, grade: 'S' });
    expect(recordBest(book, '', 0.9)).toBe(book);
    expect(recordBest(book, 'x', NaN)).toBe(book);
    const round = parseGradeBook(JSON.stringify({ ...book, cypher: { accuracy: 0.51, grade: 'S' } }));
    expect(round.cypher.grade).toBe('C');                       // a hand-edited "S" is re-derived from its accuracy
  });

  it('a broken store reads as empty rows, never a crash', () => {
    expect(parseGradeBook('{nope')).toEqual({});
    expect(parseGradeBook('[1,2]')).toEqual({});
    expect(parseGradeBook(JSON.stringify({ a: { accuracy: 'high' }, b: null, c: { accuracy: 2 }, d: { accuracy: 0.9 } }))).toEqual({ d: { accuracy: 0.9, grade: 'A' } });
    expect(GRADES_KEY).toBe('fel:dance:grades:v1');
  });

  it('the pick banner gains the best grade beside the song, unchanged when there is none', () => {
    const banner = pickBanner(trackById('battle'));
    expect(withBest(banner, undefined)).toBe(banner);
    expect(withBest(banner, { accuracy: 0.9, grade: 'A' })).toBe(`${banner}  ·  BEST A`);
  });
});

// ── MUSIC-SUITE P9 FIX PASS (2026-09-29) ─────────────────────────────────────────────────────────────────────────────
describe('P9 FIX PASS: the lean stays on the results card, and a phone\'s lean never sends anyone to recalibrate', () => {
  it('leanTag: the card\'s short form of the lean, from stats.offsetMs', () => {
    expect(leanTag(-34)).toBe('RUSHED 34 MS');
    expect(leanTag(28.4)).toBe('DRAGGED 28 MS');
    expect(leanTag(POCKET_MS)).toBe('IN THE POCKET');
    expect(leanTag(-POCKET_MS)).toBe('IN THE POCKET');
    expect(leanTag(undefined)).toBeNull();
    expect(leanTag(Number.NaN)).toBeNull();
  });

  it('the dance proof line keeps it after the grade (the 2.2 s room chip was its only place); a card without it is unchanged', () => {
    const stats = { stars: 4, accuracy: 88, maxCombo: 31 };
    const before = proofLineFor('dance', { score: 12_345, won: true, stats });
    expect(before).toBe('12345 PTS · ★★★★ · 88% · GRADE A · ×31 COMBO');
    expect(proofLineFor('dance', { score: 12_345, won: true, stats: { ...stats, offsetMs: -34 } })).toBe(`${before} · RUSHED 34 MS`);
    expect(proofLineFor('dance', { score: 12_345, won: true, stats: { ...stats, offsetMs: 3 } })).toBe(`${before} · IN THE POCKET`);
  });

  it('timingLean({ recalibrate: false }) leaves /play/calibrate out — the room passes it when any press came from the phone', () => {
    const lagging = n(10, RECALIBRATE_MS + 20);
    expect(timingLean(lagging)!.line).toContain('/play/calibrate');
    const phone = timingLean(lagging, { recalibrate: false })!;
    expect(phone.line).not.toContain('calibrate');
    expect(phone.lean).toBe('drag');
    const room = readFileSync(join(process.cwd(), 'lib/babylon/modes/DanceMode.ts'), 'utf8');
    expect(room).toContain('const lean = timingLean(offsets, { recalibrate: phonePresses === 0 });');
    expect(room).toContain('...(lean ? { offsetMs: lean.meanMs } : {}),');   // what the card reads
  });
});
