// heroBody — WHICH BODY A PLAYER WEARS, decided once (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14).
//
// The owner saw two of himself in a dunk duel. Two facts made that happen, and this module is the answer to both:
//
//   1. Every hero spawn resolved to /models/elijah-meshy.glb — the OWNER'S body scan — for every signed-in player and
//      every guest. The scan is one mesh with the jacket, shorts, shoes and hair baked in, so nothing a player chose
//      in the creator could show on it. Owner decision (2026-09-14): the scan is HIS body only; everyone else plays
//      the kit body (male or female, fel-kit-*.glb) the creator dresses and scales. Guests get the neutral male kit.
//   2. Opponents only got a different body when the mode happened to pass a tint. A second untinted hero spawn
//      (dunk duel P2) loaded the player's own file. The rule is now "an opponent is never the player's body",
//      decided in CharacterLibrary against this module's `isPlayerBodyUrl`, not per mode.
//
// WHO IS THE OWNER is a SERVER decision: `FEL_SCAN_OWNER_EMAILS` (comma-separated) is read by
// /api/v1/hero-body, never shipped to the client, and never written in the repo. The client only ever sees
// `body: 'scan' | 'kit-male' | 'kit-female'`.
//
// Pure: no Babylon, no fetch. The fetch lives in playerIdentity.resolveIdentity.

export type HeroBodyKind = 'scan' | 'kit-male' | 'kit-female';
export type BodyType = 'male' | 'female';

export const SCAN_BODY_URL = '/models/elijah-meshy.glb';
export const KIT_BODY_URL: Record<BodyType, string> = {
  male: '/models/candidates/fel-kit-male.glb',
  female: '/models/candidates/fel-kit-female.glb',
};
export const BODY_TYPES: readonly BodyType[] = ['male', 'female'];
export const DEFAULT_BODY_TYPE: BodyType = 'male';

export function urlForHeroBody(kind: HeroBodyKind): string {
  return kind === 'scan' ? SCAN_BODY_URL : KIT_BODY_URL[kind === 'kit-female' ? 'female' : 'male'];
}

/** Every file that IS a player body — an opponent spawn must never land on one of these. */
export function isPlayerBodyUrl(url: string): boolean {
  return url === SCAN_BODY_URL || url === KIT_BODY_URL.male || url === KIT_BODY_URL.female
    || url === '/models/elijah-meshy.mobile.glb';
}

/** Parse the server allowlist. Case- and whitespace-insensitive; empty entries dropped. */
export function parseOwnerEmails(raw: string | undefined | null): Set<string> {
  return new Set((raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function bodyTypeOf(v: unknown): BodyType {
  return v === 'female' || v === 'Female' ? 'female' : DEFAULT_BODY_TYPE;
}

/**
 * The decision. `email` is the signed-in account's (null for a guest); `frame` is the saved creator frame
 * (`AthleteBuild.frame`), or null when the player has never saved one.
 */
export function decideHeroBody(email: string | null | undefined, owners: Set<string>, frame: Record<string, unknown> | null): HeroBodyKind {
  if (email && owners.has(email.trim().toLowerCase())) return 'scan';
  return bodyTypeOf(frame?.bodyType) === 'female' ? 'kit-female' : 'kit-male';
}

/** The creator frame's three scales (percent on the rows) as the multipliers applyIdentity takes; null when unset. */
export function proportionsFromFrame(frame: Record<string, unknown> | null): { heightScale: number; buildScale: number; reachScale: number } | null {
  if (!frame) return null;
  const pct = (k: string) => {
    const v = frame[k];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v / 100 : 1;
  };
  return { heightScale: pct('heightScale'), buildScale: pct('buildScale'), reachScale: pct('reachScale') };
}
