// landingCheckSave — the Quick Screen's landing check, stored for a verified adult who opted in, where P8's jump gate
// reads it (lane/drills round 3, 2026-10-07; owner decision: keep the jump gate, and "do the landing check to unlock").
//
// WHY THIS EXISTS. The jump gate opens only with a landing check on file: a WorkoutScan of kind 'mirror_assessment' whose
// T5 landing numbers pass (lib/coach/protocolGate.ts landingReadOf / landingCheck, read by protocolGateServer.ts). The
// only writer of that kind is POST /api/mirror/assessment, built with the Quick Screen (PR #20) and never called by it:
// so no landing check ever reached the gate, and every adult's jumps waited for one they could not give.
//
// WHAT IT SENDS, AND FOR WHOM. The same rule, read the same way, as the screen's existing adult save
// (lib/privacy/screenHistoryClient.ts maybeSaveAdultScreen, AB-04):
//   · an under-18 / "rather not say" run (`kid`) sends NOTHING — no request at all, the status question included;
//   · otherwise the server is asked (GET /api/account/scan-save) and the record goes only when it answers
//     verifiedAdult AND optedIn (lib/privacy/scanSaveGate canSaveScanNumbers); the route asks that again itself, before
//     any read or write (403 scan_save_adults_only for anyone else);
//   · a run that stopped for pain sends nothing (the route refuses it too: 422);
//   · only the LANDING record: the run's T5, through lib/assess/prqWrite.ts toRecord (named numbers only — heights,
//     flight times, the landing's knee angles, counts, the device's frame rate), checked by postAssessment for anything
//     media-shaped before it leaves the page. Never a frame, an image, a landmark or a skeleton. The other tests of a
//     full screen stay where they were (this tab, and the re-screen save of check bands).
// The route also writes the T5's camera-estimate PRQ power axis for that adult (prqWritesFor: the best valid jump) —
// what the route was built to do with a stored screen.
//
// Outside lib/screen and the assess components on purpose, as screenHistoryClient is: those trees are scanned for any
// network call (lib/screen/no-save.test.ts). Kids never reach a request here.
import { deviceClass } from '@/lib/pose/modelChoice';
import { postAssessment, toRecord, type FetchLike, type RecordDevice } from '@/lib/assess/prqWrite';
import type { TestResult } from '@/lib/assess/scoring';
import type { Side } from '@/lib/assess/protocol';

/** Where the server answers "verified adult, opted in?" (the AB-04 status route). */
export const SCAN_SAVE_STATUS_PATH = '/api/account/scan-save';

export type LandingSaveOutcome = 'kid' | 'no-landing' | 'pain' | 'not-allowed' | 'saved' | 'refused' | 'failed';

/** A fresh record id the route accepts (8–64 of [A-Za-z0-9_-]). */
export function landingRecordId(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 20; i++) s += Math.floor(rand() * 36).toString(36);
  return `landing-${s}`;
}

/** The device line for the record, from what the page knows (its pose service status, the runner's count). */
export function landingDevice(o: {
  userAgent?: string; maxTouchPoints?: number; uaMobile?: boolean;
  model: 'lite' | 'full' | null; poseHz: number; cameraFps: number | null; width: number; height: number;
}): RecordDevice {
  const cls = deviceClass({ userAgent: o.userAgent ?? '', maxTouchPoints: o.maxTouchPoints, uaMobile: o.uaMobile });
  const clamp = (n: number, hi: number) => (Number.isFinite(n) ? Math.max(0, Math.min(hi, n)) : 0);
  return {
    class: cls, model: o.model, poseHz: clamp(o.poseHz, 240),
    cameraFps: o.cameraFps === null || !Number.isFinite(o.cameraFps) ? null : clamp(o.cameraFps, 240),
    width: Math.round(clamp(o.width, 8192)), height: Math.round(clamp(o.height, 8192)),
  };
}

/**
 * After a finished run: store its landing check for a verified, opted-in adult. `kid` is the screen's own age answer
 * (keepResult === 'kid'): true returns before ANY request.
 */
export async function maybeSaveLandingCheck(
  run: { kid: boolean; tests: readonly TestResult[]; takeoffLeg: Side | null; pain?: boolean },
  device: RecordDevice,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  o: { id?: string; now?: Date } = {},
): Promise<LandingSaveOutcome> {
  if (run.kid) return 'kid';
  if (run.pain || run.tests.some((t) => t.status === 'painStop')) return 'pain';
  const t5 = run.tests.find((t) => t.id === 'T5');
  if (!t5 || t5.status === 'skipped' || t5.status === 'notBuilt') return 'no-landing';
  try {
    const status = await (fetchImpl as unknown as typeof fetch)(SCAN_SAVE_STATUS_PATH);
    if (!status.ok) return 'not-allowed';
    const j = (await status.json()) as { verifiedAdult?: unknown; optedIn?: unknown };
    if (j.verifiedAdult !== true || j.optedIn !== true) return 'not-allowed';
    const record = toRecord({
      assessmentId: o.id ?? landingRecordId(), mode: 'quick', measuredAt: o.now ?? new Date(), device,
      takeoffLeg: run.takeoffLeg, tests: [t5], mqs: null,
    });
    const res = await postAssessment(record, fetchImpl);
    return res.status >= 200 && res.status < 300 ? 'saved' : 'refused';
  } catch {
    return 'failed';   // the result stays on this device, as it always did
  }
}
