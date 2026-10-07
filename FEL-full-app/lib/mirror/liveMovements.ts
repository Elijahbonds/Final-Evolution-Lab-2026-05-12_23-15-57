// liveMovements — the Mirror's live movements, for the pages that send someone to them (MIRROR-FIRST P1, 2026-10-07).
//
// The coach's Form Check tab promised "Upload your video… Coming in the next update" and a "Future release" AI form
// analysis. The Mirror already IS the live form check, on the athlete's own camera, with nothing uploaded — so Form Check
// now links into it, one link per movement the Mirror runs today (the harness's tabs: app/play/mirror/_components/
// mirror-harness.tsx PATTERN_SHORT; liveMovements.test.ts holds the two lists together).
//
// The address carries `?pattern=<id>`, which the Mirror reads to open that tab (MIRROR-MOVES P2, 2026-10-07:
// lib/mirror/patternParam.ts; edu-links builds its "Check it on camera" links the same way). Every link also names the
// tab, so a reader knows where it goes before tapping.
//
// MIRROR-MOVES P2: the hip hinge and the push-up are live tabs now (owner decision 2026-10-07, "both"), and the lunge
// speaks its cues — the lines below say so.
//
// Pure data. What each line says is what the harness does today, in the Mirror's own words (estimated, never measured).
import type { MirrorTab } from './patternParam';

/** The Mirror's live tabs, by the harness's own keys (patternParam.ts MIRROR_TABS — the one list). */
export type LiveMirrorPattern = MirrorTab;

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
    reads: 'Each leg forward in turn, read the same five ways, with spoken cues as you go, and the two sides compared in the review.',
  },
  {
    id: 'hinge', tab: 'Hinge', title: 'Hip Hinge',
    reads: 'Side-on: a short check, then a work set. Each rep is read for the head-to-hips line, how far the hips travel back against the knee, and the shin, with spoken cues between reps.',
  },
  {
    id: 'pushup', tab: 'Push-up', title: 'Push-up',
    reads: 'Phone on the floor, side-on: a short check, then a work set. Each rep is read for the body line, the hands, the head and the depth, with spoken cues between reps.',
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

/** The Mirror on this movement's tab (`?pattern=`, read by app/play/mirror/page.tsx — lib/mirror/patternParam.ts). */
export const mirrorMovementHref = (id: LiveMirrorPattern): string => `${MIRROR_PATH}?pattern=${id}`;
