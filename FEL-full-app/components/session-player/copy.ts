// components/session-player/copy.ts — PLAT-P01 (2026-10-27): the player's own words. DRAFT PRODUCT COPY for the Owner
// Inbox: short, plain, no medical words (tests/session-player/copy.test.ts screens them). Every movement word on screen
// (names, set-ups, cues) is the source's, unchanged.

export const PLAYER_COPY = {
  setDone: 'Set done',
  skipRest: 'Skip rest',
  startNow: 'Start now',
  resume: 'Resume',
  getReady: 'Get ready',
  rest: 'Rest',
  next: 'Next',
  paused: 'Paused',
  howToSetUp: 'How to set up',
  endAsk: 'End the session?',
  end: 'End',
  keepGoing: 'Keep going',
  done: 'Done',
  time: 'Time',
  sets: 'Sets',
  backToProgram: 'Back to the program',
  tryAgain: 'Try again',
  saving: 'Saving…',
  keptOnPhone: 'Kept on this phone.',
  preview: 'Preview: nothing was saved.',
  saveFailed: 'That did not save. Try again.',
  close: 'Close',
  pause: 'Pause',
  back: 'Previous set',
  mute: 'Mute the voice',
  unmute: 'Turn the voice on',
} as const;

/** "2/6": the step on screen of the session's steps. Written as a fraction, not "2 of 6": one word, not three, on a
 *  screen that holds 25 words while you work (the brief's "2 of 6" is the meaning; the slash is the plainer glyph). */
export const stepOfLine = (n: number, total: number): string => `${n}/${total}`;
