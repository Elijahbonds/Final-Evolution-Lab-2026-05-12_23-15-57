// MUSIC-SUITE P9 (2026-09-29), fair dance duels — the measurements behind the Arena dance score, the rival baseline and the
// ceilings, written to outbox musicsuite/p9/fair-duels-proof.json. Node only (no browser, no database): every number is
// the real judge (DanceCore via houseSong.judgeDanceSet) on the real authored charts (lib/babylon/dance/chart.ts).
// Run: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p9-fair-duels.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  houseSongFor, houseSongSteps, houseSongEndSec, houseSongSetMs, judgeDanceSet, dancePress, houseSongSummary, HOUSE_SONG_CHOICES,
  DANCE_ARENA_SCALE, type HouseSong, type HousePress,
} from '../../lib/babylon/dance/houseSong';
import { DancePerformance, beatDuration, isPressHold, isFreeSlot } from '../../lib/babylon/core/DanceCore';
import { stepsForSong } from '../../lib/babylon/core/danceTracks';
import { songFor } from '../../lib/babylon/dance/felSongs';
import { FREESTYLE_PAD } from '../../lib/babylon/dance/chart';
import { SCORE_CEILINGS, ARENA_STAKE_CEILINGS, danceChartPerfect } from '../../lib/arena-score-integrity';
import { ARENA_SCORE_BASELINES, RIVAL_BAND, drawRivalScore } from '../../lib/arena-rivals';

const OUT = join(homedir(), 'Claude/outbox/finish-release/musicsuite/p9');
let seed = 12345;
const rnd = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 0x100000000; };
const gauss = (): number => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / Math.sqrt(0.5); };
const pad = Object.values(FREESTYLE_PAD);

function houseOn(songId: string): HouseSong { const s = songFor(songId)!; return { v: 1, seed: songId, songId, difficulty: s.difficulty, bpm: s.bpm }; }
function dancer(h: HouseSong, sd: number, skip: number, keepHolds = true): HousePress[] {
  const bd = beatDuration(h.bpm);
  const out: HousePress[] = [];
  let k = 0;
  for (const s of houseSongSteps(h)) {
    if (rnd() < skip) continue;
    const t = s.beat * bd + gauss() * sd;
    out.push(dancePress(t, { key: 'A', move: isFreeSlot(s) ? pad[k++ % 4] : undefined }));
    out.push(dancePress(isPressHold(s) ? (keepHolds ? (s.beat + s.pressHoldBeats!) * bd + 0.02 : t + 0.1) : t + 0.08, { key: 'A', up: true }));
  }
  return out.sort((a, b) => a.tMs - b.tMs);
}
const every = (h: HouseSong, beats: number): HousePress[] => {
  const d = beatDuration(h.bpm) * beats;
  return Array.from({ length: Math.floor(houseSongEndSec(h) / d) }, (_, i) => dancePress(i * d));
};
const mash = (h: HouseSong, gap: number): HousePress[] => {
  const out: HousePress[] = [];
  for (let t = 0; t < houseSongEndSec(h); t += gap + (rnd() - 0.5) * gap * 0.4) out.push(dancePress(t));
  return out;
};

const perSong: Record<string, unknown> = {};
for (const c of HOUSE_SONG_CHOICES) {
  const h = houseOn(c.songId);
  const steps = houseSongSteps(h);
  const flawless = judgeDanceSet(h, dancer(h, 0, 0));
  const beginners = Array.from({ length: 21 }, () => judgeDanceSet(h, dancer(h, 0.09, 0.1)).score).sort((a, b) => a - b);
  perSong[c.songId] = {
    difficulty: c.difficulty, bpm: h.bpm, setSec: Math.round(houseSongSetMs(h)) / 1000,
    steps: steps.length, holds: steps.filter(isPressHold).length, freestyleSlots: steps.filter(isFreeSlot).length,
    p7GeneratedSteps: stepsForSong(songFor(c.songId)!).length,
    summary: houseSongSummary(houseSongFor(`proof-${c.songId}`).songId === c.songId ? houseSongFor(`proof-${c.songId}`) : { ...h, seed: 'proof' }),
    flawless: { arenaScore: flawless.score, points: flawless.points, perfectCeilingCheck: flawless.points === danceChartPerfect(steps.length + steps.filter(isPressHold).length) },
    arenaScore: {
      steady30ms: judgeDanceSet(h, dancer(h, 0.03, 0)).score,
      beginner90msSkip10pct_median_of_21: beginners[10],
      beginner90msSkip10pct_range: [beginners[0], beginners[20]],
      dropsEveryHold30ms: judgeDanceSet(h, dancer(h, 0.03, 0, false)).score,
      halfThenQuit: judgeDanceSet(h, dancer(h, 0, 0).filter((p) => p.tMs / 1000 < houseSongEndSec(h) / 2)).score,
      everyBeat: judgeDanceSet(h, every(h, 1)).score,
      every8th: judgeDanceSet(h, every(h, 0.5)).score,
      every16th: judgeDanceSet(h, every(h, 0.25)).score,
      masher8PerSec: judgeDanceSet(h, mash(h, 0.125)).score,
      masher4PerSec: judgeDanceSet(h, mash(h, 0.25)).score,
      nothing: judgeDanceSet(h, []).score,
    },
  };
}

