// chart — the AUTHORED dance charts of the six FEL house songs (re-landed fresh from closed PR #46, MUSIC-SUITE P9, on
// today's dance design: owner decision 2026-10-13), their format, the loader that turns one into DanceCore steps, and
// the validator.
//
// WHAT WAS WRONG. The six songs' press steps are GENERATED from each song's section map (danceTracks.stepsForSong):
// one move per earned stem at an energy-driven gap. Measured by chart.test.ts on the generated steps, the songs ran
// well under their own targetTapsPerMin (map.json), the "hard" songs were nearly as sparse as the easy one, and a
// player had nothing to DO inside a move. An authored chart puts accents inside moves, double taps, freeze steps and
// sections on the real onsets, easy to hard.
//
// DENSITY PAYS AS STYLE, NOT SCORE (owner, 2026-10-13). A chart has two kinds of press and they are paid differently:
//   · a MOVE press ("m"): a real DanceStep. It is judged by DancePerformance exactly as any press step, it is what
//     DanceCore scores, and a freeze is held and released as chartPlay's #13 HOLD already does (STYLE for the release).
//   · every OTHER press (an accent inside the running move, a double tap's second tap, a freestyle slot): a STYLE TAP.
//     Never a step. It is not judged, costs nothing when missed, and pays chartPlay's GROOVE_STYLE into the run's own
//     STYLE tally — the same bonus-only tally the groove taps (#10) and the freeze release (#13) pay into.
// So a denser chart gives the player more to play and more STYLE to earn, and cannot move what a run SCORES: the score
// ceiling (lib/arena-score-integrity.ts danceCeiling) counts steps, and a chart's steps are its moves only.
//
// THE SCORED-STEP CAP (owner, 2026-10-13, answering the pay question): the moves are ALSO capped per song to the number of
// steps the generated chart had (SCORED_STEP_CAP: 26 / 29 / 32 / 38 / 41 / 47), so a flawless run scores exactly what it
// always did and pay is unchanged. The authored chart has more moves than that on five songs; the moves beyond the cap
// become STYLE taps (selectScored picks them spread evenly across the song, keeping the first and last move, every break
// freeze and a caller of every instrument, and never one that would sit in the 290 ms before a scored move). WARMUP was
// authored with 25 moves against a cap of 26; its late-hook accent on beat 5 (phrase hookAw) is a wave now, so it has exactly
// 26 and every song's flawless score equals the generated chart's.
// chart.test.ts holds all of it: the cap table is stepsForSong's counts, scored = min(authored, cap), the flawless score
// equals the generated chart's on all six songs (pinned), and every shipped chart's steps sit under the ceiling's.
//
// WHAT #46 DID DIFFERENTLY, AND WHAT STAYS TODAY'S (owner, 2026-10-13: "current design wins"):
//   · #46 made a freeze a PRESS HOLD that paid score (DanceCore pressHoldBeats, a "hold" key on the note). Today a freeze
//     step is held through its clip's beats and the release pays STYLE (chartPlay.judgeRelease); the "hold" keys are gone
//     from the JSON, and DanceCore is not touched.
//   · #46 made a freestyle slot a button-picks-the-move press that paid timing × a variety factor. Today the face
//     buttons are the MATCH buttons (chartPlay FAMILY_BUTTON). A freestyle phrase here is a run of STYLE taps; no
//     button picks anything, and nothing is scored.
//   · #46 added six captured moves (kick step, side freeze, helicopter, headstand, moonwalk, robot). They are not in
//     this tree; CHART_MOVES maps each of those names to the DANCE_LIBRARY clip of its family, so the instrument a move
//     earns is the one the chart was written for.
//
// WHERE THE CHARTS LIVE: lib/babylon/dance/charts/<song>.json, imported statically here. Not public/audio/songs/<id>/,
// which is an AUDIO provenance root (lib/babylon/music/provenance.test.ts wants a PROVENANCE.json entry for every file
// there); a chart is FEL-authored data, and it must be in the bundle synchronously (no fetch to race the count-in), like
// felSongsData.json.
//
// THE FORMAT ("fel-dance-chart/1"). A chart is the song's own sections (same names, bars and order as map.json), each
// playing a list of PHRASES; a phrase is a whole number of 4/4 bars that is either CALLED (a list of notes) or FREESTYLE:
//   { "b": 0, "m": "toprock" }            a MOVE starts on beat 0 of the phrase: a scored step (b is in beats from the
//                                          phrase's start: 0.5 = the "and", 0.25 / 0.75 = the "e" / "a" sixteenths)
//   { "b": 3 }                             an ACCENT: a STYLE tap inside the running move
//   { "b": 6, "x2": 0.5 }                  a DOUBLE: this press and a second STYLE tap x2 beats later (the head is a
//                                          move or an accent, whichever it is)
//   { "b": 0, "m": "babyfreeze" }          a FREEZE: a scored step like any move, held through its clip's beats
//   { "bars": 2, "free": { "every": 1 } }  a FREESTYLE phrase: a STYLE tap every `every` beats
// Positions are STRAIGHT; the loader swings the odd sixteenths by the song's own swing (CONTRACT.md §4 timeOf:
// swingOffset(s) = 2 × (swing − 0.5) sixteenths on an odd sixteenth), so a charted "e" lands where the band plays it.
//
// THE VALIDATOR (validateChart) holds a chart to its song and its difficulty: every note on the difficulty's grid, the
// press gap / double gap / freestyle rate the difficulty allows, a freeze step's hold ended a clear gap before the next
// move, the density inside [0.8, 1.25] × the song's targetTapsPerMin, a freeze on every break bar whose section plays
// horns, every earned stem the song lists called by a move somewhere, a move's instrument actually playing in its
// section, and the routine ending in the song's last bar. It FAILS LOUDLY in chart.test.ts for every shipped chart. At
// runtime a chart that fails is never used silently either: load() logs every problem with console.error once and
// returns null, and danceTracks.stepsFor falls back to stepsForSong so the room stays playable.

