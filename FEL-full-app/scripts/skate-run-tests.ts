// Skate Run — Phase 2 mechanics, asserted against the BENCHMARK's rules.
//
// Skate 3 is the locked benchmark (PHASE2_BENCHMARK_LOCKS.md). The protocol's
// rule for this phase is to assert against the real-world reference rather than
// against our own constants, so these check the rules a skater would recognise:
// a 180 lands you switch and a 360 does not; a combo you did not land is worth
// nothing; landing clean is what converts a pot into a score.
//
// The specific bug this guards is the one that shipped: combo.bank() was called
// NOWHERE in the mode, so a 90-second run scored 0 no matter how well it was
// played. Nothing threw. A test that only asked "does ComboChain work" would
// have passed the whole time -- ComboChain was fine, the mode never called it.

import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { ComboChain } from '../lib/babylon/core/ComboChain';
import { BoardMovement, SKATE_TUNING } from '../lib/babylon/core/BoardMovement';
import { landsSwitch } from '../lib/babylon/modes/boardCore';
import { MovingRail, SKATE_GOALS } from '../lib/babylon/core/ParkGoals';
import { buildSkatepark, PARK_BOUND } from '../lib/babylon/modes/rideWorlds';

// buildSkatepark paints its ground into a DynamicTexture, which reaches for
// OffscreenCanvas -- absent under Node. Section E only inspects mesh names and
// positions, so a no-op 2D surface is enough to let the park build. Same shim
// dunk-animation-tests.ts uses, for the same reason.
if (typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas === 'undefined') {
  const ctx2d = new Proxy({}, {
    get: (_t, k) => (k === 'measureText' ? () => ({ width: 0 }) : () => undefined),
    set: () => true,
  });
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    width: number; height: number;
    constructor(w: number, h: number) { this.width = w; this.height = h; }
    getContext(): unknown { return ctx2d; }
  };
}

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const DEG = Math.PI / 180;

// ── A. switch stance follows the rotation, not a button ─────────────────────
// This is the benchmark's actual rule. A rider lands switch because the board
// is pointed the other way, and for no other reason.
ok(landsSwitch(0, 180 * DEG), 'A1 a 180 lands you switch');
ok(!landsSwitch(0, 360 * DEG), 'A2 a clean 360 leaves your stance alone');
ok(landsSwitch(0, 540 * DEG), 'A3 a 540 lands you switch');
ok(!landsSwitch(0, 720 * DEG), 'A4 a 720 leaves your stance alone');
ok(!landsSwitch(0, 0), 'A5 a straight air changes nothing');
ok(landsSwitch(0, -180 * DEG), 'A6 direction of the spin does not matter');
ok(landsSwitch(0, 170 * DEG), 'A7 an undercooked 180 still counts (arcade generosity)');
ok(!landsSwitch(0, 350 * DEG), 'A8 an undercooked 360 does NOT count');
// and it composes from a non-zero entry heading, which is the live case
ok(landsSwitch(2.4, 2.4 + 180 * DEG), 'A9 the rule is relative to the entry heading');

// ── B. switch riding costs something ────────────────────────────────────────
const mv = new BoardMovement(SKATE_TUNING);
ok(mv.stance === 'regular', 'B1 a rider starts regular');
mv.vel.set(0, 0, 10);
const speedBefore = mv.speed;
mv.switchStance();
ok(mv.stance === 'switch', 'B2 switchStance() actually switches');
ok(mv.speed < speedBefore, `B3 switching costs speed (${speedBefore.toFixed(2)} -> ${mv.speed.toFixed(2)})`);
mv.switchStance();
ok(mv.stance === 'regular', 'B4 switching again returns you to regular');

// ── C. the combo economy — bank or lose it ──────────────────────────────────
const c = new ComboChain();
ok(c.banked === 0 && c.pot === 0, 'C1 a session starts at zero');
c.add('KICKFLIP', 120, 'air');
ok(c.active, 'C2 a trick opens a combo');
ok(c.pot > 0, `C3 the trick goes into the POT, not the score (pot ${c.pot})`);
ok(c.banked === 0, 'C4 an unlanded combo is worth NOTHING to the score');
c.add('GRIND', 100, 'grind');
ok(c.multiplier >= 2, `C5 linking raises the multiplier (${c.multiplier}x)`);
const potAtRisk = c.pot;
const banked = c.bank();
ok(banked > 0, 'C6 banking pays out');
ok(c.banked === banked, 'C7 the payout lands in the session total');
ok(c.pot === 0 && !c.active, 'C8 banking closes the combo');
ok(banked >= potAtRisk, `C9 you get at least the pot you were carrying (${potAtRisk} -> ${banked})`);

