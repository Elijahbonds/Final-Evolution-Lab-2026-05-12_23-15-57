// door — every measuring tool's ONE door and ONE name (TOOLS-EASY, 2026-10-28; owner: "All tools need to be accessible,
// easy to use"). Train's Measure group is the hub: each tool is one row there, in this order, under this name, and the
// tool's own page carries the same name. VERTICAL-EASY (lib/vertical/door.ts) and SCREEN-EASY (lib/screen-easy/door.ts)
// own their two doors; this lists them beside the rest.
//
// Written as literals so lib/nav/reachability.test.ts, which reads link literals, sees them.
import { MEASURE_VERTICAL_HREF } from '@/lib/vertical/door';
import { FULL_SCREEN_HREF } from '@/lib/screen-easy/door';
import { MEASURE_VERTICAL } from '@/lib/vertical/copy';

export const JUMP_TESTS_HREF = '/train/jumps';
export const READINESS_HREF = '/train/readiness';
export const SPRINT_HREF = '/train/speed';
export const BAR_SPEED_HREF = '/train/velocity';
/** The Mirror opens on its squat coach from Train (it opened on Press / Row: one tap more to the coach most people want). */
export const MIRROR_HREF = '/play/mirror?pattern=squat';

export const JUMP_TESTS = 'Jump tests';
export const JUMP_TESTS_LEDE = 'Squat jump, one leg, 10-5 rebound jumps and the drop jump. Filmed and read on this phone.';
export const JUMP_TESTS_ADULTS_ONLY = 'The jump tests are for 18 and over for now.';

export interface ToolDoor { id: string; name: string; href: string }

/** The Measure hub, in order (solo first-use first; the coach-run combine and form review live with the coach). */
export const MEASURE_TOOLS: readonly ToolDoor[] = [
  { id: 'vertical', name: MEASURE_VERTICAL, href: MEASURE_VERTICAL_HREF },
  { id: 'screen', name: 'Screen my movement', href: FULL_SCREEN_HREF },
  { id: 'jumps', name: JUMP_TESTS, href: JUMP_TESTS_HREF },
  { id: 'readiness', name: 'Readiness check', href: READINESS_HREF },
  { id: 'sprint', name: 'Sprint speed', href: SPRINT_HREF },
  { id: 'velocity', name: 'Bar speed', href: BAR_SPEED_HREF },
  { id: 'mirror', name: 'The Mirror', href: MIRROR_HREF },
];
