#!/usr/bin/env -S npx tsx
// ONEVONE-DEFENSE-LOGIC (2026-09-07) — the rival's possession is a drive you can GUARD, checked headless.
//
//   STAY IN FRONT — a defender in the lane contains the drive: the rival sidesteps instead of running through, and
//     held in front it pulls up from range. An open lane is a layup.
//   THE STEAL IS A READ — the ball is exposed while it crosses over (the sidestep), protected in the gather.
//   THE BLOCK HAS A CUE — every release is preceded by GATHER_SEC of gather; a jump at nothing is a blow-by.
//   THE CONTEST GRADES THEM — a contested pull-up makes far less than an open layup; a hand up counts.
//   ONE OWNER — the anim tree's one-shots settle into the loop the input asks for, a cut beat's callback is ignored,
//     a hold is never interrupted; the mode never calls animator.play.
//   THE LOOP CLOSES — make-it-take-it both ways, the board is a race on both ends, the hand-off switches both carries
//     off first, every possession timer is token-guarded (source level, like basketball-rules-tests).
//
// Run: npx tsx scripts/onevone-defense-tests.ts

import { readFileSync } from 'node:fs';
import { Vector3 } from '@babylonjs/core';
import {
  AttackerBrain, STEAL_EXPOSURE_MIN, LAYUP_RANGE, GATHER_SEC, CONTAIN_PULLUP_SEC, SHOT_CLOCK_SEC, CHECK_HOLD_SEC, CROSSOVER_EXPOSED_FROM, CROSSOVER_EXPOSED_TO, STEPBACK_SEC, CROSSOVER_CHANCE,
  RIVAL_DRIVE_SPEED, rivalShotPct, handUpContest, HAND_UP_SEC,
} from '../lib/babylon/core/BasketballCore';
import { BasketballAnimTree, chooseBasketballClip, type AnimTreeInput } from '../lib/babylon/anim/basketballTree';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };
const DT = 1 / 60;
const RIM = new Vector3(0, 0, -0.6);
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

/** Run a possession: the rival starts at `self`; `defender(t, rival)` places the defender each frame. */
function possession(defender: (t: number, rival: Vector3) => Vector3, opts: { seed?: number; airborne?: (t: number) => boolean; maxSec?: number } = {}) {
  const brain = new AttackerBrain(seeded(opts.seed ?? 7));
  const self = new Vector3(0, 0, 9.2);
  const log: { t: number; phase: string; dist: number; exposure: number; contained: boolean; step: boolean; crossover: string | null }[] = [];
  let shot: { style: 'layup' | 'jumper' | 'dunk'; t: number; dist: number } | null = null;
  let gatherSec = 0;
  for (let t = 0; t < (opts.maxSec ?? 10) && !shot; t += DT) {
    const dec = brain.decide(DT, self, defender(t, self), RIM, { defenderAirborne: opts.airborne?.(t) ?? false });
    self.addInPlace(dec.wish.scale(DT));
    const dist = Math.hypot(self.x - RIM.x, self.z - RIM.z);
    if (dec.phase === 'gather') gatherSec += DT;
    log.push({ t, phase: dec.phase, dist, exposure: dec.exposure, contained: dec.contained, step: dec.step, crossover: dec.crossover });
    if (dec.shot) shot = { style: dec.shot, t, dist };
  }
  return { brain, log, shot, gatherSec, self };
}

