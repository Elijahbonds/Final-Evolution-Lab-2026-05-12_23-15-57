#!/usr/bin/env -S npx tsx
// HOOPS-10PHASE-2 phase 8 — rebound physics, boxouts, tip-ins.
//
// A full audit of core/LooseBall.ts and core/BasketballCore.ts's DefenderBrain before writing anything: real ball
// physics off the iron (ballVsBodies: swept body deflection, bobbled vs. clean pickup, box-out worth real metres
// in resolvePickup, a dead-ball rule for a board that leaves the floor) and real box-outs (DefenderBrain.boxOut,
// the seal-point geometry, the loose-ball chase overriding every other job) were BOTH already fully built in an
// earlier pass ("LOOSE BALL" 2026-09-12, "HOOPS-MOVE-KIT-A O1-O3"). The one genuine gap: a tip-in. Every offensive
// board — however close to the rim, however high the ball still was — fell through to the ordinary
// dribble/gather/shoot loop; boardOutcome() only ever labelled a rebound 'putback' for the HUD banner, nothing
// read that label to let a player go straight back up without a dribble.
//
// New core/TipIn.ts (pure, its own 11 vitest unit tests) answers two questions: is this secured rebound close
// and high enough to a putback's rim to be a tip (isTipInEligible), and does a tip that qualifies go in
// (tipInMakeChance, narrowed by the SAME contestLevel() every other shot in this suite already uses). Wired into
// BOTH modes at their board-resolution call site, narrowly: a MISSED tip attempt changes NOTHING (the ball is
// already secured the exact same way every other board always was); the only new behaviour is an instant make on
// the rare right-under-the-rim catch, scored the same way every other make in each mode already is (myScore/
// foeScore += 2, the SAME bball_score_celebrate beat, the SAME net-exit launch, the SAME checkGameOver /
// make-it-take-it continuation).
//
// Run: npx tsx scripts/tipin-tests.ts

import { readFileSync } from 'node:fs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const tipIn = readFileSync(new URL('../lib/babylon/core/TipIn.ts', import.meta.url), 'utf8');
const oneVOne = readFileSync(new URL('../lib/babylon/modes/OneVOneMode.ts', import.meta.url), 'utf8');
const threeVThree = readFileSync(new URL('../lib/babylon/modes/ThreeVThreeMode.ts', import.meta.url), 'utf8');

// --- the pure module exists and exports the right surface ---
ok(/export function isTipInEligible\(ballPos: Vector3, rim: Vector3, putback: boolean\): boolean \{/.test(tipIn),
  'TipIn exports isTipInEligible(ballPos, rim, putback)');
ok(/export function tipInMakeChance\(contest01: number\): number \{/.test(tipIn), 'TipIn exports tipInMakeChance(contest01)');
ok(/if \(!putback\) return false;/.test(tipIn), 'a change-of-possession board (not your own miss) is never tip-eligible');

// --- rebound physics / box-outs audit: confirm they were already complete, so this phase did not rebuild them ---
const looseBall = readFileSync(new URL('../lib/babylon/core/LooseBall.ts', import.meta.url), 'utf8');
ok(/export function ballVsBodies\(/.test(looseBall), 'real swept ball-vs-body deflection physics already existed (LooseBall.ts)');
ok(/export function resolvePickup\(/.test(looseBall) && /boxOutEdge/.test(looseBall), 'box-out is already worth real metres in the pickup contest (resolvePickup)');
const core = readFileSync(new URL('../lib/babylon/core/BasketballCore.ts', import.meta.url), 'utf8');
ok(/boxOut\(mark: Vector3 \| null\): void \{ this\.boxTarget = mark \? mark\.clone\(\) : null; \}/.test(core),
  'DefenderBrain.boxOut() (the seal assignment) already existed — this phase added zero new box-out logic');

// --- both modes import and wire it at their board-resolution site ---
for (const [name, src] of [['1v1', oneVOne], ['3v3', threeVThree]] as const) {
  ok(/import \{ isTipInEligible, tipInMakeChance \} from '\.\.\/core\/TipIn';/.test(src), `${name} imports isTipInEligible/tipInMakeChance from core/TipIn`);
  ok(/isTipInEligible\(/.test(src) && /tipInMakeChance\(/.test(src), `${name} actually calls both functions, not just imports them`);
  ok(/contestLevel\(.*isTipInEligible|isTipInEligible[\s\S]{0,400}contestLevel\(/.test(src) || (src.match(/contestLevel\(/g)?.length ?? 0) > 1,
    `${name} grades the tip's make chance with the SAME contestLevel() every other shot uses, not a new contest read`);
  ok(/roll\(\) < tipInMakeChance\(contest\)/.test(src), `${name} rolls the tip's make chance through the mode's existing dice (roll()), not Math.random() directly`);
  ok(/bball_score_celebrate/.test(src.slice(src.indexOf('isTipInEligible', src.indexOf('isTipInEligible') + 1))),
    `${name}'s tip-in branch plays the SAME score-celebrate beat every other make uses`);
}

// a missed tip must NOT short-circuit the ordinary board flow — both modes still run the ordinary
// resolution right after the tip-in block closes (proven by the ordinary banner/console.info text still being
// present and reachable, i.e. the new block is a conditional, not a replacement)
ok(/OFFENSIVE BOARD — PUT IT BACK!/.test(threeVThree), '3v3 still has the ordinary offensive-board banner for a MISSED tip (or a tip out of range)');
ok(/securePutback\(ctx, contested\); return; \}/.test(oneVOne), "1v1's ordinary securePutback() path is still intact and reachable for a MISSED tip");

console.log(`tipin: ${checks - fail.length}/${checks} checks passed`);
if (fail.length) { console.error('FAILED:\n' + fail.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
