// PROPOSED-jump — the jump tool's register (JUMP-PRO, 2026-10-24): when a trial is less than lab-grade, when a jump
// is verified, and when a change is real.
//
// PROPOSED — pending Elijah. NOT FINAL. Every entry is TUNE and unsigned until the PJF pilot (force-plate) data; the
// sources say where each starting value came from. Its own file, like lib/screen/PROPOSED-trust.ts, so
// lib/screen/PROPOSED-thresholds.ts (and its pinned THRESHOLDS_VERSION) is untouched; a reused screen gate is READ
// from there (th()), never copied.
//
// Pure data.
import { th } from '@/lib/screen/PROPOSED-thresholds';

export const JUMP_REGISTER_VERSION = 'jump-0.1-proposed';

export type JumpSource =
  | 'bench-2026-10-24'          // measured on lib/jump/bench.ts (synthetic ground truth; see docs/JUMP-PRO.md)
  | 'benchmark-2026-10-24'      // the competitor/literature benchmark (scratchpad round7 competitors.md, cited there)
  | 'reuses-screen-gate'        // a screen gate, read from PROPOSED-thresholds
  | 'lane-guess';               // a starting guess, labelled as one

export interface JumpEntry { value: number; tune: true; signedOff: false; source: JumpSource; label: string }
const e = (value: number, source: JumpSource, label: string): JumpEntry => ({ value, tune: true, signedOff: false, source, label });

export const JUMP = {
  'jump.landedLowCm': e(5, 'benchmark-2026-10-24',
    'Landed this much lower (cm, hips at touch-down vs take-off) AND beyond 2 SD of its own read: a flexed or flat-foot landing. The height is corrected; the trial is not verified and gets the landing tip. ≈ the benchmark\'s "~15° more knee flexion than at take-off" (an assumption there too)'),
  'jump.unclearSdCm': e(3, 'bench-2026-10-24',
    'A trial whose own ±1 SD is wider than this (cm) was read through blur or occlusion: kept, never verified, and the tip asks for light and the whole body in the shot. Bench: realistic noise 0.5–1.5 cm; motion blur 2–4 cm'),
  'jump.verifiedSdCm': e(1.5, 'bench-2026-10-24', 'A verified live jump\'s ±1 SD is at most this (cm)'),
  'jump.verifiedFps': e(th('gate.jumpFps') as number, 'reuses-screen-gate', 'A verified live jump was timed at this pose rate or more (the screen\'s jump gate)'),
  'jump.labFps': e(120, 'benchmark-2026-10-24', 'At or over this frame rate the read is lab-grade, not an "estimate" (benchmark target 3: live under 120 fps is flagged as an estimate)'),
  'jump.outlierPct': e(15, 'lane-guess', 'With 3+ jumps, one this far (%) above the others\' median is an outlier: shown, never the verified best'),
  'jump.bioCvPct': e(3, 'benchmark-2026-10-24', 'The body\'s own jump-to-jump CV (%) a session\'s typical error never goes under (published CMJ test–retest ≈ 2.5–5 %)'),
  'jump.realChangeZ': e(1.645, 'lane-guess', 'z of the smallest real change between two sessions (1.645 = 90 % sure the change is not noise)'),
} as const satisfies Record<string, JumpEntry>;

export type JumpId = keyof typeof JUMP;
export const JUMP_IDS = Object.keys(JUMP) as JumpId[];
/** A register value, by id. */
export const jr = (id: JumpId): number => JUMP[id].value;