// ── A. an open lane is a drive to the rim and a layup ──────────────────────
{
  const far = () => new Vector3(6, 0, 14);   // the defender never shows up
  const r = possession(far);
  ok(r.shot !== null, 'an open drive releases');
  ok(r.shot?.style === 'layup', `an open drive is a LAYUP (got ${r.shot?.style})`);
  ok((r.shot?.dist ?? 9) < LAYUP_RANGE + 0.05, `released at the rim (${r.shot?.dist.toFixed(2)} m)`);
  ok((r.shot?.t ?? 9) < 3.6, `the drive from the check gets there in under 3.6 s (${r.shot?.t.toFixed(2)} s)`);
  ok(r.log.slice(0, 5).every((l) => l.phase === 'check'), 'the possession opens with the CHECK');
  ok(r.log.find((l) => l.phase !== 'check')!.t >= CHECK_HOLD_SEC - DT, 'the check holds for CHECK_HOLD_SEC — no instant re-steal');
  ok(Math.abs(r.gatherSec - GATHER_SEC) < DT * 1.5, `every release is preceded by the gather telegraph (${r.gatherSec.toFixed(2)} s ≈ ${GATHER_SEC})`);
  const peak = Math.max(...r.log.map((l) => l.exposure));
  ok(peak >= STEAL_EXPOSURE_MIN, `the weave exposes the ball on the drive (peak ${peak.toFixed(2)})`);
  const gatherRows = r.log.filter((l) => l.phase === 'gather');
  ok(gatherRows.every((l) => l.exposure === 0), 'the gather is protected — no free late steals');
}

// ── B. a defender who stays in front CONTAINS the drive ────────────────────
{
  // the mirror: always 1.1 m in front of the rival on the rival→rim line
  const mirror = (_t: number, rival: Vector3) => { const d = RIM.subtract(rival); d.y = 0; d.normalize(); return rival.add(d.scale(1.1)); };
  const r = possession(mirror);
  ok(r.shot !== null, 'a contained possession still ends in a shot (no hang)');
  ok(r.shot?.style === 'jumper', `held in front, the rival PULLS UP (got ${r.shot?.style})`);
  ok((r.shot?.dist ?? 0) > 3.0, `the pull-up comes from range, not the rim (${r.shot?.dist.toFixed(2)} m)`);
  const contained = r.log.filter((l) => l.contained).length * DT;
  ok(contained >= CONTAIN_PULLUP_SEC - 0.05, `the rival was contained for the pull-up window (${contained.toFixed(2)} s)`);
  ok(r.log.some((l) => l.phase === 'sidestep'), 'a contained rival SIDESTEPS instead of running through the body');
  const sb = r.log.filter((l) => l.phase === 'stepback');
  ok(sb.length * DT >= STEPBACK_SEC - DT * 1.5, `the contained pull-up STEPS BACK first (${(sb.length * DT).toFixed(2)} s) — space for the shot, a step-in for the block`);
  ok(sb.every((l) => l.exposure < STEAL_EXPOSURE_MIN), 'the step-back protects the ball');
  ok(r.log.findIndex((l) => l.phase === 'stepback') < r.log.findIndex((l) => l.phase === 'gather'), 'step-back, then gather, then the release');
  ok(CROSSOVER_EXPOSED_FROM >= 0.05 && CROSSOVER_EXPOSED_TO - CROSSOVER_EXPOSED_FROM >= 0.25 && CROSSOVER_EXPOSED_TO <= 0.45, 'the exposed window opens after the first frames and is a human-scale read (≥ 0.25 s)');
  ok(r.log.some((l) => l.crossover !== null), 'the sidestep is a crossover event (the clip + the hand switch)');
  const sidestepRows = r.log.filter((l) => l.phase === 'sidestep');
  const exposed = sidestepRows.filter((l) => l.exposure >= STEAL_EXPOSURE_MIN).length * DT;
  ok(exposed > 0, 'the crossover EXPOSES the ball — the steal read');
  ok(exposed < sidestepRows.length * DT * 0.6, `… but only while it crosses the body (${exposed.toFixed(2)} s exposed of ${(sidestepRows.length * DT).toFixed(2)} s of sidestep) — a read, not a mash`);
  // the cue (the crossover event) precedes the window: a poke on the event's own frame hits the hand, a poke ~0.2 s later
  // lands — checked on every crossover that has a full step after it (one cut by the step-back has no window to read),
  // across three seeds so the shuffle draw cannot leave the check empty
  let early = 0, human = 0, n = 0;
  for (const seed of [7, 11, 23]) {
    const rr = possession(mirror, { seed });
    rr.log.forEach((l, i) => {
      if (!l.crossover) return;
      const tail = rr.log.slice(i, i + Math.round(0.45 / DT));
      if (tail.length < Math.round(0.45 / DT) || !tail.every((q) => q.phase === 'sidestep')) return;
      n++; if (l.exposure < STEAL_EXPOSURE_MIN) early++; if (rr.log[i + Math.round(0.22 / DT)].exposure >= STEAL_EXPOSURE_MIN) human++;
    });
  }
  ok(n >= 2, `enough full crossovers to judge the window (${n})`);
  ok(early === n, `a poke on the crossover's first frame is too early — hits the hand (${early} of ${n})`);
  ok(human === n, `a poke 220 ms after the cue (a human read) lands in the window (${human} of ${n})`);
  // shuffles: some contained steps never switch hands — nothing to poke, and no crossover clip to read
  let steps = 0, crosses = 0; for (const l of r.log) { if (l.step) steps++; if (l.crossover) crosses++; }
  ok(steps > crosses && crosses >= 1, `contained steps mix crossovers with same-hand shuffles (${crosses} of ${steps} switch hands)`);
  const shuffleExposed = r.log.some((l) => l.phase === 'sidestep' && l.exposure >= STEAL_EXPOSURE_MIN && !r.log.slice(Math.max(0, r.log.indexOf(l) - 30), r.log.indexOf(l) + 1).some((q) => q.crossover));
  ok(!shuffleExposed, 'a shuffle never exposes the ball — the read is "did the ball switch hands"');
  // a mirrored rival never reaches the rim
  ok(Math.min(...r.log.map((l) => l.dist)) > LAYUP_RANGE, `mirrored, the rival never gets to layup range (closest ${Math.min(...r.log.map((l) => l.dist)).toFixed(2)} m)`);
}

