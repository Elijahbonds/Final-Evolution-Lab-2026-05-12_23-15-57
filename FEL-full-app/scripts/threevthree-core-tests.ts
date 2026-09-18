#!/usr/bin/env -S npx tsx
// 3v3 core mechanics — floor spacing, defensive matchups, and the arc.
//
// The first frame ever captured of this mode showed all six bodies stacked at
// centre court. Two independent causes, both "steer at one ideal point":
//
//   DefenderBrain had no matchup, so all THREE defenders solved for the same
//   deny point between the ball and the rim and piled onto it — leaving every
//   other attacker completely unguarded.
//   TeammateBrain cut to the hoop EXACTLY, so both teammates cut to the same
//   square metre and arrived on top of each other.
//
// Neither is visible in a unit test of the brain alone: each returns a sane
// direction. It only shows up when you integrate the whole floor over time,
// which is what this does — the same integration the mode runs.

import { readFileSync } from 'node:fs';
import { Vector3 } from '@babylonjs/core';
import {
  TeammateBrain, DefenderBrain, clampToHalfCourt, resolveBodyCollision,
  isThree, threePointRadius, THREE_CORNER_R, THREE_TOP_R,
} from '../lib/babylon/core/BasketballCore';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const RIM = new Vector3(0, 3.05, -0.6);
const DT = 1 / 60;

interface Sim { pos: Vector3; brain: TeammateBrain | DefenderBrain; speed: number; team: 'off' | 'def' }

function run(ticks: number): { bodies: Sim[]; ball: Vector3; minSeen: number } {
  // the human player, held at a plausible ball-handler spot
  const me = new Vector3(0, 0, 6);
  const bodies: Sim[] = [
    { pos: new Vector3(-3.5, 0, 4), brain: new TeammateBrain(Math.PI * 0.25), speed: 4.2, team: 'off' },
    { pos: new Vector3(3.5, 0, 4), brain: new TeammateBrain(-Math.PI * 0.25), speed: 4.2, team: 'off' },
    { pos: new Vector3(-2, 0, 2), brain: new DefenderBrain(0.55, 0), speed: 3.8, team: 'def' },
    { pos: new Vector3(0, 0, 1.5), brain: new DefenderBrain(0.55, 1), speed: 3.8, team: 'def' },
    { pos: new Vector3(2, 0, 2), brain: new DefenderBrain(0.55, 2), speed: 3.8, team: 'def' },
  ];
  const ball = me.clone();
  let minSeen = 99;

  for (let t = 0; t < ticks; t++) {
    const offence = [me, bodies[0].pos, bodies[1].pos];
    const defence = [bodies[2].pos, bodies[3].pos, bodies[4].pos];
    for (const b of bodies) {
      // same perspective the mode wires: your own team is `allies`
      const allies = b.team === 'off' ? offence : defence;
      const foes = b.team === 'off' ? defence : offence;
      const i = b.brain.decide(DT, b.pos, ball, RIM, allies, foes);
      b.pos.addInPlace(new Vector3(i.moveX, 0, -i.moveY).scale(b.speed * DT));
      clampToHalfCourt(b.pos, 8, 15);
    }
    const all = [me, ...bodies.map((b) => b.pos)];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) resolveBodyCollision(all[i], all[j]);
    }
    if (t > 120) {                                  // let them settle first
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          minSeen = Math.min(minSeen, Vector3.Distance(all[i], all[j]));
        }
      }
    }
  }
  return { bodies, ball, minSeen };
}

const { bodies, minSeen } = run(900);   // 15 seconds

// ── A. nobody stacks ───────────────────────────────────────────────────────
ok(minSeen > 0.9,
  `A1 no two players ever occupy the same space over 15s of play ` +
  `(closest approach ${minSeen.toFixed(2)}m)`);

// ── B. the offence spreads the floor ───────────────────────────────────────
const [m0, m1] = [bodies[0].pos, bodies[1].pos];
ok(Vector3.Distance(m0, m1) > 2.5,
  `B1 the two teammates hold different areas (${Vector3.Distance(m0, m1).toFixed(2)}m apart) — ` +
  'both used to cut to the hoop point exactly and arrive stacked');

