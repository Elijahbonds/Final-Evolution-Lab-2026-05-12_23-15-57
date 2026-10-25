'use client';

// JumpMore — the jump check's other jumps, under the result (JUMP-PRO 2, 2026-10-25): the approach jump with its touch
// height, the drop jump with its RSI, the one-time standing reach, and (with a typed body weight) power. Mounted only on
// an adult's jump result (app/play/mirror/assess: never for a kid or a teen, owner 2026-10-24).
import { PowerEstimate } from './power-estimate';
import { ReachCheck } from './reach-check';
import { SideJumpUpload } from './side-jump-upload';
import type { Decoder } from '@/lib/jump/slowmoDecode';
import type { ReachStorage } from '@/lib/jump/reachStore';

export function JumpMore({ adult, bestHeightCm, plusMinusCm, decode, storage }: { adult: boolean; bestHeightCm: number | null; plusMinusCm?: number | null; decode?: Decoder; storage?: ReachStorage | null }) {
  if (!adult) return null;
  return (
    <div data-jump-more className="space-y-3">
      <PowerEstimate adult={adult} heightCm={bestHeightCm} plusMinusCm={plusMinusCm} />
      <SideJumpUpload kind="approach" decode={decode} storage={storage} />
      <ReachCheck decode={decode} storage={storage} />
      <SideJumpUpload kind="drop" decode={decode} />
    </div>
  );
}