import { MISS_AFTER, type DanceClip, type DanceStep } from '../core/DanceCore';
import { MOVE_BY_ID } from './moves';
import { GROOVE_WINDOW_SEC } from './chartPlay';
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
  /** A move starts here (a CHART_MOVES alias or a DANCE_LIBRARY clip id). Absent = an accent (a STYLE tap). */
  m?: string;
  /** A double: a second STYLE tap this many beats later. */
  x2?: number;
  /** Dance the move mirrored. */
  mir?: 0 | 1;
}

export interface ChartPhrase {
  bars: number;
  /** A called phrase. */
  notes?: ChartNote[];
  /** A freestyle phrase: a STYLE tap every `every` beats from its first beat. */
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

/**
 * The move names a chart may use, and the clip each one dances. A chart may also name a DANCE_LIBRARY clip id directly.
 * The last six are #46's captured moves; they are not in this tree, so each answers with the library clip of ITS family
 * (kick step: top rock; side freeze: baby freeze; helicopter and headstand: windmill; moonwalk and robot: arm wave).
 * The family is what matters to the game: it picks the instrument a move earns (StemBand.CATEGORY_STEM) and the MATCH
 * button (chartPlay.FAMILY_BUTTON). Landing the captured clips later changes these six lines and nothing else.
 */
export const CHART_MOVES: Readonly<Record<string, string>> = {
  toprock: 'dance_toprock_basic',
  twostep: 'dance_bounce_two_step',
  shoulder: 'dance_bounce_shoulder',
  wave: 'dance_wave_arm',
  sixstep: 'dance_footwork_six',
  babyfreeze: 'dance_freeze_baby',
  windmill: 'dance_power_windmill',
  spin: 'dance_trans_spin',
  kickstep: 'dance_toprock_basic',
  sidefreeze: 'dance_freeze_baby',
  helicopter: 'dance_power_windmill',
  headstand: 'dance_power_windmill',
  moonwalk: 'dance_wave_arm',
  robot: 'dance_wave_arm',
};

/** The whole vocabulary (dance/moves.ts): DANCE_LIBRARY's rows (the same objects) and the six captured moves, which a chart opts in to
 *  by naming their id — the six short names in CHART_MOVES still answer with the library clip, so no shipped chart changed. */
const CLIP_BY_ID = MOVE_BY_ID;

/** The clip a chart's move name dances, or null when it names no move. */
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
  /** The least gap between two presses (beats) — a double's own pair excepted. */
  minGapBeats: number;
  /** The double gaps allowed (beats); empty = no doubles at this difficulty. */
  doubles: readonly number[];
  /** The freestyle slot rates allowed (beats between slots). */
  freeEvery: readonly number[];
}

