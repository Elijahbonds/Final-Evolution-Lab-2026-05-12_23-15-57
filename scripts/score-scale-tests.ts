// node --experimental-strip-types --import ./tools/ts_resolve.mjs \
//   --import ./tools/fel_batch_alias.mjs tests/score_scale_test.ts
//
// The first block reproduces the measured disparity and asserts normalisation
// removes it. The last block checks the caption surface against its own source,
// the way M94 checks a render half that cannot be executed here.

import {
  normalise, isScaled, unscaled, scaleDisparity, sessionValue,
  SCALES, UnscaledModeError,
} from '../lib/babylon/core/scoreScale';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n} ${x}`)); };

// ══ THE MEASURED DISPARITY ═══════════════════════════════════════════════
{
  // Both sessions were mediocre runs on the deployed build.
  const DUNK_RAW = 25;      // paid 48 XP, 1 shard, 0.0 PRQ
  const KARATE_RAW = 1250;  // paid 1885 XP, 62 shards, +0.5 PRQ

  ok('MEASURED: karate submitted 50x the raw score of dunk for a comparable run',
    KARATE_RAW / DUNK_RAW === 50);

  const d = normalise('dunkContest', DUNK_RAW);
  const k = normalise('karateEndless', KARATE_RAW);
  ok('normalised, dunk was a weak run', d > 0.15 && d < 0.3, `${d.toFixed(3)}`);
  ok('normalised, karate was also a weak run', k > 0.2 && k < 0.4, `${k.toFixed(3)}`);
  ok('AND THE TWO ARE NOW WITHIN A FACTOR OF TWO OF EACH OTHER',
    Math.max(d, k) / Math.min(d, k) < 2, `${(Math.max(d, k) / Math.min(d, k)).toFixed(2)}x`);
  ok('where the raw scores were 50x apart — that gap is the whole defect',
    (KARATE_RAW / DUNK_RAW) / (Math.max(d, k) / Math.min(d, k)) > 20);

  ok('scaleDisparity names the multiple a raw comparison overstates by',
    scaleDisparity({ mode: 'dunkContest', raw: DUNK_RAW }, { mode: 'karateEndless', raw: KARATE_RAW }) > 20);
}

// ══ IT REFUSES TO GUESS ══════════════════════════════════════════════════
{
  // The measured payloads carried these mode ids. Only two have a scale, and
  // the module must say so rather than invent one — inventing is how a number
  // that looks authoritative and means nothing gets shipped.
  const OBSERVED = ['dunkContest', 'karateEndless', 'oneVOne', 'tennisMatch', 'skateRun', 'marketBrowse'];
  ok('four of six observed modes have NO scale', unscaled(OBSERVED).length === 4,
    unscaled(OBSERVED).join(','));

  let threw = false;
  try { normalise('oneVOne', 500); } catch (e) { threw = e instanceof UnscaledModeError; }
  ok('AN UNSCALED MODE THROWS RATHER THAN RETURNING A PLAUSIBLE NUMBER', threw);

  try { normalise('oneVOne', 500); } catch (e) {
    const m = (e as Error).message;
    ok('and the error explains the 39x payout, so nobody silences it with a default',
      /39x/.test(m) && /must not be computed from a raw/.test(m));
  }
  ok('isScaled lets a caller degrade instead of crashing mid-session',
    isScaled('dunkContest') && !isScaled('oneVOne'));

  ok('every shipped scale cites where it came from',
    Object.values(SCALES).every((s) => s.basis.length > 25));
  ok('and the placeholder says it is a placeholder',
    /placeholder/i.test(SCALES.karateEndless.basis));
}

// ══ THE CEILING ══════════════════════════════════════════════════════════
{
  ok('a perfect dunk contest normalises to exactly 1', normalise('dunkContest', 120) === 1);
  ok('AND AN IMPOSSIBLE SCORE IS CLAMPED, NOT PAID PROPORTIONALLY',
    normalise('dunkContest', 999999) === 1);
  ok('which matters because the score is client-supplied — POST {"score":999999}',
    normalise('dunkContest', 999999) === normalise('dunkContest', 120));
  ok('a negative score pays nothing', normalise('dunkContest', -50) === 0);
  ok('and so does a non-finite one', normalise('dunkContest', NaN) === 0);
}

// ══ THE PRQ WEIGHT STILL APPLIES ═════════════════════════════════════════
{
  // M82's whole point: a shop must mint nothing however long you browse.
  ok('a zero-weight mode is worth zero however well you score',
    sessionValue('dunkContest', 120, 0) === 0);
  ok('and a full-weight perfect run is worth the full weight',
    sessionValue('dunkContest', 120, 1) === 1);
  ok('normalisation and weighting compose in the right order',
    Math.abs(sessionValue('dunkContest', 60, 0.5) - 0.25) < 1e-9);
}

// ══ THE CAPTION SURFACE ══════════════════════════════════════════════════
//
// Measured: zero aria-live regions, zero role="status", zero .sr-only, in
// dunk, karate, onevone and tennis. The bus M82 built writes into nowhere.
{
  const src = readFileSync(join(new URL('.', import.meta.url).pathname,
    '../lib/babylon/ui/CaptionRegion.tsx'), 'utf8');
  const code = src.split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/**'))
    .join('\n');

  ok('THE MISSING SURFACE EXISTS: a polite live region', /aria-live="polite"/.test(code));
  ok('and an assertive one for cues the player must act on', /aria-live="assertive"/.test(code));
  ok('and it subscribes to M82\'s bus rather than inventing a second one',
    /captions\.subscribe/.test(code));

  // The two mistakes that make a live region silently useless.
  ok('ONLY critical cues are assertive — assertive feedback cuts off the reader mid-sentence',
    /ASSERTIVE[\s\S]{0,80}'critical'/.test(code) && !/'feedback'[^)]*assertive/i.test(code));
  ok('and the regions are ALWAYS mounted — one created with its text is never announced',
    !/\{\s*routine\.length\s*>\s*0\s*&&[\s\S]{0,40}aria-live/.test(code));

  ok('critical cues are kept, not dropped — visible() sorts them FIRST',
    /slice\(0, maxLines\)/.test(code) && !/slice\(-maxLines\)/.test(code));
  ok('the visible captions are aria-hidden so nothing is announced twice',
    /aria-hidden="true"/.test(code));
  // Against `code`, not `src`: the file's own comment explains that
  // display:none removes the node, and the first run of this check matched
  // that comment and failed the file for describing the mistake it avoids.
  ok('and sr-only keeps the node in the accessibility tree',
    /clip: rect\(0, 0, 0, 0\)/.test(code) && !/display:\s*none/.test(code));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
