// A stored Mirror screen row as app/api/mirror/screen writes it — for tests (MIRROR-COACH P3 review, 2026-09-26).
//
// Since the review, a row reads as server-graded only when it carries the server's evidence (`camera`) and its results
// are exactly what that evidence gives (lib/mirror/screenStore.ts isServerGradedScreen), and it is current data only when
// its OWN results clear the screen bar (lib/mirror/screenClaims.ts screenCoverage). Tests that built a row with
// `camera: []` beside results, or trusted a stored `provisional: false`, now build it here the way the route does.
//
// Pure: not imported by the app.
import { scoreScreen, type CheckResult, type ScreenId } from '../screen';
import { isScreenNotStation, screenCoverage, type RegradedCheck } from '../screenClaims';
import { storedScreen, type StoredScreen } from '../screenStore';
import { GRADER_UNIT, GRADER_VIEW, isGraderId } from '../stationGraders';

/** Server evidence that gives exactly these results: a flag per 'fail', a pass per 'stable' (borderline is pre-P3 only). */
export function evidenceFor(results: readonly CheckResult[]): RegradedCheck[] {
  return results.filter((r) => isGraderId(r.checkId) && r.grade !== 'borderline').map((r) => {
    const id = r.checkId as keyof typeof GRADER_UNIT;
    const status = r.grade === 'fail' ? 'flag' as const : 'pass' as const;
    return {
      checkId: id, status, value: status === 'flag' ? 0.2 : 0.01, unit: GRADER_UNIT[id], frames: 300, readableFrames: 300,
      note: status === 'flag' ? 'Flagged for a closer look.' : 'Read.', uncertainty: 0.005, spread: 0.02,
      ...(r.side ? { side: r.side } : {}), view: GRADER_VIEW[id], claimed: status,
    };
  });
}

/** The row the screen route stores for these results: server-graded, with its evidence, provisional as the route decides. */
export function serverRow(screenId: string, screen: ScreenId, results: readonly CheckResult[]): StoredScreen {
  return storedScreen(screenId, screen, results, scoreScreen(screen, results), {
    camera: evidenceFor(results), provisional: !isScreenNotStation(screenCoverage(screen, results)),
  });
}
