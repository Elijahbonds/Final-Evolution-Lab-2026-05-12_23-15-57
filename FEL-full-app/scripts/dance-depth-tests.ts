#!/usr/bin/env -S npx tsx
// Dance (The Cypher) depth checks — Class of 3000 benchmark, owner re-lock:
// "the music game more like andre 3000 music game" — playful instrument-stem
// mixing. Your dancing builds the band.
//
// What this pass built, and what nothing covered:
//   A. STEM BAND — every move family is an instrument (bounce→DRUMS,
//      footwork→BASS, wave→KEYS, toprock→PERC, freeze→HORNS, power→LEAD,
//      transition→FX), synthesized procedurally (no audio assets exist) on
//      the mode's own audio clock. Hits turn a stem up, misses duck it.
//   B. The judgement knows WHICH step it judged (DanceCore.onJudged 4th arg,
//      backward compatible) — without it no per-family mixing is possible.
//   C. The bezel: combo was published and never rendered (trap "published is
//      not rendered" again); the energy bar is the MIX with its own label.
//
// Pure where possible, source-level for the wiring.
//
// Run: npx tsx scripts/dance-depth-tests.ts

import { readFileSync } from 'node:fs';
import { nextStemLevel, CATEGORY_STEM, STEM_HIT_GAIN, STEM_MISS_LOSS } from '../lib/babylon/audio/StemBand';
import { DANCE_LIBRARY } from '../lib/babylon/core/DanceCore';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

// ── A. the mix math (pure) ──────────────────────────────────────────────────
{
  ok(nextStemLevel(0, 'PERFECT') === STEM_HIT_GAIN, 'a first PERFECT turns the instrument on');
  ok(nextStemLevel(0, 'GREAT') === STEM_HIT_GAIN, 'GREAT earns full gain');
  ok(nextStemLevel(0, 'GOOD') < STEM_HIT_GAIN, 'GOOD earns less');
  ok(nextStemLevel(1, 'PERFECT') === 1, 'stems cap at full');
  ok(nextStemLevel(0, 'MISS') === 0, 'a miss on a silent stem stays silent');
  ok(Math.abs(nextStemLevel(0.5, 'MISS') - (0.5 - STEM_MISS_LOSS)) < 1e-9, 'a miss ducks the stem');
  // a stem dies after enough misses — silence is the stakes
  let l = 1;
  for (let i = 0; i < 4; i++) l = nextStemLevel(l, 'MISS');
  ok(l === 0, 'four misses silence the instrument');
  // every library family has an instrument
  const cats = new Set(DANCE_LIBRARY.map((c) => c.category));
  for (const c of cats) ok(c in CATEGORY_STEM, `category '${c}' has an instrument`);
  const instruments = new Set(Object.values(CATEGORY_STEM));
  ok(instruments.size >= 6, `the band has real breadth (${instruments.size} instruments)`);
}

// ── B. the judgement carries the step (DanceCore wiring) ────────────────────
{
  const core = readFileSync(new URL('../lib/babylon/core/DanceCore.ts', import.meta.url), 'utf8');
  ok(core.includes('step?: DanceStep'), 'onJudged takes the step (optional, backward compatible)');
  ok(core.includes('hitStep.step, bestSigned * 1000'), 'a hit passes its step AND the signed delta');
  ok(core.includes('this.registerMiss(expired.step)'), 'an expired step reports itself');
}

// ── C. the mode + bezel wiring ──────────────────────────────────────────────
{
  const mode = readFileSync(new URL('../lib/babylon/modes/DanceMode.ts', import.meta.url), 'utf8');
  ok(mode.includes('new StemBand(audioCtx'), 'the band shares the mode\'s audio clock (no drift between judging and music)');
  ok(mode.includes('band.judge(cat, label)'), 'judgements drive the mix');
  ok(mode.includes('JOINS THE MIX'), 'an instrument joining is announced');
  ok(mode.includes('band?.update(now)'), 'the scheduler runs on the audio clock every frame');
  ok(mode.includes('band?.start('), 'the band starts at GO');
  ok(mode.includes('band?.dispose()'), 'the band is torn down');
  ok(mode.includes("energyLabel: 'MIX'"), 'the energy bar is labelled MIX');
  ok(mode.includes('band.mixLevel()'), 'the mix level is published');
  ok(mode.includes('MIX ${mixPct}%'), 'the result names the band you built');

  const host = readFileSync(new URL('../components/games/timing-babylon.tsx', import.meta.url), 'utf8');
  ok(host.includes('hud.combo'), 'the bezel renders the combo (was published-only)');
  ok(host.includes('hud.energyLabel'), 'the energy bar takes the mode\'s label (MIX)');
  ok(host.includes('hud.energy'), 'the mix bar renders');

  const verbs = readFileSync(new URL('../lib/babylon/ui/modeVerbs.ts', import.meta.url), 'utf8');
  ok(/dance: verbs\(\{ A: \{ label: 'TAP'/.test(verbs), 'touch verb TAP present');
  const cl = readFileSync(new URL('../lib/controller-link/schemas/registry.ts', import.meta.url), 'utf8');
  ok(/modeId: 'dance'/.test(cl), 'Controller Link has a dance schema');
}

if (fail.length) {
  console.error(`dance-depth-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`dance-depth-tests: ${checks} checks green`);
