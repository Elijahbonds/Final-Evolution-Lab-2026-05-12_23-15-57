// PROPOSED-trust — the trust rating's register (MIRROR-TRUST-RATING §6): how clearly the camera saw each measure.
//
// PROPOSED — pending Elijah. NOT FINAL. Every entry is TUNE and unsigned. The lines that reuse a screen gate READ it from
// lib/screen/PROPOSED-thresholds.ts (th()), never copy it. The lane's starting guesses are labelled as guesses, not cited.
// Sign-off is the same as PROPOSED-thresholds: Elijah changes a value, sets signedOff and bumps TRUST_VERSION.
// This register is its own file so PROPOSED-thresholds.ts (and its pinned THRESHOLDS_VERSION) is untouched.
//
// Pure data: no DOM, no network, no storage.
import { th, type ThresholdId } from './PROPOSED-thresholds';

export const TRUST_VERSION = 'trust-0.1-proposed';

export type TrustSource =
  | 'spec-TUNE-EJ' | 'repo-TUNE(elijah)'   // a reused screen gate, read from the PROPOSED thresholds
  | 'lane-guess-unsourced'                 // a starting guess (PM call, Elijah can overrule), until the pilot data
  | 'pjf-protocol-2026-10-23 [S3]'         // the multiphone capture protocol §1: 240 Hz flight-time error negligible
  | 'ui-only';                             // display only, rates nothing

export interface TrustEntry {
  value: number;
  tune: true;
  signedOff: false;
  source: TrustSource;
  label: string;
  /** For a reused gate: the register entry it reads. */
  reuses?: ThresholdId;
}

const reuse = (id: ThresholdId, label: string): TrustEntry => ({
  value: th(id) as number, tune: true, signedOff: false,
  source: id === 'gate.minConfidence' || id === 'gate.minPoseHz' ? 'repo-TUNE(elijah)' : 'spec-TUNE-EJ', label, reuses: id,
});
const guess = (value: number, label: string): TrustEntry => ({ value, tune: true, signedOff: false, source: 'lane-guess-unsourced', label });

export const TRUST = {
  'trust.visHigh': reuse('gate.visibilityScoring', 'Check-joint visibility at or over this line can be High'),
  'trust.visMedium': reuse('gate.visibility', 'Check-joint visibility at or over this line can be Medium; under it is Low'),
  'trust.confHigh': guess(0.8, 'Share of frames read (and the test confidence) at or over this line can be High (PM 2026-10-23: 0.8)'),
  'trust.confMedium': reuse('gate.minConfidence', 'Share of frames read at or over this line can be Medium; under it is Low'),
  'trust.framingBadHigh': guess(0.1, 'Share of frames with a framing issue at or under this line can be High (PM 2026-10-23: 0.1)'),
  'trust.framingBadMedium': guess(0.3, 'Share of frames with a framing issue at or under this line can be Medium; over it is Low (PM 2026-10-23: 0.3)'),
  'trust.poseHzMedium': reuse('gate.minPoseHz', 'Pose frames per second under this line are Low'),
  'trust.jumpFpsMedium': reuse('gate.jumpFps', 'Jump pose rate under this line is Low'),
  'trust.jumpHighFps': { value: 240, tune: true, signedOff: false, source: 'pjf-protocol-2026-10-23 [S3]', label: 'Jump height is High only at or over this frame rate (PM 2026-10-23: kept until the pilot data)' },
  'trust.reasonsShown': { value: 2, tune: true, signedOff: false, source: 'ui-only', label: 'How many reasons a card shows (all are kept)' },
} as const satisfies Record<string, TrustEntry>;

export type TrustId = keyof typeof TRUST;
export const TRUST_IDS = Object.keys(TRUST) as TrustId[];

/** A trust line's value, by id. */
export const tr = (id: TrustId): number => TRUST[id].value;
