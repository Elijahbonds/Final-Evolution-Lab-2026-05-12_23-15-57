/**
 * scripts/music/baseline-sim.ts — MUSIC-SUITE P1 (2026-09-25): the pure-code baseline numbers, no browser.
 * =====================================================================================================
 * Phase 1 of the music suite measures before it fixes. Every number below comes from the SHIPPED modules, imported and
 * run — the dance charts from DanceCore/danceTracks/DanceExport, the band from StemBand, the Academy's timing from the
 * real AudioEngine (and the legacy lib/modes/music/audio-engine.ts), PERFORM from the real PerformSet, the ceilings from
 * arena-score-integrity, the rival from arena-rivals, the payouts from reward-rules and SeasonPassCore.
 *
 * The two engines construct Web Audio objects and a window.setInterval scheduler, which node does not have. Rather
 * than re-typing their timing formula (and measuring the copy), they run on lib/babylon/music/fakeWebAudio.ts: a
 * clock-only stand-in whose buffer sources LOG their start() time. The engine code is unmodified; the sim sets the
 * context clock, fires the 25 ms interval, and reads what would have sounded when. Two things are reproduced rather
 * than run, and say so where they are used:
 *   · the session payout of app/api/sessions/route.ts:64-68 (a Next route with auth + prisma; the arithmetic is copied);
 *   · FileReader.readAsDataURL inside StudioLibrary.blobToDataUrl (StudioLibrary.ts:135-142) — `data:<type>;base64,…`.
 *
 * Run:   node node_modules/tsx/dist/cli.mjs scripts/music/baseline-sim.ts [outPath]
 * Out:   JSON (default /Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p1/sim-baseline.json) + a summary on stdout.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { execSync } from 'node:child_process';

import {
  installFakeWebAudio, FakeAudioBuffer, FakeAudioContext, FakeOfflineAudioContext, type FakeWebAudio,
} from '@/lib/babylon/music/fakeWebAudio';
import {
  DANCE_LIBRARY, DancePerformance, generateRoutine, beatDuration, JUDGE_WINDOWS, type DanceStep, type DanceClip,
} from '@/lib/babylon/core/DanceCore';
import { allTracks, stepsFor, gradeFor, type DanceTrack } from '@/lib/babylon/core/danceTracks';
import { StemBand, CATEGORY_STEM } from '@/lib/babylon/audio/StemBand';
import { exportSongToDance } from '@/lib/babylon/music/DanceExport';
import { MAX_SONG_BARS, barStartSec, renderLengthSec, type Section, type SongChain } from '@/lib/babylon/music/Song';
import { AudioEngine, type TrackState } from '@/lib/babylon/music/AudioEngine';
import { AudioEngine as LegacyAudioEngine } from '@/lib/modes/music/audio-engine';
import {
  PerformSet, performSetMax, PERFORM_SET_BARS, PERFORM_SET_NOTES, PERFORM_STEPS_PER_BAR, PERFORM_EXPIRE_S,
  PERFORM_PERFECT_S, performNoteAt, performResultStats, type PerformTapOutcome, type PerformResult,
} from '@/lib/babylon/music/performSet';
import {
  sessionWon as serverSessionWon, sessionScoreCap, isEndlessSession, sessionPayout as serverSessionPayout,
} from '@/lib/session-payout';
import { StudioLibrary } from '@/lib/babylon/music/StudioLibrary';
import { KIT_SLOTS } from '@/lib/babylon/music/SynthKit';
import { ARENA_SCORE_BASELINES, RIVAL_BAND } from '@/lib/arena-rivals';
import { SCORE_CEILINGS, danceCeiling } from '@/lib/arena-score-integrity';
import { DEFAULT_REWARD_RULES, REASON, computeGrant } from '@/lib/wallet/reward-rules';
import { SeasonPassCore } from '@/lib/season/season-pass-core';

const DEFAULT_OUT = '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p1/sim-baseline.json';
const STEPS = PERFORM_STEPS_PER_BAR;            // StudioMode.tsx:45 — the grid's steps ARE the set's steps
const ACADEMY_BPM = 92;                          // StudioMode.tsx:128 default
const ACADEMY_SWING = 0.15;                      // StudioMode.tsx:129 default
const TICK_S = 0.025;                            // AudioEngine.ts:23 LOOKAHEAD_MS (the scheduler's setInterval)
const LIVE_LEAD_S = 0.05;                        // AudioEngine.ts:103 nextNoteTime = currentTime + 0.05

const r = (x: number, d = 3): number => Math.round(x * 10 ** d) / 10 ** d;
const ms = (s: number): number => r(s * 1000, 2);

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// DANCE
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const CATEGORIES = [...new Set(DANCE_LIBRARY.map((c) => c.category))] as DanceClip['category'][];
const clipOf = (s: DanceStep): DanceClip => DANCE_LIBRARY.find((c) => c.id === s.clipId)!;

/** Every step tapped dead on its beat through the real DancePerformance (DanceCore.ts:199-215 update, :255-294 hit). */
function perfectRun(steps: DanceStep[], bpm: number): { score: number; maxCombo: number; stars: number; accuracy: number; counts: Record<string, number> } {
  const perf = new DancePerformance(bpm);
  perf.setRoutine(steps);
  // Origin 0, on purpose: update() fires a step when (now − started) >= beat·bd (DanceCore.ts:204), and with any other
  // origin (10 + x) − 10 can land one ulp under x, so a tap dead on the beat meets no pending step and scores a wild
  // MISS (measured: WARM UP read 2,750 instead of 4,725 with an origin of 10 s). peekNext's "not started" is not used.
  const start = 0;
  perf.start(start);
  const bd = beatDuration(bpm);
  for (const s of [...steps].sort((a, b) => a.beat - b.beat)) {
    const at = start + s.beat * bd;              // the same expression update() stamps the pending step with
    perf.update(at);
    perf.hit(at);
  }
  perf.update(start + (perf.totalBeats + 1) * bd);
  const res = perf.result();
  return { score: res.score, maxCombo: res.maxCombo, stars: res.stars, accuracy: res.accuracy, counts: res.counts };
}

/** The band after every tap is PERFECT, through the real StemBand's judge()/mixLevel() (StemBand.ts:69-84) on a fake ctx. */
function perfectMix(steps: DanceStep[], bpm: number): { mixPct: number; joinsAtTap: Record<string, number | null>; levels: Record<string, number>; neverJoins: string[] } {
  const ctx = new FakeAudioContext();
  const band = new StemBand(ctx as unknown as AudioContext, ctx.destination as unknown as AudioNode, bpm);
  const joinsAtTap: Record<string, number | null> = {};
  for (const cat of CATEGORIES) joinsAtTap[CATEGORY_STEM[cat]] = null;
  [...steps].sort((a, b) => a.beat - b.beat).forEach((s, i) => {
    const cat = clipOf(s).category;
    band.judge(cat, 'PERFECT');                  // DanceMode.ts:143-146 — the judged step's family turns its stem up
    if (joinsAtTap[CATEGORY_STEM[cat]] === null) joinsAtTap[CATEGORY_STEM[cat]] = i + 1;
  });
  const levels: Record<string, number> = {};
  for (const cat of CATEGORIES) levels[CATEGORY_STEM[cat]] = r(band.level(cat), 3);
  return {
    mixPct: Math.round(band.mixLevel() * 100),   // DanceMode.ts:216 mixPct = round(band.mixLevel() × 100)
    joinsAtTap,
    levels,
    neverJoins: Object.entries(joinsAtTap).filter(([, v]) => v === null).map(([k]) => k),
  };
}

