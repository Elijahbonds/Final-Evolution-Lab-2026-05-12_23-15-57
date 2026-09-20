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
  // Phase 3 (2026-09-02): four more bodies so a 3v3 never repeats a look.
  { key: 'ember', url: '/models/athletes/ember.glb' },
  { key: 'frost', url: '/models/athletes/frost.glb' },
  { key: 'sage', url: '/models/athletes/sage.glb' },
  { key: 'vex', url: '/models/athletes/vex.glb' },
  // Phase 6 (owner, 2026-09-19: "rig the other models … same normal static posture as the ones that animate", then
  // "separate those models"). The Meshy people who were not basketball players carried no rig, so nothing could spawn
  // them — and they do not come one to a file: "Athletic Male NPC 1" is FIVE men standing shoulder to shoulder inside
  // a single mesh. Fed whole to the skin transfer all five were skinned to one skeleton and the idle tore the sheet
  // apart, which is exactly what it did the first time. They are cut into people first (scripts/meshy/split-row.py,
  // at the valleys in the vertex histogram — the one thing that separates figures standing in a line), then each one
  // goes through the same transfer onto the same 22-bone skeleton as the eight. One rig, one clip set, one idle.
  { key: 'ranger', url: '/models/athletes/ranger.glb' },
  { key: 'flint', url: '/models/athletes/flint.glb' },
  { key: 'onyx', url: '/models/athletes/onyx.glb' },
  { key: 'dune', url: '/models/athletes/dune.glb' },
  { key: 'cobalt', url: '/models/athletes/cobalt.glb' },
  { key: 'vega', url: '/models/athletes/vega.glb' },
  { key: 'juno', url: '/models/athletes/juno.glb' },
  { key: 'lyra', url: '/models/athletes/lyra.glb' },
  { key: 'iris', url: '/models/athletes/iris.glb' },
  // wren and the crowd's bramble are BUILT but OUT: on those two the transfer bound the arms to the chest — not a
  // vertex reached an arm bone — so the anatomical repair below has no arm cluster to split and their arms would
  // swing from the sternum. The files stay on disk; they are not spawned until the transfer can find their arms.
  { key: 'amir', url: '/models/athletes/amir.glb' },
];

/** THE hero — the one body every mode spawns unless it asks for a specific file. Owner decision 2026-09-05 (Ship Pass 6):
 *  the owner's Meshy scan, skinned to the 22-bone rig by scripts/meshy/rig-scan.py, is the hero everywhere; rivals, partners
 *  and crowd stay on the roster (rosterUrlFor). The forge hero stays on disk as FORGE_HERO_URL for the Closet's kit bodies. */
export const DEFAULT_HERO_URL = '/models/elijah-meshy.glb';
export const FORGE_HERO_URL = '/models/fel-hero.glb';

const HERO_URLS = new Set([DEFAULT_HERO_URL, FORGE_HERO_URL, 'fel-hero.glb', 'elijah-meshy.glb', '/models/elijah-hero.glb', 'elijah-hero.glb', 'hero.glb']);

/** Any empty or bare hero spelling ('', 'hero.glb', 'elijah-hero.glb') means
 *  "the hero". The procedural path ignored the URL entirely, so these call
 *  sites shipped for months; on the GLB path they fetched a 404 and took the
 *  mode down (threepoint, gymnastics, bigair, carnival — 2026-09-02). */
export function normalizeHeroUrl(url: string | undefined | null): string {
  if (!url) return DEFAULT_HERO_URL;
  if (HERO_URLS.has(url) && !url.startsWith('/')) return DEFAULT_HERO_URL;
  if (url === '/models/elijah-hero.glb' || url === FORGE_HERO_URL) return DEFAULT_HERO_URL;   // the retired asset and the forge hero both mean "the hero"
  return url;
}

/** Deterministic pick from the tint string so the same rival color is always
 *  the same body within and across sessions. */
export function rosterUrlFor(url: string, tint?: string): string | null {
  if (!tint || ATHLETE_ROSTER.length === 0) return null;
  if (!HERO_URLS.has(url)) return null;              // caller asked for a specific body
  let h = 0;
  for (let i = 0; i < tint.length; i++) h = (h * 31 + tint.charCodeAt(i)) >>> 0;
  return ATHLETE_ROSTER[h % ATHLETE_ROSTER.length].url;
}
