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
  ];
  const registered: string[] = [];
  for (const b of builders) {
    const g = b();
    if (g) { animator.register(g); registered.push(g.name); }
  }
  console.info(`[FEL-ANIM] authored clips registered: ${registered.join(', ')}`);
  return registered;
}