function chartReport(t: DanceTrack, steps: DanceStep[], source: string) {
  const bd = beatDuration(t.bpm);
  const sorted = [...steps].sort((a, b) => a.beat - b.beat);
  const totalBeats = sorted.length ? sorted[sorted.length - 1].beat + sorted[sorted.length - 1].holdBeats : 0;
  const tapSec = sorted.map((s) => s.beat * bd);
  let longestGap = 0, longestGapFromBeat = 0;
  for (let i = 1; i < tapSec.length; i++) {
    const g = tapSec[i] - tapSec[i - 1];
    if (g > longestGap) { longestGap = g; longestGapFromBeat = sorted[i - 1].beat; }
  }
  const runEndSec = (totalBeats + 1) * bd;       // DanceMode.ts:451 — results once songBeat > totalBeats + 1
  const nominalSec = t.bars * 4 * bd;
  const families: Record<string, number> = {};
  for (const c of CATEGORIES) families[c] = 0;
  for (const s of sorted) families[clipOf(s).category]++;
  const best = perfectRun(sorted, t.bpm);
  const mix = perfectMix(sorted, t.bpm);
  return {
    id: t.id, name: t.name, bpm: t.bpm, bars: t.bars, difficulty: t.difficulty, source,
    durationSec: {
      nominal: r(nominalSec, 2),
      goToResults: r(runEndSec, 2),
      withCountIn: r(runEndSec + 4 * bd, 2),
      how: 'nominal = bars × 4 × 60/bpm; goToResults = (routine totalBeats + 1) beats (DanceMode.ts:451); withCountIn adds the one-bar count-in (DanceMode.ts:406-408)',
    },
    taps: sorted.length,
    tapsPerMinute: r(sorted.length / (nominalSec / 60), 1),
    tapsPerMinuteOverRun: r(sorted.length / (runEndSec / 60), 1),
    longestGapSec: r(longestGap, 3),
    longestGapBeats: r(longestGap / bd, 2),
    longestGapStartsAtBeat: longestGapFromBeat,
    tailAfterLastTapSec: tapSec.length ? r(runEndSec - tapSec[tapSec.length - 1], 3) : null,
    offBeatEntries: sorted.filter((s) => s.beat % 1 !== 0).length,
    maxScore: best.score,
    maxScoreFormulaCheck: sorted.length * JUDGE_WINDOWS[0].points + 5 * (sorted.length * (sorted.length + 1)) / 2,
    perfectRun: { allPerfect: best.counts.PERFECT === sorted.length, maxCombo: best.maxCombo, stars: best.stars, grade: gradeFor(best.accuracy) },
    families,
    stemsByFamily: Object.fromEntries(CATEGORIES.map((c) => [c, CATEGORY_STEM[c]])),
    maxMixPctAllPerfect: mix.mixPct,
    mixStemLevelsAllPerfect: mix.levels,
    mixJoinsAtTap: mix.joinsAtTap,
    stemsThatNeverJoin: mix.neverJoins,
    steps: sorted.map((s) => ({ beat: s.beat, sec: r(s.beat * bd, 3), clip: clipOf(s).name, family: clipOf(s).category, holdBeats: s.holdBeats })),
  };
}

function denseSong(id: string, onSlots: readonly string[], bpm = ACADEMY_BPM) {
  const tracks: TrackState[] = KIT_SLOTS.map((k) => ({
    sampleId: k.id, pattern: new Array<boolean>(STEPS).fill(onSlots.includes(k.id)), volume: 0.8, muted: false, pan: 0,
  }));
  const sections: Section[] = [{ id: 'dense', name: 'hook', tracks }];
  // 8 entries × 8 bars = 64 bars = MAX_SONG_BARS (Song.ts:13); an entry is 1–8 bars (Song.ts:25-33)
  const chain: SongChain = Array.from({ length: MAX_SONG_BARS / 8 }, () => ({ sectionId: 'dense', bars: 8 }));
  return { id, name: 'DENSE', bpm, steps: STEPS, chain, sections };
}

