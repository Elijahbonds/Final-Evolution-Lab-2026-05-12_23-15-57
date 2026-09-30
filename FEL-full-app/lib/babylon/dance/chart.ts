// chart — MUSIC-SUITE P9 (2026-09-29, "charts, freestyle and fair dance duels"): the AUTHORED dance charts of the six FEL
// house songs, their format, the loader that turns one into DanceCore steps, and the validator.
//
// WHAT WAS WRONG. P7 shipped the six songs with press steps GENERATED from each song's section map
// (danceTracks.stepsForSong): one move per earned stem at an energy-driven gap. Measured on this lane before this file
// (a throwaway vitest over stepsForSong): 15.9 / 17.4 / 18.9 / 22.2 / 23.3 / 26.4 taps a minute for warmup … evolution,
// against the songs' own targetTapsPerMin of 28 / 40 / 54 / 68 / 84 / 100 (map.json, CONTRACT.md §5) — every chart
// at a quarter to a half of its target, the "hard" songs nearly as sparse as the easy one, every press a move start on
// a downbeat, and nothing a player could DO inside a move. PLAN phase 9 asked for authored charts: accents inside
// moves, double taps, freeze holds and sections, easy → hard.
//
// WHERE THE CHARTS LIVE (decided, per the phase brief's "decide and document"): lib/babylon/dance/charts/<song>.json,
// imported statically here. Not public/audio/songs/<id>/chart.json, because (1) that folder is an AUDIO provenance
// root — lib/babylon/music/provenance.test.ts requires a PROVENANCE.json entry (sha256, licence, the rendering script)
// for every file in it, and a chart is FEL-authored data, not rendered audio; (2) the chart is JUDGED — on the device
// and, for an Arena duel, again on the server from the press list (P6's rejudge pattern) — so it must be in the bundle
// synchronously, with no fetch that could fail or race the count-in, exactly like felSongsData.json.
//
// THE FORMAT ("fel-dance-chart/1"). A chart is the song's own sections (same names, bars and order as map.json), each
// playing a list of PHRASES; a phrase is a whole number of 4/4 bars that is either CALLED (a list of notes) or FREESTYLE:
//   { "b": 0, "m": "toprock" }            a MOVE starts on beat 0 of the phrase: press, and the dancer dances it until
//                                          the next move (b is in beats from the phrase's start: 0.5 = the "and",
//                                          0.25 / 0.75 = the "e" / "a" sixteenths)
//   { "b": 3 }                             an ACCENT: a press INSIDE the running move (no new clip — the dancer hits it)
//   { "b": 6, "x2": 0.5 }                  a DOUBLE TAP: this press and a second one x2 beats later
//   { "b": 0, "m": "babyfreeze", "hold": 3 }  a FREEZE HOLD: press and keep it down for 3 beats (pressHoldBeats)
//   { "bars": 2, "free": { "every": 1 } }  a FREESTYLE phrase: a slot every `every` beats; the button picks the move
// Positions are STRAIGHT; the loader swings the odd sixteenths by the song's own swing (CONTRACT.md §4 timeOf:
// swingOffset(s) = 2 × (swing − 0.5) sixteenths on an odd sixteenth), so a charted "e" lands where the band plays it.
//
// THE VALIDATOR (validateChart) holds a chart to its song and its difficulty: every note on the difficulty's grid,
// every hold at least a beat long and ended at least an eighth before the next press, the press gap / double gap / freestyle rate the difficulty
// allows, the density inside [0.8, 1.25] × the song's targetTapsPerMin, a freeze hold on every break bar whose section
// plays horns, every earned stem the song lists called by a move somewhere, a move's instrument actually playing in its
// section, freestyle only where the pad's four instruments play and never two freestyle phrases back to back
// (decision #3: freestyle bars ALTERNATE with called bars), and the routine ending in the song's last bar. It FAILS
// LOUDLY in chart.test.ts for every shipped chart. At runtime a chart that fails is never used silently either:
// chartStepsFor logs every problem with console.error once and returns null, and danceTracks.stepsFor falls back to
// stepsForSong (still callable — body routines may lean on it) so the room stays playable.

