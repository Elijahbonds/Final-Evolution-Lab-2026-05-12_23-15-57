#!/usr/bin/env -S npx tsx
// HOOPS-10PHASE-2 phase 3 — THE SHOT OUTCOME MODEL.
//
// The brief: make = f(release timing, distance, contest, fatigue, shot type), deterministic under the test seed.
// Four of those five already existed and are proven elsewhere (SHOT_QUALITY_PCT = timing, classifyShot's pctMod =
// distance banded into shot type, contestedPct = contest); this phase's real addition is FATIGUE (fatiguePct, new
// in HoopsDefense.ts) wired into both 1v1's releaseJumper and 3v3's resolveMyShot. This suite proves the model as
// a WHOLE: each factor moves the make chance the direction it should, on its own, with the others held fixed — and
// that the same inputs always produce the same pct and the same rim verdict under a seeded rand (no mode, no
// scene, no live timer needed to see it).
//
// Run: npx tsx scripts/shot-outcome-model-tests.ts

import { readFileSync } from 'node:fs';
import { Vector3 } from '@babylonjs/core';
import { SHOT_QUALITY_PCT, classifyShot, type ShotQuality } from '../lib/babylon/core/BasketballCore';
import { contestedPct, fatiguePct, CONTEST_PCT_BITE, FATIGUE_PCT_BITE } from '../lib/babylon/core/HoopsDefense';
import { rimDecides } from '../lib/babylon/core/RimDecides';
import { mulberry32 } from '../lib/babylon/core/trainingSim';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

/** The same pipeline releaseJumper / resolveMyShot run: timing → style/distance → contest → fatigue. */
function modelPct(quality: ShotQuality, pctMod: number, contest01: number, fatigue01: number): number {
  return Math.min(0.98, fatiguePct(contestedPct(SHOT_QUALITY_PCT[quality] * pctMod, contest01), fatigue01));
}

// ── A. release timing (f's first argument) — perfect beats good beats early/late beats brick, always ───────────
{
  const p = (q: ShotQuality) => modelPct(q, 1, 0, 0);
  ok(p('perfect') > p('good'), 'a perfect release outscores a good one at identical distance/contest/fatigue');
  ok(p('good') > p('early') && p('good') > p('late'), 'a good release beats an early or late one');
  ok(p('early') > p('brick') && p('late') > p('brick'), 'an early or late release still beats a flat brick');
}

// ── B. distance / shot type (f's second and fifth arguments — classifyShot bands one into the other) ──────────
{
  const hoop = new Vector3(0, 3.05, 0);
  const still = new Vector3(0, 0, 0);
  const atRim = classifyShot(new Vector3(0, 0, 1.6), still, hoop, 0);
  const midRange = classifyShot(new Vector3(0, 0, 4), still, hoop, 0);
  const deep = classifyShot(new Vector3(0, 0, 8), still, hoop, 0);
  ok(atRim.style === 'layup', `standing at the rim classifies as a layup (got ${atRim.style})`);
  ok(midRange.style === 'floater' || midRange.style === 'jumper', `mid-range classifies as a floater or jumper (got ${midRange.style})`);
  ok(deep.style === 'jumper', `standing deep classifies as a jumper (got ${deep.style})`);
  // distance moved the style, and the style carries its OWN make modifier (pctMod) — that is how "distance" reaches
  // the make chance: not as a free-standing continuous term, but banded through the shot the body actually took.
  ok(atRim.pctMod !== deep.pctMod, `a layup and a standing jumper carry different pctMod (${atRim.pctMod} vs ${deep.pctMod}) — distance reaches the model through shot type`);
  ok(modelPct('good', atRim.pctMod, 0, 0) > modelPct('good', deep.pctMod, 0, 0),
    'at the same timing/contest/fatigue, the layup\'s pctMod outscores the standing jumper\'s — nearer, cleaner shots score higher');
}

// ── C. contest ───────────────────────────────────────────────────────────────────────────────────────────────
{
  let last = 1;
  for (const c of [0, 0.25, 0.5, 0.75, 1]) {
    const p = modelPct('good', 1, c, 0);
    ok(p <= last + 1e-9, `make chance is non-increasing in contest (contest ${c} gave ${p.toFixed(3)}, prior ${last.toFixed(3)})`);
    last = p;
  }
  ok(modelPct('good', 1, 1, 0) < modelPct('good', 1, 0, 0) * (1 - CONTEST_PCT_BITE) + 1e-9,
    'a full contest takes a real bite (up to CONTEST_PCT_BITE), not a token one');
}

