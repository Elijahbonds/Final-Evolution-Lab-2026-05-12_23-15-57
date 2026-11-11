// EVERY-SCREEN phase 1, part B: the training and coaching jobs, as walks (scripts/every-screen/jobs.mts runs them).
//
// The fifteen jobs of the phase-1 brief, as three people. Where the same job exists on two paths (an athlete alone logs a
// set in a program the AI built; a coached client logs one in the coach's session) both are walked. Every label and
// selector here was read off the running app on 2026-11-10 (scripts/every-screen/explore.mts).
//
// A job that ends at a camera ends where a person has to step into the picture: `endsAt` says so. A job whose feature is
// switched off ends at the notice, and is "done" only if that notice offers a way on (the plan's gate: every switched-off
// feature says why and what to do instead).
import type { Job, Step } from './jobs.mts';

/** Home, then the Train tab: one tap. */
/** EVERY-SCREEN P4: two jump checks as the jump check keeps them on a phone (lib/jump/historyStore.ts HISTORY_KEY and its entry). */
const JUMP_HISTORY_KEY = 'fel.jump.history.v1';
const kept = (id: string, at: string, bestCm: number) => ({ id, at, test: 'check', bestCm, plusMinusCm: 3, jumps: 3, verified: false, manualFrames: false, source: 'live', fps: 30, rsi: null, contactMs: null, v0Mps: null, rsiMod: null });
const JUMP_KEPT = JSON.stringify([kept('rig-jump-2', '2026-11-10T17:00:00.000Z', 44), kept('rig-jump-1', '2026-11-03T17:00:00.000Z', 41)]);
const TRAIN: Step[] = [{ goto: '/play', say: 'home' }, { css: 'nav a[href="/train"]:visible', say: 'the Train tab' }];
/** The coach's own home: Train, then "Your roster". */
const COACH: Step[] = [...TRAIN, { tap: 'Your roster', expect: '[data-coach-clients]', say: 'Your roster' }];
const ASK = 'All I have is a band. Full body, 3 days a week.';
/** An athlete alone, already inside a session of the program the AI built (not counted: it is another job's ground). */
const IN_BUILT_SESSION: Step[] = [
  { goto: '/train/build', pre: true },
  { css: '[data-testid=program-ask-open]', ifPresent: true, pre: true },
  { fill: ['[data-testid=program-ask-input]', ASK], pre: true },
  { css: '[data-testid=program-ask-build]', expect: '[data-testid=program-view]', pre: true },
  { css: '[data-testid=program-start]', expect: '[data-session-player]', pre: true, say: 'Start today' },
];
/** A coached client, already inside today's session from the coach. */
const IN_COACH_SESSION: Step[] = [
  { goto: '/coach', pre: true, expect: '[data-testid=today-start]' },
  { css: '[data-testid=today-start]', expect: '[data-session-player]', pre: true, say: "Start today's session" },
];
const PRIMARY = '[data-player-primary] button';
const CAMERA = '/CAMERA CHECK|CAMERA SETUP|Step into|TAP TO START/';