import type { DanceClip, DanceStep } from '../core/DanceCore';
// MUSIC-SUITE P9 moves (2026-09-29, owner decision #17): the room's move vocabulary — DANCE_LIBRARY's eight, then the
// captured breaking and popping moves (dance/moves.ts). DANCE_LIBRARY itself stays unchanged (generateRoutine reads it).
import { ALL_DANCE_MOVES } from './moves';
import { CATEGORY_STEM } from '../audio/StemBand';
import { songFor, type FelSong, type FelStem, type SectionName, type SongDifficulty } from './felSongs';
import warmupChart from './charts/warmup.json';
import cypherChart from './charts/cypher.json';
import goldenhourChart from './charts/goldenhour.json';
import battleChart from './charts/battle.json';
import canalsChart from './charts/canals.json';
import evolutionChart from './charts/evolution.json';

export const CHART_FORMAT = 'fel-dance-chart/1';

/** One note of a called phrase (see the file header). */
export interface ChartNote {
  /** Beats from the phrase's start (straight; the loader swings odd sixteenths). */
  b: number;
  /** A move starts here (a CHART_MOVES alias or a move id — dance/moves.ts). Absent = an accent inside the running move. */
  m?: string;
  /** A double tap: a second press this many beats later. */
  x2?: number;
  /** A press hold: keep the press down this many beats (DanceStep.pressHoldBeats). */
  hold?: number;
  /** Dance the move mirrored. */
  mir?: 0 | 1;
}

export interface ChartPhrase {
  bars: number;
  /** A called phrase. */
  notes?: ChartNote[];
  /** A freestyle phrase: a slot every `every` beats from its first beat; `move` is the slot's default clip (what a
   *  button with no pick of its own dances — FREESTYLE_PAD gives every button one, so it is only a fallback). */
  free?: { every: number; move?: string };
}

export interface ChartSection {
  /** The song's own section at this position (map.json): same name, start bar and length. */
  name: SectionName;
  bar: number;
  bars: number;
  /** Phrase ids, in order; their bars add up to the section's. */
  play: string[];
}

export interface DanceChart {
  format: string;
  song: string;
  bpm: number;
  bars: number;
  author: string;
  /** What the chart is going for, in a line or two (not read by code). */
  about?: string;
  phrases: Record<string, ChartPhrase>;
  sections: ChartSection[];
}

/** The move names a chart may use, and the clip each one dances. A chart may also name a move id directly.
 *  MUSIC-SUITE P9 moves: the captured moves (dance/moves.ts CAPTURED_MOVES) have names here too, each in its family —
 *  a kick step is toprock, a side freeze is a freeze (so it may carry a break bar's freeze hold), the helicopter and the
 *  headstand spin are power, the moonwalk and the robot ride the wave (popping) family. */
export const CHART_MOVES: Readonly<Record<string, string>> = {
  toprock: 'dance_toprock_basic',
  twostep: 'dance_bounce_two_step',
  shoulder: 'dance_bounce_shoulder',
  wave: 'dance_wave_arm',
  sixstep: 'dance_footwork_six',
  babyfreeze: 'dance_freeze_baby',
  windmill: 'dance_power_windmill',
  spin: 'dance_trans_spin',
  kickstep: 'dance_toprock_kick',
  sidefreeze: 'dance_freeze_side',
  helicopter: 'dance_power_helicopter',
  headstand: 'dance_power_headstand',
  moonwalk: 'dance_pop_moonwalk',
  robot: 'dance_pop_robot',
};

/**
 * THE FREESTYLE PAD: the move each button dances in a freestyle bar (and in free dance). Four short clips, one per
 * face button, so a pick is readable the beat it is pressed; each earns its own instrument (perc, drums, keys, fx —
 * StemBand.CATEGORY_STEM). R2 / SPACE / a phone's single TAP pick A's move (lib/babylon/dance/freestyle.ts padMove),
 * so a one-button player can freestyle — at the variety floor, which is the point of variety.
 */
