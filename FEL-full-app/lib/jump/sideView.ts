// sideView — the side-on jumps (approach, drop) as the jump check's session card reads them, and a side-on video's
// clock (JUMP-PRO 2, 2026-10-25).
//
//   analyseSideClip   a picked video's frames → its approach jumps or its drop jump, at the file's REAL rate: as the
//                     slow-mo reader does (lib/jump/slowmo.ts), each stretch a phone's share sheet uses (1, 2, 4, 8) is
//                     tried and gravity decides — a stretched clip falls k² too slowly against the body's own legs, so
//                     only the right clock has a jump that falls like one (the readers' own ruler check)
//   asSessionT5       either read as the T5Extra components/jump/jump-session-card.tsx draws: every jump with its ±,
//                     the flags, mean ± SD, the real-change line, the verified mark; a drop jump's contact and RSI ride
//                     in `rebounds`, as the jump check's repeated jumps do
//
// Pure.
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { JumpRead, T5Extra } from '@/lib/assess/scoring';
import { poseHz } from '@/lib/assess/scoring';
import { th } from '@/lib/assess/thresholds';
import { readApproach, type ApproachJump, type ApproachRead } from './approach';
import { readDrop, type DropJump, type DropRead } from './drop';
import { sessionStats } from './session';
import { STRETCHES } from './slowmo';

export type SideKind = 'approach' | 'drop';
export type SideResult =
  | { ok: true; kind: 'approach'; stretch: number; fps: number; read: ApproachRead; t5: T5Extra }
  | { ok: true; kind: 'drop'; stretch: number; fps: number; read: DropRead; t5: T5Extra }
  | { ok: false; why: string };

const rescale = (frames: readonly PoseFrame[], k: number): PoseFrame[] =>
  k === 1 ? [...frames] : frames.map((f) => ({ ...f, t: f.t / k, ...(f.arrive !== undefined ? { arrive: f.arrive / k } : {}) }));

const jumpRead = (j: { index: number; valid: boolean; invalidWhy?: string; flightMs: number; heightCm: number; takeoffT: number; landT: number; heightSdCm: number | null; quality: ApproachJump['quality'] }, method: 'refined' | 'frames'): JumpRead => ({
  index: j.index, valid: j.valid, ...(j.invalidWhy ? { invalidWhy: j.invalidWhy } : {}), flightMs: j.flightMs, heightCm: j.heightCm,
  takeoffT: j.takeoffT, landT: j.landT, landingFlex: null, landingValgus: { left: null, right: null }, landingSymMs: null, dipKneeFlex: null,
  method, heightSdCm: j.heightSdCm, quality: j.quality,
});

function t5Of(jumps: JumpRead[], fps: number, plusMinus: number | null): T5Extra {
  const valid = jumps.filter((j) => j.valid);
  const session = sessionStats(valid);
  const best = valid.reduce<JumpRead | null>((a, j) => (!a || j.heightCm > a.heightCm ? j : a), null);
  return {
    jumps, bestHeightCm: best?.heightCm ?? null, bestFlightMs: best?.flightMs ?? null, bestJump: best?.index ?? null,
    poseFps: fps, cameraFps: null, fpsLow: fps < th('gate.jumpFps'), heightPlusMinusCm: plusMinus,
    cvPct: session.cvPct, inconsistent: false, session,
  };
}

/** An approach read as the session card's T5Extra. */
export function approachAsT5(r: ApproachRead): T5Extra {
  const jumps = r.jumps.map((j) => jumpRead(j, j.method));
  const best = r.jumps.find((j) => j.index === r.bestIndex);
  return t5Of(jumps, r.poseFps, best?.plusMinusCm ?? null);
}

/** A drop read as the session card's T5Extra: each drop's rebound a jump, its contact and RSI a rebound. */
export function dropAsT5(r: DropRead): T5Extra {
  const jumps = r.drops.map((d: DropJump, i) => jumpRead({ ...d, index: i + 1 }, d.heightSdCm === null ? 'frames' : 'refined'));
  const rb = r.drops.flatMap((d, i) => (d.valid && d.rsi !== null ? [{ from: i + 1, to: i + 1, contactMs: d.contactMs, rsi: d.rsi, rsiFlight: Math.round((d.flightMs / d.contactMs) * 100) / 100 }] : []));
  const bestRb = rb.reduce<(typeof rb)[number] | null>((a, x) => (!a || x.rsi > a.rsi ? x : a), null);
  const best = r.drops.filter((d) => d.valid).reduce<DropJump | null>((a, d) => (!a || d.heightCm > a.heightCm ? d : a), null);
  return { ...t5Of(jumps, r.poseFps, best?.plusMinusCm ?? null), rebounds: { rebounds: rb, bestRsi: bestRb?.rsi ?? null, bestContactMs: bestRb?.contactMs ?? null, best5Rsi: null } };
}

/** A side-on clip's frames (t = the file's media time) → its jumps at the real rate. `aspect` = width ÷ height. */
export function analyseSideClip(fileFrames: readonly PoseFrame[], aspect: number, kind: SideKind): SideResult {
  if (fileFrames.filter((f) => f.present).length < 30) return { ok: false, why: 'The video did not show a body clearly enough. Film from the side, whole body in the shot.' };
  let lastWhy: string | null = null;
  for (const k of STRETCHES) {
    const frames = rescale(fileFrames, k);
    const fps = poseHz(frames);
    if (kind === 'approach') {
      const read = readApproach(frames, { aspect, poseHz: fps });
      if (read.jumps.some((j) => j.valid)) return { ok: true, kind, stretch: k, fps, read, t5: approachAsT5(read) };
      lastWhy = read.jumps[0]?.invalidWhy ?? lastWhy;
    } else {
      const read = readDrop(frames, { aspect, poseHz: fps });
      if (read.drops.some((d) => d.valid)) return { ok: true, kind, stretch: k, fps, read, t5: dropAsT5(read) };
      lastWhy = read.drops[0]?.invalidWhy ?? read.why ?? lastWhy;
    }
  }
  return {
    ok: false,
    why: kind === 'approach'
      ? `No approach jump was found${lastWhy ? ` (${lastWhy})` : ''}. Film from the side, the whole run-up and the jump in the shot.`
      : (lastWhy ? `No drop jump was read: ${lastWhy}.` : 'No drop jump was found. Stand on the box, step off, and jump the moment you land.'),
  };
}
