// hoops-builder phase B (owner 2026-11-12): where the hoops modes point at the builder — the 1v1 / 3v3 start card and the results card.
// Pure: the start card and GameShell decide where to draw it; this decides whether, and with which words.
import { ratingFreeRun } from '../../babylon/hoops/ratings';

export const HOOPS_BUILDER_HREF = '/creator/hoops';
/** The harness's mode ids (the start card) and GameShell's mode keys (the results card) of the two rated modes. */
export const RATED_HARNESS_MODES: readonly string[] = ['onevone', 'threevthree'];
export const RATED_SHELL_MODES: readonly string[] = ['hoops1v1', 'hoops3v3'];

/** The start card's line: a link in a casual run; in a rating-free run, the plain fact (no link out of a staked or ranked run). */
export function startCardLink(modeId: string, search: string): { href: string | null; label: string } | null {
  if (!RATED_HARNESS_MODES.includes(modeId)) return null;
  return ratingFreeRun(search)
    ? { href: null, label: 'STANDARD RATINGS IN THIS GAME' }
    : { href: HOOPS_BUILDER_HREF, label: 'YOUR HOOPS PLAYER →' };
}

/** The results card's extra action (EndScreenAction's shape): casual 1v1 / 3v3 only. */
export function resultsAction(mode: string, search: string): Array<{ id: string; label: string; href: string }> | undefined {
  if (!RATED_SHELL_MODES.includes(mode) || ratingFreeRun(search)) return undefined;
  return [{ id: 'hoops-player', label: 'Your hoops player', href: HOOPS_BUILDER_HREF }];
}