export const FREESTYLE_PAD = {
  A: 'dance_toprock_basic',
  B: 'dance_bounce_two_step',
  X: 'dance_wave_arm',
  Y: 'dance_trans_spin',
} as const;
export type PadButton = keyof typeof FREESTYLE_PAD;

const CLIP_BY_ID = new Map(ALL_DANCE_MOVES.map((c) => [c.id, c]));

/** The clip a chart's move name dances, or null when it names no move (dance/moves.ts ALL_DANCE_MOVES). */
export function moveClip(m: string | undefined): DanceClip | null {
  if (!m) return null;
  return CLIP_BY_ID.get(CHART_MOVES[m] ?? m) ?? null;
}

/** The stem a clip's family earns ('perc', 'drums', …), lower-cased as FelStem spells it. */
export function clipStem(clipId: string): FelStem | null {
  const c = CLIP_BY_ID.get(clipId);
  return c ? (CATEGORY_STEM[c.category].toLowerCase() as FelStem) : null;
}

// ── difficulty rules ────────────────────────────────────────────────────────────────────────────────────────────

export interface DifficultyRule {
  /** Every press sits on this grid (beats): 1 = quarters, 0.5 = eighths, 0.25 = sixteenths. */
  grid: number;
  /** The least gap between two presses (beats) — a double tap's own pair excepted. */
  minGapBeats: number;
  /** The double-tap gaps allowed (beats); empty = no double taps at this difficulty. */
  doubles: readonly number[];
  /** The freestyle slot rates allowed (beats between slots). */
  freeEvery: readonly number[];
}

/**
 * Easy → hard, by the song's own 1..6 difficulty (map.json). The EASY song asks for quarter notes only, a beat apart,
 * no doubles, freestyle every two beats; the middle songs open eighths and eighth-note doubles; from difficulty 4 a
 * double may be a sixteenth; the two hardest may put presses a sixteenth apart and freestyle on the eighths.
 * NEW TUNED NUMBERS (the owner's eye is the judge — flag them).
 */
export const DIFFICULTY_RULES: Readonly<Record<SongDifficulty, DifficultyRule>> = {
  1: { grid: 1, minGapBeats: 1, doubles: [], freeEvery: [2] },
  2: { grid: 0.5, minGapBeats: 0.5, doubles: [0.5], freeEvery: [2, 1] },
  3: { grid: 0.5, minGapBeats: 0.5, doubles: [0.5], freeEvery: [2, 1] },
  4: { grid: 0.25, minGapBeats: 0.5, doubles: [0.5, 0.25], freeEvery: [1] },
  5: { grid: 0.25, minGapBeats: 0.25, doubles: [0.5, 0.25], freeEvery: [1, 0.5] },
  6: { grid: 0.25, minGapBeats: 0.25, doubles: [0.5, 0.25], freeEvery: [1, 0.5] },
};

/** A chart's taps a minute must sit inside this band × its song's targetTapsPerMin (map.json, CONTRACT.md §5). */
export const DENSITY_BAND: readonly [number, number] = [0.8, 1.25];
/** A press hold must end at least this many beats (an eighth) before the next press: time to let go and press again. */
export const HOLD_GAP_BEATS = 0.5;
/** A press hold lasts at least a beat: shorter, it is a tap with a release attached (a 0.5-beat hold at 118 BPM is
 *  254 ms, and DanceCore's release allowance would keep it for almost any release). */
export const MIN_HOLD_BEATS = 1;
/** Freestyle bars may be at most this share of a chart (the called bars are the chart). */
export const MAX_FREE_SHARE = 0.4;

// ── expansion ───────────────────────────────────────────────────────────────────────────────────────────────────

export type BarKind = 'call' | 'free';

