// registerAuthoredClips — build every authored clip against the live skeleton
// and register into the CharacterAnimator. Registry-name hits beat aliases.

import type { Scene, Skeleton } from '@babylonjs/core';
import type { CharacterAnimator } from '../CharacterAnimator';
import { buildEastbay } from './eastbay';
import { buildChargeGather, buildLaunch, buildScoreHang, buildLandCrouch } from './dunkSuite';
import { buildMocapDunk } from './mocapDunk';
import { buildFinishWindmill, buildFinishTomahawk, buildFinishBlown, buildCelebrateBig } from './dunkFinishes';
import { buildIdleStand, buildStrafe, buildJumpUp, buildJumpLand } from './locomotion';
import { buildJuke, buildSpinMove, buildTackledFall } from './football';
import { buildHitReact, buildKnockdown } from './karate';
import {
  buildDribbleIdle, buildCrossover, buildHesi, buildLayupGather, buildDefendSlide, buildBlockReach, buildStealReach,
} from './basketball';
import { buildBatStance, buildBatSwing, buildPitchOver, buildPitchSide } from './baseball';
import { buildGolfAddress, buildGolfSwing } from './golf';
import { buildTennisReady, buildTennisServe, buildTennisSwing } from './tennis';
import { buildVolleyBlock, buildVolleyReady, buildVolleySpike } from './volleyball';
import { buildKeeperDive, buildKeeperSet, buildSoccerKick } from './soccer';
import {
  buildBoardRideIdle, buildBoardCarveLeft, buildBoardCarveRight, buildBoardTuck,
  buildBoardGrab, buildBoardAir, buildBoardGrind, buildBoardLand,
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
    () => buildJuke(scene, skeleton, 'left'),
    () => buildJuke(scene, skeleton, 'right'),
    () => buildSpinMove(scene, skeleton),
    () => buildTackledFall(scene, skeleton),
    () => buildHitReact(scene, skeleton),
    () => buildKnockdown(scene, skeleton),
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
    () => buildBoardRideIdle(scene, skeleton),
    () => buildBoardCarveLeft(scene, skeleton),
    () => buildBoardCarveRight(scene, skeleton),
    () => buildBoardTuck(scene, skeleton),
    () => buildBoardGrab(scene, skeleton),
    () => buildBoardAir(scene, skeleton),
    () => buildBoardGrind(scene, skeleton),
    () => buildBoardLand(scene, skeleton),
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
  console.info(`[FEL-ANIM] authored clips registered: ${registered.join(', ')}`);
  return registered;
}
