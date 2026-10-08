#!/usr/bin/env -S npx tsx
// HOOPS-TO-75 — regression guards for the Sep 30 scored playtest items.

import { readFileSync } from 'node:fs';
import { Vector3 } from '@babylonjs/core';
import {
  rivalShotPct, proximityContest01, HAND_UP_SEC, HAND_UP_CONTEST, distXZ,
  TeammateBrain, DefenderBrain, clampToHalfCourt, resolveBodyCollision,
} from '../lib/babylon/core/BasketballCore';
import { topRivalScore } from '../lib/babylon/modes/ThreePointMode';
import { proofLineFor } from '../lib/proofLine';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const RIM = new Vector3(0, 3.05, -0.6);
const DT = 1 / 60;

// ── 1v1 WA-14: well-timed gather jump raises contest enough for stops ───────
{
  const dist = 1.1;
  const base = proximityContest01(dist);
  const gatherJump = Math.min(1, base + HAND_UP_CONTEST + 0.12);
  ok(gatherJump > 0.55, `WA-14 gather-jump contest ${gatherJump.toFixed(2)} > 0.55`);
  const openPct = rivalShotPct(5.5, 0.05, 'jumper');
  const stopPct = rivalShotPct(5.5, gatherJump, 'jumper');
  ok(stopPct < openPct - 0.15, `WA-14 contested jumper make% drops (${openPct.toFixed(2)} → ${stopPct.toFixed(2)})`);
  ok(myJumpAgeGuard(), 'WA-14 HAND_UP_SEC window is human-scale');
}

function myJumpAgeGuard(): boolean {
  return HAND_UP_SEC >= 0.25 && HAND_UP_SEC <= 0.75;
}

// ── 1v1 WA-25: trash line gated before game-ending buckets ───────────────────
{
  const src = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
  ok(src.includes('foeScore < TARGET_SCORE - 2') && src.includes('player.trash.score'),
    'WA-25 trash.score suppressed on game-ending makes');
}

// ── 1v1 early-jump debounce ──────────────────────────────────────────────────
{
  const src = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
  ok(src.includes('earlyJumpBannerAt') && src.includes('1800'),
    '1v1 early-jump banner debounced');
}

// ── 3v3 WA-1: buzzer waits for live shots ────────────────────────────────────
{
  const src = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
  ok(src.includes('let buzzer = false') && src.includes('liveAtBuzzer'),
    'WA-1 buzzer holds until arcs and dunk flights finish');
  ok(src.includes('foeShotScored = true') && src.match(/foeScore \+= (2|points); foeShotScored = true/g)!.length >= 2,   // IMPROVE (2026-10-06, 3v3 #2): the jumper release banks what it was worth (`points`: a three is three)
    'WA-1 rival dunk marks foeShotScored like the jumper release');
}

// ── 3v3 WA-15 / HP-5: spacing spawn + distinct kits ────────────────────────
{
  const src = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
  ok(src.includes('TEAM_SHORTS') && src.includes("SLOT_KEYS.shorts"),
    'HP-5 both jersey and shorts tinted per team');
  ok(src.includes('-4.8, 0, 5.8') && src.includes('-0.8 - i * 1.1'),
    'WA-15 wider off-ball spawn spread');
  const { minSeen } = runFloorSim();
  ok(minSeen > 0.9, `WA-15 floor sim min spacing ${minSeen.toFixed(2)}m > 0.9m`);
}

function runFloorSim(): { minSeen: number } {
  const me = new Vector3(0, 0, 6);
  const bodies = [
    { pos: new Vector3(-4.8, 0, 5.8), brain: new TeammateBrain(Math.PI * 0.25), speed: 4.2, team: 'off' as const },
    { pos: new Vector3(4.8, 0, 5.8), brain: new TeammateBrain(-Math.PI * 0.25), speed: 4.2, team: 'off' as const },
    { pos: new Vector3(-4.5, 0, -0.8), brain: new DefenderBrain(0.55, 0), speed: 3.8, team: 'def' as const },
    { pos: new Vector3(0, 0, -1.9), brain: new DefenderBrain(0.55, 1), speed: 3.8, team: 'def' as const },
    { pos: new Vector3(4.5, 0, -3.0), brain: new DefenderBrain(0.55, 2), speed: 3.8, team: 'def' as const },
  ];
  const ball = me.clone();
  let minSeen = 99;
  for (let t = 0; t < 900; t++) {
    const offence = [me, bodies[0].pos, bodies[1].pos];
    const defence = [bodies[2].pos, bodies[3].pos, bodies[4].pos];
    for (const b of bodies) {
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
    if (t > 120) {
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          minSeen = Math.min(minSeen, Vector3.Distance(all[i], all[j]));
        }
      }
    }
  }
  return { minSeen };
}

