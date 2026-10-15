// The Cypher's input chain, as a test can run it: one FelInput stream in, the judge's answers out.
//
// DanceMode's onInput → pressAt → DancePerformance.hit lives in a closure that needs the whole scene, so a test cannot call
// it. This runs the SAME pure functions the room calls, in the SAME order (danceTap → matchPress → the STYLE tap →
// the MATCH fumble → perf.hit), so what a stream of events does to the judge can be measured without a scene. It is a mirror,
// not the room: lib/babylon/modes/dancePadWiring.test.ts pins the room's source to the same sequence, so the two cannot
// drift apart without one of those tests failing.
//
// Time: every event carries the heard-clock second it lands at; perf.update runs at that second first (the frame that
// precedes an input event), exactly as the room's update() does.
import type { FelInput } from '../../lib/babylon/core/InputBus';
import { DancePerformance, beatDuration, type DanceStep, type Judgement } from '../../lib/babylon/core/DanceCore';
import { danceTap, type TriggerLatch } from '../../lib/babylon/audio/SongClock';
import { buttonForStep, matchPress, pressTarget, styleTapAt, GROOVE_STYLE, GROOVE_WINDOW_SEC } from '../../lib/babylon/dance/chartPlay';
import { STOOP_LOOKAHEAD } from '../../lib/babylon/dance/stoopWindows';
import { FreestyleDeck, freeSpanAt, freeStyleFor, routeFreestyle, type FreeSpan } from '../../lib/babylon/dance/freestyle';

export interface TimedInput { at: number; ev: FelInput }
export interface ChainResult {
  /** The judgement each judged hit got, in order (wild taps included as MISS). */
  labels: Judgement[];
  score: number;
  combo: number;
  maxCombo: number;
  counts: Record<Judgement, number>;
  /** STYLE tally (groove / style taps): never part of the score. */
  style: number;
  /** MATCH: presses refused with the wrong button. */
  wrongButton: number;
  /** Presses the chain ignored (not a tap at all). */
  ignored: number;
  /** Presses a FREESTYLE section took (lane/dance-extras): a move danced, never the judge. */
  freestyle: number;
  /** The moves those presses danced, in order (clip ids). */
  moves: string[];
}

export function runChain(o: {
  steps: DanceStep[];
  bpm: number;
  match: boolean;
  inputs: TimedInput[];
  /** The chart's STYLE beats (song beats), as the room reads them; none = no STYLE taps. */
  styleBeats?: number[];
  /** The chart's FREESTYLE sections (song beats): inside one every face button picks the move (DanceMode.freestylePress). */
  freeSpans?: FreeSpan[];
  /** Run to this heard second after the last input (so unanswered steps expire as MISS). */
  endAt?: number;
}): ChainResult {
  const perf = new DancePerformance(o.bpm);
  perf.setRoutine(o.steps);
  const labels: Judgement[] = [];
  perf.onJudged = (l) => { labels.push(l); };
  perf.start(0);
  let latch: TriggerLatch = 'up';
  const fumbled = new Set<DanceStep>();
  const taken = new Set<number>();
  const grooves = o.styleBeats ?? [];
  const bd = beatDuration(o.bpm);
  let style = 0, wrongButton = 0, ignored = 0, freestyle = 0;
  const moves: string[] = [];
  const deck = new FreestyleDeck();
  let freeCur: FreeSpan | null = null;

  for (const { at, ev } of [...o.inputs].sort((a, b) => a.at - b.at)) {
    perf.update(at);
    const t = danceTap(latch, ev);
    latch = t.latch;
    const btn = o.match ? matchPress(ev, t.tap) : null;
    // ── DanceMode.update's trackFreestyle, then onInput's freestylePress (before the tap guard) ──
    const span = o.freeSpans?.length ? freeSpanAt(o.freeSpans, at / bd) : null;
    if (span !== freeCur) { freeCur = span; if (span) deck.reset(); }
    if (freeCur) {
      const route = routeFreestyle({ e: ev, tap: t.tap, upcoming: perf.upcoming(at, STOOP_LOOKAHEAD), heardNow: at, beatPos: at / bd, beatSec: bd, styleBeats: grooves, taken });
      if (route) {
        moves.push(deck.press(route.slot).clipId);
        if (route.slotBeat !== null) taken.add(route.slotBeat);
        style += freeStyleFor(route);
        freestyle++;
        continue;
      }
    }
    if (!t.tap && !btn) { ignored++; continue; }
    // ── DanceMode.pressAt ──
    const near = grooves.length || o.match ? perf.upcoming(at, STOOP_LOOKAHEAD) : null;
    if (grooves.length && near) {
      const g = styleTapAt(grooves, near, at, at / bd, GROOVE_WINDOW_SEC / bd, taken);
      if (g !== null) { taken.add(g); style += GROOVE_STYLE; continue; }
    }
    if (o.match && btn && near) {
      const target = pressTarget(near, at);
      if (target) {
        if (fumbled.has(target.step)) continue;
        if (buttonForStep(target.step) !== btn) { fumbled.add(target.step); wrongButton++; continue; }
      }
    }
    void perf.hit(at);
  }
  perf.update(o.endAt ?? (o.inputs.length ? Math.max(...o.inputs.map((i) => i.at)) + 2 : 2));
  const r = perf.result();
  return { labels, score: r.score, combo: perf.combo, maxCombo: r.maxCombo, counts: r.counts, style, wrongButton, ignored, freestyle, moves };
}

/** A hand-made routine: the families the MATCH buttons carry, one step a bar at 120 BPM (a beat is 0.5 s). */
export function sampleSteps(): DanceStep[] {
  const mk = (clipId: string, beat: number, holdBeats: number): DanceStep => ({ clipId, beat, holdBeats, mirrored: false });
  return [
    mk('dance_toprock_basic', 0, 4),      // A
    mk('dance_footwork_six', 4, 8),       // B
    mk('dance_wave_arm', 12, 2),          // X
    mk('dance_freeze_baby', 16, 2),       // Y
    mk('dance_bounce_two_step', 20, 4),   // A
    mk('dance_trans_spin', 24, 2),        // X
    mk('dance_power_windmill', 28, 8),    // B
  ];
}