/**
 * Easy → hard, by the song's own 1..6 difficulty (map.json). The EASY song asks for quarter notes only, a beat apart,
 * no doubles, a freestyle tap every two beats; the middle songs open eighths and eighth-note doubles; from difficulty 4 a
 * double may be a sixteenth; the two hardest may put presses a sixteenth apart and freestyle on the eighths.
 * These are #46's numbers, now the grid of STYLE taps as much as of moves (the owner's eye is the judge).
 */
export const DIFFICULTY_RULES: Readonly<Record<SongDifficulty, DifficultyRule>> = {
  1: { grid: 1, minGapBeats: 1, doubles: [], freeEvery: [2] },
  2: { grid: 0.5, minGapBeats: 0.5, doubles: [0.5], freeEvery: [2, 1] },
  3: { grid: 0.5, minGapBeats: 0.5, doubles: [0.5], freeEvery: [2, 1] },
  4: { grid: 0.25, minGapBeats: 0.5, doubles: [0.5, 0.25], freeEvery: [1] },
  5: { grid: 0.25, minGapBeats: 0.25, doubles: [0.5, 0.25], freeEvery: [1, 0.5] },
  6: { grid: 0.25, minGapBeats: 0.25, doubles: [0.5, 0.25], freeEvery: [1, 0.5] },
};

/** A chart's presses a minute (moves AND style taps) must sit inside this band × its song's targetTapsPerMin. */
export const DENSITY_BAND: readonly [number, number] = [0.8, 1.25];
/** The beats of room a freeze step leaves after its clip ends before the next move: time to let go and press again. */
export const HOLD_GAP_BEATS = 0.5;

// ── expansion ───────────────────────────────────────────────────────────────────────────────────────────────────

export type PressKind = 'move' | 'accent' | 'double' | 'free';

/** One press of an expanded chart. */
export interface ChartPress {
  kind: PressKind;
  /** 1-based bar. */
  bar: number;
  /** Song beat, straight (on the charted grid). */
  beat: number;
  /** Song beat with the song's sixteenth swing — what the step (and the judge) uses. */
  swungBeat: number;
  /** The move a 'move' press dances, or the running move for an accent / double (empty for a freestyle tap). */
  clipId: string;
  mirrored: boolean;
  /** For a double's second tap: the head's straight beat. */
  headBeat?: number;
  /** Index into chart.sections. */
  section: number;
  phrase: string;
}