/** One press of an expanded chart. */
export interface ChartPress {
  kind: 'move' | 'accent' | 'double' | 'free';
  /** 1-based bar. */
  bar: number;
  /** Song beat, straight (on the charted grid). */
  beat: number;
  /** Song beat with the song's sixteenth swing — what the step (and the judge) uses. */
  swungBeat: number;
  clipId: string;
  mirrored: boolean;
  /** A press hold's length (beats). */
  hold?: number;
  /** For a double's second tap: the head's straight beat. */
  headBeat?: number;
  /** Index into chart.sections. */
  section: number;
  phrase: string;
}

export interface ExpandedChart {
  presses: ChartPress[];
  /** One entry per bar (index 0 = bar 1). */
  barKinds: BarKind[];
  /** What the expansion itself could not make sense of (validateChart reports these first). */
  problems: string[];
}

const EPS = 1e-9;
const onGrid = (v: number, grid: number): boolean => Math.abs(v / grid - Math.round(v / grid)) < 1e-6;

/** CONTRACT.md §4: an odd sixteenth is late by 2 × (swing − 0.5) sixteenths. `beat` is straight. */
export function swingBeat(beat: number, swing: number): number {
  const s = beat * 4;
  const si = Math.round(s);
  if (Math.abs(s - si) > 1e-6 || si % 2 === 0) return beat;
  return beat + (2 * (swing - 0.5)) / 4;
}

/** Walk a chart into its presses, in song order. Pure; never throws. */
export function expandChart(chart: DanceChart, song: FelSong): ExpandedChart {
  const problems: string[] = [];
  const presses: ChartPress[] = [];
  const barKinds: BarKind[] = [];
  let running: { clipId: string; mirrored: boolean } | null = null;
  chart.sections.forEach((sec, si) => {
    let bar = sec.bar;
    for (const pid of sec.play) {
      const ph = chart.phrases[pid];
      if (!ph) { problems.push(`section ${si} (${sec.name}) plays unknown phrase "${pid}"`); continue; }
      const start = (bar - 1) * 4;
      for (let k = 0; k < ph.bars; k++) barKinds[bar - 1 + k] = ph.free ? 'free' : 'call';
      if (ph.free) {
        const clip = moveClip(ph.free.move ?? 'toprock');
        const every = ph.free.every;
        if (!clip) problems.push(`phrase "${pid}": free.move "${ph.free.move}" is not a move`);
        if (every > 0) {
          for (let b = 0; b < ph.bars * 4 - EPS; b += every) {
            const beat = start + b;
            presses.push({
              kind: 'free', bar: Math.floor(beat / 4) + 1, beat, swungBeat: swingBeat(beat, song.swing),
              clipId: clip?.id ?? FREESTYLE_PAD.A, mirrored: false, section: si, phrase: pid,
            });
          }
        }
        running = null;   // after a freestyle phrase the dancer is on whatever the player picked: a move must come next
      } else {
        for (const n of ph.notes ?? []) {
          const beat = start + n.b;
          const common = { bar: Math.floor(beat / 4) + 1, section: si, phrase: pid };
          let head: ChartPress;
          if (n.m !== undefined) {
            const clip = moveClip(n.m);
            if (!clip) { problems.push(`phrase "${pid}" beat ${n.b}: "${n.m}" is not a move`); continue; }
            running = { clipId: clip.id, mirrored: n.mir === 1 };
            head = { kind: 'move', beat, swungBeat: swingBeat(beat, song.swing), clipId: clip.id, mirrored: n.mir === 1, ...common };
          } else {
            if (!running) { problems.push(`phrase "${pid}" beat ${n.b}: an accent with no move running (a move must come first, and first again after freestyle)`); continue; }
            head = { kind: 'accent', beat, swungBeat: swingBeat(beat, song.swing), clipId: running.clipId, mirrored: running.mirrored, ...common };
          }
          if (n.hold !== undefined) head.hold = n.hold;
          presses.push(head);
          if (n.x2 !== undefined) {
            const b2 = beat + n.x2;
            presses.push({
              kind: 'double', beat: b2, swungBeat: swingBeat(b2, song.swing), clipId: head.clipId, mirrored: head.mirrored,
              headBeat: beat, bar: Math.floor(b2 / 4) + 1, section: si, phrase: pid,
            });
          }
        }
      }
      bar += ph.bars;
    }
  });
  presses.sort((a, b) => a.beat - b.beat);
  return { presses, barKinds, problems };
}

