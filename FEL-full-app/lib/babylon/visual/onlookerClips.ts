// onlookerClips — the clips an onlooker can ever play (lane/improve-hoops, phase 3 of docs/IMPROVE-10-PHASE-AUDIT.md, 2026-11-22).
//
// An onlooker (visual/Onlookers.ts) asks its body for two clips and nothing else: `idle` (its start clip, and the clip it resumes on)
// and `cheer`. But it was spawned like a player: every clip in the scene's scope was solved onto it at spawn — about 217 on a hoops
// court, the whole hoops and dunk vocabulary — and on the phone tier that was 5–6 s of main thread per body (the CPU profile of the 1v1
// and 3v3 loads, scripts/probes/improve-hoops/loadprof.mjs), for two bodies standing on the boardwalk rail.
//
// The set below is every name those two requests can resolve to, so the body plays exactly the clip it played before: the request,
// each alias it falls through (CLIP_ALIASES: idle → idle_stand → guard, cheer → jump_up → jumpshot), the scope's resting loop (where a
// refused request lands, clipScope.scopeFallback) and its alias, and the captured clip standing in for any of them (OPPONENT_VARIANTS:
// an opponent's play goes through opponentMotion.variantFor). Knob `perf.onlookerClipsOnly` (1 = this set; 0 = every clip, as before).
import { CLIP_ALIASES } from '../anim/clipAliases';
import { scopeFallback, type ClipScope } from '../anim/clipScope';
import { OPPONENT_VARIANTS } from '../anim/opponentMotion';
import { feel } from '../../feel-panel/feel';

/** 1 = an onlooker builds only the clips it can play; 0 = every clip in scope, as before (shipped 0: FEEL-PANEL.md). */
export const ONLOOKER_CLIPS_ONLY = 0;
export const onlookerClipsOnly = (): boolean => feel('perf.onlookerClipsOnly', ONLOOKER_CLIPS_ONLY) >= 0.5;

/** What Onlookers asks its bodies to play. */
export const ONLOOKER_REQUESTS = ['idle', 'cheer'] as const;

/** Every clip name the requests can end on, for this scope: the closure under aliases and captured stand-ins. */
export function onlookerClipNames(scope: ClipScope | null, requests: readonly string[] = ONLOOKER_REQUESTS): Set<string> {
  const out = new Set<string>();
  const todo: string[] = [...requests, scopeFallback(scope)];
  while (todo.length) {
    const n = todo.pop()!;
    if (out.has(n)) continue;
    out.add(n);
    const alias = CLIP_ALIASES[n]?.[0]; if (alias) todo.push(alias);
    for (const v of OPPONENT_VARIANTS.get(n) ?? []) todo.push(v);
  }
  return out;
}

/** The spawn's clip filter for an onlooker in this scope, or undefined (every clip) with the knob off. */
export function onlookerClipFilter(scope: ClipScope | null): ((name: string) => boolean) | undefined {
  if (!onlookerClipsOnly()) return undefined;
  const names = onlookerClipNames(scope);
  console.info(`[FEL-LOAD] onlookers build their ${names.size} playable clips only (perf.onlookerClipsOnly)`);
  return (name) => names.has(name);
}
