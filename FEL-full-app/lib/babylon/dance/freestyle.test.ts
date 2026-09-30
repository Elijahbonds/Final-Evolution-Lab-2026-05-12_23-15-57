// MUSIC-SUITE P9 (2026-09-29): the dance room's freestyle input edges, bar cues and free-dance switch (dance/freestyle.ts).

import { describe, it, expect } from 'vitest';
import type { FelInput } from '../core/InputBus';
import { KEY_SPACE_DOWN } from '../core/StartWake';
import { danceTap, type TriggerLatch } from '../audio/SongClock';
import {
  pressEdge, padMove, barKindAt, barCue, stoopCueRoom, freeDanceFromQuery, FREESTYLE_BANNER, CALLBAR_BANNER,
  FULL_BAND_HITS, FREESTYLE_CAMERA_STREAK, type PressKey,
  freestylePickSwitch, FREESTYLE_MIN_SHOW_BEATS, upcomingHoldLine, holdingLine, padMovesLine,
} from './freestyle';
import * as freestyleModule from './freestyle';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FREESTYLE_PAD, barKindsFor, chartStepsFor } from './chart';
import { FEL_SONGS, secPerBar } from './felSongs';
import { beatDuration } from '../core/DanceCore';
import { nextStemLevel } from '../audio/StemBand';
import { STOOP, stoopLines } from '../audio/mic/script/stoop';

/** Feed events through pressEdge; returns each edge (down / up keys), and the same stream's danceTap taps. */
function feed(events: FelInput[], start: TriggerLatch = 'up'): { downs: (PressKey | null)[]; ups: (PressKey | null)[]; taps: boolean[] } {
  let a = start, b = start;
  const downs: (PressKey | null)[] = [], ups: (PressKey | null)[] = [], taps: boolean[] = [];
  for (const e of events) {
    const r = pressEdge(a, e); a = r.latch; downs.push(r.down); ups.push(r.up);
    const t = danceTap(b, e); b = t.latch; taps.push(t.tap);
  }
  expect(a).toBe(b);                                    // the latch is danceTap's own, event for event
  return { downs, ups, taps };
}

