// Prove It voice (SESSION-SETUP-V1). The same speechSynthesis idea as the Mirror: no package, no download.
// Voice is on until this tab mutes it. Mute cancels whatever is speaking and blocks the next line.
// IMPROVE (2026-10-06): a nickname is SHOWN from page memory, never spoken (NEXT_UP_SPOKEN). This module never writes it.

export const MUTE_KEY = 'fel.prove-it.mute';

export interface Speaker {
  cancel(): void;
  speak(line: string, onend?: () => void): void;
}

export function inchesFromCm(cm: number): number {
  if (!Number.isFinite(cm)) return 0;
  return Math.round(cm / 2.54);
}

/** On screen: who is up next (the name is shown, not spoken: NEXT_UP_SPOKEN). */
export function nextUpLine(name: string): string {
  return `Next up: ${name}`;
}

/**
 * IMPROVE (2026-10-06), the owner's decision: Prove It never reads an athlete's name aloud. A nickname typed on the day came out
 * of the browser's voice mangled and robotic; now a recorded "Next up!" plays (the Coach's take, tools/voice/script/coach.csv;
 * the browser's best voice says it until it is recorded) and the name is shown big on screen.
 */
export const NEXT_UP_SPOKEN = 'Next up!';

const judgesText = (judgeAverage: number): string => (Math.round(judgeAverage * 10) / 10).toFixed(1);

/** The spoken result: "34 inches, judges 8.5" — the on-screen resultLine without the name. */
export function spokenResultLine(verticalCm: number, judgeAverage: number): string {
  return `${inchesFromCm(verticalCm)} inches, judges ${judgesText(judgeAverage)}`;
}

/** What is said after a measured dunk: the result, then "Next up!" when somebody is next. No line carries a name. */
export function cuesAfterDunk(verticalCm: number, judgeAverage: number, hasNext: boolean): string[] {
  return hasNext ? [spokenResultLine(verticalCm, judgeAverage), NEXT_UP_SPOKEN] : [spokenResultLine(verticalCm, judgeAverage)];
}

export function goWhenReadyLine(): string {
  return 'Go when ready';
}

/** "<name>, 34 inches, judges 8.5" — inches from the measured centimetres, judges as the card average. */
export function resultLine(name: string, verticalCm: number, judgeAverage: number): string {
  return `${name}, ${inchesFromCm(verticalCm)} inches, judges ${judgesText(judgeAverage)}`;
}

export function judgeAverage(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((sum, n) => sum + n, 0) / scores.length;
}

export function readMuted(store: { getItem(key: string): string | null }): boolean {
  try {
    return store.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeMuted(store: { setItem(key: string, value: string): void }, muted: boolean): void {
  store.setItem(MUTE_KEY, muted ? '1' : '0');
}

/**
 * Speak a line, or a short queue. Mute cancels the speaker and drops every line still waiting.
 * Calling this while muted does not speak.
 */
export function speakCues(speaker: Speaker, lines: readonly string[], muted: boolean): void {
  if (muted || lines.length === 0) {
    speaker.cancel();
    return;
  }
  speaker.cancel();
  let i = 0;
  const step = () => {
    if (i >= lines.length) return;
    const line = lines[i];
    i += 1;
    speaker.speak(line, () => step());
  };
  step();
}
