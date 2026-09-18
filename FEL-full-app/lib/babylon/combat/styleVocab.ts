// styleVocab — which captured-move vocabulary the player's picked style brings, read WITHOUT the schools table (2026-09-15).
//
// CharacterLibrary installs a style's moves at spawn and is imported by every mode. schools.ts carries words the clip-scope
// guard reads as clip names (a school's favoured strike, the `guard` trait), so importing it there put a boxer's jab into
// the derby's scope (clipScope.test). This reads the same remembered pick (`?style=` / localStorage, schools.BLEND_KEY)
// and knows only which school ids carry a vocabulary. schools.test holds the two in step.
export type PickedVocab = 'capoeira' | 'tricking';
export const VOCAB_SCHOOLS: Readonly<Record<string, PickedVocab>> = { capoeira: 'capoeira', tricking: 'tricking' };
const KEY = 'fel-combat-style';

/** The vocabulary of the player's PRIMARY school, or null for a trait-only school. */
export function pickedVocab(): PickedVocab | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('style') ?? window.localStorage.getItem(KEY);
    const primary = raw?.split(':')[0] ?? '';
    return VOCAB_SCHOOLS[primary] ?? null;
  } catch { return null; }
}