/** The press steps DancePerformance plays (see DanceStep's MUSIC-SUITE P9 fields). holdBeats stays the clip's length
 *  (its documented meaning: the routine's end reads last.beat + last.holdBeats), never a press hold's length. */
export function stepsFromPresses(presses: readonly ChartPress[]): DanceStep[] {
  return presses.map((p) => {
    const clip = CLIP_BY_ID.get(p.clipId);
    const step: DanceStep = { clipId: p.clipId, beat: p.swungBeat, holdBeats: clip?.beats ?? 1, mirrored: p.mirrored };
    if (p.hold !== undefined) step.pressHoldBeats = p.hold;
    if (p.kind === 'free') step.pressFree = true;
    if (p.kind === 'accent' || p.kind === 'double') step.pressKind = p.kind;
    return step;
  });
}

// ── stats + validation ──────────────────────────────────────────────────────────────────────────────────────────

export interface ChartStats {
  presses: number;
  tapsPerMin: number;
  moves: number;
  accents: number;
  doubles: number;
  holds: number;
  freeSlots: number;
  freeBars: number;
  /** The least gap between two presses that are not a double's pair (beats). */
  minGapBeats: number;
}

export function chartStats(chart: DanceChart, song: FelSong): ChartStats {
  const { presses, barKinds } = expandChart(chart, song);
  const count = (k: ChartPress['kind']) => presses.filter((p) => p.kind === k).length;
  let minGap = Infinity;
  for (let i = 1; i < presses.length; i++) {
    if (presses[i].kind === 'double') continue;
    minGap = Math.min(minGap, presses[i].beat - presses[i - 1].beat);
  }
  return {
    presses: presses.length,
    tapsPerMin: presses.length / (song.durationSec / 60),
    moves: count('move'), accents: count('accent'), doubles: count('double'),
    holds: presses.filter((p) => p.hold !== undefined).length,
    freeSlots: count('free'),
    freeBars: barKinds.filter((k) => k === 'free').length,
    minGapBeats: minGap,
  };
}

/** The pad's four instruments: freestyle only belongs where all four play (a pick must be heard). */
const PAD_STEMS: FelStem[] = Object.values(FREESTYLE_PAD).map((id) => clipStem(id)!).filter(Boolean);

/**
 * Everything wrong with a chart against its song, as plain sentences (empty = valid). Pure. See the file header for
 * the rules; each is one block below.
 */
