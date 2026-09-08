// registerAuthoredClips — build every authored clip against the live skeleton
// and register into the CharacterAnimator. Registry-name hits beat aliases.

import type { Scene, Skeleton } from '@babylonjs/core';
import type { CharacterAnimator } from '../CharacterAnimator';
import { buildEastbay } from './eastbay';
import { buildChargeGather, buildLaunch, buildScoreHang, buildLandCrouch } from './dunkSuite';
import { buildMocapDunk } from './mocapDunk';
import { buildFinishWindmill, buildFinishTomahawk, buildFinishBlown, buildCelebrateBig } from './dunkFinishes';
import { buildSelfLob, buildKickUp, buildCartwheel, buildDoubleUp, buildScorpion, buildLostFound, buildHideSeek, buildSpin360 } from './dunkTricks';
import { buildIdleStand, buildStrafe, buildJumpUp, buildJumpLand } from './locomotion';
import { buildBaseClips } from './baseClips';
import { buildJuke, buildSpinMove, buildTackledFall, buildCarryRun } from './football';
import { buildHitReact, buildKnockdown, buildGuardStep, buildBlockHold, buildGuardImpact, buildParry, buildFloorHold, buildGetUp, buildWindupHold, buildEvade, buildLeanDodge } from './karate';
import { buildFreeRunAirHold, buildFreeRunTuck, buildFreeRunSlide } from './freerun';
import {
  buildDribbleIdle, buildCrossover, buildHesi, buildLayupGather, buildDefendSlide, buildBlockReach, buildStealReach,
} from './basketball';
import { buildBatStance, buildBatSwing, buildPitchOver, buildPitchSide } from './baseball';
import { buildGolfAddress, buildGolfSwing, buildGolfPutt, buildGolfFinishHold } from './golf';
import { buildTennisReady, buildTennisServe, buildTennisSwing, buildTennisShuffle } from './tennis';
import { buildVolleyBlock, buildVolleyReady, buildVolleySpike, buildVolleyShuffle } from './volleyball';
import { buildKeeperDive, buildKeeperSet, buildSoccerKick, buildKeeperDiveHold, buildKeeperRise } from './soccer';
import {
  buildBoardRideIdle, buildBoardCarveLeft, buildBoardCarveRight, buildBoardTuck,
  buildBoardGrab, buildBoardAir, buildBoardGrind, buildBoardLand, buildBoardPush,
  buildSkateKickflip, buildSkateBail,
} from './boardSuite';

