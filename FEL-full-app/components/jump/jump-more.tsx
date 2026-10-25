'use client';

// JumpMore — the jump check's other jumps, under the result (JUMP-PRO 2, 2026-10-25): the approach jump with its touch
// height, the drop jump with its RSI, the one-time standing reach, and (with a typed body weight) power. Mounted only on
// an adult's jump result (app/play/mirror/assess: never for a kid or a teen, owner 2026-10-24).
// JUMP-TESTS (2026-10-25): the live check's take-off speed (an estimate), the standard jump tests, the history kept on
// this phone with its CSV, and — in the pilot's build only — the pilot capture panel. All adults only, like the rest.
import { useMemo } from 'react';
import type { T5Extra } from '@/lib/assess/scoring';
import { PowerEstimate } from './power-estimate';
import { ReachCheck } from './reach-check';
import { SideJumpUpload } from './side-jump-upload';
import { JumpTests } from './jump-tests';
import { JumpHistory } from './jump-history';
import { JumpVelocity } from './jump-velocity';
import { PilotCapture } from './pilot-capture';
import { jumpKinematics } from '@/lib/jump/velocity';
import { reachStorage, type ReachStorage } from '@/lib/jump/reachStore';
import type { Decoder } from '@/lib/jump/slowmoDecode';

export function JumpMore({ adult, bestHeightCm, plusMinusCm, decode, storage, t5 = null, pilot, onExport }: {
  adult: boolean; bestHeightCm: number | null; plusMinusCm?: number | null; decode?: Decoder; storage?: ReachStorage | null;
  /** JUMP-TESTS: the live check's read (its jumps' take-off speed; "keep today's jump check"; the pilot log). */
  t5?: T5Extra | null;
  /** The pilot panel's switch, for the probe; the app leaves it to the build flag. */
  pilot?: boolean;
  onExport?: (name: string, text: string) => void;
}) {
  const kin = useMemo(() => new Map((t5?.jumps ?? []).filter((j) => j.valid).map((j) => [j.index, jumpKinematics(j, { countermovement: true })])), [t5]);
  if (!adult) return null;
  const store = storage === undefined ? reachStorage() : storage;
  return (
    <div data-jump-more className="space-y-3">
      <JumpVelocity t5={t5} kin={kin} />
      <PowerEstimate adult={adult} heightCm={bestHeightCm} plusMinusCm={plusMinusCm} />
      <SideJumpUpload kind="approach" decode={decode} storage={storage} />
      <ReachCheck decode={decode} storage={storage} />
      <SideJumpUpload kind="drop" decode={decode} />
      <JumpTests adult={adult} decode={decode} storage={store} liveT5={t5} {...(pilot !== undefined ? { pilot } : {})} />
      <JumpHistory adult={adult} storage={store} liveT5={t5} onExport={onExport} />
      <PilotCapture adult={adult} liveT5={t5} {...(pilot !== undefined ? { enabled: pilot } : {})} onExport={onExport} />
    </div>
  );
}