describe('pressEdge: danceTap underneath, plus which key, X / Y, and releases', () => {
  it('A / B press and release; X / Y too (danceTap never tapped them)', () => {
    const btn = (b: 'A' | 'B' | 'X' | 'Y', pressed: boolean): FelInput => ({ t: 'button', btn: b, pressed });
    const r = feed([btn('A', true), btn('A', false), btn('B', true), btn('B', false), btn('X', true), btn('X', false), btn('Y', true), btn('Y', false)]);
    expect(r.downs).toEqual(['A', null, 'B', null, 'X', null, 'Y', null]);
    expect(r.ups).toEqual([null, 'A', null, 'B', null, 'X', null, 'Y']);
    // on every input danceTap taps, pressEdge presses (the called bars' taps are unchanged)
    r.taps.forEach((t, i) => { if (t) expect(r.downs[i]).not.toBeNull(); });
    expect(r.taps).toEqual([true, false, true, false, false, false, false, false]);
  });

  it('an R pull: one press at the crossing, nothing while held (a pad re-sends every frame), one release when let go', () => {
    const trig = (value: number): FelInput => ({ t: 'trigger', side: 'R', value });
    const r = feed([trig(0.1), trig(0.6), trig(0.9), trig(0.9), trig(0.5), trig(0.2), trig(0.0), trig(0.7)]);
    expect(r.downs).toEqual([null, 'R2', null, null, null, null, null, 'R2']);
    expect(r.ups).toEqual([null, null, null, null, null, 'R2', null, null]);
  });

  it('SPACE: pressed on the way down; released on its latch coming up or on the made-up key-up A — never pressed by that A', () => {
    const down: FelInput = { t: 'trigger', side: 'R', value: KEY_SPACE_DOWN };
    const depth = (v: number): FelInput => ({ t: 'trigger', side: 'R', value: v });
    const upA: FelInput = { t: 'button', btn: 'A', pressed: true, src: 'space' };
    // a quick tap: the 0 before any depth is the key's own first frame (P2 FIX PASS), so the key-up A releases it
    const quick = feed([down, depth(0), upA]);
    expect(quick.downs).toEqual(['SPACE', null, null]);
    expect(quick.ups).toEqual([null, null, 'SPACE']);
    // a hold: the depth climbs, then 0 on key-up releases it (the A after it releases again, which costs nothing)
    const held = feed([down, depth(0.3), depth(0.6), depth(0.6), depth(0), upA]);
    expect(held.downs).toEqual(['SPACE', null, null, null, null, null]);
    expect(held.ups).toEqual([null, null, null, null, 'SPACE', 'SPACE']);
  });

  it('anything else is neither (the L trigger, sticks, the d-pad, START)', () => {
    const r = feed([
      { t: 'trigger', side: 'L', value: 1 }, { t: 'stick', side: 'L', x: 1, y: 0 },
      { t: 'dpad', dir: 'up', pressed: true }, { t: 'button', btn: 'START', pressed: true },
    ]);
    expect([...r.downs, ...r.ups].every((x) => x === null)).toBe(true);
  });

  // MUSIC-SUITE P9 FIX PASS (2026-09-29): CHANGED ASSERTION (named in the report). This pinned "X and Y press only where a
  // freestyle slot is the nearest step" — the blocker itself: the phone pad and the touch rig name X/Y ARM WAVE and SPIN,
  // the charts call those moves by name, and a press of the named button was dropped and the step expired a MISS. Every
  // pad button now presses on every step (roomPlay.test.ts plays it through the judge); the gate function is gone.
  it('every pad button presses on every step: the X / Y gate (acceptsPress) is gone, from this file and from the room', () => {
    expect('acceptsPress' in freestyleModule).toBe(false);
    const room = readFileSync(join(process.cwd(), 'lib/babylon/modes/DanceMode.ts'), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    expect(room).not.toMatch(/acceptsPress|freeSlotNearest/);
  });

  it('the pad: a face button\'s own move; R2, SPACE and a phone TAP (an A) pick A\'s', () => {
    expect(padMove('A')).toBe(FREESTYLE_PAD.A);
    expect(padMove('Y')).toBe(FREESTYLE_PAD.Y);
    expect(padMove('R2')).toBe(FREESTYLE_PAD.A);
    expect(padMove('SPACE')).toBe(FREESTYLE_PAD.A);
    expect(new Set(Object.values(FREESTYLE_PAD)).size).toBe(4);
  });
});

describe('bar cues: Stoop a bar ahead, the banner on the switch', () => {
  it('a call → free → call run', () => {
    const k = ['call', 'call', 'free', 'free', 'call', 'call'] as const;
    expect([0, 1, 2, 3, 4, 5].map((i) => barCue([...k], i))).toEqual([
      { stoop: null, banner: null },
      { stoop: 'dance.freestyle', banner: null },          // the bar before the switch: Stoop gets a bar to say it
      { stoop: null, banner: FREESTYLE_BANNER },            // the switch: the banner
      { stoop: 'dance.callbar', banner: null },
      { stoop: null, banner: CALLBAR_BANNER },
      { stoop: null, banner: null },
    ]);
    expect(barCue(null, 0)).toEqual({ stoop: null, banner: null });
    expect(barCue([...k], 99)).toEqual({ stoop: null, banner: null });
    expect(barKindAt([...k], 2)).toBe('free');
    expect(barKindAt([...k], -1)).toBe('call');
    expect(barKindAt(null, 3)).toBe('call');
  });

  it('every shipped chart: each freestyle block is announced once, and each return to called bars once', () => {
    for (const s of FEL_SONGS) {
      const kinds = barKindsFor(s)!;
      const blocks = kinds.filter((k, i) => k === 'free' && kinds[i - 1] !== 'free').length;
      const cues = kinds.map((_, i) => barCue(kinds, i));
      expect(cues.filter((c) => c.stoop === 'dance.freestyle').length, s.id).toBe(blocks);
      expect(cues.filter((c) => c.banner === FREESTYLE_BANNER).length, s.id).toBe(blocks);
      expect(cues.filter((c) => c.stoop === 'dance.callbar').length, s.id).toBe(blocks);   // every block is followed by called bars
      expect(stoopLines('dance.freestyle').length).toBeGreaterThan(0);
      expect(stoopLines('dance.callbar').length).toBeGreaterThan(0);
    }
    expect(STOOP.id).toBe('stoop');
  });

  it('stoopCueRoom: the guard P8 built decides whether a line is SAID — measured, per chart (the phase report quotes these)', () => {
    // a toy chart: a step every beat except a 3-beat gap after the cue bar's first beat — a 2 s line fits there only
    const toy = ['call', 'free'] as const;   // one cue: bar 0 announces the freestyle bar
    const times = [0, 1, 2, 3, 4.5, 5, 6, 7, 8];
    expect(stoopCueRoom([...toy], [0.5, 4, 5, 6, 7], 4, 2)).toEqual({ cues: 1, fits: 1 });   // gap 0.62 → 3.88
    expect(stoopCueRoom([...toy], times, 4, 2)).toEqual({ cues: 1, fits: 0 });                  // never 2 s clear inside 4 s
    const shortest = Math.min(...stoopLines('dance.freestyle').map((l) => l.text.split(/\s+/).length));
    expect(shortest).toBeGreaterThan(0);
    const report: string[] = [];
    for (const s of FEL_SONGS) {
      const kinds = barKindsFor(s)!;
      const bd = beatDuration(s.bpm);
      const times2 = chartStepsFor(s)!.map((st) => st.beat * bd);
      const r2 = stoopCueRoom(kinds, times2, secPerBar(s), 2.0);
      report.push(`${s.id} ${r2.fits}/${r2.cues}`);
      expect(r2.cues).toBeGreaterThan(0);
    }
    console.info(`[P9 stoop] freestyle/call-bar cues with room for a 2.0 s line (the shortest rendered is 1.76 s): ${report.join(', ')}`);
  });
});

describe('free dance', () => {
  it('?free=1 / ?dance=free open it; nothing else does', () => {
    expect(freeDanceFromQuery('?free=1')).toBe(true);
    expect(freeDanceFromQuery('?track=battle&free=1')).toBe(true);
    expect(freeDanceFromQuery('?dance=free')).toBe(true);
    expect(freeDanceFromQuery('?free=0')).toBe(false);
    expect(freeDanceFromQuery('?freestyle=1')).toBe(false);
    expect(freeDanceFromQuery('')).toBe(false);
    expect(freeDanceFromQuery(null)).toBe(false);
  });

  it('FULL_BAND_HITS clean hits take a silent stem to full (the band plays everything), through the bands\' own judge', () => {
    let level = 0;
    for (let i = 0; i < FULL_BAND_HITS; i++) level = nextStemLevel(level, 'PERFECT');
    expect(level).toBe(1);
    let short = 0;
    for (let i = 0; i < FULL_BAND_HITS - 1; i++) short = nextStemLevel(short, 'PERFECT');
    expect(short).toBeLessThan(1);
  });

  it('the freestyle camera frame is a streak, inside the stage camera\'s cap (stageCamera streakCap 24)', () => {
    expect(FREESTYLE_CAMERA_STREAK).toBeGreaterThan(0);
    expect(FREESTYLE_CAMERA_STREAK).toBeLessThanOrEqual(24);
  });
});

// ── MUSIC-SUITE P9 FIX PASS (2026-09-29) ─────────────────────────────────────────────────────────────────────────────
describe('P9 FIX PASS: a freestyle pick is seen whole (freestylePickSwitch)', () => {
  it('the running move carries on; the first pick after a called move changes at once; a pick sooner than the show time waits', () => {
    expect(FREESTYLE_MIN_SHOW_BEATS).toBe(2);
    expect(freestylePickSwitch({ pick: 'dance_wave_arm', dancing: 'dance_wave_arm', lastPickBeat: 10, nowBeat: 10.5 })).toBe('same');
    expect(freestylePickSwitch({ pick: 'dance_wave_arm', dancing: 'dance_toprock_basic', lastPickBeat: null, nowBeat: 10 })).toBe('now');
    expect(freestylePickSwitch({ pick: 'dance_trans_spin', dancing: 'dance_wave_arm', lastPickBeat: 10, nowBeat: 11 })).toBe('later');
    expect(freestylePickSwitch({ pick: 'dance_trans_spin', dancing: 'dance_wave_arm', lastPickBeat: 10, nowBeat: 11.5 })).toBe('later');
    expect(freestylePickSwitch({ pick: 'dance_trans_spin', dancing: 'dance_wave_arm', lastPickBeat: 10, nowBeat: 12 })).toBe('now');
  });

  it('on the densest freestyle (evolution\'s ½-beat slots, the four moves in turn) the body changes at most every 2 beats', () => {
    let dancing: string | null = 'dance_toprock_basic', lastPick: number | null = null, queued: string | null = null;
    const changes: number[] = [];
    const pad = Object.values(FREESTYLE_PAD);
    for (let k = 0; k < 32; k++) {
      const beat = 100 + k * 0.5;
      if (queued && lastPick !== null && beat - lastPick >= FREESTYLE_MIN_SHOW_BEATS) { dancing = queued; queued = null; lastPick = beat; changes.push(beat); }
      const pick = pad[k % 4];
      const sw = freestylePickSwitch({ pick, dancing, lastPickBeat: lastPick, nowBeat: beat });
      if (sw === 'now') { dancing = pick; lastPick = beat; queued = null; changes.push(beat); } else if (sw === 'later') queued = pick; else queued = null;
    }
    for (let i = 1; i < changes.length; i++) expect(changes[i] - changes[i - 1]).toBeGreaterThanOrEqual(FREESTYLE_MIN_SHOW_BEATS);
    expect(changes.length).toBeGreaterThanOrEqual(7);                    // it still dances the picks — just never a flicker
  });

  it('DanceMode routes picks through it and dances a waiting pick when its time is up', () => {
    const room = readFileSync(join(process.cwd(), 'lib/babylon/modes/DanceMode.ts'), 'utf8');
    expect(room).toContain('const sw = freestylePickSwitch({ pick: pick.move, dancing: moveClipId, lastPickBeat: pickSwitchBeat, nowBeat });');
    expect(room).toContain('if (queuedPick && pickSwitchBeat !== null && (heard - startAt) / bd - pickSwitchBeat >= FREESTYLE_MIN_SHOW_BEATS - 1e-9) {');
  });
});

describe('P9 FIX PASS: the hold on the bottom line, the pad by its moves\' names', () => {
  it('a hold\'s cue says how long; a held hold counts down', () => {
    expect(upcomingHoldLine('Baby Freeze', 3)).toBe('HOLD BABY FREEZE · 3 BEATS');
    expect(upcomingHoldLine('Side Freeze', 1)).toBe('HOLD SIDE FREEZE · 1 BEAT');
    expect(upcomingHoldLine('Baby Freeze', 1.5)).toBe('HOLD BABY FREEZE · 1.5 BEATS');
    expect(holdingLine('Baby Freeze', 1.234)).toBe('KEEP HOLDING BABY FREEZE · 1.2s');
    expect(holdingLine('Baby Freeze', -0.2)).toBe('KEEP HOLDING BABY FREEZE · 0.0s');
  });

  it('DanceMode shows the countdown while a hold is down (not the next move), and the length before it', () => {
    const room = readFileSync(join(process.cwd(), 'lib/babylon/modes/DanceMode.ts'), 'utf8');
    expect(room).toContain('if (!freeDance && perf.holding) {');
    expect(room).toContain('hud.nextStep = holdingLine(');
    expect(room).toContain('upcomingHoldLine(clip?.name ?? \'MOVE\', next.step.pressHoldBeats!)');
  });

  it('the freestyle hint names the four moves, as the phone pad and the touch rig do', () => {
    expect(padMovesLine({ A: 'Top Rock', B: 'Two Step', X: 'Arm Wave', Y: 'Spin' })).toBe('YOUR MOVE · TOP ROCK / TWO STEP / ARM WAVE / SPIN');
  });
});
