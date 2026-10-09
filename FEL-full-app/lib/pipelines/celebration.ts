// lib/pipelines/celebration.ts — PIPELINES (owner, 2026-10-06): the routine a player equipped from My Creations as a
// dunk celebration. Pure.
//
// "Equip" (components/creator/my-creations.tsx) stores a dance card's steps and BPM on the device
// (lib/modes/dance/active-routine.ts), and the toast promised "land a dunk to see it celebrate" — but nothing read it.
// This turns the equipped routine into a short clip chain a mode can play after a made dunk: the first few steps, each
// held for its own beats at the routine's tempo, capped so a celebration never outstays the replay. The DEFAULT
// celebration (nothing equipped) answers null, so a mode keeps its own celebrations unless the player chose one.
//
// The DunkMode wiring is ROUTED (improve-hoops / dunk-next): Dunk's clip scope refuses dance clips today
// (lib/babylon/anim/clipScope.ts SCOPES.dunk), so the dancer's clips must be registered on the dunk player's skeleton
// (registerDanceClips + registerMirroredClips, as DanceMode does) and `dance` borrowed into that scope before the chain
// can play — animation work for the lane that owns that rig.

import { DEFAULT_CELEBRATION, type EquippedRoutine } from '@/lib/modes/dance/active-routine';

export interface CelebStep { clip: string; mirrored: boolean; sec: number }

/** TUNED (new): at most four moves and four seconds — the length of the d-pad celebrations it stands in for. */
export const CELEB_MAX_STEPS = 4;
export const CELEB_MAX_SEC = 4;
const STEP_MIN_SEC = 0.3, STEP_MAX_SEC = 2;

const isDefault = (r: EquippedRoutine) => JSON.stringify(r.steps) === JSON.stringify(DEFAULT_CELEBRATION.steps);

/** The equipped routine as a clip chain, or null when nothing (or only the default) is equipped. */
export function celebrationChain(r: EquippedRoutine | null | undefined): CelebStep[] | null {
  if (!r || !Array.isArray(r.steps) || !r.steps.length || isDefault(r)) return null;
  const bpm = Number.isFinite(r.bpm) && r.bpm >= 40 && r.bpm <= 300 ? r.bpm : 100;
  const out: CelebStep[] = [];
  let total = 0;
  for (const s of [...r.steps].sort((a, b) => a.beat - b.beat)) {
    if (typeof s?.clipId !== 'string' || !/^dance_[a-z0-9_]{1,40}$/.test(s.clipId)) continue;
    const sec = Math.min(STEP_MAX_SEC, Math.max(STEP_MIN_SEC, ((Number(s.holdBeats) || 1) * 60) / bpm));
    if (out.length >= CELEB_MAX_STEPS || total + sec > CELEB_MAX_SEC) break;
    out.push({ clip: s.mirrored ? `${s.clipId}.M` : s.clipId, mirrored: !!s.mirrored, sec });
    total += sec;
  }
  return out.length ? out : null;
}

/**
 * Play a chain: each step's clip, then the next after its seconds, then `done`. `play` returns false when the body
 * cannot play that clip (refused, not registered): the chain then stops and hands back to `done` at once, so a missing
 * clip never leaves the body frozen. Returns a cancel function.
 */
export function playChain(
  chain: readonly CelebStep[], play: (clip: string) => boolean, done: () => void,
  schedule: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
): () => void {
  let live = true;
  const step = (i: number) => {
    if (!live) return;
    if (i >= chain.length || !play(chain[i].clip)) { live = false; done(); return; }
    schedule(() => step(i + 1), chain[i].sec * 1000);
  };
  step(0);
  return () => { live = false; };
}
