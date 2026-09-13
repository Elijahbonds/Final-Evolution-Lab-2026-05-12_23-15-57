// THE IN-DEVELOPMENT WALL — what a new player is allowed to judge us on (2026-09-13).
//
// Owner, on the containment wall: build it. And on where the line goes: "the six v1 modes, plus anything
// that passed a prior A+ pass."
//
// THE LINE IS DRAWN FROM EVIDENCE, NOT FROM MEMORY. Every mode file in this repo was scanned for a
// documented A+ pass (`A+ mission`, `A+ P0`, `MODE-A+`). Every single registered mode carries one except
// two: VelocityKartMode and AeroAcesMode, both built from scratch on 2026-09-12 and never through an A+
// pass. So the wall is those two, and it is small because the roster is further along than the briefs
// assumed — Phase 0 measured all 28 modes loading at 60 fps with audio.
//
// A SMALL WALL IS THE HONEST ANSWER HERE. It would have been easy to lock twenty modes and call it rigour,
// but locking a mode that has been through an A+ pass and boots clean is not protecting the player from
// anything — it is hiding finished work, which is the exact mistake Brain Brawl was already living (its
// Babylon mode sat in the registry, unreachable, while the route rendered the 2D version).
//
// NOTHING IS DELETED AND NOTHING IS UNREGISTERED. A walled mode still builds, still runs under /dev/mode,
// still has its tests. The wall is a NAVIGATION gate: the mode select shows it with an honest label and its
// /play route explains itself instead of loading. Coming off the wall is one line.

/** Modes a player can reach from the main navigation. */
export type ShipStatus = 'shipped' | 'in-development';

export interface WalledMode {
  /** Registry key. */
  key: string;
  /** What is actually missing — shown to the player, so it has to be true and specific. */
  reason: string;
}

/**
 * Behind the wall, with the reason each one is there.
 *
 * The reason is PLAYER-FACING. "Coming soon" is a non-answer and reads as a content gate; naming the real
 * gap is both honest and a promise we can be held to.
 */
export const WALLED: readonly WalledMode[] = [
  // EMPTY, and that is the wall working rather than the wall being pointless.
  //
  // It went up on 2026-09-13 holding exactly two modes — velocitykart and aeroaces, the only two registered
  // modes with no documented A+ pass — and the reason it gave players was specific: "the karts/aircraft
  // still need an art pass." That art pass landed the same day (tapered bodywork, wheels with rims, a roll
  // hoop, a round fuselage with swept wings and a turning propeller, and a field of rivals in both), so the
  // reason no longer holds and the modes come off.
  //
  // The mechanism stays. Adding an entry here is how a mode goes back behind the wall, and the label has to
  // name the real gap — "coming soon" is a non-answer that reads as a content gate.
];

const WALLED_KEYS = new Set(WALLED.map((w) => w.key));

export function shipStatus(modeKey: string): ShipStatus {
  return WALLED_KEYS.has(modeKey) ? 'in-development' : 'shipped';
}

export function isWalled(modeKey: string): boolean {
  return WALLED_KEYS.has(modeKey);
}

/** Why this mode is walled, or null when it is not. */
export function walledReason(modeKey: string): string | null {
  return WALLED.find((w) => w.key === modeKey)?.reason ?? null;
}

/**
 * Route slugs behind the wall.
 *
 * `/play/<slug>` and the registry key differ for some modes, so the mapping is explicit rather than derived
 * — a silently wrong guess here would either wall the wrong mode or leave a walled one reachable, and both
 * fail quietly.
 */
export const WALLED_ROUTES: Readonly<Record<string, string>> = {
  'velocity-kart': 'velocitykart',
  'aero-aces': 'aeroaces',
};

export function isWalledRoute(slug: string): boolean {
  return slug in WALLED_ROUTES;
}
