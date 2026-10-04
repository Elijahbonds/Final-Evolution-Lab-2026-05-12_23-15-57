// Prove It voice (SESSION-SETUP-V1). The same speechSynthesis idea as the Mirror: no package, no download.
// Voice is on until this tab mutes it. Mute cancels whatever is speaking and blocks the next line.
// A nickname is spoken from page memory. This module never writes it.

export const MUTE_KEY = 'fel.prove-it.mute';

export interface Speaker {
  cancel(): void;
  speak(line: string, onend?: () => void): void;
}

export function inchesFromCm(cm: number): number {
  if (!Number.isFinite(cm)) return 0;
  return Math.round(cm / 2.54);
}

export function nextUpLine(name: string): string {
  return `Next up: ${name}`;
}

export function goWhenReadyLine(): string {
  return 'Go when ready';
}

/** "<name>, 34 inches, judges 8.5" — inches from the measured centimetres, judges as the card average. */
export function resultLine(name: string, verticalCm: number, judgeAverage: number): string {
  const judges = (Math.round(judgeAverage * 10) / 10).toFixed(1);
  return `${name}, ${inchesFromCm(verticalCm)} inches, judges ${judges}`;
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