export interface ExpandedChart {
  presses: ChartPress[];
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
  let running: { clipId: string; mirrored: boolean } | null = null;
  chart.sections.forEach((sec, si) => {
    let bar = sec.bar;
    for (const pid of sec.play) {
      const ph = chart.phrases[pid];
      if (!ph) { problems.push(`section ${si} (${sec.name}) plays unknown phrase "${pid}"`); continue; }
      const start = (bar - 1) * 4;
      if (ph.free) {
        const every = ph.free.every;
        if (!(every > 0)) problems.push(`phrase "${pid}": free.every ${every} is not a positive number of beats`);
        else {
          for (let b = 0; b < ph.bars * 4 - EPS; b += every) {
            const beat = start + b;
            presses.push({
              kind: 'free', bar: Math.floor(beat / 4) + 1, beat, swungBeat: swingBeat(beat, song.swing),
              clipId: '', mirrored: false, section: si, phrase: pid,
            });
          }
        }
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
            if (!running) { problems.push(`phrase "${pid}" beat ${n.b}: an accent with no move running (a move must come first)`); continue; }
            head = { kind: 'accent', beat, swungBeat: swingBeat(beat, song.swing), clipId: running.clipId, mirrored: running.mirrored, ...common };
          }
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
  return { presses, problems };
}

/** The SCORED moves as the press steps DancePerformance plays: plain steps, exactly the shape stepsForSong makes. */
export function stepsFromPresses(scored: readonly ChartPress[]): DanceStep[] {
  return scored.map((p) => ({ clipId: p.clipId, beat: p.swungBeat, holdBeats: CLIP_BY_ID.get(p.clipId)?.beats ?? 1, mirrored: p.mirrored }));
}

/** The STYLE taps (every press that is not a scored move): the (swung) song beat each lands on. Sorted, de-duplicated. */
export function styleBeatsFromPresses(style: readonly ChartPress[]): number[] {
  return [...new Set(style.map((p) => p.swungBeat))].sort((a, b) => a - b);
}

// ── the cap: which moves stay scored ────────────────────────────────────────────────────────────────────────────

/**
 * THE SCORED-STEP CAP (owner, 2026-10-13: "cap scored steps per song to the OLD generated counts, so pay is exactly
 * unchanged"). Each song's scored steps are at most this many — the number of steps danceTracks.stepsForSong generates for
 * it (chart.test.ts pins each to stepsForSong(song).length). The authored chart has more moves than that on five of the six
 * songs; the moves beyond the cap are not dropped, they become STYLE taps (the density rule). A song whose chart has FEWER
 * moves than its cap keeps them all and would score under today's; WARMUP was that song (25 against 26) until one of its
 * accents was promoted to a move (owner, 2026-10-13), so now every song has at least its cap and scores exactly today's.
 * It lives here, as a table, because chart.ts cannot import danceTracks (danceTracks imports chart). A song with no entry
 * is uncapped.
 */
export const SCORED_STEP_CAP: Readonly<Record<string, number>> = {
  warmup: 26, cypher: 29, goldenhour: 32, battle: 38, canals: 41, evolution: 47,
};

export interface ChartPlan {
  presses: ChartPress[];
  /** The moves that are DanceSteps, in song order. */
  scored: ChartPress[];
  /** Everything else: accents, doubles, freestyle slots, and the authored moves the cap turned into STYLE taps. */
  style: ChartPress[];
  /** The authored moves the cap demoted (a subset of `style`). */
  demoted: ChartPress[];
  /** The cap could not be met safely (validateChart reports these). */
  problems: string[];
}

/** A STYLE tap this close (s) before a scored move would be judged as an early press of that move. */
const CLEAR_SEC = MISS_AFTER + GROOVE_WINDOW_SEC;

/**
 * Choose which authored moves stay scored when there are more than `cap`. Pure and deterministic.
 *   KEPT whatever the cap: the first and the last move, every break-bar freeze (the horns hit), and for each stem the song
 *   lists the move in the middle of the moves that earn it — so every instrument can still be earned and the routine
 *   still opens and ends where the chart does.
 *   DEMOTED: the rest are thinned EVENLY, every (n / d)-th of the remaining moves, so the scored steps stay spread across
 *   the whole song and not clustered in its first N.
 *   SAFE: a demoted move becomes a STYLE tap, so it must not land in the 290 ms before the next scored move nor inside a
 *   scored freeze's hold; where an even pick would, the nearest safe move is demoted instead.
 */
export function selectScored(presses: readonly ChartPress[], song: FelSong, cap: number): { demoted: Set<ChartPress>; problems: string[] } {
  const problems: string[] = [];
  const moves = presses.filter((p) => p.kind === 'move');
  const want = moves.length - cap;
  const demoted = new Set<ChartPress>();
  if (want <= 0) return { demoted, problems };

  const required = new Set<ChartPress>([moves[0], moves[moves.length - 1]]);
  for (const bar of song.breakBars) {
    const sec = song.sections.find((s) => bar >= s.startBar && bar < s.startBar + s.bars);
    if (!sec?.stems.includes('horns')) continue;
    const f = moves.find((p) => p.beat === (bar - 1) * 4 && CLIP_BY_ID.get(p.clipId)?.category === 'freeze');
    if (f) required.add(f);
  }
  const listed = new Set(song.sections.flatMap((s) => s.stems).filter((s) => s !== 'bed'));
  for (const stem of listed) {
    const callers = moves.filter((p) => clipStem(p.clipId) === stem);
    if (callers.length && !callers.some((p) => required.has(p))) required.add(callers[Math.floor(callers.length / 2)]);
  }
  const free = moves.filter((p) => !required.has(p));
  if (free.length < want) {
    problems.push(`the cap of ${cap} scored steps cannot be met: ${required.size} moves are needed to open and end the routine, hit every break and earn every instrument`);
    return { demoted, problems };
  }

  const idx = new Map(moves.map((p, i) => [p, i]));
  const spb = 60 / song.bpm;
  const unsafe = (c: ChartPress): boolean => {
    // the first move after c that stays scored (c itself is being demoted)
    const next = moves.slice(idx.get(c)! + 1).find((m) => !demoted.has(m));
    if (next && (next.swungBeat - c.swungBeat) * spb < CLEAR_SEC - EPS) return true;
    // inside a scored freeze's hold, the button is already down
    return moves.some((m) => {
      if (demoted.has(m) || m === c) return false;
      const clip = CLIP_BY_ID.get(m.clipId);
      return !!clip && clip.category === 'freeze' && c.beat > m.beat + EPS && c.beat < m.beat + clip.beats - EPS;
    });
  };
  // the even pick: the middle of each of `want` equal slices of the free moves
  const picks = Array.from({ length: want }, (_, k) => free[Math.floor(((k + 0.5) * free.length) / want)]);
  for (const c of picks) demoted.add(c);
  // repair: a pick that is unsafe gives way to the nearest free move that is not
  for (let round = 0; round < 64; round++) {
    const bad = [...demoted].find((c) => unsafe(c));
    if (!bad) break;
    demoted.delete(bad);
    const at = free.indexOf(bad);
    const alt = free
      .map((c, i) => ({ c, d: Math.abs(i - at) }))
      .filter(({ c }) => !demoted.has(c) && c !== bad)
      .sort((a, b) => a.d - b.d)
      .map(({ c }) => c)
      .find((c) => { demoted.add(c); const ok = !unsafe(c); if (!ok) demoted.delete(c); return ok; });
    if (!alt) { problems.push(`the cap of ${cap} scored steps cannot be met without a style tap landing in a move's judge window`); demoted.add(bad); break; }
  }
  return { demoted, problems };
}

/** Split an expanded chart into its scored steps and its STYLE taps, under the song's scored-step cap. */
export function planChart(chart: DanceChart, song: FelSong): ChartPlan {
  const { presses, problems } = expandChart(chart, song);
  const cap = SCORED_STEP_CAP[song.id];
  const sel = cap === undefined ? { demoted: new Set<ChartPress>(), problems: [] as string[] } : selectScored(presses, song, cap);
  const scored = presses.filter((p) => p.kind === 'move' && !sel.demoted.has(p));
  const style = presses.filter((p) => p.kind !== 'move' || sel.demoted.has(p));
  return { presses, scored, style, demoted: presses.filter((p) => sel.demoted.has(p)), problems: [...problems, ...sel.problems] };
}

// ── stats + validation ──────────────────────────────────────────────────────────────────────────────────────────

export interface ChartStats {
  /** Every press: moves + style taps. The density the song's targetTapsPerMin is measured against. */
  presses: number;
  tapsPerMin: number;
  /** The moves the chart authors (before the scored-step cap). */
  authoredMoves: number;
  /** The scored steps: the authored moves, up to the song's SCORED_STEP_CAP. */
  moves: number;
  /** Authored moves the cap turned into STYLE taps. */
  demoted: number;
  accents: number;
  doubles: number;
  freeSlots: number;
  /** Every STYLE tap: accents + doubles + freestyle slots + demoted moves. */
  styleTaps: number;
  /** The least gap between two presses that are not a double's pair (beats). */
  minGapBeats: number;
}

export function chartStats(chart: DanceChart, song: FelSong): ChartStats {
  const { presses, scored, style, demoted } = planChart(chart, song);
  const count = (k: PressKind) => presses.filter((p) => p.kind === k).length;
  let minGap = Infinity;
  for (let i = 1; i < presses.length; i++) {
    if (presses[i].kind === 'double') continue;
    minGap = Math.min(minGap, presses[i].beat - presses[i - 1].beat);
  }
  return {
    presses: presses.length,
    tapsPerMin: presses.length / (song.durationSec / 60),
    authoredMoves: count('move'), moves: scored.length, demoted: demoted.length,
    accents: count('accent'), doubles: count('double'), freeSlots: count('free'),
    styleTaps: style.length,
    minGapBeats: minGap,
  };
}

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

  // phrases: shape, grid, doubles, freestyle rate
  for (const [pid, ph] of Object.entries(chart.phrases)) {
    if (!(Number.isInteger(ph.bars) && ph.bars > 0)) fail(`phrase "${pid}": bars ${ph.bars} is not a positive whole number`);
    if (!!ph.notes === !!ph.free) { fail(`phrase "${pid}": needs exactly one of notes / free`); continue; }
    const len = ph.bars * 4;
    if (ph.free) {
      if (!rule.freeEvery.includes(ph.free.every)) fail(`phrase "${pid}": freestyle every ${ph.free.every} beats is not allowed at difficulty ${song.difficulty} (${rule.freeEvery.join(' / ')})`);
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
      }
    });
  }

