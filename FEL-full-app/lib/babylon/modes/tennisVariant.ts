// TENNIS-TIEBREAK-FOLD (ALL-MODES-TO-75 §1 + S6, 2026-10-22; Elijah: "Fold Tiebreak into Tennis"): the Tennis family's
// variants, read off /play/tennis?variant=. Pure — no Babylon — so the route, its loader and the tests all share it.
//
// `modeKey` is the registry key the timing host mounts (MODES.tennis / MODES.tiebreak, both NetSportMode configs in
// TennisMode.ts); `sessionMode` is what GameShell posts the run under. The tiebreak keeps the `tiebreak` session key:
// its score is points to 7, which the tennis score rule (games, at most 6) would refuse.

export type TennisVariant = 'match' | 'tiebreak';

export interface TennisVariantInfo {
  modeKey: 'tennis' | 'tiebreak';
  sessionMode: 'tennis' | 'tiebreak';
  /** Where this variant plays — the login round trip comes back here. */
  path: string;
}

export const TENNIS_VARIANTS: Readonly<Record<TennisVariant, TennisVariantInfo>> = {
  match: { modeKey: 'tennis', sessionMode: 'tennis', path: '/play/tennis' },
  tiebreak: { modeKey: 'tiebreak', sessionMode: 'tiebreak', path: '/play/tennis?variant=tiebreak' },
};

/** The old /play/tiebreak route lands here. */
export const TIEBREAK_VARIANT_PATH = TENNIS_VARIANTS.tiebreak.path;

/** `?variant=` → the variant; anything else (absent, unknown, repeated) is the full match. */
export function tennisVariantOf(param: string | string[] | null | undefined): TennisVariant {
  const v = Array.isArray(param) ? param[0] : param;
  return v === 'tiebreak' ? 'tiebreak' : 'match';
}