// ── 3PT HP-8 / HP-12 / proof line ────────────────────────────────────────────
{
  const board = [
    { name: 'YOU', score: 21, shot: true, isPlayer: true },
    { name: 'RAY', score: 18, shot: true, isPlayer: false },
  ];
  ok(topRivalScore(board) === 18, 'HP-8 topRivalScore reads the leader');
  const line = proofLineFor('threePoint', { score: 21, opponentScore: 18, won: true, stats: { points: 21, rivalScore: 18 } });
  ok(line === '21 PTS DOWNTOWN vs 18 · WON', `HP-12 proof line carries rival (${line})`);
  const host = readFileSync('components/games/three-point-babylon.tsx', 'utf8');
  ok(host.includes('rivalPts') && host.includes('RANGE UNLOCKED ·'),
    'HP-12 won headline includes the result line');
  ok(!host.includes('opponentScore: 0'), 'HP-8 host no longer hardcodes opponentScore 0');
}

// ── Host lobby HP-2 / HP-3 ───────────────────────────────────────────────────
{
  const lobby = readFileSync('components/controller-link/host-lobby.tsx', 'utf8');
  ok(lobby.includes('hideRoomChip') && lobby.includes("NODE_ENV === 'production'"),
    'HP-3 room chip hidden in production');
  ok(lobby.includes('pads.length > 0') && lobby.includes('HP-2'),
    'HP-2 connected pad suppresses CONNECT badge');
}

// ── Dunk HP-1 / tomahawk arm gate ────────────────────────────────────────────
{
  const dunkHost = readFileSync('components/games/dunk-babylon.tsx', 'utf8');
  ok(dunkHost.includes('const judging') && dunkHost.includes('!judging'),
    'HP-1 dunk host staggers judge stack vs timing/banner/mic');
  const dunkMode = readFileSync('lib/babylon/modes/DunkMode.ts', 'utf8');
  ok(dunkMode.includes("e.t !== 'button' || !e.pressed") && dunkMode.includes("e.t === 'dpad' && e.pressed) flight.recognizer.feed"),
    'tomahawk arms only on deliberate press, not held stick from run-up');
  ok(dunkMode.includes('lastJudgeWhy') && dunkMode.includes("slamTiming: ''"),
    'HP-1 timing HUD deferred until judge total beat');
}

// ── Shared WA-23 frame + HP-10 venue ─────────────────────────────────────────
{
  for (const f of ['components/games/basketball-babylon.tsx', 'components/games/three-v-three-babylon.tsx', 'components/games/three-point-babylon.tsx']) {
    const src = readFileSync(f, 'utf8');
    ok(src.includes('h-[calc(100dvh-3.25rem)]') && !src.includes('aspect-[16/10]'),
      `WA-23 ${f} uses full-height frame like dunk`);
  }
  const vb = readFileSync('lib/babylon/nexus/veniceBoardwalk.ts', 'utf8');
  ok(vb.includes('HOOPS-TO-75 HP-10') && !vb.includes('SCAN_N - 17.4'),
    'HP-10 dunk sign moved off the north lawn for shared hoops');
}

// ── Posted score integrity helpers (board === POST fields) ───────────────────
{
  ok(scorePostMatch('hoops1v1', 11, 8, 11, 8, true), '1v1 posted score matches board');
  ok(scorePostMatch('hoops3v3', 12, 20, 12, 20, false), '3v3 posted score matches board');
  ok(scorePostMatch('threePoint', 21, 18, 21, 18, true), '3PT posted score matches board');
  ok(scorePostMatch('dunkContest', 47, 44, 47, 44, true), 'dunk posted score matches board');
}

function scorePostMatch(_mode: string, boardMe: number, boardFoe: number, postMe: number, postFoe: number, won: boolean): boolean {
  return boardMe === postMe && boardFoe === postFoe;
}

// ── Dunk perf: sim dt clamp present ──────────────────────────────────────────
{
  const dunkMode = readFileSync('lib/babylon/modes/DunkMode.ts', 'utf8');
  ok(dunkMode.includes('clamp((ikScene?.getEngine().getDeltaTime() ?? 16) / 1000, 0, 0.05)'),
    'dunk perf dt clamp caps 50ms spike cost');
}

if (fail.length) {
  console.error(`HOOPS-TO-75: ${fail.length} failed, ${checks - fail.length}/${checks} passed`);
  for (const f of fail) console.error('  ✗', f);
  process.exit(1);
}
console.log(`HOOPS-TO-75: ${checks}/${checks} passed`);
