// TODAY-DRILL (2026-10-27): a reading-level estimate for product copy — the Flesch–Kincaid grade, with a plain
// vowel-group syllable count (silent final "e" dropped, at least one per word). An estimate, good enough to hold short
// UI lines to "about 6th–8th grade"; it is not a readability study. Test-only.
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function words(text: string): string[] {
  return text.match(/[A-Za-z][A-Za-z'’-]*|\d+(?:\.\d+)?/g) ?? [];
}

/** Flesch–Kincaid grade of a block of text (sentences split on . ! ? and the line itself). */
export function fkGrade(text: string): number {
  const ws = words(text);
  if (!ws.length) return 0;
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length);
  const syl = ws.reduce((s, w) => s + (/^\d/.test(w) ? 1 : syllables(w)), 0);
  return 0.39 * (ws.length / sentences) + 11.8 * (syl / ws.length) - 15.59;
}
