// route — what /play/drills offers, and its addresses (Mirror & coaching plan Phase 6, "drills and warm-up by body",
// 2026-10-07; movement-play plan P9's missing route).
//
// THE FIRST SHELF IS THE PLAYBOOK'S CH. 5 AND CH. 6 (the brief: "start with the Playbook ch. 5 wake-up and ch. 6
// jump-and-land drills"). drills.ts holds eleven charts; the other six (ch. 7 SAQ, the approach rhythm from The Art of
// Dunking) stay off the route for now — they are written and tested, but nobody has run them on a camera in a room yet,
// and two of them (the T-drill's touches, the 3-step decel's cut) ask for more floor than the space check measures.
// assumption: "start with" means the route shows only these five; adding the rest is one line here.
//
// Pure: no DOM, no imports beyond the charts. The Playbook chapter href is spelled here (not lib/education/links.ts
// chapterHref) so the drills page does not pull the whole imported book into its bundle; tests/drills holds it to the
// course's real chapters.
import type { Drill } from './chart';
import { SCREEN_HOME } from '../screen/routes';
import { COUNTERMOVEMENT_GEOMETRY, POGO_BILATERAL, POGO_UNILATERAL, SAFE_LANDING, WAKE_UP, drillById } from './drills';

export const DRILLS_PATH = '/play/drills';
/** The query key that opens one drill: /play/drills?drill=<id>. */
export const DRILL_PARAM = 'drill';

/** The drills on the route, in the order the page lists them: the wake-up first, then chapter 6 in the book's order. */
export const ROUTE_DRILLS: readonly Drill[] = [WAKE_UP, COUNTERMOVEMENT_GEOMETRY, POGO_BILATERAL, POGO_UNILATERAL, SAFE_LANDING];

/** The drill a ?drill= value names, when the route offers it; null for anything else (an id off the shelf included). */
export function routeDrill(id: string | null | undefined): Drill | null {
  if (!id) return null;
  const d = drillById(id);
  return d && ROUTE_DRILLS.includes(d) ? d : null;
}

/** The address that opens a drill on the route (its detail, never the camera: the camera always waits for a tap). */
export function drillHref(id: string): string {
  return `${DRILLS_PATH}?${DRILL_PARAM}=${encodeURIComponent(id)}`;
}

/** The Playbook chapter a drill comes from (the reader's own address: app/education/playbook/[chapter]). */
export function drillChapterHref(d: Pick<Drill, 'source'>): string | null {
  return d.source.book === 'playbook' ? `/education/playbook/${d.source.chapter}` : null;
}

/** "Playbook ch. 6 · Drill 3: The Safe Landing Check" — where the drill is written, for the page. */
export function drillSourceLine(d: Pick<Drill, 'source'>): string {
  const book = d.source.book === 'playbook' ? 'Playbook' : 'The Art of Dunking';
  return `${book} ch. ${d.source.chapter} · ${d.source.section}`;
}

/** Minutes, rounded up, for the list ("10 min"). */
export function drillMinutes(d: Pick<Drill, 'phases'>): number {
  return Math.max(1, Math.ceil(d.phases.reduce((s, p) => s + p.durationSec, 0) / 60));
}

// ── the landing check (owner decision, 2026-10-07: keep the jump gate; offer "do the landing check to unlock") ─────────

/** Where the landing check starts: the Quick Screen's FRONT page, whose first button is the jump test (about a minute).
 *  Never a deep link past it: the screen's age question and grown-up step come first for every visitor. */
export const LANDING_CHECK_ENTRY = SCREEN_HOME;
export const LANDING_UNLOCK_LABEL = 'Do the 1-minute landing check to unlock';

/**
 * The unlock button is ON (lane/drills round 3, 2026-10-07). Until today no landing check could reach the gate: it reads
 * WorkoutScan kind 'mirror_assessment' (lib/coach/protocolGateServer.ts), whose only writer, POST /api/mirror/assessment,
 * nothing called. The Quick Screen now stores its T5 landing record there for a verified adult who opted in
 * (lib/privacy/landingCheckSave.ts; the route re-checks canSaveScanNumbers), so a passed landing check opens the gate for
 * LANDING_CHECK_WEEKS, and this page (force-dynamic, refreshed on return) shows the jumps unlocked.
 */
export const LANDING_UNLOCK_LIVE = true;
