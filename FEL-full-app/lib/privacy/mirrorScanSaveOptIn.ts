// lib/privacy/mirrorScanSaveOptIn.ts — the Mirror's in-page scan-save opt-in (#326, cursor-bundle-2, 2026-10-24).
//
// The Mirror page (app/play/mirror/page.tsx) hands the harness two server answers, both read from the DATABASE's
// User.dobYear and never from the session, a cookie or a request body:
//   · canSaveScan      — canSaveScanNumbers: verified 18+ AND already opted in (lib/privacy/scanSaveGate.ts);
//   · scanSaveEligible — verifiedAdult(dobYear): verified 18+ (the strict `> 18` year gap, lib/age/ageRules.ts).
//
// TEENS NEVER SEE THE OFFER. A 13–17 account (a guardian's yes included: this module takes no consent at all — the
// coach loop's guardian-approved TRAINING saves, lib/coach/teenGate.ts, do not reach Mirror scans), an unknown age and an
// exactly-18-by-year account all arrive with scanSaveEligible false, so the card is not offered and nothing this page
// does can turn its saves on. The server holds the same line twice more: POST /api/account/scan-save refuses a grant
// from anyone but a verified adult (lib/privacy/scanSaveRecord.ts setScanSaveGranted → 403), and every /api/mirror/*
// write runs canSaveScanNumbers itself. tests/mirror-no-save/mirror-opt-in-teen.test.ts pins all three layers.
//
// Pure and import-free: the harness is a client component.

export interface MirrorScanSaveInput {
  /** canSaveScanNumbers, asked on the server: verified 18+ and already opted in. */
  canSaveScan: boolean;
  /** verifiedAdult(User.dobYear), asked on the server. */
  scanSaveEligible: boolean;
}

/** Is the opt-in card offered on the Mirror? Only to a verified adult who has not opted in yet. */
export function mirrorScanSaveOffered({ canSaveScan, scanSaveEligible }: MirrorScanSaveInput): boolean {
  return scanSaveEligible === true && canSaveScan !== true;
}

/**
 * Do this page's Mirror results go to /api/mirror/*? Already opted in, or a verified adult whose grant the SERVER has
 * confirmed from this page (`grantedHere` is set only after POST /api/account/scan-save answered ok — a ticked box that
 * has not been confirmed sends nothing).
 */
export function mirrorCanSave({ canSaveScan, scanSaveEligible, grantedHere }: MirrorScanSaveInput & { grantedHere: boolean }): boolean {
  if (canSaveScan === true) return true;
  return scanSaveEligible === true && grantedHere === true;
}
