// sprintFix — every refused sprint run says its reason AND its fix (TOOLS-EASY, 2026-10-28). The sprint reader's own
// reasons (lib/sprint/{session,timing,trace,agility,profile}.ts) are kept word for word; the six that said only what
// went wrong get the one thing to do next, added after them. The readers are not changed.
//
// Pure.

/** The reasons that had no fix, matched on their own words, and the fix each one gets. */
const FIXES: { has: string; fix: string }[] = [
  { has: 'The Go has not sounded yet', fix: 'Wait for "Go", then run.' },
  { has: 'turns were not on opposite sides', fix: 'Touch one line, then the far line, then run back through the middle.' },
  { has: 'Too little of the run was seen', fix: 'Stand the phone further back so more of the run is in the picture.' },
  { has: 'did not fit a sprint from a start', fix: 'Start from still in the picture, then sprint flat out.' },
  { has: 'came too soon after the start', fix: 'Start behind the line, at the distance you set.' },
  { has: 'crossings were too close together', fix: 'Check the two lines are tapped at the two poles, then run again.' },
  { has: 'Too few frames to read a speed', fix: 'Film side-on, the whole body in view, and run through the picture.' },
];

/** The reason, with its fix when it had none. A reason that already says what to do comes back unchanged. */
export function withSprintFix(why: string): string {
  const f = FIXES.find((x) => why.includes(x.has));
  return f ? `${why.trim().replace(/\.?$/, '.')} ${f.fix}` : why;
}

export const SPRINT_FIX_REASONS = FIXES.map((f) => f.has);