// ── C. the defence matches up instead of ball-chasing ──────────────────────
// Each defender is assigned a man. It should end nearer the man it was told to
// guard than the average defender is — i.e. the assignment does something.
const me = new Vector3(0, 0, 6);
const marks = [me, m0, m1];
const defs = [bodies[2].pos, bodies[3].pos, bodies[4].pos];
let assignedBetter = 0;
for (let d = 0; d < 3; d++) {
  const toMine = Vector3.Distance(defs[d], marks[d]);
  const toOthers = marks.filter((_, k) => k !== d).map((m) => Vector3.Distance(defs[d], m));
  if (toMine <= Math.min(...toOthers) + 0.75) assignedBetter++;
}
ok(assignedBetter >= 2,
  `C1 defenders cover the man they were assigned (${assignedBetter}/3) — with no ` +
  'assignment all three solved for the same deny point and left two attackers free');

const defSpread = Math.min(
  Vector3.Distance(defs[0], defs[1]),
  Vector3.Distance(defs[1], defs[2]),
  Vector3.Distance(defs[0], defs[2]),
);
ok(defSpread > 1.2, `C2 the three defenders are not in a heap (closest pair ${defSpread.toFixed(2)}m)`);

// ── D. everyone stays on the court ─────────────────────────────────────────
for (const b of bodies) {
  ok(Math.abs(b.pos.x) <= 8.001 && b.pos.z >= 0.499 && b.pos.z <= 15.001,
    `D-a body stayed in bounds (${b.pos.x.toFixed(1)}, ${b.pos.z.toFixed(1)})`);
}

// ── E. the three-point line is a real arc, not a circle ───────────────────
// Asserted against the REAL NBA line, not against our own constant — testing
// 6.75 against 6.75 would have happily confirmed a wrong number, which is the
// mistake this replaces. 3PT shipped a flat radius as its D1; 3v3 then made the
// identical mistake independently.
ok(Math.abs(THREE_CORNER_R - 6.71) < 0.005, `E1 corner three is the real 6.71m (${THREE_CORNER_R})`);
ok(Math.abs(THREE_TOP_R - 7.24) < 0.005, `E2 top-of-arc three is the real 7.24m (${THREE_TOP_R})`);

const TOP = Math.PI / 2, CORNER = (30 * Math.PI) / 180;
ok(threePointRadius(TOP) > threePointRadius(CORNER) + 0.4,
  'E3 the top of the key is a genuinely longer shot than the corner — that ' +
  'difference IS basketball shot selection, and a flat radius erases it');

// A spot 7.0m out is a THREE from the corner and only a TWO from the top. One
// number cannot express that, which is the whole point.
const at = (ang: number, r: number) =>
  new Vector3(RIM.x + Math.cos(ang) * r, 0, RIM.z + Math.sin(ang) * r);
ok(isThree(at(CORNER, 7.0), RIM), 'E4 7.0m from the corner is a three');
ok(!isThree(at(TOP, 7.0), RIM), 'E5 the same 7.0m from the top of the key is only a two');
ok(!isThree(at(TOP, 3.0), RIM), 'E6 a shot in the paint is never a three');

// ── F. the scoring scale ───────────────────────────────────────────────────
// Read from the source, because the bug is a bare literal in one branch. The
// jumper path was corrected from the old "1 inside / 2 outside" scale to real
// 2s and 3s; the DUNK path kept awarding 1, so the best shot in basketball was
// worth half a jump shot. Nothing catches that but a check on the number.
const src = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
ok(!/myScore \+= 1;/.test(src),
  'F1 no scoring path awards a single point — 3v3 is a 2s-and-3s game and a ' +
  'dunk is a two, not a one');
ok(/myScore \+= 2;/.test(src), 'F2 the dunk path awards a two');
ok(/myScore \+= arcPoints;/.test(src), 'F3 jump shots award 2 or 3 by the arc');

if (fail.length) {
  console.error(`threevthree-core-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`threevthree-core-tests: ${checks} checks green — spacing holds and the arc is real`);
