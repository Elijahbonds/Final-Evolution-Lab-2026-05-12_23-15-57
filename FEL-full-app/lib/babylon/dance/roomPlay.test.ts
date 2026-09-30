// MUSIC-SUITE P9 (2026-09-29): the room's P9 input path, played headless over every shipped chart. The dance room's dev
// server (:3121) was down for this phase as for every one before it, so this drives the SAME pure pieces DanceMode.ts
// wires, in the same order (DanceMode onInput: pressEdge → hit(heard, { key, move: padMove }) ; a release →
// release(heard, key)), with real FelInput events — a pad's face buttons, the R trigger, SPACE — on the judge's own clock,
// and checks what a player would see at the end. (MUSIC-SUITE P9 FIX PASS, 2026-09-29: the X / Y gate, acceptsPress, is
// gone — every pad button presses on every step.)

import { describe, it, expect } from 'vitest';
import type { FelInput } from '../core/InputBus';
import { KEY_SPACE_DOWN } from '../core/StartWake';
import type { TriggerLatch } from '../audio/SongClock';
import { DancePerformance, beatDuration, isFreeSlot, isPressHold, type DanceResult, type DanceStep } from '../core/DanceCore';
import { pressEdge, padMove } from './freestyle';
import { chartStepsFor, FREESTYLE_PAD, type PadButton } from './chart';
import { FEL_SONGS, type FelSong } from './felSongs';

type Ev = { t: number; e: FelInput };
const btn = (b: 'A' | 'B' | 'X' | 'Y', pressed: boolean): FelInput => ({ t: 'button', btn: b, pressed });

/** The room's onInput for the 'playing' phase, minus the scene: exactly DanceMode's order of decisions. */
function playRoom(song: FelSong, events: Ev[]): { r: DanceResult; ignored: number } {
  const steps = chartStepsFor(song)!;
  const perf = new DancePerformance(song.bpm);
  perf.setRoutine(steps);
  perf.start(0);
  let latch: TriggerLatch = 'up';
  const ignored = 0;   // (nothing is ignored any more: every pad button presses on every step)
  for (const { t, e } of [...events].sort((a, b) => a.t - b.t)) {
    perf.update(t);
    const edge = pressEdge(latch, e);
    latch = edge.latch;
    if (edge.up && perf.holding) perf.release(t, edge.up);
    if (!edge.down) continue;
    perf.hit(t, { key: edge.down, move: padMove(edge.down) });
  }
  perf.update((perf.totalBeats + 1) * beatDuration(song.bpm));
  return { r: perf.result(), ignored };
}

/** A player who presses every step on time: `key(i, step)` picks the button; holds are held `holdFor` of their length. */
function script(song: FelSong, key: (i: number, s: DanceStep) => 'A' | 'B' | 'X' | 'Y', holdFor = 1.05): Ev[] {
  const bd = beatDuration(song.bpm);
  const out: Ev[] = [];
  chartStepsFor(song)!.forEach((s, i) => {
    const t = s.beat * bd + 0.012;
    const k = key(i, s);
    out.push({ t, e: btn(k, true) });
    const up = isPressHold(s) ? t + s.pressHoldBeats! * bd * holdFor : t + 0.06;
    out.push({ t: up, e: btn(k, false) });
  });
  return out;
}