// the room's frame-driven judge vs the rejudge of its recorded list (unrounded times), 30/60/144 Hz
let runs = 0, diffs = 0;
for (const c of HOUSE_SONG_CHOICES) for (const hz of [30, 60, 144]) for (let k = 0; k < 12; k++) {
  const h = houseOn(c.songId);
  const presses = k % 3 === 0 ? dancer(h, 0.08, 0) : k % 3 === 1 ? mash(h, 0.15) : dancer(h, 0.15, 0.3, false);
  const perf = new DancePerformance(h.bpm);
  perf.setRoutine(houseSongSteps(h));
  const startAt = 3.3 + k * 0.917;
  perf.start(startAt);
  const end = houseSongEndSec(h);
  const ps = presses.filter((p) => p.tMs / 1000 >= -0.2 && p.tMs / 1000 <= end);
  let i = 0;
  const fire = (p: HousePress) => { const t = startAt + p.tMs / 1000; if (p.up) { if (perf.holding) perf.release(t, p.key); } else perf.hit(t, p.key || p.move ? { key: p.key, move: p.move } : undefined); };
  for (let f = startAt + rnd() / hz; f <= startAt + end + 1 / hz; f += 1 / hz) {
    while (i < ps.length && startAt + ps[i].tMs / 1000 <= f) fire(ps[i++]);
    perf.update(Math.min(f, startAt + end));
  }
  while (i < ps.length) fire(ps[i++]);
  perf.update(startAt + end);
  runs++;
  const live = Math.round(perf.result().accuracy * DANCE_ARENA_SCALE);
  if (live !== judgeDanceSet(h, JSON.parse(JSON.stringify(presses))).score) diffs++;
}

const spread: Record<string, number> = {};
for (let i = 0; i < 600; i++) { const id = houseSongFor(`cm_${i}_${(i * 7919).toString(36)}`).songId; spread[id] = (spread[id] ?? 0) + 1; }

const cold = Array.from({ length: 200 }, (_, i) => drawRivalScore({ seed: `cold-${i}`, mode: 'dance', playerHistory: [] }).score);
const proof = {
  when: new Date().toISOString(),
  what: 'MUSIC-SUITE P9 fair dance duels — Arena dance score (accuracy × 10,000 on the duel\'s house song), measured on the authored charts',
  arenaScale: DANCE_ARENA_SCALE,
  ceilings: { arenaStakeDance: ARENA_STAKE_CEILINGS.dance.max, freePlaySessionDance: SCORE_CEILINGS.dance.max, oldArenaDance: 79_680 },
  rival: { baseline: ARENA_SCORE_BASELINES.dance, band: RIVAL_BAND, coldBand200Seeds: [Math.min(...cold), Math.max(...cold)] },
  houseSongSpread600Seeds: spread,
  roomVsRejudge: { runs, accuracyScoreDifferences: diffs, note: 'frame-driven DancePerformance (the room loop) vs judgeDanceSet on the recorded list after a JSON round trip' },
  perSong,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'fair-duels-proof.json'), `${JSON.stringify(proof, null, 1)}\n`);
console.log(JSON.stringify({ roomVsRejudge: proof.roomVsRejudge, ceilings: proof.ceilings, rival: proof.rival, spread }, null, 1));
for (const [id, v] of Object.entries(perSong)) console.log(id, JSON.stringify((v as { arenaScore: unknown }).arenaScore));
