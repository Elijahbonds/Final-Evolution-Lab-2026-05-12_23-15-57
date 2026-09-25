// firstRun — what a brand-new athlete sees first, and who gets to decide it.
//
// Until now the sign-up form showed six sports, saved your pick to localStorage, and then sent you to the home
// page and forgot it. You told it what you came for and it shrugged. Worse, a card scanned from somebody's QR
// paid its owner shards (share-link.ts) and then dropped the new athlete on the same generic shelf as everybody
// else — the creator brought them in and had no say in what they landed on.
//
// Two things decide the first screen:
//
//   THE PATH      Game first, or body first. Some people arrive to play and some arrive to be assessed, and
//                 guessing wrong is how you lose either one. It is a question, asked once, in plain words.
//
//   THE GAME      If a creator's link or QR brought them, the creator's SIGNATURE MODE is the first game —
//                 CreatorCard.mode, which already exists and already means exactly this. Somebody who scans
//                 Amir's card at a court should land in Amir's game, not on a menu. Absent a creator, the
//                 athlete picks from the carousel, and absent both there is a default.
//
// All of it is pure so the page, the API and the tests agree on one answer.

import { MODE_INFO, VENUES, canonicalModeKey } from '../game-data';

export type OnboardingPath = 'play' | 'body';

/** Where each path begins. `body` is the Mirror because a movement screen is the front door to everything else. */
export const PATH_HOME: Record<OnboardingPath, string> = {
  play: '/play',
  body: '/play/mirror',
};

/** The one game to open with when nothing and nobody has said otherwise. */
export const DEFAULT_FIRST_GAME = 'dunkContest';

export function isPath(v: unknown): v is OnboardingPath {
  return v === 'play' || v === 'body';
}

/** A mode key is usable only if something can actually be opened with it.
 *  HOTFIX (2026-09-24): an old spelling of a key counts (canonicalModeKey), so a saved pick or a creator card written
 *  before the catalogue took the session keys still opens its game. */
export function isPlayableMode(key: string | null | undefined): boolean {
  const k = canonicalModeKey(key);
  return Boolean(k && MODE_INFO[k]?.href);
}

/**
 * The first game, in priority order: the creator who brought them, then the athlete's own pick, then the default.
 *
 * The creator wins over the athlete's pick ON PURPOSE and only at this moment — they are arriving through
 * somebody's card, and the point of that card is "come and play THIS with me". The athlete's own choice takes
 * over everywhere afterwards, and the carousel still lets them change it before they commit.
 *
 * Anything unrecognised is ignored rather than trusted, at every level: a creator card carrying a retired mode
 * key, or a hand-edited URL, must not strand a new athlete on a route that does not exist.
 */
export function resolveFirstGame(opts: {
  creatorMode?: string | null;
  chosen?: string | null;
}): string {
  // HOTFIX (2026-09-24): returned as the catalogue spells it now. A pick saved as 'musicAcademy' and a creator card that
  // stores 'velocitykart' both still land in their game.
  if (isPlayableMode(opts.creatorMode)) return canonicalModeKey(opts.creatorMode);
  if (isPlayableMode(opts.chosen)) return canonicalModeKey(opts.chosen);
  return DEFAULT_FIRST_GAME;
}

/** Where a new athlete lands once the questions are answered. */
export function destinationFor(path: OnboardingPath, modeKey?: string | null): string {
  if (path === 'body') return PATH_HOME.body;
  const key = resolveFirstGame({ chosen: modeKey });
  return MODE_INFO[key]?.href ?? PATH_HOME.play;
}

export interface FirstRunHost {
  /** The creator's display name, for "Amir sent you". */
  name: string;
  /** Their signature mode, if it is one that can be played. */
  mode: string | null;
  /** Their card's accent, so the arrival carries their colour. */
  accent: string | null;
}

/** Normalises whatever the database hands back about the host into something the UI can render without guarding. */
export function hostFrom(card: { displayName?: string | null; mode?: string | null; accent?: string | null } | null | undefined,
                         fallbackName?: string | null): FirstRunHost | null {
  const name = String(card?.displayName ?? fallbackName ?? '').trim();
  if (!name) return null;
  const mode = isPlayableMode(card?.mode) ? canonicalModeKey(card?.mode) : null;   // HOTFIX (2026-09-24): an old spelling is read as the current key
  const accent = /^#[0-9A-Fa-f]{6}$/.test(String(card?.accent ?? '')) ? String(card?.accent) : null;
  return { name, mode, accent };
}

/**
 * The picture for a mode, taken from the venue it is played at — the two are joined by href, which is the only
 * thing they share. A mode whose venue has no artwork yet returns null and the card draws its own tile rather
 * than a broken image.
 */
export function artFor(modeKey: string): string | null {
  // HOTFIX (2026-09-24): an old spelling finds its venue art too.
  const href = MODE_INFO[canonicalModeKey(modeKey)]?.href;
  if (!href) return null;
  return VENUES.find((v) => v.href === href)?.image ?? null;
}

/**
 * The carousel's running order. Art first, because a card with a photograph is worth more than a card without one
 * and the first screen should lead with the best the product has. The creator's game is hoisted to the front when
 * there is one, so a scanned card opens on the game it was scanned for.
 */
export function carouselOrder(firstGame?: string | null): string[] {
  const keys = Object.keys(MODE_INFO).filter((k) => MODE_INFO[k]?.href);
  const withArt = keys.filter((k) => artFor(k));
  const without = keys.filter((k) => !artFor(k));
  const ordered = [...withArt, ...without];
  // HOTFIX (2026-09-24): the lead is spelled as the carousel spells it. Raw, an old spelling would lead the carousel and
  // the same game would show again under its current key.
  const lead = isPlayableMode(firstGame) ? canonicalModeKey(firstGame) : null;
  return lead ? [lead, ...ordered.filter((k) => k !== lead)] : ordered;
}