export function registerAuthoredClips(
  animator: CharacterAnimator, scene: Scene, skeleton: Skeleton,
): string[] {
  const builders = [
    () => buildIdleStand(scene, skeleton),
    () => buildStrafe(scene, skeleton, 'left'),
    () => buildStrafe(scene, skeleton, 'right'),
    () => buildJumpUp(scene, skeleton),
    () => buildJumpLand(scene, skeleton),
    () => buildChargeGather(scene, skeleton),
    () => buildLaunch(scene, skeleton),
    () => buildMocapDunk(scene, skeleton),
    () => buildEastbay(scene, skeleton),
    () => buildScoreHang(scene, skeleton),
    () => buildLandCrouch(scene, skeleton),
    () => buildFinishWindmill(scene, skeleton),
    () => buildFinishTomahawk(scene, skeleton),
    () => buildFinishBlown(scene, skeleton),
    () => buildCelebrateBig(scene, skeleton),
    // DUNK-CONTROL-JUICE (2026-09-08): the named dunks — runway beats (self-lob, kick-up, cartwheel, double-up) and air shapes
    () => buildSelfLob(scene, skeleton),
    () => buildKickUp(scene, skeleton),
    () => buildCartwheel(scene, skeleton),
    () => buildDoubleUp(scene, skeleton),
    () => buildScorpion(scene, skeleton),
    () => buildLostFound(scene, skeleton),
    () => buildHideSeek(scene, skeleton),
    () => buildSpin360(scene, skeleton),
    () => buildJuke(scene, skeleton, 'left'),
    () => buildJuke(scene, skeleton, 'right'),
    () => buildSpinMove(scene, skeleton),
    () => buildTackledFall(scene, skeleton),
    () => buildHitReact(scene, skeleton),
    () => buildKnockdown(scene, skeleton),
    // MODE-STICK-FACE family (2026-09-07): sport-correct loco — the carrier's tucked-ball run, the fighter's guard step
    () => buildCarryRun(scene, skeleton),
    () => buildGuardStep(scene, skeleton),
    () => buildBlockHold(scene, skeleton),     // ANIM-READABILITY (combat, 2026-09-07): the guard verbs and the floor
    () => buildGuardImpact(scene, skeleton),
    () => buildParry(scene, skeleton),
    () => buildFloorHold(scene, skeleton),
    () => buildGetUp(scene, skeleton),
    () => buildWindupHold(scene, skeleton),   // ANIM-READABILITY (creative, 2026-09-07): the counter-strike rival's telegraph
    () => buildLeanDodge(scene, skeleton),    // KARATE-NEO-COOP (2026-09-07): the bullet-time lean (the endless dodge with no stick held)
    () => buildEvade(scene, skeleton),        // KARATE-NEO-COOP (2026-09-07): the fighter's slip — the dodge was the football juke
    () => buildFreeRunAirHold(scene, skeleton),   // ANIM-READABILITY (creative): the runner's air hold, tuck and slide
    () => buildFreeRunTuck(scene, skeleton),
    () => buildFreeRunSlide(scene, skeleton),
    // Board suite — skate / surf / snowboard all ride on these. Without them
    // every board clip fell through the alias table onto a karate stance.
    // Phase 3 (2026-09-03): the racket, club, net and keeper sports stop borrowing karate
    () => buildGolfAddress(scene, skeleton),
    () => buildGolfSwing(scene, skeleton),
    () => buildTennisReady(scene, skeleton),
    () => buildTennisSwing(scene, skeleton),
    () => buildTennisServe(scene, skeleton),
    () => buildVolleyReady(scene, skeleton),
    () => buildVolleySpike(scene, skeleton),
    () => buildVolleyBlock(scene, skeleton),
    () => buildSoccerKick(scene, skeleton),
    () => buildKeeperSet(scene, skeleton),
    () => buildKeeperDive(scene, skeleton),
    // ANIM-READABILITY (net / precision, 2026-09-07): the putt, the ready shuffles, the keeper's held stretch and rise
    () => buildGolfPutt(scene, skeleton),
    () => buildGolfFinishHold(scene, skeleton),
    () => buildTennisShuffle(scene, skeleton, 'left'),
    () => buildTennisShuffle(scene, skeleton, 'right'),
    () => buildVolleyShuffle(scene, skeleton, 'left'),
    () => buildVolleyShuffle(scene, skeleton, 'right'),
    () => buildKeeperDiveHold(scene, skeleton),
    () => buildKeeperRise(scene, skeleton),
    () => buildBoardRideIdle(scene, skeleton),
    () => buildBoardCarveLeft(scene, skeleton),
    () => buildBoardCarveRight(scene, skeleton),
    () => buildBoardTuck(scene, skeleton),
    () => buildBoardGrab(scene, skeleton),
    () => buildBoardAir(scene, skeleton),
    () => buildBoardGrind(scene, skeleton),
    () => buildBoardLand(scene, skeleton),
    () => buildBoardPush(scene, skeleton),   // ANIM-READABILITY (2026-09-07): the skate push, replacing the walk alias
    () => buildSkateKickflip(scene, skeleton),
    () => buildSkateBail(scene, skeleton),
    // Basketball packages (Phase 4, 2026-09-03) — size-ups, gather, slide,
    // block and steal used to alias onto run/guard/jumpshot.
    () => buildDribbleIdle(scene, skeleton),
    () => buildCrossover(scene, skeleton, 'left'),
    () => buildCrossover(scene, skeleton, 'right'),
    () => buildHesi(scene, skeleton),
    () => buildLayupGather(scene, skeleton),
    () => buildDefendSlide(scene, skeleton, 'left'),
    () => buildDefendSlide(scene, skeleton, 'right'),
    () => buildBlockReach(scene, skeleton),
    () => buildStealReach(scene, skeleton),
    // Baseball packages (Phase 6, 2026-09-03) — the derby borrowed karate clips.
    () => buildBatStance(scene, skeleton),
    () => buildBatSwing(scene, skeleton),
    () => buildPitchOver(scene, skeleton),
    () => buildPitchSide(scene, skeleton),
  ];
  const registered: string[] = [];
  for (const b of builders) {
    const g = b();
    if (g) { animator.register(g); registered.push(g.name); }
  }
  // The nine base clips (run, walk, guard, strikes, jumpshot) the forge bakes into
  // fel-hero.glb, built here on the live skeleton too so a body without baked
  // animations (the MPFB2 candidate) plays them — one source of truth.
  for (const g of buildBaseClips(scene, skeleton)) { animator.register(g); registered.push(g.name); }
  console.info(`[FEL-ANIM] authored clips registered: ${registered.join(', ')}`);
  return registered;
}