// ── D. fatigue — this phase's new term ───────────────────────────────────────────────────────────────────────
{
  let last = 1;
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const p = modelPct('good', 1, 0, f);
    ok(p <= last + 1e-9, `make chance is non-increasing in fatigue (fatigue ${f} gave ${p.toFixed(3)}, prior ${last.toFixed(3)})`);
    last = p;
  }
  const fresh = modelPct('perfect', 1, 0, 0);
  const gassed = modelPct('perfect', 1, 0, 1);
  ok(gassed < fresh, `a gassed shooter (fatigue 1) scores worse than a fresh one (fatigue 0) on an otherwise identical perfect release (${gassed.toFixed(3)} vs ${fresh.toFixed(3)})`);
  ok(fresh - gassed <= FATIGUE_PCT_BITE * fresh + 1e-9, 'fatigue never costs more than its own bite, independent of (and smaller than) a full contest');
}

// ── E. all five together — the compound case the brief actually describes ──────────────────────────────────────
{
  const close = modelPct('perfect', 1.18 /* layup pctMod */, 0, 0);           // perfect, point-blank, uncontested, fresh
  const far = modelPct('late', 0.95 /* jumper pctMod */, 0.8, 0.9);           // late, deep, heavily contested, gassed
  ok(close > 0.9, `the best-case shot (perfect point-blank layup, fresh) reads a high make chance (got ${close.toFixed(3)})`);
  ok(far < 0.2, `the worst-case shot (late deep jumper, contested, gassed) reads a low make chance (got ${far.toFixed(3)})`);
  ok(close > far, 'the compound best case clearly outscores the compound worst case');
}

// ── F. deterministic under the test seed — same pct, same seed, same verdicts, every run ───────────────────────
{
  const rim = new Vector3(0, 3.05, 0);
  const toShooter = new Vector3(0, 0, 6);
  const pct = modelPct('good', 1, 0.3, 0.4);
  const runOnce = () => {
    const rand = mulberry32(20261003);
    const verdicts: boolean[] = [];
    for (let i = 0; i < 50; i++) verdicts.push(rimDecides(rim, toShooter, pct, 0.6, {}, rand).made);
    return verdicts;
  };
  const a = runOnce();
  const b = runOnce();
  ok(JSON.stringify(a) === JSON.stringify(b), 'the same pct drawn through the same seed produces the identical 50-shot sequence of makes/misses, every time');
  const madeCount = a.filter(Boolean).length;
  ok(madeCount > 0 && madeCount < 50, `the seeded sequence is not degenerate — a mix of makes and misses (got ${madeCount}/50 made)`);
}

// ── G. source check: fatigue is wired into BOTH 1v1 and 3v3's real release paths, not just this test's model ──
{
  const onevone = readFileSync(new URL('../lib/babylon/modes/OneVOneMode.ts', import.meta.url), 'utf8');
  const threevthree = readFileSync(new URL('../lib/babylon/modes/ThreeVThreeMode.ts', import.meta.url), 'utf8');
  ok(/fatiguePct\(contestedPct\(SHOT_QUALITY_PCT\[quality\] \* pctMod \* mbus\.multiplier\(\), shotContest\), meFatigue01\)/.test(onevone),
    "1v1's releaseJumper runs the shot through fatiguePct, not just contestedPct");
  ok(/fatiguePct\(contestedPct\(SHOT_QUALITY_PCT\[quality\] \* pctMod, shotContest\), meFatigue01\)/.test(threevthree),
    "3v3's resolveMyShot runs the shot through fatiguePct, not just contestedPct");
  ok(/const meFatigue01 = Math\.max\(0, 1 - turbo\.t01\)/.test(onevone) && /const meFatigue01 = Math\.max\(0, 1 - turbo\.t01\)/.test(threevthree),
    "fatigue reads the turbo tank run down in both modes — the same 'how gassed' signal the posture layer already uses, not a new stat");
}

// ── report ─────────────────────────────────────────────────────────────────
if (fail.length) {
  console.error(`shot-outcome-model-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`shot-outcome-model-tests: ${checks} checks green`);