function danceSection() {
  // In node there is no window, so readExportedTrack() is null and allTracks() is the three shipped charts.
  const tracks = allTracks().map((t) => {
    const mine = stepsFor(t);
    const steps = mine ?? generateRoutine({ bars: t.bars, difficulty: t.difficulty, seed: t.seed });   // DanceMode.ts:271-272
    return chartReport(t, steps, mine ? 'exported' : 'generateRoutine(bars, difficulty, seed) — DanceMode.ts:272');
  });

  // THE 64-BAR EXPORT. SongPanel ids a song `s${Date.now()}` per mount (SongPanel.tsx:25), and the export's seed is
  // seedFrom(song.id) (DanceExport.ts:192), so a re-export in a new session re-rolls the chart: the reachable maximum is the
  // best over ids, searched here over 3,000 consecutive Date.now()-style ids per groove.
  const ID0 = 1_790_000_000_000;
  const IDS = 3000;
  const grooves: Record<string, readonly string[]> = {
    everySlotEvery16th: KIT_SLOTS.map((k) => k.id),
    hatOnlyEvery16th: ['hat'],
    snareOnlyEvery16th: ['snare'],
    kickOnlyEvery16th: ['kick'],
  };
  const exports: Record<string, unknown> = {};
  for (const [name, slots] of Object.entries(grooves)) {
    const first = exportSongToDance(denseSong(`s${ID0}`, slots));
    let bestSteps = -1, bestId = '', worstSteps = Infinity;
    for (let i = 0; i < IDS; i++) {
      const out = exportSongToDance(denseSong(`s${ID0 + i}`, slots));
      const n = out?.steps.length ?? 0;
      if (n > bestSteps) { bestSteps = n; bestId = `s${ID0 + i}`; }
      if (n < worstSteps) worstSteps = n;
    }
    const best = exportSongToDance(denseSong(bestId, slots))!;
    const firstRun = first ? perfectRun(first.steps, first.track.bpm) : null;
    const bestRun = perfectRun(best.steps, best.track.bpm);
    const bestMix = perfectMix(best.steps, best.track.bpm);
    exports[name] = {
      slotsOn: slots,
      difficulty: first?.track.difficulty ?? null,
      density: first?.summary.density ?? null,
      hits: first?.summary.hits ?? null,
      sampleId: `s${ID0}`,
      sampleSteps: first?.steps.length ?? 0,
      sampleMaxScore: firstRun?.score ?? 0,
      idsSearched: IDS,
      stepsRange: [worstSteps, bestSteps],
      bestId,
      bestMaxScore: bestRun.score,
      bestFamilies: Object.fromEntries(CATEGORIES.map((c) => [c, best.steps.filter((s) => clipOf(s).category === c).length])),
      bestMaxMixPct: bestMix.mixPct,
      durationSec: r((best.summary.beats + 1) * beatDuration(best.track.bpm), 1),
    };
  }

  const baseline = ARENA_SCORE_BASELINES.dance;
  const rivalRange = [Math.round(baseline * (1 - RIVAL_BAND)), Math.round(baseline * (1 + RIVAL_BAND))];
  const ceiling = danceCeiling();
  const shippedVsRival = tracks.map((t) => ({
    id: t.id, maxScore: t.maxScore,
    vsRivalCentre: r(t.maxScore / baseline, 3),
    perfectBeatsRivalMin: t.maxScore > rivalRange[0],
    perfectBeatsRivalCentre: t.maxScore > baseline,
    perfectBeatsRivalMax: t.maxScore > rivalRange[1],
    // assumption: seedU (arena-rivals.ts:134) is uniform on [0,1), so the rival is uniform on the band and a perfect run
    // wins with probability (max/centre − (1 − band)) / (2·band), clamped
    perfectWinChanceVsColdStartRival: r(Math.max(0, Math.min(1, (t.maxScore / baseline - (1 - RIVAL_BAND)) / (2 * RIVAL_BAND))), 3),
    shareOfCeiling: r(t.maxScore / ceiling, 4),
  }));
  const bestExport = Math.max(...Object.values(exports).map((e) => (e as { bestMaxScore: number }).bestMaxScore));
  return {
    how: 'every chart run through the real DancePerformance, each step tapped at exactly its beat (delta 0 → PERFECT 300 + 5 × combo, DanceCore.ts:286-292); MIX through the real StemBand.judge/mixLevel on a fake AudioContext',
    tracks,
    export64Bars: {
      how: 'exportSongToDance (DanceExport.ts:182-208) on a 64-bar song (8 chain entries × 8 bars of one section) whose section has the named slots on every 16th, 92 BPM; best of 3,000 song ids; score via the real DancePerformance',
      grooves: exports,
    },
    arena: {
      rivalBaselineCentre: baseline,
      rivalBand: RIVAL_BAND,
      rivalRange,
      rivalHow: 'drawRivalScore on the cold-start baseline: centre × (1 − 0.18 + u × 0.36) (arena-rivals.ts:180, 186, 250-255); dance is banded on sessions, not duel scores (arena-rivals.ts:196)',
      danceCeiling: ceiling,
      danceCeilingHow: 'danceCeiling() (arena-score-integrity.ts:250-255): floor(64 bars × 4 beats ÷ 2-beat shortest clip) = 128 steps, 128 × 300 + 5 × 128 × 129 / 2',
      bestReachableExportMaxScore: bestExport,
      bestExportShareOfCeiling: r(bestExport / ceiling, 4),
      bestExportVsRivalCentre: r(bestExport / baseline, 2),
      shippedVsRival,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// SWING — the live scheduler vs the render, in both engines
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function allOnTrack(sampleId: string): TrackState {
  return { sampleId, pattern: new Array<boolean>(STEPS).fill(true), volume: 0.8, muted: false, pan: 0 };
}
const silentBuffer = (): AudioBuffer => new FakeAudioBuffer(1, 4410, 44100) as unknown as AudioBuffer;

interface LiveEngine {
  start(): void;
  stop(): void;
  readonly context: AudioContext;
}

/** Start the engine at ctx time 0 and fire its 25 ms interval until `count` steps have been scheduled; step times from 0. */
function liveSchedule(fake: FakeWebAudio, eng: LiveEngine, count: number): number[] {
  const ctx = eng.context as unknown as FakeAudioContext;
  ctx.currentTime = 0;
  eng.start();
  let k = 0;
  while (ctx.starts.length < count && k < 1_000_000) { k++; ctx.currentTime = k * TICK_S; fake.tick(); }
  eng.stop();
  return ctx.starts.slice(0, count).map((s) => s.at - LIVE_LEAD_S);
}

async function renderedStarts(render: () => Promise<unknown>): Promise<number[]> {
  const before = FakeOfflineAudioContext.created.length;
  await render();
  const made = FakeOfflineAudioContext.created.slice(before);
  return made.flatMap((c) => c.starts.map((s) => s.at)).sort((a, b) => a - b);
}

function swingCase(live: number[], render: number[], bpm: number, swing: number, bars: number) {
  const base = 60 / bpm / 4;
  const n = bars * STEPS;
  const perStep = Array.from({ length: n }, (_, i) => ({
    step: i,
    liveMs: ms(live[i]),
    renderMs: ms(render[i]),
    errMs: ms(live[i] - render[i]),
    liveOffGridMs: ms(live[i] - i * base),
    renderOffGridMs: ms(render[i] - i * base),
  }));
  const liveBar = live[STEPS] - live[0];
  const renderBarNominal = STEPS * base;
  // swing ratio: the first 16th of each 8th pair over the whole pair (50% = straight, 66.7% = triplet swing)
  const ratio = (t: number[], pairs: number): number => {
    let acc = 0;
    for (let p = 0; p < pairs; p++) acc += (t[2 * p + 1] - t[2 * p]) / (t[2 * p + 2] - t[2 * p]);
    return acc / pairs;
  };
  const evenOff = perStep.filter((s) => s.step % 2 === 0 && s.step < STEPS);
  const oddOff = perStep.filter((s) => s.step % 2 === 1 && s.step < STEPS);
  // the render has no step 64; its bar line is n × base (AudioEngine.ts:214 places bar b step s at (b·steps + s)·stepDur)
  const renderWithEnd = [...render.slice(0, n), n * base];
  return {
    swing,
    stepSec: r(base, 6),
    liveBarSec: r(liveBar, 4),
    renderBarSec: r(renderBarNominal, 4),
    liveBarStretchPct: r((liveBar / renderBarNominal - 1) * 100, 3),
    liveEffectiveBpm: r(bpm * renderBarNominal / liveBar, 3),
    liveTempoErrorPct: r((renderBarNominal / liveBar - 1) * 100, 3),
    maxAbsErrMs: ms(Math.max(...perStep.map((s) => Math.abs(live[s.step] - render[s.step])))),
    errAtBarLinesMs: [1, 2, 3, 4].filter((b) => b <= bars).map((b) => ({ bar: b, errMs: ms(live[b * STEPS] - b * STEPS * base) })),
    swingRatioLive: r(ratio(live, n / 2), 4),
    swingRatioRender: r(ratio(renderWithEnd, n / 2), 4),
    bar1OffGrid: {
      onBeat16thsLiveMs: evenOff.map((s) => s.liveOffGridMs),
      offBeat16thsLiveMs: oddOff.map((s) => s.liveOffGridMs),
      onBeat16thsRenderMs: evenOff.map((s) => s.renderOffGridMs),
      offBeat16thsRenderMs: oddOff.map((s) => s.renderOffGridMs),
    },
    liveOddStepDelayAfterItsPartnerMs: ms(live[1] - live[0] - base),
    liveEvenStepDelayAfterItsPartnerMs: ms(live[2] - live[1] - base),
    renderOddStepDelayMs: ms(render[1] - base),
    perStep,
  };
}

function shiftedVerdict(c: ReturnType<typeof swingCase>): string {
  if (c.swing === 0) return 'no shift (swing 0): live and render are both the straight grid';
  return `render: the OFF-beat 16ths (odd steps) sit ${c.renderOddStepDelayMs} ms late on a fixed grid (bar ${c.renderBarSec} s); ` +
    `live: each odd step follows its partner by exactly one straight 16th (+${c.liveOddStepDelayAfterItsPartnerMs} ms) and the ` +
    `delay lands on the NEXT ON-beat 16th (+${c.liveEvenStepDelayAfterItsPartnerMs} ms), so the swing is reversed ` +
    `(ratio ${c.swingRatioLive} < 0.5) and the whole grid slides late by ${c.liveEvenStepDelayAfterItsPartnerMs} ms per 8th`;
}

async function swingSection(fake: FakeWebAudio) {
  const bars = 4;
  const count = bars * STEPS + 1;                // + the downbeat after bar 4, for the bar-4 line
  const academy = [];
  for (const swing of [0, 0.15, 0.4]) {
    const eng = new AudioEngine({ bpm: ACADEMY_BPM, steps: STEPS, tracks: [allOnTrack('kick')], swing });
    eng.loadBuffer('kick', 'Kick', silentBuffer(), 'kick');
    const live = liveSchedule(fake, eng, count);
    const mixdown = await renderedStarts(() => eng.renderMixdown(bars));
    const songBars = Array.from({ length: bars }, () => [allOnTrack('kick')]);
    const song = await renderedStarts(() => eng.renderSong(songBars, [], renderLengthSec(bars, ACADEMY_BPM, STEPS, [])));
    eng.dispose();
    const c = swingCase(live, mixdown, ACADEMY_BPM, swing, bars);
    const songVsMixdownMaxMs = ms(Math.max(...mixdown.map((t, i) => Math.abs(t - song[i]))));
    const barStart = [1, 2, 3, 4].map((b) => ({
      bar: b, songBarStartSec: r(barStartSec(b, ACADEMY_BPM, STEPS), 4), liveBarStartSec: r(live[b * STEPS], 4),
      errMs: ms(live[b * STEPS] - barStartSec(b, ACADEMY_BPM, STEPS)),
    }));
    academy.push({ ...c, verdict: shiftedVerdict(c), renderSongVsMixdownMaxDiffMs: songVsMixdownMaxMs, songBarStartSecVsLive: barStart });
  }

  const legacy = [];
  for (const swing of [0, 0.15, 0.4, 1.0]) {
    const eng = new LegacyAudioEngine({ bpm: ACADEMY_BPM, steps: STEPS, tracks: [allOnTrack('kick')], swing });
    await eng.loadSample('kick', 'Kick', 'data:application/octet-stream;base64,AAAA', 'kick');
    const live = liveSchedule(fake, eng, count);
    const stems = await renderedStarts(() => eng.renderStems(bars));
    eng.dispose();
    const c = swingCase(live, stems, ACADEMY_BPM, swing, bars);
    legacy.push({
      ...c,
      verdict: swing === 0 ? 'no shift (swing 0)' : `renderStems has NO swing (audio-engine.ts:119 starts every step at (bar·steps + step)·stepDur): the stems are straight while the live loop is reverse-swung and ${c.liveBarStretchPct}% long`,
    });
  }
  return {
    how: 'the real engines on fakeWebAudio: start() at ctx time 0, the 25 ms interval fired with the clock stepped 25 ms, one track on every step; live times = the buffer sources\' start() times − 0.05 s (AudioEngine.ts:103); render times = the start() times inside renderMixdown(4) (AudioEngine.ts:214-215) and renderSong/placeBar (:278), legacy renderStems(4) (audio-engine.ts:119)',
    bpm: ACADEMY_BPM,
    bars,
    academyEngine: {
      formulaLive: 'AudioEngine.ts:131-136 advance(): nextNoteTime += base + (currentStep odd ? base × swing × 0.5 : 0) — added after every odd step, never paid back',
      formulaRender: 'AudioEngine.ts:214-215 and :278: at = (bar·steps + step)·stepDur + (step odd ? stepDur × swing × 0.5 : 0) — odd steps delayed on a fixed grid',
      uiSwingRange: 'StudioMode.tsx:487 slider 0–40 → swing 0–0.40; default 0.15 (:129)',
      cases: academy,
    },
    legacyEngine: {
      formulaLive: 'lib/modes/music/audio-engine.ts:71-76 — the same advance() as the Academy engine',
      formulaRender: 'lib/modes/music/audio-engine.ts:119 renderStems: straight grid, swing ignored',
      uiSwingRange: 'components/creator/modes/music-mode.tsx:163 slider 0–100 → swing 0–1.0; default 0.15 (:51)',
      cases: legacy,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PERFORM
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function emptyTracks(): TrackState[] {       // StudioMode.tsx:57-62
  return KIT_SLOTS.map((k) => ({ sampleId: k.id, pattern: new Array<boolean>(STEPS).fill(false), volume: 0.8, muted: false, pan: 0 }));
}

interface TapRecord { note: number; offsetMs: number; result: PerformTapOutcome; hitNote: number | null; hitDtMs: number | null }

interface PerformRun {
  taps: TapRecord[];
  score: number;
  combo: number;
  notesOffered: number;
  expiredMisses: number;
  soundsScheduled: number;
  overAtSec: number | null;
  lastNoteSec: number | null;
  releaseLatencyMs: number[];
  /** MUSIC-SUITE P2: the set's own result at the end of the run (won = accuracy >= 0.5 over >= 8 bars). */
  result: PerformResult;
}

/**
 * One PERFORM set on the real AudioEngine + PerformSet, wired exactly as StudioMode wires them:
 *   onStepAudible(s, t) → set.note(s, t, ctx.currentTime) (StudioMode.tsx:208-216), a tap → set.tap(ctx.currentTime)
 *   (StudioMode.tsx:258-266). Ticks fire at tickPhase + 25 ms·k after start() at ctx 0; `tapFor` gives each audible note
 *   (in schedule order) an absolute tap time, or null. `quantize` reads the clock the way a browser does, in 128-frame
 *   render quanta at 48 kHz (assumption: Chrome/Safari on this Mac run the context at 48 kHz).
 */
function runPerform(fake: FakeWebAudio, o: {
  bpm: number; swing: number; arena: boolean; grid: 'all' | 'empty'; tickPhaseSec: number; untilSec: number;
  tapFor?: (note: number, time: number) => number | null; quantize?: boolean;
}): PerformRun {
  const tracks = o.grid === 'all' ? [allOnTrack('kick'), ...emptyTracks().slice(1)] : emptyTracks();
  const eng = new AudioEngine({ bpm: o.bpm, steps: STEPS, tracks, swing: o.swing });
  for (const k of KIT_SLOTS) eng.loadBuffer(k.id, k.name, silentBuffer(), k.category);
  const ctx = eng.context as unknown as FakeAudioContext;
  const read = (t: number): number => (o.quantize ? Math.floor((t * 48000) / 128) * 128 / 48000 : t);
  const set = new PerformSet({ arena: o.arena });
  const expected = (): { step: number; time: number }[] => (set as unknown as { expected: { step: number; time: number }[] }).expected;
  let expiredMisses = 0, overAtSec: number | null = null, lastNoteSec: number | null = null;
  const releaseLatencyMs: number[] = [];
  const idxByTime = new Map<number, number>();
  // MUSIC-SUITE P2 (2026-09-25): wired as StudioMode wires it now — a step is offered when SCHEDULED (onStepScheduled; a
  // note while the grid sounds, performNoteAt, else a rest), and the playhead hook only expires windows and ends the set.
  // `releaseLatencyMs` is still now − t at the moment a note becomes hittable: negative = known before it sounds.
  // A tap that WAITS (P2: a nearer note may still be scheduled) settles in a later call; its record gets the verdict then
  // (lastTap changes identity once per settle, oldest waiting tap first).
  const waitingRecs: { rec: TapRecord; at: number }[] = [];
  let lastSeen = set.lastTap;
  const resolveWaiting = (): void => {
    if (set.lastTap === lastSeen) return;
    lastSeen = set.lastTap;
    const w = waitingRecs.shift();
    if (!w || !set.lastTap) return;
    w.rec.result = set.lastTap.judgement;
    if (set.lastTap.errorSec !== null) {
      const noteT = w.at - set.lastTap.errorSec;
      const key = [...idxByTime.keys()].find((x) => Math.abs(x - noteT) < 1e-6);
      w.rec.hitNote = key === undefined ? null : idxByTime.get(key) ?? null;
      w.rec.hitDtMs = ms(set.lastTap.errorSec);
    }
  };
  eng.onStepScheduled = (s, t, sound) => {
    const now = ctx.currentTime;
    const isNote = performNoteAt(sound);
    if (isNote) releaseLatencyMs.push((now - t) * 1000);
    const { missed, offered } = isNote ? set.note(s, t, now) : set.rest(s, t, now);
    resolveWaiting();
    expiredMisses += missed;
    if (offered) lastNoteSec = t;
  };
  eng.onStepAudible = () => {
    const now = ctx.currentTime;
    expiredMisses += set.expire(now);
    resolveWaiting();
    if (overAtSec === null && set.over(now)) overAtSec = now;
  };
  ctx.currentTime = 0;
  eng.start();
  const taps: TapRecord[] = [];
  const pending: { at: number; note: number; time: number }[] = [];
  let seen = 0, k = 1, lastEventAt = 0;
  for (;;) {
    const nextTick = o.tickPhaseSec + TICK_S * k;
    pending.sort((a, b) => a.at - b.at);
    if (pending.length && pending[0].at < nextTick) {            // a tap that lands before the next timer firing
      const p = pending.shift()!;
      // a tap planned for before the tick that scheduled its note would run the clock backwards: refuse, never fudge
      if (p.at < lastEventAt) throw new Error(`tap for note ${p.note} at ${p.at}s is before the last event (${lastEventAt}s)`);
      lastEventAt = p.at;
      ctx.currentTime = read(p.at);
      set.expire(ctx.currentTime);   // P2: tap() sweeps expired notes first; sweep here so `gone` is the note the tap took
      resolveWaiting();
      const before = expected().map((e) => e.time);
      const result = set.tap(ctx.currentTime);
      const after = new Set(expected().map((e) => e.time));
      const gone = before.find((t) => !after.has(t));
      const rec: TapRecord = {
        note: p.note, offsetMs: ms(p.at - p.time), result,
        hitNote: gone === undefined ? null : idxByTime.get(gone) ?? null,
        hitDtMs: gone === undefined ? null : ms(ctx.currentTime - gone),
      };
      taps.push(rec);
      if (result === 'WAIT') waitingRecs.push({ rec, at: ctx.currentTime }); else lastSeen = set.lastTap;
      continue;
    }
    if (nextTick > o.untilSec || overAtSec !== null) break;
    lastEventAt = nextTick;
    ctx.currentTime = read(nextTick);
    fake.tick();
    k++;
    while (seen < ctx.starts.length) {                            // newly scheduled notes → plan their taps
      const t = ctx.starts[seen].at;
      idxByTime.set(t, seen);
      const at = o.tapFor?.(seen, t);
      if (at !== null && at !== undefined) pending.push({ at, note: seen, time: t });
      seen++;
    }
  }
  const soundsScheduled = ctx.starts.length;
  eng.dispose();
  const result = set.result(ctx.currentTime);   // decides any tap still waiting
  resolveWaiting();
  return { taps, score: set.score, combo: set.combo, notesOffered: set.notes, expiredMisses, soundsScheduled, overAtSec, lastNoteSec, releaseLatencyMs, result };
}

/** What /api/sessions and the shell's earn events pay for one session. */
function sessionPayout(score: number, won: boolean) {
  // REPRODUCED from app/api/sessions/route.ts:64-68 (a Next route: auth + prisma, not importable here)
  const xp = Math.max(5, Math.round(score * 1.5) + (won ? 50 : 10));
  const profileShards = Math.max(1, Math.floor(score / 20)) + (won ? 3 : 0);
  const lc = won ? 15 : 0;
  // REAL: the shell reports mode_session_completed always and mode_session_won on a win (game-shell.tsx:235-246);
  // the server prices them with these rules (reward-rules.ts:140-149) through computeGrant (:207-219)
  const walletCoins = computeGrant(DEFAULT_REWARD_RULES[REASON.MODE_SESSION_COMPLETED], { score });
  const walletShards = won ? computeGrant(DEFAULT_REWARD_RULES[REASON.MODE_SESSION_WON], {}) : 0;
  // REAL: season XP (season-pass-core.ts:132-139), without the first-of-day +150 or quests
  const seasonXp = SeasonPassCore.sessionXp({ score, won });
  return {
    profileXp: xp, profileShards, lc, walletCoins, walletShards, seasonXp,
    totalShards: profileShards + walletShards,
    how: 'profileXp = max(5, round(1.5·score) + (won ? 50 : 10)); profileShards = max(1, floor(score/20)) + (won ? 3 : 0); LC = won ? 15 : 0 (route.ts:64-68, + a streak bonus of 5×day on the first session of a day, :74-78, not included); walletCoins/walletShards = computeGrant(MODE_SESSION_COMPLETED / MODE_SESSION_WON); seasonXp = SeasonPassCore.sessionXp (+150 first of day not included)',
  };
}

/**
 * MUSIC-SUITE P2 (2026-09-25, live-proof pass): what POST /api/sessions pays NOW, through the REAL server rules
 * (lib/session-payout.ts — pure, so importable here), wired as app/api/sessions/route.ts:81-131 wires them: sessionWon →
 * sessionScoreCap → isEndlessSession → sessionPayout (not an Arena set, so arenaVerified false). `sessionPayout` above is
 * P1's copy of the OLD formula, kept so the P1 columns read the same. Two rows: the SHARED CONTRACT (the shell forwards
 * the room's stats) and TODAY's shell, which posts no `stats` (session-payout.ts ROOM_STATS_FORWARDED = false). The
 * daily streak LC and the season/wallet earns are left out.
 */
function serverPayoutP2(score: number, result: PerformResult, durationSec: number) {
  const stats = performResultStats(result);
  const row = (st: Record<string, unknown> | null, forwarded: boolean) => {
    const won = serverSessionWon('music', result.won, st, durationSec, { score, statsForwarded: forwarded });
    const cap = sessionScoreCap('music', st, durationSec);
    const paidScore = cap === null ? score : Math.min(score, cap);
    const endless = isEndlessSession('music', st, durationSec);
    const p = serverSessionPayout({ score: paidScore, won, endless, durationSec });
    return { won, endless, paidScore, xp: p.xp, profileShards: p.shards, lc: p.winCredits, capped: p.capped };
  };
  return {
    durationSec: r(durationSec, 2),
    statsForwarded: row(stats, true),
    todaysShellNoStats: row(null, false),
    how: 'lib/session-payout.ts sessionWon / sessionScoreCap / isEndlessSession / sessionPayout, as app/api/sessions/route.ts:81-131 calls them (arenaVerified false); statsForwarded = the room\'s performResultStats(result) in the body; todaysShellNoStats = no stats (ROOM_STATS_FORWARDED false: the room\'s own won is kept when it scored)',
  };
}

function tally(taps: TapRecord[]) {
  // MUSIC-SUITE P2: a tap with no note in reach is EXTRA now (P1 called it EARLY whatever its timing)
  const t = { PERFECT: 0, GOOD: 0, EXTRA: 0, WAIT: 0, sameNote: 0, previousNote: 0, olderNote: 0, noNote: 0 };
  for (const x of taps) {
    t[x.result]++;
    if (x.hitNote === null) t.noNote++;
    else if (x.hitNote === x.note) t.sameNote++;
    else if (x.hitNote === x.note - 1) t.previousNote++;
    else t.olderNote++;
  }
  return t;
}

function performSection(fake: FakeWebAudio) {
  const OFFSETS_MS = [-60, -30, 0, 30, 60];
  const PHASES_MS = Array.from({ length: 25 }, (_, i) => i);
  const bars4 = (swing: number) => LIVE_LEAD_S + 4 * STEPS * (60 / ACADEMY_BPM / 4) * (1 + swing / 4) + 0.4;

  // (1) AN ISOLATED NOTE: notes 0–15 were each hit PERFECT at +30 ms (so nothing is left open), then note 16 — bar 2's
  // downbeat — is tapped at the offset. The tap can only meet its own note. (Note 0 itself sounds 50 ms after START, too
  // soon for an early tap to exist, AudioEngine.ts:103.)
  const isolatedTap = (d: number, p: number, quantize: boolean): TapRecord => runPerform(fake, {
    bpm: ACADEMY_BPM, swing: ACADEMY_SWING, arena: false, grid: 'all', tickPhaseSec: p / 1000, untilSec: 3.5, quantize,
    tapFor: (n, t) => (n < 16 ? t + 0.03 : n === 16 ? t + d / 1000 : null),
  }).taps.find((x) => x.note === 16)!;
  const isolated = OFFSETS_MS.map((d) => ({ offsetMs: d, ...tally(PHASES_MS.map((p) => isolatedTap(d, p, false))), tickPhasesTried: PHASES_MS.length }));
  const isolatedQuantized = OFFSETS_MS.map((d) => ({ offsetMs: d, ...tally(PHASES_MS.map((p) => isolatedTap(d, p, true))) }));

  // (2) ONE TAP IN RUNNING MUSIC: the player lets 16 notes go by and taps bar 2's downbeat.
  const loneTap = OFFSETS_MS.map((d) => {
    const taps = PHASES_MS.map((p) => runPerform(fake, {
      bpm: ACADEMY_BPM, swing: ACADEMY_SWING, arena: false, grid: 'all', tickPhaseSec: p / 1000, untilSec: 3.5,
      tapFor: (n, t) => (n === 16 ? t + d / 1000 : null),
    }).taps[0]);
    return {
      offsetMs: d, ...tally(taps),
      hitDtMsRange: [Math.min(...taps.map((x) => x.hitDtMs ?? Infinity)), Math.max(...taps.map((x) => x.hitDtMs ?? -Infinity))],
    };
  });

  // (3) A STEADY PLAYER: bar 1 hit PERFECT at +30 ms (a warm-up bar, so the first measured tap is not the set's first
  // 50 ms), then every note of bars 2–5 tapped at the same offset; 25 timer phases. Tallies count bars 2–5 only.
  const steady = [0, ACADEMY_SWING].map((swing) => ({
    swing,
    rows: OFFSETS_MS.map((d) => {
      const runs = PHASES_MS.map((p) => runPerform(fake, {
        bpm: ACADEMY_BPM, swing, arena: false, grid: 'all', tickPhaseSec: p / 1000, untilSec: bars4(swing) + 4 * (60 / ACADEMY_BPM),
        tapFor: (n, t) => (n < STEPS ? t + 0.03 : n < 5 * STEPS ? t + d / 1000 : null),
      }));
      const measured = runs.flatMap((x) => x.taps.filter((tp) => tp.note >= STEPS));
      const scores = runs.map((x) => x.score).sort((a, b) => a - b);
      return {
        offsetMs: d, taps: measured.length, ...tally(measured),
        scoreMin: scores[0], scoreMedian: scores[Math.floor(scores.length / 2)], scoreMax: scores[scores.length - 1],
        perfectSetScore: performSetMax(5 * STEPS),
      };
    }),
  }));

  // release latency (how long after its audible time a note becomes hittable)
  const lat = runPerform(fake, { bpm: ACADEMY_BPM, swing: ACADEMY_SWING, arena: false, grid: 'all', tickPhaseSec: 0.0137, untilSec: 10 }).releaseLatencyMs;

  // (4) A SET WITH EXACTLY ONE TAP (free play, the tap PERFECT at +30 ms on bar 2's downbeat), then END SET.
  const one = runPerform(fake, {
    bpm: ACADEMY_BPM, swing: ACADEMY_SWING, arena: false, grid: 'all', tickPhaseSec: 0.007, untilSec: bars4(ACADEMY_SWING),
    tapFor: (n, t) => (n === 16 ? t + 0.03 : null),
  });
  const oneWon = one.result.won;                 // MUSIC-SUITE P2: performSetWon (P1: StudioMode.tsx:367 won: score > 0)
  const oneTapEarly = runPerform(fake, {        // the same single tap, 30 ms EARLY
    bpm: ACADEMY_BPM, swing: ACADEMY_SWING, arena: false, grid: 'all', tickPhaseSec: 0.007, untilSec: bars4(ACADEMY_SWING),
    tapFor: (n, t) => (n === 16 ? t - 0.03 : null),
  });

  // (5) A PERFECT 5-MINUTE FREE-PLAY SET at 92 BPM (the steady +30 ms player: PERFECT on every note, table 3).
  const fiveMin = [0, ACADEMY_SWING].map((swing) => {
    const run = runPerform(fake, {
      bpm: ACADEMY_BPM, swing, arena: false, grid: 'all', tickPhaseSec: 0.011, untilSec: LIVE_LEAD_S + 300,
      tapFor: (_n, t) => (t - LIVE_LEAD_S < 300 ? t + 0.03 : null),
    });
    const perfect = run.taps.filter((x) => x.result === 'PERFECT').length;
    return {
      swing, notes: run.notesOffered, tapsPerfect: perfect, score: run.score, scoreIsPerformSetMax: run.score === performSetMax(perfect),
      result: run.result,
      payout: sessionPayout(run.score, run.result.won),
      serverPayoutP2: serverPayoutP2(run.score, run.result, 300),   // MUSIC-SUITE P2: what the route pays now
    };
  });

  // (6) THE EMPTY GRID: every step is still a note (AudioEngine.ts:139-152 pushes every step; StudioMode.tsx:208-216).
  const emptyArena = runPerform(fake, { bpm: ACADEMY_BPM, swing: ACADEMY_SWING, arena: true, grid: 'empty', tickPhaseSec: 0.005, untilSec: 200 });
  const emptyMinute = runPerform(fake, { bpm: ACADEMY_BPM, swing: ACADEMY_SWING, arena: false, grid: 'empty', tickPhaseSec: 0.005, untilSec: LIVE_LEAD_S + 60 });

  return {
    how: 'the real AudioEngine + PerformSet on fakeWebAudio, wired as StudioMode wires them (P2: a note offered on onStepScheduled, a rest when the grid is silent; P1 was StudioMode.tsx:208-216, note on release) and a tap = set.tap(ctx.currentTime); the scheduler interval fires at phase + 25 ms·k, phases 0–24 ms tried (the timer and the audio clock are not aligned in a browser); "true audible time" = the scheduled start() time on the context clock (output latency not added)',
    rules: {
      releaseRule: 'P2: a note is offered when the scheduler SCHEDULES it (AudioEngine.onStepScheduled, up to SCHEDULE_AHEAD_S = 100 ms before it sounds); PerformSet.tap takes the nearest open note by signed error. (P1: drainPlayhead released a step only once its time <= ctx.currentTime.)',
      windows: { perfectBelowMs: PERFORM_PERFECT_S * 1000, hitWithinMs: PERFORM_EXPIRE_S * 1000, earlyWindowMs: 'as far ahead as the note is scheduled (see releaseLatencyMs, negative = before it sounds), at most 250' },
      releaseLatencyMs: { min: r(Math.min(...lat), 2), max: r(Math.max(...lat), 2), mean: r(lat.reduce((a, b) => a + b, 0) / lat.length, 2), samples: lat.length },
    },
    isolatedNote: { how: 'notes 0–15 hit PERFECT at +30 ms (nothing left open), then note 16 tapped at the offset; 25 timer phases', rows: isolated },
    isolatedNoteQuantizedClock: { how: 'same, with ctx.currentTime read in 128-frame quanta at 48 kHz (assumption)', rows: isolatedQuantized },
    loneTapInRunningMusic: { how: 'notes 0–15 go by untapped; only note 16 (bar 2 downbeat) is tapped', rows: loneTap },
    steadyPlayer: { how: 'bar 1 hit at +30 ms, then every note of bars 2–5 tapped at the same offset; 25 timer phases × 64 measured taps per row; score = the whole 5-bar set (perfectSetScore = performSetMax(80))', bySwing: steady },
    oneTapSet: {
      how: 'free play, one PERFECT tap (+30 ms on note 16), then END SET after 4 bars: StudioMode.tsx:360-372 endSet',
      score: one.score, won: oneWon, headline: one.combo > 0 ? `${one.score} · best combo x${one.combo}` : `${one.score}`,
      payout: sessionPayout(one.score, oneWon),
      serverPayoutP2: serverPayoutP2(one.score, one.result, bars4(ACADEMY_SWING)),   // MUSIC-SUITE P2: what the route pays now
      sameTap30msEarly: {
        result: oneTapEarly.taps[0]?.result, hitNote: oneTapEarly.taps[0]?.hitNote, hitDtMs: oneTapEarly.taps[0]?.hitDtMs,
        score: oneTapEarly.score, won: oneTapEarly.result.won,
      },
    },
    perfectFiveMinuteFreePlay: { how: 'steady +30 ms player, every note PERFECT, notes whose audible time is within 300 s of the first', bySwing: fiveMin },
    emptyGrid: {
      how: 'all 8 kit rows empty (StudioMode.tsx:57-62), every kit buffer loaded',
      arenaSetNotesOffered: emptyArena.notesOffered,
      arenaSetSoundsScheduled: emptyArena.soundsScheduled,
      arenaSetEndsAtSec: emptyArena.overAtSec === null ? null : r(emptyArena.overAtSec - LIVE_LEAD_S, 2),
      freePlayNotesPerMinute: emptyMinute.notesOffered,
      freePlaySoundsPerMinute: emptyMinute.soundsScheduled,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PUBLISH — the library's data URLs against a localStorage quota
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

async function publishSection(fake: FakeWebAudio) {
  const rows = [];
  for (const bpm of [60, ACADEMY_BPM, 160]) {         // StudioMode.tsx:484 BPM slider 60–160
    const tracks = emptyTracks().map((t, i) => (i < 3 ? { ...t, pattern: t.pattern.map((_, j) => j % (i + 2) === 0) } : t));
    const eng = new AudioEngine({ bpm, steps: STEPS, tracks, swing: ACADEMY_SWING });
    for (const k of KIT_SLOTS) eng.loadBuffer(k.id, k.name, silentBuffer(), k.category);
    const blob = await eng.renderMixdown(2);                       // StudioMode.tsx:282
    const frames = FakeOfflineAudioContext.created[FakeOfflineAudioContext.created.length - 1].length;
    // REPRODUCED: FileReader.readAsDataURL (StudioLibrary.ts:135-142) → `data:<blob.type>;base64,<bytes>`
    const dataUrl = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
    eng.dispose();
    const quotas: Record<string, unknown> = {};
    for (const [label, quota] of [['5 MiB chars (Chromium: 10 MiB of UTF-16)', 5 * 1024 * 1024], ['5,000,000 chars', 5_000_000]] as const) {
      fake.storage.clear();
      fake.storage.quotaChars = quota;
      let ok = 0, error = '';
      for (let i = 0; i < 50; i++) {
        try {
          StudioLibrary.publish({                                 // the REAL publish → writeAll (StudioLibrary.ts:43-46, 54-65)
            title: `T${i}`, authorId: 'me', authorName: 'You', kit: 'street', bpm, swing: ACADEMY_SWING, polished: false,
            sequencer: { bpm, steps: STEPS, tracks, swing: ACADEMY_SWING }, mixdownDataUrl: dataUrl, remixOf: null, streamingLinks: [],
          });
          ok++;
        } catch (e) { error = (e as Error).name; break; }
      }
      quotas[label] = { quotaChars: quota, publishesThatFit: ok, failsOnPublish: ok + 1, error, usedCharsAfter: fake.storage.usedChars };
    }
    const recordChars = JSON.stringify(StudioLibrary.list()[0] ?? {}).length;
    rows.push({
      bpm,
      renderSec: r(frames / 44100, 4),
      frames,
      wavBytes: blob.size,
      dataUrlChars: dataUrl.length,
      dataUrlMB: r(dataUrl.length / 1e6, 3),
      recordJsonChars: recordChars,
      quotas,
    });
  }
  return {
    how: 'renderMixdown(2) on the real AudioEngine (length = ceil(44100 × (stepDur × 16 × 2 + 1.2)) frames, AudioEngine.ts:191-193), the real encodeWav (16-bit stereo, 44-byte header, :291-316), the data URL as FileReader makes it, then the REAL StudioLibrary.publish until localStorage throws, on an otherwise empty origin',
    lengthDependsOn: 'bpm only (not the pattern, not swing)',
    rows,
    failureHandling: 'writeAll has no try/catch (StudioLibrary.ts:43-46) and publishTrack is try/finally with no catch (StudioMode.tsx:280-301): the QuotaExceededError escapes as an unhandled rejection and the player sees no message',
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ARENA MUSIC
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function arenaMusicSection(fake: FakeWebAudio) {
  const ceiling = SCORE_CEILINGS.music.max;
  const sets = [0, ACADEMY_SWING].map((swing) => {
    const run = runPerform(fake, {
      bpm: ACADEMY_BPM, swing, arena: true, grid: 'all', tickPhaseSec: 0.009, untilSec: 300,
      tapFor: (_n, t) => t + 0.03,
    });
    return {
      swing, notesOffered: run.notesOffered, perfectTaps: run.taps.filter((x) => x.result === 'PERFECT').length,
      score: run.score, equalsCeiling: run.score === ceiling,
      setEndsAtSec: run.overAtSec === null ? null : r(run.overAtSec - LIVE_LEAD_S, 2),
      lastNoteAtSec: run.lastNoteSec === null ? null : r(run.lastNoteSec - LIVE_LEAD_S, 2),
    };
  });
  const baseline = ARENA_SCORE_BASELINES.music;
  const notesInARowFor = (target: number): number => { let n = 0; while (performSetMax(n) < target) n++; return n; };
  return {
    how: 'SCORE_CEILINGS.music.max = performSetMax() (arena-score-integrity.ts:515-519) vs a 32-bar Arena set played by the steady +30 ms player on the real AudioEngine + PerformSet({ arena: true })',
    ceiling,
    performSetMax: performSetMax(),
    setBars: PERFORM_SET_BARS,
    setNotes: PERFORM_SET_NOTES,
    perfectSets: sets,
    commentClaim: 'performSet.ts:17 says 32 bars is 83 s at 92 BPM (swing 0)',
    rivalBaselineCentre: baseline,
    rivalRange: [Math.round(baseline * (1 - RIVAL_BAND)), Math.round(baseline * (1 + RIVAL_BAND))],
    ceilingOverRivalCentre: r(ceiling / baseline, 1),
    perfectNotesInARowToPassRivalCentre: notesInARowFor(baseline + 1),
    perfectNotesInARowToPassRivalMax: notesInARowFor(Math.round(baseline * (1 + RIVAL_BAND)) + 1),
    danceCeilingForComparison: danceCeiling(),
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const out = process.argv[2] || DEFAULT_OUT;
  const dance = danceSection();                               // before the fakes: no window, so no exported slot
  const fake = installFakeWebAudio();
  try {
    const swing = await swingSection(fake);
    const perform = performSection(fake);
    const publish = await publishSection(fake);
    const arenaMusic = arenaMusicSection(fake);
    let head = 'unknown';
    try { head = execSync('/Library/Developer/CommandLineTools/usr/bin/git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { /* no git */ }
    const result = {
      meta: {
        phase: 'MUSIC-SUITE P1 — pure-code baseline (no browser)',
        generatedAt: new Date().toISOString(),
        gitHead: head,
        script: 'scripts/music/baseline-sim.ts',
        webAudio: 'lib/babylon/music/fakeWebAudio.ts (clock-only stand-in; the engines are the shipped code)',
      },
      dance, swing, perform, publish, arenaMusic,
    };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(result, null, 1));
    printSummary(result, out);
  } finally {
    fake.uninstall();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function printSummary(res: any, out: string): void {
  const L = (s: string): void => console.log(s);
  L(`MUSIC-SUITE P1 baseline → ${out}`);
  L('\nDANCE (per shipped track: s, taps, taps/min, longest gap s, max score, MIX% all PERFECT, families)');
  for (const t of res.dance.tracks) {
    L(`  ${t.id.padEnd(7)} ${t.durationSec.nominal}s (run ${t.durationSec.goToResults}s)  taps ${t.taps}  ${t.tapsPerMinute}/min  gap ${t.longestGapSec}s  max ${t.maxScore}${t.perfectRun.allPerfect ? '' : ' (NOT all PERFECT!)'}  MIX ${t.maxMixPctAllPerfect}%  ${JSON.stringify(t.families)}`);
  }
  for (const [k, v] of Object.entries(res.dance.export64Bars.grooves)) {
    const e = v as { stepsRange: number[]; bestMaxScore: number; sampleMaxScore: number; difficulty: number };
    L(`  export ${k}: diff ${e.difficulty} steps ${e.stepsRange.join('–')} max ${e.sampleMaxScore} (sample) / ${e.bestMaxScore} (best id)`);
  }
  L(`  rival ${res.dance.arena.rivalRange.join('–')} (centre ${res.dance.arena.rivalBaselineCentre})  ceiling ${res.dance.arena.danceCeiling}`);
  L('\nSWING (Academy engine, 92 BPM, 4 bars)');
  for (const c of res.swing.academyEngine.cases) {
    L(`  s=${c.swing}: live bar ${c.liveBarSec}s vs ${c.renderBarSec}s (+${c.liveBarStretchPct}%), eff BPM ${c.liveEffectiveBpm}, max err ${c.maxAbsErrMs} ms, ratio live ${c.swingRatioLive} / render ${c.swingRatioRender}`);
  }
  for (const c of res.swing.legacyEngine.cases) {
    L(`  legacy s=${c.swing}: eff BPM ${c.liveEffectiveBpm}, max err vs stems ${c.maxAbsErrMs} ms`);
  }
  L('\nPERFORM isolated note (25 timer phases): offset → PERFECT/GOOD/EXTRA   [quantized clock]');
  res.perform.isolatedNote.rows.forEach((x: { offsetMs: number; PERFECT: number; GOOD: number; EXTRA: number }, i: number) => {
    const q = res.perform.isolatedNoteQuantizedClock.rows[i];
    L(`  ${String(x.offsetMs).padStart(4)} ms → ${x.PERFECT}/${x.GOOD}/${x.EXTRA}   [${q.PERFECT}/${q.GOOD}/${q.EXTRA}]`);
  });
  L('PERFORM lone tap on bar 2 downbeat: offset → PERFECT/GOOD/EXTRA (same/prev note)');
  for (const x of res.perform.loneTapInRunningMusic.rows) L(`  ${String(x.offsetMs).padStart(4)} ms → ${x.PERFECT}/${x.GOOD}/${x.EXTRA} (${x.sameNote}/${x.previousNote})`);
  for (const s of res.perform.steadyPlayer.bySwing) {
    L(`PERFORM steady player, swing ${s.swing} (per row 25×64 taps): offset → PERFECT/GOOD/EXTRA, same/prev, median score (perfect ${s.rows[0].perfectSetScore})`);
    for (const x of s.rows) L(`  ${String(x.offsetMs).padStart(4)} ms → ${x.PERFECT}/${x.GOOD}/${x.EXTRA}  ${x.sameNote}/${x.previousNote}  ${x.scoreMedian}`);
  }
  const o = res.perform.oneTapSet;
  L(`one-tap set: score ${o.score} won ${o.won} → XP ${o.payout.profileXp}, shards ${o.payout.totalShards}, LC ${o.payout.lc}, coins ${o.payout.walletCoins}, season XP ${o.payout.seasonXp}`);
  const sv = (x: any) => `won ${x.won} endless ${x.endless} → XP ${x.xp}, profile shards ${x.profileShards}, LC ${x.lc}${x.capped ? ' (capped)' : ''}`;
  L(`  P2 server (stats forwarded): ${sv(o.serverPayoutP2.statsForwarded)} | today's shell (no stats): ${sv(o.serverPayoutP2.todaysShellNoStats)}`);
  for (const f of res.perform.perfectFiveMinuteFreePlay.bySwing) {
    L(`5-min perfect free play s=${f.swing}: notes ${f.notes} score ${f.score} → XP ${f.payout.profileXp}, shards ${f.payout.totalShards}, LC ${f.payout.lc}`);
    L(`  P2 server (stats forwarded): ${sv(f.serverPayoutP2.statsForwarded)} | today's shell (no stats): ${sv(f.serverPayoutP2.todaysShellNoStats)}`);
  }
  L(`empty grid: arena set ${res.perform.emptyGrid.arenaSetNotesOffered} notes / ${res.perform.emptyGrid.arenaSetSoundsScheduled} sounds; free play ${res.perform.emptyGrid.freePlayNotesPerMinute} notes/min`);
  L('\nPUBLISH');
  for (const p of res.publish.rows) {
    const q = Object.values(p.quotas)[0] as { publishesThatFit: number };
    L(`  ${p.bpm} BPM: WAV ${p.wavBytes} B, data URL ${p.dataUrlChars} chars → ${q.publishesThatFit} fit in 5 MiB`);
  }
  L('\nARENA MUSIC');
  L(`  ceiling ${res.arenaMusic.ceiling}; perfect 32-bar sets: ${res.arenaMusic.perfectSets.map((s: { swing: number; score: number; setEndsAtSec: number }) => `s=${s.swing} ${s.score} (ends ${s.setEndsAtSec}s)`).join(', ')}`);
  L(`  rival ${res.arenaMusic.rivalRange.join('–')}; ${res.arenaMusic.perfectNotesInARowToPassRivalCentre} / ${res.arenaMusic.perfectNotesInARowToPassRivalMax} PERFECT notes in a row pass the centre / the top of the band`);
}

main().catch((e) => { console.error(e); process.exit(1); });
