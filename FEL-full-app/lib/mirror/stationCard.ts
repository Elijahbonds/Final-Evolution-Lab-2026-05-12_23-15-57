// stationCard — what the Movement Screen's per-station result card says (MIRROR-COACH P3, 2026-09-26). Pure.
//
// One card per station the camera graded, one row per camera check: the value with its unit (labelled estimated), the
// status in three words — Pass / Flagged for a closer look / Not read — one FIX line under a flag, and under a check
// the camera could not read, what happens next: its ONE retest while that is pending, and "kept as not read, never as a
// pass" once it is spent or declined. A station with no camera check (the breath answers, a coach's hands-on check)
// has no card here: the camera does not grade it (lib/mirror/selfReport.ts says what those stations say).
import { screenFor, type ScreenId } from './screen';
import { fixFor } from './screenCorrectives';
import type { StationRecord } from './screenRunner';
import { formatGradeValue, type GradeStatus, type StationGrade } from './stationGraders';

export const STATUS_LABEL: Record<GradeStatus, string> = {
  pass: 'Pass',
  flag: 'Flagged for a closer look',
  unreadable: 'Not read',
};

/** Said under a check the camera could not read while its station's one retest is pending or running. */
export const RETEST_OFFER = 'Retest this station — it runs once more, then the screen moves on.';
/** …after the retest also could not read it. */
export const NOT_READ_AFTER_RETEST = 'Not read after one retest — kept as not read, never as a pass.';
/** …when the retest was skipped. */
export const NOT_READ_SKIPPED = 'Kept as not read, never as a pass.';

export interface CardRow {
  checkId: string;
  label: string;
  status: GradeStatus;
  statusLabel: string;
  /** The value in words with its unit, or the reason it was not read. */
  value: string;
  /** One FIX line, under a flag only. */
  fix: string | null;
  /** Under a not-read check only: the retest offer, or what was kept. */
  retest: string | null;
}

export interface StationCardModel {
  stationId: string;
  stationIndex: number;
  title: string;
  attempts: number;
  retesting: boolean;
  rows: CardRow[];
}

function rowFor(g: StationGrade, label: string, rec: StationRecord): CardRow {
  return {
    checkId: g.checkId,
    label,
    status: g.status,
    statusLabel: STATUS_LABEL[g.status],
    value: g.status === 'unreadable' ? g.note : formatGradeValue(g),
    // fixFor, not screen.ts fixLine (MIRROR-COACH P3 review, 2026-09-26): the hip-level FIX works "the low side" and the
    // grade's side is the HIGHER hip, so the card now says which side is low, as the next-steps card and the coach do
    fix: g.status === 'flag' ? fixFor(g.checkId, g.side) : null,
    retest: g.status !== 'unreadable' ? null
      : rec.retesting ? RETEST_OFFER
      : rec.attempts >= 2 ? NOT_READ_AFTER_RETEST
      : NOT_READ_SKIPPED,
  };
}

/** The card for one graded station, or null for a station the camera does not grade. */
export function stationCard(screen: ScreenId, rec: StationRecord): StationCardModel | null {
  if (!rec.grades.length) return null;
  const stations = screenFor(screen);
  const st = stations[rec.stationIndex];
  const labelOf = (id: string) => st?.checks.find((c) => c.id === id)?.label ?? id;
  const leg = st?.stance ? ` · ${st.stance} leg` : '';
  const what = st ? st.checks.filter((c) => c.source === 'camera').map((c) => c.label).join(', ') : rec.stationId;
  return {
    stationId: rec.stationId,
    stationIndex: rec.stationIndex,
    title: `Station ${rec.stationIndex + 1} of ${stations.length} · ${what}${leg}`,
    attempts: rec.attempts,
    retesting: rec.retesting,
    rows: rec.grades.map((g) => rowFor(g, labelOf(g.checkId), rec)),
  };
}

export function stationCards(screen: ScreenId, recs: readonly StationRecord[]): StationCardModel[] {
  return recs.map((r) => stationCard(screen, r)).filter((c): c is StationCardModel => c !== null);
}