  const { presses, scored, style, problems: walk } = planChart(chart, song);
  problems.push(...walk);
  if (presses.length === 0) { fail('no presses'); return problems; }
  const end = song.bars * 4;

  // spacing: the difficulty's least gap, on BOTH clocks — the straight beats the chart is written in AND the swung beats
  // the judge plays (an odd sixteenth lands late by the song's swing); nothing past the end.
  for (let i = 0; i < presses.length; i++) {
    const p = presses[i], next = presses[i + 1];
    if (p.beat >= end - EPS) fail(`a press at beat ${p.beat} is past the song's end (${end})`);
    const gap = next ? Math.min(next.beat - p.beat, next.swungBeat - p.swungBeat) : Infinity;
    if (next && next.kind !== 'double' && gap < rule.minGapBeats - EPS) {
      fail(`bar ${next.bar}: presses ${+gap.toFixed(4)} beats apart as played (beat ${p.beat} → ${next.beat}, swung ${p.swungBeat} → ${next.swungBeat}), difficulty ${song.difficulty} allows ${rule.minGapBeats}`);
    }
    if (next && next.kind === 'double' && next.headBeat !== p.beat) fail(`bar ${next.bar}: a press falls inside a double (beat ${p.beat})`);
  }

  // a freeze step is held through its clip, so the next MOVE must start a clear gap after the clip ends (the player lets
  // go on the beat, then presses again) — chartPlay's #13 HOLD, unchanged
  const moves = scored;
  moves.forEach((m, i) => {
    const clip = CLIP_BY_ID.get(m.clipId);
    const next = moves[i + 1];
    if (!clip || clip.category !== 'freeze' || !next) return;
    const room = Math.min(next.beat - (m.beat + clip.beats), next.swungBeat - (m.swungBeat + clip.beats));
    if (room < HOLD_GAP_BEATS - EPS) fail(`bar ${m.bar}: the freeze at beat ${m.beat} ends at ${m.beat + clip.beats}, less than ${HOLD_GAP_BEATS} beat before the next move (${next.beat}, swung ${next.swungBeat})`);
  });