describe('the room, played headless over every shipped chart', () => {
  it('on time, holds held, the pad cycled in freestyle: every press PERFECT, every hold kept, full variety', () => {
    for (const s of FEL_SONGS) {
      let turn = 0;
      const pad = ['A', 'B', 'X', 'Y'] as const;
      const { r, ignored } = playRoom(s, script(s, (_i, st) => (isFreeSlot(st) ? pad[turn++ % 4] : 'A')));
      const steps = chartStepsFor(s)!;
      const holds = steps.filter(isPressHold).length;
      expect(ignored, s.id).toBe(0);
      expect(r.counts, s.id).toEqual({ PERFECT: steps.length + holds, GREAT: 0, GOOD: 0, MISS: 0 });
      expect(r.holds).toEqual({ kept: holds, dropped: 0 });
      expect(r.variety).toBe(1);
      expect(r.accuracy).toBe(1);
    }
  });

  it('letting go of every hold halfway drops every hold (a MISS each), and nothing else changes', () => {
    for (const s of FEL_SONGS) {
      const { r } = playRoom(s, script(s, () => 'A', 0.5));
      const steps = chartStepsFor(s)!;
      const holds = steps.filter(isPressHold).length;
      expect(r.holds, s.id).toEqual({ kept: 0, dropped: holds });
      expect(r.counts).toEqual({ PERFECT: steps.length, GREAT: 0, GOOD: 0, MISS: holds });
    }
  });

  it('one button all song: the timing is perfect, the freestyle award decays (variety floored) and the score drops', () => {
    for (const s of FEL_SONGS) {
      let turn = 0;
      const pad = ['A', 'B', 'X', 'Y'] as const;
      const varied = playRoom(s, script(s, (_i, st) => (isFreeSlot(st) ? pad[turn++ % 4] : 'A'))).r;
      const same = playRoom(s, script(s, () => 'A')).r;
      expect(same.accuracy).toBe(1);                              // timing is timing
      expect(same.variety!).toBeLessThan(0.35);
      expect(same.score, s.id).toBeLessThan(varied.score);
    }
  });

  // MUSIC-SUITE P9 FIX PASS (2026-09-29): CHANGED ASSERTION (named in the report). This pinned "X and Y in a CALLED bar are
  // the no-op they always were" — the blocker: a phone or touch player pressing SPIN on a step the lane calls Spin got no
  // press, and the step expired a MISS. Now X / Y press on called steps like A / B, and still pick in freestyle bars.
  it('Y on a called SPIN step is judged (and X on an ARM WAVE); in a freestyle bar they still pick', () => {
    const s = FEL_SONGS[0];
    const bd = beatDuration(s.bpm);
    const spin = chartStepsFor(s)!.find((st) => !isFreeSlot(st) && st.clipId === FREESTYLE_PAD.Y)!;
    const wave = chartStepsFor(s)!.find((st) => !isFreeSlot(st) && st.clipId === FREESTYLE_PAD.X)!;
    const free = chartStepsFor(s)!.find(isFreeSlot)!;
    expect(spin && wave, 'warmup calls Spin and Arm Wave by name').toBeTruthy();
    const out = playRoom(s, [
      { t: spin.beat * bd, e: btn('Y', true) }, { t: spin.beat * bd + 0.05, e: btn('Y', false) },
      { t: wave.beat * bd, e: btn('X', true) }, { t: wave.beat * bd + 0.05, e: btn('X', false) },
      { t: free.beat * bd, e: btn('Y', true) }, { t: free.beat * bd + 0.05, e: btn('Y', false) },
    ]);
    expect(out.ignored).toBe(0);
    expect(out.r.counts.PERFECT).toBe(3);                         // the called Spin, the called Arm Wave and the freestyle Y
    expect(out.r.variety).toBe(1);
  });

  it('THE PHASE REVIEW\'S PLAYER, on every song: perfect timing, pressing the button named by the running move — 100 %', () => {
    // (measured before the fix: 84.6 / 83.1 / 78.7 / 92.1 / 86.4 / 84.2 % — the named X / Y presses were dropped)
    const byMove = new Map<string, PadButton>((Object.entries(FREESTYLE_PAD) as [PadButton, string][]).map(([k, id]) => [id, k]));
    const pad = ['A', 'B', 'X', 'Y'] as const;
    for (const s of FEL_SONGS) {
      let turn = 0;
      const { r, ignored } = playRoom(s, script(s, (_i, st) => (isFreeSlot(st) ? pad[turn++ % 4] : byMove.get(st.clipId) ?? 'A')));
      expect(ignored, s.id).toBe(0);
      expect(r.accuracy, s.id).toBe(1);
      expect(r.counts.MISS, s.id).toBe(0);
    }
  });

  it('the R trigger and SPACE hold a freeze too: the release comes from the trigger latch / the key coming up', () => {
    const s = FEL_SONGS[0];
    const bd = beatDuration(s.bpm);
    const hold = chartStepsFor(s)!.find(isPressHold)!;
    const t = hold.beat * bd;
    const end = t + hold.pressHoldBeats! * bd;
    const trig = (tt: number, value: number): Ev => ({ t: tt, e: { t: 'trigger', side: 'R', value } });
    const r2 = playRoom(s, [trig(t - 0.01, 0.1), trig(t, 0.9), trig(t + 0.2, 0.9), trig(end + 0.01, 0.1)]).r;
    expect(r2.holds).toEqual({ kept: 1, dropped: expect.any(Number) });
    const r2early = playRoom(s, [trig(t - 0.01, 0.1), trig(t, 0.9), trig(t + 0.2, 0.1)]).r;
    expect(r2early.holds!.kept).toBe(0);
    const space = playRoom(s, [
      { t, e: { t: 'trigger', side: 'R', value: KEY_SPACE_DOWN } }, trig(t + 0.3, 0.6), trig(t + 0.2 + (end - t) / 2, 0),
      { t: t + 0.21 + (end - t) / 2, e: { t: 'button', btn: 'A', pressed: true, src: 'space' } },
    ]).r;
    expect(space.holds!.kept).toBe(0);                            // let go halfway: dropped, and the key-up A pressed nothing
    expect(space.counts.PERFECT).toBe(1);
  });
});
