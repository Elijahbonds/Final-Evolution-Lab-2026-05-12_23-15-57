// athleteRoster — distinct bodies for rivals/NPCs so a contested screen is not
// the hero GLB cloned with a tint. Baked by scripts/avatar/roster.mts into
// public/models/athletes/<key>.glb (proportions + kit colorway baked in).
//
// WIRING — CharacterLibrary.spawn(), GLB path only: when a caller passes the
// shared hero URL AND a tint (the universal "this is not the player" signal in
// every mode), the spawn is redirected to a deterministic roster pick. The
// hero/player spawns (no tint) keep the identity hero. If a roster file is
// missing the load fails and CharacterLibrary falls back to the hero — the
// roster can never brick a mode.

export interface RosterAthlete {
  key: string;
  url: string;
}

export const ATHLETE_ROSTER: RosterAthlete[] = [
  { key: 'atlas', url: '/models/athletes/atlas.glb' },
  { key: 'blitz', url: '/models/athletes/blitz.glb' },
  { key: 'nova', url: '/models/athletes/nova.glb' },
  { key: 'titan', url: '/models/athletes/titan.glb' },
];

const HERO_URLS = new Set(['/models/fel-hero.glb', 'fel-hero.glb', '/models/elijah-hero.glb', 'elijah-hero.glb', 'hero.glb']);

/** Deterministic pick from the tint string so the same rival color is always
 *  the same body within and across sessions. */
export function rosterUrlFor(url: string, tint?: string): string | null {
  if (!tint || ATHLETE_ROSTER.length === 0) return null;
  if (!HERO_URLS.has(url)) return null;              // caller asked for a specific body
  let h = 0;
  for (let i = 0; i < tint.length; i++) h = (h * 31 + tint.charCodeAt(i)) >>> 0;
  return ATHLETE_ROSTER[h % ATHLETE_ROSTER.length].url;
}
