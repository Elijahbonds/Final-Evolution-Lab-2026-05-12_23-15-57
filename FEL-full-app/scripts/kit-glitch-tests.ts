#!/usr/bin/env -S npx tsx
/**
 * scripts/kit-glitch-tests.ts — THE CLOTHES STAY ON, IN EVERY MOVE (KIT-GLITCH, owner 2026-11-12: "the clothes look glitched out
 * sometimes" — skin through cloth, stripes, cloth torn at the joints in moves, pieces floating off the body).
 *
 * Headless (NullEngine, no browser): the SHIPPED kit body and two forge rivals go through the real kit and mask code
 * (applyKit, maskBodyNow), are posed through real authored clips (a stride, a jumper, a lunge, a high kick, the tomahawk) and
 * every shown garment is measured (scripts/probes/kit-glitch/cpu.ts):
 *   · FLOAT — the farthest garment vertex from the skin. A garment vertex that takes an arm's weights follows the arm and
 *     stands off the hip as a spike (measured 0.48 m before the waistband donor rule; 0.06–0.09 m is a loose short's hem).
 *   · TEAR  — garment edges past ×2 of their bind length AND past ×1.5 of the skin under them. KIT-GLITCH could not fix the
 *     shorts (a plain skin transfer made the crotch worse: the leg tubes crossed into each other); KIT-FIT fitted each tube
 *     to its own thigh first (docs/KIT-FIT-PLAN.md). This HOLDS the measured level: a change that tears it further fails here.
 * The on-screen proof (poke-through and flicker in pixels, every tier) is the browser rig, scripts/probes/kit-glitch/rig.mts.
 *
 * Run: npx tsx scripts/kit-glitch-tests.ts
 */
import assert from 'node:assert';
import { measureBodies, type PoseRead } from './probes/kit-glitch/cpu';

/** A garment vertex farther than this from the skin, in any pose, is floating (a spike or a flap). */
const FLOAT_MAX = 0.15;
/** A short's torn edges per pose, held at the measured level, never raised. KIT-GLITCH measured 17 in a stride and 25 in a high
 *  kick on the male kit short, up to 28 on the rivals' baggy short (held at 30). KIT-FIT (lane/kit-fit, the leg tubes fitted to
 *  their own thigh and weighted from it: scripts/avatar/kit-fit/bake.ts) brought them to 4 / 9 / 21 (male / grit / yara, worst
 *  pose each): held at 22. */
const SHORTS_TEAR_HELD = 22;
/** Every other garment: no torn edges beyond a handful in any pose (the tee measured 0–4). */
const OTHER_TEAR_MAX = 8;

const CLIPS: [string, number][] = [['idle_stand', 0.3], ['run', 0.25], ['jumpshot', 0.5], ['bball_def_lunge_left', 0.5], ['high_kick', 0.5], ['dunk_finish_tomahawk', 0.35]];

async function main(): Promise<void> {
  const quiet = console.log, warn = console.warn, info = console.info;
  console.log = (...a: unknown[]) => { if (!/^(BJS|\[FEL-)/.test(String(a[0]))) quiet(...a); };
  console.warn = () => undefined; console.info = () => undefined;
  let reads: PoseRead[];
  try { reads = await measureBodies(['male', 'rival:grit', 'rival:yara'], { clips: CLIPS }); }
  finally { console.log = quiet; console.warn = warn; console.info = info; }
  let pass = 0;
  const ok = (n: string, fn: () => void) => { fn(); pass++; quiet(`  ✓ ${n}`); };

  ok('every body was posed through every clip, with garments shown', () => {
    assert.equal(reads.length, 3 * CLIPS.length, `poses measured: ${reads.length}`);
    for (const r of reads) assert.ok(r.garments.some((g) => /^Kit_tops_/.test(g.mesh)) && r.garments.some((g) => /^Kit_shorts_/.test(g.mesh)), `${r.body} ${r.clip}: a top and a short show`);
  });
  ok(`no garment vertex stands more than ${FLOAT_MAX} m off the skin, in any pose (no spike, no floating piece)`, () => {
    for (const r of reads) for (const g of r.garments) assert.ok(g.float < FLOAT_MAX, `${r.body} ${r.clip} ${g.mesh}: ${g.float} m off the skin`);
  });
  ok(`the court short tears no more than measured at the fix (≤ ${SHORTS_TEAR_HELD} edges a pose); the rest ≤ ${OTHER_TEAR_MAX}`, () => {
    for (const r of reads) for (const g of r.garments) {
      const cap = /^Kit_shorts_/.test(g.mesh) ? SHORTS_TEAR_HELD : OTHER_TEAR_MAX;
      assert.ok(g.tear <= cap, `${r.body} ${r.clip} ${g.mesh}: ${g.tear} torn edges ${JSON.stringify(g.tearBones)}`);
    }
  });
  for (const r of reads) quiet(`    ${r.body} ${r.clip}: ${r.garments.map((g) => `${g.mesh.replace(/^Kit_/, '')} tear ${g.tear} float ${g.float}`).join(' · ')}`);
  quiet(`kit-glitch-tests: ${pass} passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
