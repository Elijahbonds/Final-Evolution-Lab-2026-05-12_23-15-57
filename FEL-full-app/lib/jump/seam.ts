// seam — the measured jump, typed, for the lanes that come after this one (JUMP-PRO, 2026-10-24; owner: "leave a
// clean, typed seam: a verified best jump per type with its trust level"). Real vertical unlocks dunks, the avatar's
// jump rating follows the real number, beat-my-vertical challenges — each reads a JumpRecord, never a T5Extra.
//
// FAIRNESS (owner rule): a real rep never sells an advantage in ranked, staked or paid play. This seam only describes
// the jump; whoever consumes it in a game applies that rule (lib/feel-panel already refuses knobs there).
// TEENS: `power` is never on a record (owner 2026-10-24: body weight and power are adults only, and never shown to a
// teen); a teen's record is the caller's to keep on the device (lib/screen/kid.ts, lib/mirror/deviceProgress.ts).
//
// Pure.
import type { T5Extra } from '@/lib/assess/scoring';
import { verifyJump, type TrustLevelHook, type VerifyBlock } from './session';

/** The jump types the owner listed. Only 'cmj' and 'repeated' are read today (docs/JUMP-PRO.md: approach and drop). */
export type JumpType = 'cmj' | 'approach' | 'drop' | 'repeated';

export interface JumpRecord {
  type: JumpType;
  /** The take-off-velocity height (cm) and its 95 % range. */
  heightCm: number;
  plusMinusCm: number | null;
  /** The owner's verified rule; when false, why. */
  verified: boolean;
  blocks: VerifyBlock[];
  source: 'live' | 'slowmo';
  /** The frame rate it was timed at, and PR #424's trust level when the caller has it. */
  fps: number;
  trust: TrustLevelHook | null;
  /** RSI for a repeated-jump record (best rebound), else null. */
  rsi: number | null;
}

/**
 * The best jump of a T5 read as a record: the VERIFIED best when one verifies (a clean jump can verify while a higher,
 * flagged one does not), else the best with its blocks. Null when no jump counted.
 */
export function bestJumpRecord(t5: T5Extra, ctx: { source: 'live' | 'slowmo'; trust?: TrustLevelHook | null }): JumpRecord | null {
  const valid = t5.jumps.filter((j) => j.valid);
  if (!valid.length) return null;
  const check = (j: (typeof valid)[number]) => verifyJump(j, { poseHz: t5.poseFps, source: ctx.source, trust: ctx.trust ?? null });
  const verifiedOnes = valid.map((j) => ({ j, v: check(j) })).filter((x) => x.v.verified);
  const pick = verifiedOnes.length
    ? verifiedOnes.reduce((a, b) => (b.j.heightCm > a.j.heightCm ? b : a))
    : (() => { const j = valid.reduce((a, b) => (b.heightCm > a.heightCm ? b : a)); return { j, v: check(j) }; })();
  return {
    type: 'cmj',
    heightCm: pick.j.heightCm,
    plusMinusCm: pick.j.heightSdCm != null ? Math.round(1.96 * pick.j.heightSdCm * 10) / 10 : t5.heightPlusMinusCm,
    verified: pick.v.verified, blocks: pick.v.blocks, source: ctx.source, fps: t5.poseFps, trust: ctx.trust ?? null, rsi: null,
  };
}

/** Every record a T5 read gives: the jump ('cmj'), and when the jumps rebounded, the repeated-jump record (RSI). */
export function jumpRecords(t5: T5Extra, ctx: { source: 'live' | 'slowmo'; trust?: TrustLevelHook | null }): JumpRecord[] {
  const cmj = bestJumpRecord(t5, ctx);
  if (!cmj) return [];
  const rb = t5.rebounds;
  if (!rb?.bestRsi) return [cmj];
  const best = rb.rebounds.reduce((a, b) => (b.rsi > a.rsi ? b : a));
  const j = t5.jumps.find((x) => x.index === best.to)!;
  const v = verifyJump(j, { poseHz: t5.poseFps, source: ctx.source, trust: ctx.trust ?? null });
  return [cmj, {
    type: 'repeated', heightCm: j.heightCm, plusMinusCm: j.heightSdCm != null ? Math.round(1.96 * j.heightSdCm * 10) / 10 : null,
    verified: v.verified, blocks: v.blocks, source: ctx.source, fps: t5.poseFps, trust: ctx.trust ?? null, rsi: rb.bestRsi,
  }];
}
