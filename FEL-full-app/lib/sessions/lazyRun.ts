/**
 * lib/sessions/lazyRun.ts — NB-4 (hoops grade 0d16f5dd), QA risk on #264: whether a game's server run waits for TAP TO START.
 * A lazy game asks for its run when the shared Babylon ModeHarness begins one (ready → playing, sessionStore.beginRun). Only
 * the Babylon harness ever calls beginRun, so the wait is armed only when the 3D engine is what loads for this mode: with
 * NEXT_PUBLIC_DISABLE_3D=1 (or a mode not on Babylon) the 2D / R3F fallback renders, nothing calls beginRun, and keying on
 * the mode name alone left the run unstarted (RUN_MISSING). Those games ask at mount, as before.
 */
import { isBabylon } from '@/components/three/flags';

/** The games whose server run starts at TAP TO START. The hoops family for now; other harness games can join once checked. */
export const LAZY_RUN_MODES: ReadonlySet<string> = new Set(['hoops1v1', 'hoops3v3', 'threePoint']);

/** Wait for the harness's beginRun: a lazy mode AND the Babylon engine is what this page loads for it. */
export function lazyRunFor(mode: string): boolean {
  return LAZY_RUN_MODES.has(mode) && isBabylon(mode);
}