// ── C. a jump at nothing is a BLOW-BY; the shot clock never hangs ──────────
{
  const mirror = (_t: number, rival: Vector3) => { const d = RIM.subtract(rival); d.y = 0; d.normalize(); return rival.add(d.scale(1.1)); };
  const r = possession(mirror, { airborne: (t) => t > 1.0 && t < 1.5 });
  ok(r.log.some((l) => l.phase === 'blowby'), 'a defender in the air with nothing to block gets driven past');
  // and the blow-by makes progress toward the rim
  const before = r.log.find((l) => l.t >= 1.0)!.dist, after = r.log.find((l) => l.t >= 1.5)!.dist;
  ok(after < before - 1.0, `the blow-by gains ground (${before.toFixed(2)} → ${after.toFixed(2)} m)`);
  // the rival learns: a stripped crossover means fewer crossovers next possession, decaying back over possessions
  const learner = new AttackerBrain(seeded(5));
  learner.noteStolen(); learner.noteStolen();
  const c0 = learner.caution; learner.reset(); const c1 = learner.caution;
  ok(c0 > 0 && c1 < c0 && c1 > 0, `caution rises on a steal and decays per possession (${c0.toFixed(2)} → ${c1.toFixed(2)})`);
  ok(CROSSOVER_CHANCE - c0 >= 0.2, 'a cautious rival still crosses over sometimes (floor 0.2)');
  // a layup is gathered in stride: the release lands closer to the rim than the gather began
  const open = possession(() => new Vector3(6, 0, 14), { seed: 9 });
  const g0 = open.log.find((l) => l.phase === 'gather')!;
  ok(!!g0 && (open.shot?.dist ?? 9) < g0.dist - 0.3, `the layup gather moves (${g0?.dist.toFixed(2)} → ${open.shot?.dist.toFixed(2)} m) — no free chase-down`);
  const b = new AttackerBrain(seeded(3));
  b.decide(1, new Vector3(0, 0, 9), new Vector3(0, 0, 7), RIM);   // past the check
  b.blowBy();
  ok(b.phase === 'blowby', 'a whiffed reach opens the lane (blowBy)');
  // the clock: a rival stuck at range with a defender glued on still shoots by SHOT_CLOCK_SEC
  const glue = (_t: number, rival: Vector3) => rival.add(new Vector3(0, 0, -1.0));
  const r2 = possession(glue, { maxSec: SHOT_CLOCK_SEC + 2 });
  ok(r2.shot !== null && r2.shot.t <= SHOT_CLOCK_SEC + GATHER_SEC + 0.1, `the possession never hangs (shot at ${r2.shot?.t.toFixed(2)} s)`);
  ok(r.brain.phase === 'released' || r.brain.phase === 'gather', 'the brain ends in a terminal phase');
  const b2 = new AttackerBrain(seeded(1));
  ok(b2.decide(DT, new Vector3(0, 0, 9), new Vector3(0, 0, 7), RIM).wish.length() === 0, 'the check is a standstill (an idle dribble)');
  ok(RIVAL_DRIVE_SPEED < 6.4, 'the rival drives slower than the defender\'s top speed — a slide can stay in front');
}