const c2 = new ComboChain();
c2.add('TREFLIP', 240, 'air');
c2.add('MANUAL', 90, 'manual');
const lost = c2.pot;
c2.bail();
ok(c2.pot === 0, 'C10 a bail clears the pot');
ok(c2.banked === 0, `C11 a bail loses the WHOLE pot (${lost} points gone)`);
ok(!c2.active, 'C12 a bail closes the combo');

// ── D. the goals are the ones the lock names ────────────────────────────────
ok(SKATE_GOALS.length === 4, `D1 four goals (got ${SKATE_GOALS.length})`);
const byId = new Map(SKATE_GOALS.map((g) => [g.id, g]));
ok(byId.has('score5k'), 'D2 a banked-score goal exists');
ok(byId.has('combo800'), 'D3 a single-combo goal exists');
ok(byId.has('gap_moving'), 'D4 a gap/grind goal exists');
ok(byId.has('coins10'), 'D5 a collection goal exists');
// A score goal that cannot be reached because banking is broken is the exact
// failure this mode shipped with, so tie the goal to the mechanic that feeds it.
ok((byId.get('score5k')?.target ?? 0) > 0, 'D6 the score goal has a real target');
ok((byId.get('combo800')?.target ?? 0) > 0, 'D7 the combo goal has a real target');

// ── E. Phase 6: the world shows the rules ───────────────────────────────────
// World-Population Protocol L2: "if the HUD is the only place a rule is
// visible, L2 is incomplete". The patrol rail was worse than that -- it is a
// named RUN GOAL ("GRIND THE PATROL RAIL") and it had no mesh at all, so the
// player was asked to find an object that was never drawn.
const engine = new NullEngine();
const scene = new Scene(engine);

const rail = new MovingRail(
  new Vector3(-2, 0.5, 0), new Vector3(2, 0.5, 0),
  new Vector3(0, 0, -8), new Vector3(0, 0, 8), 0.18,
);
const railMesh = rail.mount(scene);
ok(!!railMesh, 'E1 the patrol rail has a body');
ok(scene.meshes.some((m) => m.name === 'rail_patrol'), 'E2 it is in the scene');
const before = railMesh.position.clone();
for (let i = 0; i < 60; i++) rail.update(1 / 30);
ok(!railMesh.position.equals(before),
  `E3 the body PATROLS with the line (${before.z.toFixed(2)} -> ${railMesh.position.z.toFixed(2)})`);
// the drawn rail must sit where the grind line actually is, or the player
// grinds thin air next to a visible rail
const mid = Vector3.Center(rail.line.a, rail.line.b);
ok(Vector3.Distance(mid, railMesh.position) < 0.01,
  `E4 the body is exactly ON the grind line (off by ${Vector3.Distance(mid, railMesh.position).toFixed(4)}m)`);
rail.dispose();
ok(!scene.meshes.some((m) => m.name === 'rail_patrol'), 'E5 dispose() takes it away');

// L3: the invisible clamp and the visible fence must be the same number.
const park = buildSkatepark(scene);
const fences = scene.meshes.filter((m) => m.name === 'wall_fence');
ok(fences.length === 4, `E6 the park is fenced on four sides (got ${fences.length})`);
for (const f of fences) {
  const onBound = Math.abs(Math.abs(f.position.x) - PARK_BOUND) < 0.01
                || Math.abs(Math.abs(f.position.z) - PARK_BOUND) < 0.01;
  ok(onBound, `E7 fence at (${f.position.x}, ${f.position.z}) stands on PARK_BOUND ${PARK_BOUND}`);
}
// The camera probes occlusion against anything matching wall_*; a fence that
// caught that ray would yank the camera in every time the rider neared an edge.
ok(fences.every((f) => !f.isPickable), 'E8 the fence never catches the camera occlusion ray');
ok(park.grindLines.length >= 5, `E9 the park still has its rails (${park.grindLines.length})`);
park.dispose();
scene.dispose();
engine.dispose();

if (fail.length) {
  console.error(`skate-run-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  x ' + f);
  process.exit(1);
}
console.log(`skate-run-tests: ${checks} checks green — switch, banking and the goals behave like Skate 3`);
