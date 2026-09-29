// thresholds — a thin re-export (SCREEN-SHIP, 2026-09-29).
//
// Every number Mirror Assess scores with now lives in ONE file, lib/screen/PROPOSED-thresholds.ts: PROPOSED, pending
// Elijah (NASM-CES/PES) approval, NOT FINAL, nothing signed off. This module keeps PR #20's import path for its
// importers; it holds no value of its own (lib/screen/literals.test.ts checks that no threshold literal lives outside
// the PROPOSED file).
export {
  THRESHOLDS_VERSION, PROTOCOL_VERSION, THRESHOLDS, THRESHOLD_IDS, PROVISIONAL_LABEL, PREVIEW_LINE,
  th, bandOf, bands3Of, bandWordOf, isProvisional,
  type Band, type Bands3, type BandWord, type Threshold, type ThresholdId, type ThresholdSource,
} from '@/lib/screen/PROPOSED-thresholds';
