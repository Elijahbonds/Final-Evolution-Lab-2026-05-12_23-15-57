/**
 * board-ssx-tests.ts — headless invariants for the SSX3 snowboard rebuild pass:
 *   • directional Uber (signature) trick set in lib/board/trick-table.ts
 *   • rhythm-boost meter in lib/board/boost-meter.ts
 *   • THPS combo chain in lib/board/combo-engine.ts
 * All pure — no window/document, no server-only imports. Registered in
 * scripts/standing-suite.ts.
 */
import {
  UBER_TRICKS,
  SPECIAL_TRICK,
  lookupTrick,
  type TrickDir,
} from '../lib/board/trick-table';
import { BoostMeter } from '../lib/board/boost-meter';
import { ComboEngine } from '../lib/board/combo-engine';

type Case = { name: string; pass: boolean; detail?: string };
const cases: Case[] = [];
const check = (name: string, pass: boolean, detail?: string) =>
  cases.push({ name, pass, detail });

// ---- Uber (signature) directional trick set -------------------------------
const DIRS: TrickDir[] = ['neutral', 'up', 'down', 'left', 'right'];
{
  // every direction resolves to its own special trick
  for (const d of DIRS) {
    const t = lookupTrick('special', d);
    check(`uber[${d}] is special`, t.special === true, JSON.stringify(t.id));
    check(`uber[${d}] matches table`, t.id === UBER_TRICKS[d].id, `${t.id} vs ${UBER_TRICKS[d].id}`);
    check(`uber[${d}] has snow name`, !!t.names.snow && t.names.snow.length > 0, t.names.snow);
    check(`uber[${d}] base is big-air worthy`, t.base >= 2000, `base=${t.base}`);
  }
  // directional selection actually differs (not all collapsing to neutral)
  const ids = new Set(DIRS.map((d) => lookupTrick('special', d).id));
  check('uber dirs are distinct', ids.size === DIRS.length, `distinct=${ids.size}`);
  // signature snow branding sanity — the down uber is the marquee 1080
  check('uber down snow name', lookupTrick('special', 'down').names.snow === 'Double Cork 1080',
    lookupTrick('special', 'down').names.snow);
  // back-compat alias still points at neutral
  check('SPECIAL_TRICK aliases neutral uber', SPECIAL_TRICK.id === UBER_TRICKS.neutral.id, SPECIAL_TRICK.id);
}

// ---- Rhythm boost ----------------------------------------------------------
{
  // baseline: no time supplied -> multiplier stays 1x (backward compatible)
  const b = new BoostMeter();
  b.addFromPoints(2600); // one full bar's worth of points, no rhythm
  check('no-time bank keeps rhythm at 0', b.rhythm === 0, `rhythm=${b.rhythm}`);
  check('no-time bank keeps mult 1x', Math.abs(b.rhythmMult() - 1) < 1e-9, `mult=${b.rhythmMult()}`);
}
{
  // chained banks within the window grow the rhythm chain and its multiplier
  const b = new BoostMeter();
  b.addFromPoints(100, 0, 0.0);   // first bank starts the chain (rhythm 0)
  const m0 = b.rhythmMult();
  b.addFromPoints(100, 0, 1.0);   // within 3s window -> rhythm 1
  b.addFromPoints(100, 0, 2.0);   // within window -> rhythm 2
  check('rhythm grows on chained banks', b.rhythm === 2, `rhythm=${b.rhythm}`);
  check('rhythmMult grows past 1x', b.rhythmMult() > m0, `mult=${b.rhythmMult()}`);
}
{
  // a gap longer than the window resets the chain
  const b = new BoostMeter();
  b.addFromPoints(100, 0, 0.0);
  b.addFromPoints(100, 0, 1.0);   // rhythm 1
  b.addFromPoints(100, 0, 10.0);  // gap > 3s -> reset to 0
  check('rhythm resets after a gap', b.rhythm === 0, `rhythm=${b.rhythm}`);
}
{
  // the rhythm chain is capped (RHYTHM_MAX = 4)
  const b = new BoostMeter();
  for (let i = 0; i < 12; i++) b.addFromPoints(50, 0, i * 0.5); // steady flow
  check('rhythm chain is capped', b.rhythm <= 4, `rhythm=${b.rhythm}`);
  check('rhythmMult caps at 1.8x', Math.abs(b.rhythmMult() - 1.8) < 1e-9, `mult=${b.rhythmMult()}`);
}

// ---- Tricky / signature spend gate ----------------------------------------
{
  const b = new BoostMeter();
  check('spendSpecial blocked when not tricky', b.spendSpecial() === false, 'blocked');
  // fill the meter to enter tricky
  b.addFromPoints(3000); // > full bar
  check('meter enters tricky when full', b.tricky === true, `tricky=${b.tricky}`);
  check('spendSpecial allowed when tricky', b.spendSpecial() === true, 'spent');
  check('spendSpecial burns the meter', b.value < 1, `value=${b.value}`);
}

// ---- THPS combo chain ------------------------------------------------------
{
  const c = new ComboEngine();
  c.addTrick(100);
  c.addTrick(100);
  c.addTrick(100);
  const snap = c.snapshot();
  check('combo sums bases', snap.baseSum === 300, `baseSum=${snap.baseSum}`);
  check('combo multiplies per trick', snap.multiplier === 3, `mult=${snap.multiplier}`);
  check('combo pending = base*mult', snap.pending === 900, `pending=${snap.pending}`);
  const banked = c.bank();
  check('combo banks base*mult', banked === 900, `banked=${banked}`);
  const after = c.snapshot();
  check('combo closes after bank', after.open === false, `open=${after.open}`);
}

// ---- report ----------------------------------------------------------------
const failed = cases.filter((c) => !c.pass);
for (const c of cases) {
  // eslint-disable-next-line no-console
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail && !c.pass ? '  — ' + c.detail : ''}`);
}
if (failed.length) {
  // eslint-disable-next-line no-console
  console.error(`\nboard-ssx: ${failed.length}/${cases.length} FAILED`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log(`\nboard-ssx: all ${cases.length} invariants passed`);

export {};
