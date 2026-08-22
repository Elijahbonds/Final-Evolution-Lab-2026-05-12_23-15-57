// node --experimental-strip-types --import ./tools/ts_resolve.mjs \
//   --import ./tools/fel_batch_alias.mjs tests/canvas_fit_test.ts
//
// The measured case first. Everything else in this file exists so the policy
// cannot quietly stop applying to it.

import {
  fitCanvas, savedFraction, applyCanvasFit,
  MAX_DEVICE_PIXEL_RATIO, MAX_BACKING_PIXELS,
} from '../lib/babylon/core/canvasFit';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n} ${x}`)); };
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;

// ══ THE MEASURED CASE ════════════════════════════════════════════════════
{
  // Exactly what the deployed build does on an iPhone 13 today, before the
  // CSS fix: a 372×232 box at devicePixelRatio 3.
  const before = fitCanvas({ cssWidth: 372, cssHeight: 232, dpr: 3 });
  ok('MEASURED: the 9x buffer becomes 4x', near(before.effectiveDpr, 2));
  ok('and the scaling level is what Babylon wants', near(before.hardwareScalingLevel, 0.5));
  ok('and it names the cap that bound', before.limitedBy === 'dpr');
  ok('MORE THAN HALF THE FILL RATE IS SAVED — the reason to do this at all',
    savedFraction({ cssWidth: 372, cssHeight: 232, dpr: 3 }) > 0.5);

  // And after the CSS fix, when the canvas is four times bigger. The cap has
  // to still hold there or the two fixes cancel: a full-bleed canvas at DPR 3
  // is 1.86M backing pixels, which is most of the budget on its own.
  const after = fitCanvas({ cssWidth: 372, cssHeight: 556, dpr: 3 });
  ok('AND IT STILL HOLDS ONCE THE CANVAS IS FULL-BLEED', near(after.effectiveDpr, 2));
  ok('full-bleed at the cap stays inside the pixel budget',
    after.backingWidth * after.backingHeight < MAX_BACKING_PIXELS,
    `${after.backingWidth * after.backingHeight}`);
}

// ══ THE BUDGET HAS TO BIND ON A REAL DEVICE ══════════════════════════════
{
  // A budget that only binds in theory is a budget that does nothing. This is
  // an iPad Pro 12.9" at DPR 2, full-bleed — a device in this audience.
  const tablet = fitCanvas({ cssWidth: 1024, cssHeight: 1300, dpr: 2 });
  ok('THE BUDGET BINDS ON AN IPAD, not only in theory', tablet.limitedBy === 'pixel-budget');
  ok('and it is the budget, not the DPR cap, that bound', tablet.effectiveDpr < MAX_DEVICE_PIXEL_RATIO);
  ok('the result respects the budget', tablet.backingWidth * tablet.backingHeight <= MAX_BACKING_PIXELS + 4000);
  ok('and it is still at least 1:1 — a blurry game is worse than a slow one',
    tablet.effectiveDpr >= 1);

  // A desktop at 1x is already inside everything and must not be touched.
  const desk = fitCanvas({ cssWidth: 1166, cssHeight: 728, dpr: 1 });
  ok('a 1x desktop is left alone', desk.limitedBy === null && near(desk.effectiveDpr, 1));
  ok('and saves nothing, because there was nothing to save',
    savedFraction({ cssWidth: 1166, cssHeight: 728, dpr: 1 }) === 0);
}

// ══ NEVER BELOW 1:1 ══════════════════════════════════════════════════════
{
  // A 4K canvas blows the budget outright. The floor must hold, because
  // scaling below 1:1 is how you ship a game that looks broken rather than
  // slow — and the correct response at that point is M92's AdaptiveQuality,
  // shedding effects, not resolution.
  const huge = fitCanvas({ cssWidth: 3840, cssHeight: 2160, dpr: 2 });
  ok('a 4K surface never renders below 1:1', huge.effectiveDpr === 1);
  ok('even though that exceeds the budget — the floor wins deliberately',
    huge.backingWidth * huge.backingHeight > MAX_BACKING_PIXELS);
  ok('and the scaling level stays valid for Babylon', huge.hardwareScalingLevel === 1);
}

// ══ THE BROWSER LYING ════════════════════════════════════════════════════
{
  // Scaling by NaN blanks the canvas, and a blank canvas is indistinguishable
  // from "the game failed to load" — the exact bug report this project has
  // been chasing for months. So every bad reading resolves to 1.
  for (const bad of [0, -1, NaN, Infinity]) {
    const r = fitCanvas({ cssWidth: 372, cssHeight: 232, dpr: bad as number });
    ok(`dpr ${String(bad)} falls back to 1:1 rather than blanking the canvas`,
      Number.isFinite(r.hardwareScalingLevel) && r.hardwareScalingLevel > 0 && near(r.effectiveDpr, 1));
  }
  const zero = fitCanvas({ cssWidth: 0, cssHeight: 0, dpr: 2 });
  ok('a zero-sized canvas does not divide by zero',
    Number.isFinite(zero.hardwareScalingLevel) && zero.backingWidth >= 1);
}

// ══ IT ACTUALLY DRIVES AN ENGINE ═════════════════════════════════════════
{
  const calls: number[] = [];
  let resized = 0;
  const engine = { setHardwareScalingLevel: (l: number) => calls.push(l), resize: () => { resized++; } };
  const r = applyCanvasFit(engine, { clientWidth: 372, clientHeight: 556 }, 3);
  ok('applyCanvasFit sets the level on the engine', calls.length === 1 && near(calls[0], 0.5));
  ok('and resizes, because the level does not take effect until it does', resized === 1);
  ok('and returns the fit it applied', near(r.effectiveDpr, 2));

  // An engine without resize() must not throw — Babylon's NullEngine has none.
  const bare = { setHardwareScalingLevel: () => {} };
  let threw = false;
  try { applyCanvasFit(bare, { clientWidth: 100, clientHeight: 100 }, 2); } catch { threw = true; }
  ok('an engine with no resize() does not throw', !threw);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