// ── D. the contest grades THEM: open layup ≫ contested pull-up; a hand up counts ─
{
  ok(rivalShotPct(1.2, 0, 'layup') > 0.65, 'an open layup is a good look');
  ok(rivalShotPct(6.0, 1, 'jumper') < 0.2, 'a smothered pull-up from range is a prayer');
  ok(rivalShotPct(1.2, 0, 'layup') - rivalShotPct(1.2, 1, 'layup') >= 0.35, 'the contest takes a real bite out of a layup');
  ok(rivalShotPct(4.0, 0.3, 'jumper') > rivalShotPct(7.0, 0.3, 'jumper'), 'range costs');
  ok(handUpContest(0.2, 0.3) > 0.2 && handUpContest(0.2, HAND_UP_SEC + 0.1) === 0.2, 'a recent jump puts a hand in the shot, an old one does not');
  for (const d of [0.5, 3, 7.5]) for (const c of [0, 0.5, 1]) for (const s of ['layup', 'jumper'] as const) { const p = rivalShotPct(d, c, s); ok(p >= 0.05 && p <= 0.95, `pct in range (${d}, ${c}, ${s})`); }
}

// ── E. the tree is ONE owner: one-shots settle, cut callbacks are ignored, holds are never interrupted ─
{
  type Play = { clip: string; loop: boolean; onEnd?: () => void; restart?: boolean };
  const plays: Play[] = [];
  const fake = { play: (clip: string, o: Play) => { plays.push({ clip, loop: !!o.loop, onEnd: o.onEnd, restart: o.restart }); return null; } } as never;
  const BASE: AnimTreeInput = { speed01: 0, crossover: false, nearestDefender: 5, hasBall: true, shooting: false, dunking: false, driving: false, defending: false, bracing: false, staggered: false };
  const tree = new BasketballAnimTree(fake);
  tree.update(BASE); tree.update(BASE);
  ok(plays.length === 1 && plays[0].loop, 'loops dedupe per frame');
  // a tree-chosen one-shot (the stagger) plays once with its own onEnd and settles into the loop the input asks for
  tree.update({ ...BASE, staggered: true });
  ok(plays.length === 2 && !plays[1].loop && !!plays[1].onEnd, 'a one-shot state plays once, non-loop, with the tree\'s onEnd');
  tree.update({ ...BASE, staggered: true }); tree.update({ ...BASE, staggered: true });
  ok(plays.length === 2, 'a one-shot in flight is not restarted by the per-frame update');
  plays[1].onEnd!();
  ok(plays.length === 3 && plays[2].loop && plays[2].clip === 'bball_dribble_idle', `a finished one-shot settles into the loop (got ${plays[2]?.clip})`);
  tree.update({ ...BASE, staggered: true });
  ok(plays.length === 3, 'the same one-shot does not re-fire while the input still names it');
  tree.update(BASE); tree.update({ ...BASE, staggered: true });
  ok(plays.length === 4 && plays[3].clip === 'karate_hit_react', 'a fresh stagger fires again after the trigger dropped');
  // a mode beat: cut by a newer beat → the old callback is ignored
  const t2 = new BasketballAnimTree(fake); plays.length = 0;
  t2.update({ ...BASE, defending: true, hasBall: false });
  t2.beat('bball_steal_reach'); t2.beat('bball_block_reach');
  const stale = plays[1].onEnd!, live = plays[2].onEnd!;
  stale();
  ok(plays.length === 3 && t2.busy, 'a cut beat\'s end callback is ignored (the newer beat still owns the body)');
  live();
  ok(plays.length === 4 && plays[3].loop && plays[3].clip === 'bball_defend_stance', `the live beat settles into the defence stance (got ${plays[3]?.clip})`);
  // a hold is never interrupted by update(); release() settles
  t2.hold('jumpshot'); const n = plays.length;
  t2.update({ ...BASE, speed01: 1 }); t2.update({ ...BASE, staggered: true });
  ok(plays.length === n, 'a hold is never interrupted by the per-frame update — not even by a priority state');
  t2.update({ ...BASE, speed01: 1 });
  t2.release();
  ok(plays.length === n + 1 && plays[n].loop, 'release() settles the hold into the tree\'s choice');
  // settleTo: a knockdown lands on the floor hold until the mode lifts it
  const t3 = new BasketballAnimTree(fake); plays.length = 0;
  t3.update(BASE);
  t3.beat('karate_knockdown', { settleTo: { clip: 'karate_floor_hold' } });
  plays[1].onEnd!();
  ok(plays[2]?.clip === 'karate_floor_hold' && plays[2].loop && t3.busy, 'a knockdown settles onto the held floor');
  t3.update(BASE);
  ok(plays.length === 3, 'the floor hold survives the per-frame update');
  t3.beat('karate_get_up'); plays[3].onEnd!();
  ok(plays[4]?.clip === 'bball_dribble_idle', 'the get-up settles back into the game loop');
  // the slide picks its side
  ok(chooseBasketballClip({ ...BASE, defending: true, hasBall: false, speed01: 0.6, slideDir: 'right' }).clip === 'bball_defend_slide_right', 'a right slide plays the right clip');
  ok(chooseBasketballClip({ ...BASE, defending: true, hasBall: false, speed01: 0.6 }).clip === 'bball_defend_slide_left', 'the default slide is the left clip');
  ok(chooseBasketballClip({ ...BASE, floored: true, staggered: true }).clip === 'karate_floor_hold', 'the floor outranks a stagger');
}