export const JOBS: Job[] = [
  // ── EVERY-SCREEN P7: around the games. The plan: "pick a game → playing in ≤ 2 taps; results → play again in 1; a lobby
  //    always says what it is waiting for" ──
  {
    id: 'pick-game', who: 'solo', throttle: true, name: 'Pick a game on Play and start playing', planBudget: 'pick a game → playing in ≤ 2 taps (phase 7)',
    steps: [
      { goto: '/play', say: 'Play' },
      { tap: 'Flight Night', expect: '/TAP TO START/', within: 90, say: 'Flight Night (the arena loads)' },
      { tap: 'TAP TO START', gone: '[data-splash-column]', within: 20, say: 'Tap to start: playing' },
    ],
  },
  {
    id: 'host-lobby', who: 'solo', name: 'Host a game on a big screen: what the lobby says', planBudget: 'a lobby always says what it is waiting for (phase 7)',
    steps: [
      { goto: '/host', say: 'Host' },
      { tap: 'Start the screen', expect: '/waiting|join|code/i', within: 30, say: 'Start the screen: the lobby' },
    ],
    endsAt: 'the lobby: it waits for phones to join with its code',
  },
  {
    // the owner (2026-11-11): signed in with a birth date on file, the vertical test does not ask the age again. On the LIT
    // rig the birth date is kept (prisma/pending/2026-10-19-user-dob.sql applied); on the main rig, as in production today,
    // only the year is, and the question is asked
    id: 'open-signup-no-second-age', who: 'anon', lit: true, name: 'Sign up, then the vertical test (birth date on file)', planBudget: 'sign-up asks for nothing twice (phase 6; owner 2026-11-11)',
    steps: [
      { goto: '/signup', say: 'Create account' },
      { select: ['select[aria-label="Birth year"]', '1995'], say: 'birth year' },
      { fill: ['input[aria-label="Month"]', '6'], say: 'month' },
      { fill: ['input[aria-label="Day"]', '15'], say: 'day' },
      { tap: 'Continue', expect: 'input[type=email]', within: 20, say: 'Continue (then: what did you come for?)' },
      { fill: ['input[placeholder="Athlete name"]', 'Rig Newcomer'], say: 'athlete name' },
      { fill: ['input[type=email]', 'rig-new-{ts}@example.test'], say: 'email' },
      { fill: ['input[type=password]', 'rig-password-1'], say: 'password' },
      { css: 'label:has([data-terms-tick]) > span[aria-hidden]', say: 'I agree to the Terms of Service and Privacy Policy' },
      { tap: 'BEGIN EVOLUTION', expect: 'canvas', within: 60, say: 'Begin evolution' },
      { goto: '/play/mirror/assess?run=vertical', say: 'later: Measure my vertical' },
      { expect: '/Does anything hurt/', within: 30, say: 'no "How old are you?": straight to the pain question' },
    ],
  },
  // ── EVERY-SCREEN P6: a new person, signed out, on the throttled phone (CPU 4×, as the crawl): the plan's gate is "from
  //    the home page to doing something real (a game or a first workout) in ≤ 4 taps and under 60 s" ──
  {
    id: 'new-first-game', who: 'anon', throttle: true, name: 'New: from the home page to playing a game', planBudget: 'home → something real in ≤ 4 taps and under 60 s (phase 6)',
    steps: [
      { goto: '/', say: 'the home page' },
      { tap: 'Play now', expect: '[data-testid=guest-age-step]', within: 30, say: 'Play now' },
      { tap: 'Play without saving', expect: '/TAP TO START/', within: 90, say: 'Play without saving (the arena loads)' },
      { tap: 'TAP TO START', gone: '[data-splash-column]', within: 20, say: 'Tap to start: playing' },
    ],
  },
  {
    // the plan: "sign-up asks for nothing twice". The walk signs up, then opens the vertical test: what it is asked there
    // is in the phase-6 notes (docs/every-screen/JOBS-NOTES.md)
    id: 'new-signup', who: 'anon', throttle: true, name: 'New: sign up, then the vertical test', planBudget: 'sign-up asks for nothing twice (phase 6)',
    steps: [
      { goto: '/signup', say: 'Create account' },
      { select: ['select[aria-label="Birth year"]', '1995'], say: 'birth year' },
      { fill: ['input[aria-label="Month"]', '6'], say: 'month' },
      { fill: ['input[aria-label="Day"]', '15'], say: 'day' },
      { tap: 'Continue', expect: 'input[type=email]', within: 20, say: 'Continue' },
      { fill: ['input[placeholder="Athlete name"]', 'Rig Newcomer'], say: 'athlete name' },
      { fill: ['input[type=email]', 'rig-new-{ts}@example.test'], say: 'email' },
      { fill: ['input[type=password]', 'rig-password-1'], say: 'password' },
      { css: 'label:has([data-terms-tick]) > span[aria-hidden]', say: 'I agree to the Terms of Service and Privacy Policy (a real checkbox since phase 7)' },
      { tap: 'BEGIN EVOLUTION', expect: 'canvas', within: 60, say: 'Begin evolution: into the first game picked (Flight Night)' },
      { goto: '/train', say: 'later: Train' },
      { css: 'a[href^="/play/mirror/assess"], a[href^="/screen"]', expect: '/How old are you|Does anything hurt|CAMERA/i', within: 30, say: 'Measure my vertical (Train): what it asks' },
    ],
  },
  {
    id: 'new-first-workout', who: 'anon', throttle: true, name: 'New: from the home page to a first workout (the vertical test)', planBudget: 'home → something real in ≤ 4 taps and under 60 s (phase 6)',
    steps: [
      { goto: '/', say: 'the home page' },
      { tap: 'Measure my vertical', expect: '/How old are you/', within: 30, say: 'Measure my vertical' },
      { tap: '18 or older', expect: '/Does anything hurt/', say: '18 or older' },
      { tap: 'No, nothing hurts', expect: CAMERA, within: 30, say: 'No, nothing hurts' },
    ],
    endsAt: 'the camera: the jumps need a person in front of it',
  },
  // ── an athlete training alone ──
  {
    id: 'solo-start-today', who: 'solo', name: "Start today's workout (today's drill)", planBudget: 'open app → first exercise in ≤ 2 taps and ≤ 10 s (phase 2)',
    steps: [...TRAIN, { tap: "Start today's drill", expect: '/Full-body wake-up|PRE-GAME/i', say: "Start today's drill" }, { tap: 'Start', expect: CAMERA, say: 'Start' }],
    endsAt: 'the drill is on camera: it needs a person in the picture',
  },
  {
    // EVERY-SCREEN P2: the athlete alone's "today", once a program is kept on this phone: Train's first card starts it
    id: 'solo-resume-program', who: 'solo', name: 'Start today\'s workout (a program kept on this phone)', planBudget: 'open app → first exercise in ≤ 2 taps and ≤ 10 s (phase 2)',
    steps: [...IN_BUILT_SESSION.map((x) => ({ ...x })), { goto: '/play', say: 'home', pre: false }, { css: 'nav a[href="/train"]:visible', say: 'the Train tab' },
      { css: '[data-resume-program]', expect: '[data-session-player]', say: 'Your program: Start today' }],
  },
  {
    id: 'solo-ask-builder', who: 'solo', name: 'Ask the AI builder for a program and start it', planBudget: 'ask → first rep in ≤ 4 taps (phase 3)',
    steps: [
      ...TRAIN, { tap: 'Build my program', expect: '[data-testid=program-builder]', say: 'Build my program' },
      // a program saved on the account opens folded (EVERY-SCREEN P4): "Change the ask" is then one more tap, counted
      { css: '[data-testid=program-ask-open]', ifPresent: true, say: 'Change the ask (only when a program is already saved)' },
      { fill: ['[data-testid=program-ask-input]', ASK], say: 'type the ask' },
      { css: '[data-testid=program-ask-build]', expect: '[data-testid=program-view]', say: 'Build it' },
      { css: '[data-testid=program-start]', expect: '[data-session-player]', say: 'Start today' },
      // EVERY-SCREEN P3: the ready count runs by itself (phase 2); the walk had pressed its quiet "Start now" as a fifth tap
      { expect: '[data-session-player][data-phase=work]', say: 'the ready count ends by itself: the first rep' },
    ],
  },
  {
    id: 'solo-change-one-thing', who: 'solo', name: 'Change one thing in the program the AI built, and start it', planBudget: 'change one thing without starting over; save, and start (phase 3)',
    steps: [
      { goto: '/train/build', pre: true },
      { css: '[data-testid=program-ask-open]', ifPresent: true, pre: true },
  { fill: ['[data-testid=program-ask-input]', ASK], pre: true },
      { css: '[data-testid=program-ask-build]', expect: '[data-testid=program-view]', pre: true },
      // EVERY-SCREEN P5: once a program is built, what FEL read is one line; "Change" opens the chips (a tap, counted)
      { css: '[data-testid=program-ask-open]', ifPresent: true, expect: '[data-chip=days]', say: 'Change (what FEL read, folded to one line)' },
      { css: '[data-chip=days] button[aria-label^="More"]', expect: '/4 days/', say: 'one more day a week (the days chip\'s +)' },
      { css: '[data-testid=program-start]', expect: '[data-session-player]', say: 'Start today' },
    ],
  },
  {
    id: 'solo-log-set', who: 'solo', name: 'Log a set (in the program the AI built)', planBudget: 'log a set in 1 tap (phase 2)',
    steps: [...IN_BUILT_SESSION, { expect: '[data-session-player][data-phase=work]', say: 'the ready count ends by itself' }, { css: PRIMARY, expect: '[data-session-player]:not([data-phase=work]), [data-session-player][data-set="2"]', say: 'Set done' }],
  },
  {
    id: 'solo-finish', who: 'solo', name: 'Finish a session (in the program the AI built)', planBudget: 'a 5-exercise session in ≤ 12 taps beyond the sets (phase 2)',
    steps: [...IN_BUILT_SESSION, { play: ['[data-session-player][data-phase=finish]', 200], say: 'every set, to the finish screen' }, { css: PRIMARY, expect: '/1 of \\d+ sessions done/', say: 'Back to the program' }],
  },
  {
    id: 'solo-test-jump', who: 'solo', name: 'Test a jump (measure my vertical)', planBudget: 'vertical in ≤ 3 taps (phase 4)',
    // EVERY-SCREEN P4: from the signed-in home, as the VERTICAL-EASY gate counts it (its "Measure my vertical" chip is on
    // Play and on Train): 3 taps. Through Train it is 4.
    steps: [{ goto: '/play', say: 'home' }, { css: '[data-testid=play-vertical-entry]', expect: '/How old are you/', say: 'Measure my vertical (on Play)' }, { tap: '18 or older', expect: '/Does anything hurt/', say: '18 or older' }, { tap: 'No, nothing hurts', expect: CAMERA, say: 'No, nothing hurts' }],
    endsAt: 'the camera: three jumps in front of it (the reading itself is measured on recorded jumps, not on this rig)',
  },
  {
    id: 'solo-movement-screen', who: 'solo', name: 'Run the movement screen', planBudget: 'movement screen in 3 taps and under 3 minutes (phase 4)',
    steps: [{ goto: '/play', say: 'home' }, { css: '[data-testid=play-screen-entry]', expect: '/How old are you/', say: 'Screen my movement (on Play)' }, { tap: '18 or older', expect: '/Does anything hurt/', say: '18 or older' }, { tap: 'No, nothing hurts', expect: CAMERA, say: 'No, nothing hurts' }],
    endsAt: 'the camera: four moves in front of it',
  },
  {
    id: 'solo-see-progress', who: 'solo', name: 'See progress', planBudget: 'progress number → its source in 1 tap (phase 4)',
    steps: [...TRAIN, { tap: 'My progress', expect: '/Your numbers over time/', say: 'My progress' }],
  },
  {
    id: 'solo-progress-source', who: 'solo', name: 'See where a progress number came from', planBudget: 'progress number → its source in 1 tap (phase 4)',
    // EVERY-SCREEN P4: the rig cannot jump in front of a camera, so the jump is put on the phone as the jump check keeps
    // it (lib/jump/historyStore.ts); then one tap on the row shows the tool, how it measures and how sure, and each
    // number's own test and time. The second tap opens that tool.
    steps: [
      { goto: '/train/progress', pre: true, say: 'My progress' },
      { seed: [JUMP_HISTORY_KEY, JUMP_KEPT], pre: true, expect: '[data-progress-row]', say: 'a jump kept on this phone (put there by the rig)' },
      { css: '[data-progress-row] button[aria-expanded]', expect: '[data-progress-trace] [data-progress-source]', say: 'the jump row: its source' },
      { css: '[data-progress-source]', expect: '/Jump tests/', say: 'Open the tool (Jump tests)' },
    ],
  },
  {
    id: 'solo-join-group', who: 'solo', name: 'Find and join a group', planBudget: 'join a group in ≤ 4 taps (phase 5)',
    steps: [{ goto: '/groups', say: 'the groups page (no door in the app yet: opened by its address, as from a shared link)' }, { expect: '[data-opens-soon-instead]', say: 'the switched-off notice offers a way on' }],
    endsAt: 'switched off until the group-booking tables are applied: the screen says so and offers what to do instead',
  },
  {
    id: 'solo-book-1on1', who: 'solo', name: 'Book a 1:1', planBudget: 'book a 1:1 in ≤ 5 taps (phase 5)',
    steps: [{ goto: '/groups', say: 'the groups page' }, { tap: 'Book a 1:1 session', expect: '/Book a session/', say: 'Book a 1:1 session' }, { expect: '[data-opens-soon-instead]', say: 'the switched-off notice offers a way on' }],
    endsAt: 'switched off until the group-booking tables are applied: the screen says so and offers what to do instead',
  },
  {
    id: 'solo-cancel-booking', who: 'solo', name: 'Cancel a booking', planBudget: 'cancel in ≤ 3 taps with the rule shown first (phase 5)',
    steps: [{ goto: '/groups', say: 'the groups page ("Your sessions" lives here once booking is on)' }, { expect: '[data-opens-soon-instead]', say: 'the switched-off notice offers a way on' }],
    endsAt: 'switched off: nothing can be booked, so there is nothing to cancel; the notice says what to do instead',
  },
  // ── EVERY-SCREEN P5: the booking jobs as they will be once the owner applies the group-booking SQL (the LIT rig,
  //    `jobs.mts --lit`: every pending file applied, the rig's coach as the business owner, one group seeded). The four
  //    walks above stay: they are the screens as production has them today ("Opens soon", and what to do instead). ──
  {
    id: 'open-join-group', who: 'solo', lit: true, name: 'Find and join a group (booking open)', planBudget: 'join a group in ≤ 4 taps (phase 5)',
    steps: [
      ...TRAIN, { css: 'a[href="/groups"]', expect: '[data-groups-browser]', say: 'Groups (on Train once booking is open)' },
      { css: '[data-action=join]', expect: '[data-buy-sheet]', say: 'Join (the 4-week package is picked)' },
      { css: '[data-buy-pay] [data-fel-primary], [data-buy-pay] button', expect: '[data-buy-done]', say: 'Reserve, pay at the gym' },
    ],
  },
  {
    id: 'open-book-1on1', who: 'solo', lit: true, name: 'Book a 1:1 (booking open)', planBudget: 'book a 1:1 in ≤ 5 taps (phase 5)',
    steps: [
      ...TRAIN, { css: 'a[href="/groups/one-on-one"]', expect: '[data-one-on-one]', say: 'Book a 1:1 session (on Train; in person is already picked)' },
      { css: '[data-gym]', expect: '[data-slot]', say: 'the gym' },
      { css: '[data-slot]', expect: '/Reserve, pay at the gym/', say: 'a time' },
      { tap: 'Reserve, pay at the gym', expect: '[data-booked]', say: 'Reserve, pay at the gym' },
    ],
  },
  {
    id: 'open-cancel-booking', who: 'solo', lit: true, name: 'Cancel a booking (booking open)', planBudget: 'cancel in ≤ 3 taps with the rule shown first (phase 5)',
    steps: [
      { goto: '/play', say: 'home' }, { css: 'nav a[href="/train"]:visible', expect: '[data-my-group-sessions] [data-cancel-rule]', say: 'the Train tab: your sessions, the cancel rule above them' },
      { css: '[data-my-group-sessions] [data-action=cancel]', expect: '[data-action=confirm-cancel]', say: 'Cancel (the button now says what it costs)' },
      { css: '[data-action=confirm-cancel]', expect: '/Cancelled/', say: 'Cancel free (or: counts as used)' },
    ],
  },
  {
    id: 'open-attendance', who: 'coach', lit: true, name: 'Take group attendance (booking open)', planBudget: 'attendance in ≤ 1 tap per person (phase 5)',
    steps: [
      ...COACH, { css: '[data-coach-tool=groups]', expect: '[data-roster] [data-mark=present]', say: "Groups: today's session opens on its roster" },
      { css: '[data-roster] [data-mark=present]', expect: '[data-roster] [data-mark=present][aria-pressed=true]', say: 'Present (one tap for Casey)' },
    ],
  },
  // ── a coached client ──
  {
    id: 'client-start-today', who: 'client', name: "Start today's workout (the coach's session)", planBudget: 'open app → first exercise in ≤ 2 taps and ≤ 10 s (phase 2)',
    steps: [...TRAIN, { css: '[data-testid=today-card]', expect: '[data-session-player]', say: "the Today card: Start today's session" }],
  },
  {
    id: 'client-log-set', who: 'client', name: "Log a set (the coach's session)", planBudget: 'log a set in 1 tap (phase 2)',
    steps: [...IN_COACH_SESSION, { expect: '[data-session-player][data-phase=work]', say: 'the ready count ends by itself' }, { css: PRIMARY, expect: '[data-session-player]:not([data-phase=work]), [data-session-player][data-set="2"]', say: 'Set done' }],
  },
  {
    id: 'client-finish', who: 'client', name: "Finish a session (the coach's session)", planBudget: 'a 5-exercise session in ≤ 12 taps beyond the sets (phase 2)',
    steps: [...IN_COACH_SESSION, { play: ['[data-session-player][data-phase=finish]', 200], say: 'every set, to the finish screen' }, { expect: '/Saved\\. Your coach will see it/', say: 'the finish screen says it is saved' }, { css: PRIMARY, expect: '/WEEK \\d+ · SESSION|How you feel/', say: 'Back to Today' }],
  },
  // ── the coach ──
  {
    id: 'coach-who-trained', who: 'coach', name: 'See who trained', planBudget: '"Who needs me today" is the coach\'s first screen (phase 5)',
    steps: [...COACH, { expect: '/sessions? this week|THIS WEEK/', say: 'the roster\'s week is on the first screen' }],
  },
  {
    id: 'coach-adjust-program', who: 'coach', name: 'Adjust a program (change one exercise)', planBudget: 'adjust one exercise in ≤ 4 taps (phase 5)',
    steps: [
      // the athlete from the roster strip (always there); the "Needs you" card that also opens them goes once it is acted on
      // EVERY-SCREEN P5: the Program tab lists the next session; an exercise, then a band, and it is saved (quick-adjust.tsx)
      ...COACH, { css: 'button[aria-label^="Casey Client:"]', expect: '/PROGRAM/', say: 'open the athlete' }, { tap: 'PROGRAM', expect: '[data-quick-adjust]', say: 'the Program tab' },
      { css: '[data-quick-exercise="Rig goblet squat"]', expect: '[data-quick-band=cruise]', say: 'Rig goblet squat' },
      { css: '[data-quick-band=cruise]', expect: '[data-quick-saved]', say: 'Cruise (saved on the tap)' },
    ],
  },
  {
    id: 'coach-review-clip', who: 'coach', name: 'Review a form clip', planBudget: '– (phase 5)',
    steps: [...COACH, { css: '[data-coach-tool=reviews]', expect: '/FORM REVIEWS/i', say: 'Form reviews' }, { expect: '/opens soon|to review/i', say: 'the queue, or the notice that sending is not open' }],
    endsAt: 'switched off until the form-review table is applied: clients film a set and read their own flags; nothing reaches the coach yet, and the screen says so',
  },
  {
    id: 'coach-group-attendance', who: 'coach', name: 'Take group attendance', planBudget: 'attendance in ≤ 1 tap per person (phase 5)',
    steps: [...COACH, { css: '[data-coach-tool=groups]', expect: '/Groups/', say: 'Groups' }, { expect: '[data-opens-soon-instead]', say: 'the switched-off notice offers a way on' }],
    endsAt: 'switched off until the group-booking tables are applied: the screen says so and offers what to do instead',
  },
  {
    id: 'coach-shot-charts', who: 'coach', name: 'Open shot charts', planBudget: '– (phase 5)',
    steps: [...COACH, { css: '[data-coach-setup-open]', expect: '/Shot charts/', say: 'Setup' }, { tap: 'Shot charts', expect: '[data-coach-shots-dark], [data-coach-shots]', say: 'Shot charts' }, { expect: '[data-dark-instead], [data-coach-shots]', say: 'the switched-off notice offers a way on' }],
    endsAt: 'switched off until the shot-chart table is applied: the screen says so and offers a way back',
  },
];
