// liveMovements — the Mirror's live movements, for the pages that send someone to them (MIRROR-FIRST P1, 2026-10-07).
//
// The coach's Form Check tab promised "Upload your video… Coming in the next update" and a "Future release" AI form
// analysis. The Mirror already IS the live form check, on the athlete's own camera, with nothing uploaded — so Form Check
// now links into it, one link per movement the Mirror runs today (the harness's tabs: app/play/mirror/_components/
// mirror-harness.tsx PATTERN_SHORT; liveMovements.test.ts holds the two lists together).
//
// The address carries `?pattern=<id>`, the one plan Phase 2 reads to open that tab (edu-links builds its "Check it on
// camera" links the same way). Until Phase 2 lands the Mirror opens on its first tab, so every link also names the tab
// to pick — a line that stays true after it.
//
// Pure data. What each line says is what the harness does today, in the Mirror's own words (estimated, never measured).

/** The Mirror's live tabs, by the harness's own keys. */
export type LiveMirrorPattern = 'squat' | 'lunge' | 'pressRow' | 'jump' | 'screen';

export interface LiveMovement {
  id: LiveMirrorPattern;
  /** The tab's own short label in the Mirror's picker. */
  tab: string;
  title: string;
  /** What the camera reads, in one line. */
  reads: string;
}

export const MIRROR_PATH = '/play/mirror';

export const MIRROR_LIVE_MOVEMENTS: readonly LiveMovement[] = [
  {
    id: 'squat', tab: 'Squat', title: 'Corrective Squat',
    reads: 'Breathe first, then a movement check and a work set. Knees, heels, shoulders and weight are read every rep, and the coach cues as you go.',
  },
  {
    id: 'lunge', tab: 'Lunge', title: 'Lunge',
    reads: 'Each leg forward in turn, read the same five ways, and the two sides compared in the review.',
  },
  {
    id: 'pressRow', tab: 'Press / Row', title: 'Split-Stance Press / Row',
    reads: 'Elbow flare, shrug and trunk read on every rep, with spoken cues, and estimated engagement for five zones.',
  },
  {
    id: 'jump', tab: 'Jump', title: 'Vertical Jump',
    reads: 'Your jump, estimated from flight time, and your best to beat.',
  },
  {
    id: 'screen', tab: 'Screen', title: 'Movement Screen',
    reads: 'A guided screen: six stations in about two minutes, each read as it finishes, then what to work on.',
  },
];

/** The Mirror on this movement's tab (once plan Phase 2 reads `?pattern=`; the Mirror's first tab until then). */
export const mirrorMovementHref = (id: LiveMirrorPattern): string => `${MIRROR_PATH}?pattern=${id}`;