export function validateChart(chart: DanceChart, song: FelSong): string[] {
  const problems: string[] = [];
  const fail = (why: string): void => { problems.push(why); };
  const rule = DIFFICULTY_RULES[song.difficulty];

  // identity
  if (chart.format !== CHART_FORMAT) fail(`format "${chart.format}" is not "${CHART_FORMAT}"`);
  if (chart.song !== song.id) fail(`chart is for "${chart.song}", not "${song.id}"`);
  if (chart.bpm !== song.bpm) fail(`bpm ${chart.bpm} is not the song's ${song.bpm}`);
  if (chart.bars !== song.bars) fail(`bars ${chart.bars} is not the song's ${song.bars}`);
  if (!chart.author) fail('no author');

  // sections = the song's own sections, each filled exactly by its phrases
  if (chart.sections.length !== song.sections.length) fail(`${chart.sections.length} sections, the song has ${song.sections.length}`);
  chart.sections.forEach((sec, i) => {
    const s = song.sections[i];
    if (!s) return;
    if (sec.name !== s.name || sec.bar !== s.startBar || sec.bars !== s.bars) {
      fail(`section ${i} is ${sec.name} @${sec.bar}×${sec.bars}, the song's is ${s.name} @${s.startBar}×${s.bars}`);
    }
    const filled = sec.play.reduce((n, pid) => n + (chart.phrases[pid]?.bars ?? 0), 0);
    if (filled !== sec.bars) fail(`section ${i} (${sec.name}) plays ${filled} bars of phrases, it is ${sec.bars} bars`);
  });

  // phrases: shape, grid, doubles, holds, freestyle rate
  for (const [pid, ph] of Object.entries(chart.phrases)) {
    if (!(Number.isInteger(ph.bars) && ph.bars > 0)) fail(`phrase "${pid}": bars ${ph.bars} is not a positive whole number`);
    if (!!ph.notes === !!ph.free) { fail(`phrase "${pid}": needs exactly one of notes / free`); continue; }
    const len = ph.bars * 4;
    if (ph.free) {
      if (!rule.freeEvery.includes(ph.free.every)) fail(`phrase "${pid}": freestyle every ${ph.free.every} beats is not allowed at difficulty ${song.difficulty} (${rule.freeEvery.join(' / ')})`);
      if (ph.free.move !== undefined && !moveClip(ph.free.move)) fail(`phrase "${pid}": free.move "${ph.free.move}" is not a move`);
      continue;
    }
    const notes = ph.notes!;
    if (notes.length === 0) fail(`phrase "${pid}": a called phrase with no notes`);
    notes.forEach((n, k) => {
      const at = `phrase "${pid}" note ${k} (b ${n.b})`;
      if (!(n.b >= 0 && n.b < len)) fail(`${at}: outside the phrase's ${len} beats`);
      if (!onGrid(n.b, rule.grid)) fail(`${at}: off the ${rule.grid}-beat grid of difficulty ${song.difficulty}`);
      if (k > 0 && !(n.b > notes[k - 1].b)) fail(`${at}: not after the note before it`);
      if (n.m !== undefined && !moveClip(n.m)) fail(`${at}: "${n.m}" is not a move`);
      if (n.x2 !== undefined) {
        if (!rule.doubles.includes(n.x2)) fail(`${at}: a double of ${n.x2} beats is not allowed at difficulty ${song.difficulty}${rule.doubles.length ? ` (${rule.doubles.join(' / ')})` : ' (no doubles)'}`);
        if (!(n.b + n.x2 < len)) fail(`${at}: the double's second tap falls outside the phrase`);
        if (n.hold !== undefined) fail(`${at}: a double tap cannot also be a hold`);
      }
      if (n.hold !== undefined) {
        if (!(n.hold > 0) || !onGrid(n.hold, 0.25)) fail(`${at}: hold ${n.hold} is not a positive number of sixteenths`);
        else if (n.hold < MIN_HOLD_BEATS) fail(`${at}: hold ${n.hold} is shorter than ${MIN_HOLD_BEATS} beat (a freeze hold must be felt)`);
        if (!onGrid(n.b, 0.5)) fail(`${at}: a hold starts on an eighth (the swing would move its end off the grid)`);
      }
    });
  }

  const { presses, barKinds, problems: walk } = expandChart(chart, song);
  problems.push(...walk);
  if (presses.length === 0) { fail('no presses'); return problems; }
  const end = song.bars * 4;

  // spacing: the difficulty's least gap; a hold ends at least HOLD_GAP_BEATS before the next press; nothing past the end.
  // MUSIC-SUITE P9 FIX PASS (2026-09-29): on BOTH clocks — the straight beats the chart is written in AND the swung beats
  // the judge plays (swungBeat: an odd sixteenth lands late by the song's swing). The gaps were only checked straight, and
  // canals kvD's double { b 3.5, x2 0.25 } put its second tap on an odd sixteenth that CANALS' 0.55 swing moves to 3.775 —
  // 0.225 beats (114 ms at 118 BPM) before the move on beat 4, under difficulty 5's 0.25-beat least gap, and the validator
  // passed it. A gap is now the smaller of its straight and its swung width.
  for (let i = 0; i < presses.length; i++) {
    const p = presses[i], next = presses[i + 1];
    if (p.beat >= end - EPS) fail(`a press at beat ${p.beat} is past the song's end (${end})`);
    const gap = next ? Math.min(next.beat - p.beat, next.swungBeat - p.swungBeat) : Infinity;
    if (next && next.kind !== 'double' && gap < rule.minGapBeats - EPS) {
      fail(`bar ${next.bar}: presses ${+gap.toFixed(4)} beats apart as played (beat ${p.beat} → ${next.beat}, swung ${p.swungBeat} → ${next.swungBeat}), difficulty ${song.difficulty} allows ${rule.minGapBeats}`);
    }
    if (next && next.kind === 'double' && next.headBeat !== p.beat) fail(`bar ${next.bar}: a press falls inside a double tap (beat ${p.beat})`);
    if (p.hold !== undefined) {
      const holdEnd = p.beat + p.hold, holdEndSwung = p.swungBeat + p.hold;
      const room = next ? Math.min(next.beat - holdEnd, next.swungBeat - holdEndSwung) : Infinity;
      if (next && room < HOLD_GAP_BEATS - EPS) fail(`bar ${p.bar}: the hold at beat ${p.beat} ends at ${holdEnd}, less than ${HOLD_GAP_BEATS} beat before the next press (${next.beat}, swung ${next.swungBeat})`);
      if (Math.max(holdEnd, holdEndSwung) > end + EPS) fail(`bar ${p.bar}: the hold at beat ${p.beat} runs past the song's end`);
    }
  }

  // density: easy → hard, around the song's own target
  const stats = chartStats(chart, song);
  const [lo, hi] = [DENSITY_BAND[0] * song.targetTapsPerMin, DENSITY_BAND[1] * song.targetTapsPerMin];
  if (stats.tapsPerMin < lo - EPS || stats.tapsPerMin > hi + EPS) {
    fail(`${stats.tapsPerMin.toFixed(1)} taps a minute is outside ${lo.toFixed(1)}–${hi.toFixed(1)} (the song's target ${song.targetTapsPerMin} × ${DENSITY_BAND.join('–')})`);
  }

  // a move's instrument plays in its section; every stem the song lists is called by a move somewhere
  const called = new Set<FelStem>();
  for (const p of presses) {
    if (p.kind !== 'move') continue;
    const stem = clipStem(p.clipId);
    const sec = song.sections[p.section];
    if (stem) called.add(stem);
    if (stem && sec && !sec.stems.includes(stem)) fail(`bar ${p.bar}: a ${p.clipId} (${stem}) in the ${sec.name}, which does not play ${stem}`);
  }
  const listed = new Set(song.sections.flatMap((s) => s.stems).filter((s) => s !== 'bed'));
  for (const stem of listed) if (!called.has(stem)) fail(`no move ever calls ${stem}: that instrument could never be earned`);

  // a freeze hold on every break bar whose section plays horns (the band stops, the horns hit)
  for (const bar of song.breakBars) {
    const sec = song.sections.find((s) => bar >= s.startBar && bar < s.startBar + s.bars);
    if (!sec?.stems.includes('horns')) continue;
    const ok = presses.some((p) => p.kind === 'move' && p.beat === (bar - 1) * 4 && CLIP_BY_ID.get(p.clipId)?.category === 'freeze' && p.hold !== undefined);
    if (!ok) fail(`break bar ${bar}: no freeze hold on its downbeat`);
  }

  // freestyle: present, alternating with called bars, not most of the chart, and only where the pad is heard
  const freeBars = barKinds.filter((k) => k === 'free').length;
  if (freeBars === 0) fail('no freestyle bar (decision #3: freestyle bars alternate with called bars)');
  if (freeBars > MAX_FREE_SHARE * song.bars) fail(`${freeBars} freestyle bars is more than ${MAX_FREE_SHARE * 100}% of ${song.bars}`);
  const flat = chart.sections.flatMap((s) => s.play);
  for (let i = 1; i < flat.length; i++) {
    if (chart.phrases[flat[i]]?.free && chart.phrases[flat[i - 1]]?.free) fail(`freestyle phrase "${flat[i]}" follows another freestyle phrase with no called bar between`);
  }
  chart.sections.forEach((sec, i) => {
    if (!sec.play.some((pid) => chart.phrases[pid]?.free)) return;
    const stems = song.sections[i]?.stems ?? [];
    const missing = PAD_STEMS.filter((s) => !stems.includes(s));
    if (missing.length) fail(`section ${i} (${sec.name}) has freestyle but does not play ${missing.join(', ')} (a pick would earn nothing you can hear)`);
  });

  // the routine ends in the song's last bar (DanceMode finishes a beat after last.beat + last.holdBeats)
  const steps = stepsFromPresses(presses);
  const last = steps[steps.length - 1];
  const routineEnd = last.beat + last.holdBeats;
  if (routineEnd > end + EPS || routineEnd < end - 4 - EPS) fail(`the routine ends at beat ${routineEnd}, not inside the last bar (${end - 4}–${end})`);
  if (presses[presses.length - 1].kind === 'free') fail('the chart ends on a freestyle slot (end on a called move)');
  return problems;
}

