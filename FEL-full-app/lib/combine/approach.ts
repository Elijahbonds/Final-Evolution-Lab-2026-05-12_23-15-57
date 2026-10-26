// lib/combine/approach.ts — COMBINE-DAY (2026-10-25): an approach-jump video's jumps as the station's attempts.
//
// The reading is JUMP-PRO 2's, unchanged: lib/jump/sideView.ts analyseSideClip reads the side-on clip at its real rate,
// lib/jump/reach.ts touchHeight turns a standing reach into the touch height. This only maps a read to attempts: each
// jump in the clip is one attempt (a jump the reader refused is a no-mark), with the touch height when this athlete's
// standing reach was read in this combine. No ± is passed on (no accuracy claims until the force-plate pilot).
//
// Pure.
import type { ApproachRead } from '@/lib/jump/approach';
import { touchHeight } from '@/lib/jump/reach';
import type { Reach } from './types';

const r1 = (x: number) => Math.round(x * 10) / 10;

export function approachAttempts(read: Pick<ApproachRead, 'jumps'>, reach: Reach | null | undefined, max: number): { value: number | null; touchCm: number | null }[] {
  return read.jumps.slice(0, Math.max(0, max)).map((j) => {
    if (!j.valid || !Number.isFinite(j.heightCm)) return { value: null, touchCm: null };
    const touch = reach ? touchHeight(j, reach) : null;
    return { value: r1(j.heightCm), touchCm: touch ? touch.touchCm : null };
  });
}