// ── F. source level: the loop closes ───────────────────────────────────────
{
  const src = readFileSync(new URL('../lib/babylon/modes/OneVOneMode.ts', import.meta.url), 'utf8');
  ok(!/\b(me|foe)\.animator\.play\(/.test(src), 'the mode never plays a clip past the tree (one owner per body)');
  ok(src.includes('new AttackerBrain('), 'the rival possession is the AttackerBrain, not a timer');
  ok(!src.includes('DEFENSE_DRIVE_SEC'), 'the 2.2 s drive timer is gone');
  ok(src.includes("startDefense(ctx, 'MAKE IT, TAKE IT"), 'their make keeps the ball with them (make it, take it)');
  ok(/function giveBall[\s\S]*felReleased = true;[\s\S]*meCarry\?\.update\(0, 0, false\); foeCarry\?\.update\(0, 0, false\);[\s\S]*attachBallToHand/.test(src), 'the hand-off switches both live dribbles off before the ball changes hands');
  ok(src.includes('possessionToken === tok'), 'possession timers are token-guarded (no stale watchdog into the next possession)');
  ok(!src.includes('defense watchdog'), 'the setTimeout watchdog is gone');
  ok(/edge <= 0\) startDefense\(ctx, possession === 'mine'/.test(src), 'the board is a race on both ends');
  ok(src.includes('} else if (loose && !dunking) {'), 'a loose ball steps whoever\'s possession it is');
  ok(src.includes('dec.exposure >= STEAL_EXPOSURE_MIN'), 'the steal reads the rival\'s exposure');
  ok(src.includes("meAnimTree.beat('bball_steal_reach')") && src.includes("meAnimTree.beat('bball_block_reach')"), 'the steal and the block have a reach');
  ok(src.includes('checkBlock(me.root.position, foe.root.position, myJumpAge)'), 'the block is timed against the release');
  ok(src.includes('c.attacker') && src.includes('c.victim'), 'fouls read who ran into whom');
  ok(src.includes('CHECK_FOE') && src.includes('CHECK_ME'), 'their possession checks up at the top');
}

// ── report ─────────────────────────────────────────────────────────────────
if (fail.length) {
  console.error(`onevone-defense-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`onevone-defense-tests: ${checks} checks green`);
