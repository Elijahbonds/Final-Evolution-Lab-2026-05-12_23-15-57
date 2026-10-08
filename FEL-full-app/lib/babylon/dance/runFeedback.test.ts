// IMPROVE (2026-10-06): the Cypher's run feedback (runFeedback.ts) — EARLY/LATE on every hit (#1), one banner clear
// time (#2), the run's timing offset (#3), full combo (#6) and the weakest section (#9).
import { describe, expect, it } from 'vitest';
import {
  BannerClock, judgementBanner, judgementTag, offsetSummary, OFFSET_LEAN_MS, OFFSET_MIN_HITS, isFullCombo, sectionOf,
  SectionTally,
} from './runFeedback';
import { FEL_SONGS } from './felSongs';

describe('#1 judgementTag / judgementBanner', () => {
  it('names the side on GREAT and GOOD, not only on a MISS', () => {
    expect(judgementTag('GREAT', -60)).toBe(' — EARLY');
    expect(judgementTag('GOOD', 150)).toBe(' — LATE');
    expect(judgementTag('MISS', -210)).toBe(' — EARLY');
  });
  it('a PERFECT, or a judgement with no delta (an expired step), names no side', () => {
    expect(judgementTag('PERFECT', 30)).toBe('');
    expect(judgementTag('GOOD', undefined)).toBe('');
    expect(judgementTag('MISS', Number.NaN)).toBe('');
  });
  it('keeps the side under a combo, and an instrument joining still wins the banner', () => {
    expect(judgementBanner('GREAT', 7, 55, null)).toBe('GREAT — LATE  ×7');
    expect(judgementBanner('GOOD', 2, -120, null)).toBe('GOOD — EARLY');
    expect(judgementBanner('PERFECT', 9, 3, null)).toBe('PERFECT  ×9');
    expect(judgementBanner('GOOD', 9, -120, 'BASS JOINS THE MIX')).toBe('BASS JOINS THE MIX');
  });
});

describe('#2 BannerClock — one clear time, the newest banner wins', () => {
  it('an older banner\'s clear never fires after a newer banner went up', () => {
    const b = new BannerClock();
    b.show(0, 1000);        // "X JOINS THE MIX" at t = 0, 1 s
    b.show(200, 380);       // a judgement at 0.2 s replaces it: clears at 0.58 s
    expect(b.due(500)).toBe(false);
    expect(b.due(580)).toBe(true);
    expect(b.due(1000)).toBe(false);   // the join's old 1 s clear is gone, it does not fire again
  });
  it('a newer, longer banner is not cut short by an older short one (the race the setTimeouts had)', () => {
    const b = new BannerClock();
    b.show(0, 380);         // GOOD at t = 0
    b.show(100, 1000);      // an instrument joins at 0.1 s
    expect(b.due(380)).toBe(false);    // the GOOD's 380 ms would have wiped the join here
    expect(b.due(1100)).toBe(true);
  });
  it('cancel drops the pending clear (the results own the banner)', () => {
    const b = new BannerClock();
    b.show(0, 380);
    b.cancel();
    expect(b.pending).toBe(false);
    expect(b.due(10_000)).toBe(false);
  });
});

describe('#3 offsetSummary', () => {
  it('says nothing until there are enough hits', () => {
    expect(offsetSummary(400, OFFSET_MIN_HITS - 1)).toEqual({ avgMs: null, lean: null, line: '' });
  });
  it('a late lean reads "+38 ms LATE" and points at the calibration screen', () => {
    const s = offsetSummary(38 * 20, 20);
    expect(s.avgMs).toBe(38);
    expect(s.lean).toBe('late');
    expect(s.line).toContain('+38 ms LATE');
    expect(s.line).toContain('/play/calibrate');
  });
  it('an early lean reads negative and EARLY', () => {
    const s = offsetSummary(-30 * 10, 10);
    expect(s.lean).toBe('early');
    expect(s.line).toContain('-30 ms EARLY');
  });
  it('a small average is in the pocket, with no recalibrate prompt', () => {
    const s = offsetSummary((OFFSET_LEAN_MS - 1) * 10, 10);
    expect(s.lean).toBeNull();
    expect(s.line).toContain('IN THE POCKET');
    expect(s.line).not.toContain('calibrate');
  });
});

describe('#6 isFullCombo', () => {
  it('is no MISS and at least one hit', () => {
    expect(isFullCombo({ PERFECT: 10, GREAT: 3, GOOD: 1, MISS: 0 })).toBe(true);
    expect(isFullCombo({ PERFECT: 10, GREAT: 3, GOOD: 1, MISS: 1 })).toBe(false);
    expect(isFullCombo({ PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 })).toBe(false);
  });
});

describe('#9 sectionOf / SectionTally', () => {
  const song = FEL_SONGS.find((s) => s.id === 'warmup')!;   // intro 4 · verse 8 · hook 8 · break 2 · verse 4 · hook 8 · outro 2
  it('numbers a repeated section name and leaves a unique one bare', () => {
    expect(sectionOf(song, 0).label).toBe('INTRO');
    expect(sectionOf(song, 4 * 4).label).toBe('VERSE 1');        // bar 5
    expect(sectionOf(song, (4 + 8) * 4).label).toBe('HOOK 1');   // bar 13
    const hook2Start = song.sections.filter((s) => s.name === 'hook')[1].startBar;
    expect(sectionOf(song, (hook2Start - 1) * 4 + 2).label).toBe('HOOK 2');
  });
  it('a song-less chart (a player export) is told in 8-bar phrases', () => {
    expect(sectionOf(undefined, 0).label).toBe('BARS 1–8');
    expect(sectionOf(undefined, 8 * 4).label).toBe('BARS 9–16');
  });
  it('the weakest section is the one with the most misses, the earlier on a tie; hits never count', () => {
    const t = new SectionTally(song);
    expect(t.weakest()).toBeNull();
    expect(t.line()).toBe('');
    const hook2Beat = (song.sections.filter((s) => s.name === 'hook')[1].startBar - 1) * 4;
    t.note(0, 'MISS');
    for (let i = 0; i < 4; i++) t.note(hook2Beat + i * 2, 'MISS');
    for (let i = 0; i < 9; i++) t.note(16, 'PERFECT');
    expect(t.weakest()).toEqual({ label: 'HOOK 2', misses: 4 });
    expect(t.line()).toBe('PRACTISE HOOK 2 · 4 MISSES');
    const tie = new SectionTally(song);
    tie.note(16, 'MISS'); tie.note(0, 'MISS');
    expect(tie.weakest()?.label).toBe('INTRO');
  });
});