// ── the shipped charts ──────────────────────────────────────────────────────────────────────────────────────────

const RAW: Readonly<Record<string, DanceChart>> = {
  warmup: warmupChart as unknown as DanceChart,
  cypher: cypherChart as unknown as DanceChart,
  goldenhour: goldenhourChart as unknown as DanceChart,
  battle: battleChart as unknown as DanceChart,
  canals: canalsChart as unknown as DanceChart,
  evolution: evolutionChart as unknown as DanceChart,
};

/** The authored chart for a song, or undefined. The raw data: use chartStepsFor to play it. */
export const chartFor = (songId: string | null | undefined): DanceChart | undefined => (songId ? RAW[songId] : undefined);
export const CHART_SONG_IDS: readonly string[] = Object.keys(RAW);

const played = new Map<string, { steps: DanceStep[]; barKinds: BarKind[] } | null>();

function load(song: FelSong): { steps: DanceStep[]; barKinds: BarKind[] } | null {
  if (played.has(song.id)) return played.get(song.id)!;
  const chart = RAW[song.id];
  let out: { steps: DanceStep[]; barKinds: BarKind[] } | null = null;
  if (chart) {
    const problems = validateChart(chart, song);
    if (problems.length) {
      // never silently: chart.test.ts fails on this first; a chart that still reaches a player is shouted about here
      console.error(`[FEL-DANCE] chart "${song.id}" is INVALID (${problems.length}) — playing the generated steps instead:\n  ${problems.join('\n  ')}`);
    } else {
      const { presses, barKinds } = expandChart(chart, song);
      out = { steps: stepsFromPresses(presses), barKinds };
    }
  }
  played.set(song.id, out);
  return out;
}

/** The authored chart's steps for a song (a fresh copy every call), or null: no chart, or one that failed validation
 *  (logged loudly — see load()). */
export function chartStepsFor(song: FelSong | string): DanceStep[] | null {
  const s = typeof song === 'string' ? songFor(song) : song;
  const got = s ? load(s) : null;
  return got ? got.steps.map((st) => ({ ...st })) : null;
}

/** Which bars are called and which are freestyle (index 0 = bar 1), or null when the song has no playable chart. */
export function barKindsFor(song: FelSong | string): BarKind[] | null {
  const s = typeof song === 'string' ? songFor(song) : song;
  const got = s ? load(s) : null;
  return got ? [...got.barKinds] : null;
}