  // a STYLE tap just BEFORE a move must be out of the move's judge window: a press at the tap (up to GROOVE_WINDOW_SEC
  // late) that is still within MISS_AFTER of the move would be judged as an early press OF THE MOVE, and the press the
  // player then makes on the move would be a wild tap. (After a move the head is normally hit and gone.)
  const spb = 60 / song.bpm;
  const clearSec = CLEAR_SEC;
  for (const p of style) {
    const next = moves.find((m) => m.swungBeat > p.swungBeat + EPS);
    if (next && (next.swungBeat - p.swungBeat) * spb < clearSec - EPS) {
      fail(`bar ${p.bar}: a ${p.kind === 'move' ? 'demoted move' : p.kind} tap at beat ${p.beat} is ${Math.round((next.swungBeat - p.swungBeat) * spb * 1000)} ms before the move at beat ${next.beat}, inside its judge window (${Math.round(clearSec * 1000)} ms clear needed)`);
    }
  }

  // …and no STYLE tap lands inside a freeze's hold: the button is already down, so it could not be pressed again
  moves.forEach((m) => {
    const clip = CLIP_BY_ID.get(m.clipId);
    if (!clip || clip.category !== 'freeze') return;
    for (const p of style) {
      const inside = (p.beat > m.beat + EPS && p.beat < m.beat + clip.beats - EPS) || (p.swungBeat > m.swungBeat + EPS && p.swungBeat < m.swungBeat + clip.beats - EPS);
      if (inside) fail(`bar ${p.bar}: a ${p.kind === 'move' ? 'demoted move' : p.kind} tap at beat ${p.beat} falls inside the freeze held from beat ${m.beat} (the button is down)`);
    }
  });

  // density: easy → hard, around the song's own target (moves + style taps: that is what a player has to play)
  const stats = chartStats(chart, song);
  const [lo, hi] = [DENSITY_BAND[0] * song.targetTapsPerMin, DENSITY_BAND[1] * song.targetTapsPerMin];
  if (stats.tapsPerMin < lo - EPS || stats.tapsPerMin > hi + EPS) {
    fail(`${stats.tapsPerMin.toFixed(1)} taps a minute is outside ${lo.toFixed(1)}–${hi.toFixed(1)} (the song's target ${song.targetTapsPerMin} × ${DENSITY_BAND.join('–')})`);
  }

  // a move's instrument plays in its section; every stem the song lists is called by a move somewhere
  const called = new Set<FelStem>();
  for (const p of moves) {
    const stem = clipStem(p.clipId);
    const sec = song.sections[p.section];
    if (stem) called.add(stem);
    if (stem && sec && !sec.stems.includes(stem)) fail(`bar ${p.bar}: a ${p.clipId} (${stem}) in the ${sec.name}, which does not play ${stem}`);
  }
  const listed = new Set(song.sections.flatMap((s) => s.stems).filter((s) => s !== 'bed'));
  for (const stem of listed) if (!called.has(stem)) fail(`no move ever calls ${stem}: that instrument could never be earned`);

  // a freeze on every break bar whose section plays horns (the band stops, the horns hit)
  for (const bar of song.breakBars) {
    const sec = song.sections.find((s) => bar >= s.startBar && bar < s.startBar + s.bars);
    if (!sec?.stems.includes('horns')) continue;
    const ok = moves.some((p) => p.beat === (bar - 1) * 4 && CLIP_BY_ID.get(p.clipId)?.category === 'freeze');
    if (!ok) fail(`break bar ${bar}: no freeze on its downbeat`);
  }

  // the routine ends in the song's last bar (DanceMode finishes a beat after last.beat + last.holdBeats)
  const steps = stepsFromPresses(scored);
  const last = steps[steps.length - 1];
  if (!last) { fail('no move at all'); return problems; }
  const routineEnd = last.beat + last.holdBeats;
  if (routineEnd > end + EPS || routineEnd < end - 4 - EPS) fail(`the routine ends at beat ${routineEnd}, not inside the last bar (${end - 4}–${end})`);
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

interface Played { steps: DanceStep[]; styleBeats: number[] }
const played = new Map<string, Played | null>();

function load(song: FelSong): Played | null {
  if (played.has(song.id)) return played.get(song.id)!;
  const chart = RAW[song.id];
  let out: Played | null = null;
  if (chart) {
    const problems = validateChart(chart, song);
    if (problems.length) {
      // never silently: chart.test.ts fails on this first; a chart that still reaches a player is shouted about here
      console.error(`[FEL-DANCE] chart "${song.id}" is INVALID (${problems.length}) — playing the generated steps instead:\n  ${problems.join('\n  ')}`);
    } else {
      const plan = planChart(chart, song);
      out = { steps: stepsFromPresses(plan.scored), styleBeats: styleBeatsFromPresses(plan.style) };
    }
  }
  played.set(song.id, out);
  return out;
}

/** The authored chart's scored steps for a song (a fresh copy every call), or null: no chart, or one that failed
 *  validation (logged loudly — see load()). */
export function chartStepsFor(song: FelSong | string): DanceStep[] | null {
  const s = typeof song === 'string' ? songFor(song) : song;
  const got = s ? load(s) : null;
  return got ? got.steps.map((st) => ({ ...st })) : null;
}

/** The authored chart's STYLE taps for a song: the (swung) song beats of its accents, doubles and freestyle slots, or
 *  null when the song has no playable chart (then the room's computed groove beats apply, chartPlay.grooveBeats). */
export function chartStyleBeatsFor(song: FelSong | string | null | undefined): number[] | null {
  const s = typeof song === 'string' ? songFor(song) : song;
  const got = s ? load(s) : null;
  return got ? [...got.styleBeats] : null;
}
