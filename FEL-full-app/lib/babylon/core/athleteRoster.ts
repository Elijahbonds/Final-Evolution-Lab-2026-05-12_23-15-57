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
  // MODELS PASS (owner drop 2026-09-22, cast by look — docs/CAST-MESHY-2026-09-22.md): 22 Meshy characters on the same 22-bone rig
  // via scripts/meshy/batch-meshy22.sh (skin-transfer.py onto the T-posed donor). The 0.6 / 1K pack: rivals and crowd never
  // carry the 2K. Keys are the source id until the owner names them.
  { key: 'm22-6d8c65ad', url: '/models/athletes/m22-6d8c65ad.glb' },
  { key: 'm22-dab1e0f7', url: '/models/athletes/m22-dab1e0f7.glb' },
  { key: 'm22-df555984', url: '/models/athletes/m22-df555984.glb' },
  { key: 'm22-c19ac82e', url: '/models/athletes/m22-c19ac82e.glb' },
  { key: 'm22-2ef63bb6', url: '/models/athletes/m22-2ef63bb6.glb' },
  { key: 'm22-421d2cdb', url: '/models/athletes/m22-421d2cdb.glb' },
  { key: 'm22-9e24fc5b', url: '/models/athletes/m22-9e24fc5b.glb' },
  { key: 'm22-367df58a', url: '/models/athletes/m22-367df58a.glb' },
  { key: 'm22-4d4c6f8f', url: '/models/athletes/m22-4d4c6f8f.glb' },
  { key: 'm22-feb2aabc', url: '/models/athletes/m22-feb2aabc.glb' },
  { key: 'm22-bb13bdbe', url: '/models/athletes/m22-bb13bdbe.glb' },
  { key: 'm22-242b6fd6', url: '/models/athletes/m22-242b6fd6.glb' },
  { key: 'm22-5cf665ee', url: '/models/athletes/m22-5cf665ee.glb' },
  { key: 'm22-bdb3bfb8', url: '/models/athletes/m22-bdb3bfb8.glb' },
  { key: 'm22-c4822d61', url: '/models/athletes/m22-c4822d61.glb' },
  { key: 'm22-350e6667', url: '/models/athletes/m22-350e6667.glb' },
  { key: 'm22-50acc34e', url: '/models/athletes/m22-50acc34e.glb' },
  { key: 'm22-2d171b36', url: '/models/athletes/m22-2d171b36.glb' },
  { key: 'm22-d81daaf0', url: '/models/athletes/m22-d81daaf0.glb' },
  { key: 'm22-b3a4e54f', url: '/models/athletes/m22-b3a4e54f.glb' },
  { key: 'm22-b5bcf955', url: '/models/athletes/m22-b5bcf955.glb' },
  { key: 'm22-f760a342', url: '/models/athletes/m22-f760a342.glb' },
];

/** MODELS PASS phase 7: which roster bodies a mode's rivals and crowd draw from (the whole roster when a mode has none). The
 *  modeId is the registry's modeId (`baseball`, `soccer`, `snowboard_slalom`, …), read off `scene.metadata.felModeId`. */
export const MODE_CAST: Record<string, readonly string[]> = {
  baseball: ['m22-6d8c65ad', 'm22-50acc34e', 'm22-2d171b36', 'm22-b5bcf955', 'm22-f760a342'],
  bigair: ['m22-feb2aabc', 'm22-242b6fd6', 'm22-bdb3bfb8', 'm22-350e6667'],
  // BRAINBRAWL-RESIDUAL (2026-09-24): a quiz show's contestants, host and audience, dressed for a studio. Without a cast
  // the P2 tint hashed onto the whole roster and landed on the shirtless beach body (feb2aabc): the eye read P2 as naked.
  brainbrawl: ['m22-5cf665ee', 'm22-bdb3bfb8', 'm22-242b6fd6', 'm22-350e6667', 'm22-50acc34e', 'm22-f760a342', 'm22-df555984', 'm22-421d2cdb'],
  carnival: ['m22-4d4c6f8f', 'm22-242b6fd6', 'm22-5cf665ee', 'm22-c4822d61', 'm22-50acc34e', 'm22-b3a4e54f'],
  dance: ['m22-421d2cdb', 'm22-9e24fc5b', 'm22-5cf665ee', 'm22-f760a342'],
  duel: ['m22-dab1e0f7', 'm22-c19ac82e'],
  dunk: ['m22-6d8c65ad', 'm22-dab1e0f7'],
  dunkduel: ['m22-6d8c65ad', 'm22-dab1e0f7'],
  football: ['m22-dab1e0f7', 'm22-df555984'],
  freerun: ['m22-c19ac82e', 'm22-421d2cdb', 'm22-367df58a'],
  golf: ['m22-421d2cdb', 'm22-9e24fc5b', 'm22-c4822d61', 'm22-50acc34e', 'm22-2d171b36', 'm22-d81daaf0', 'm22-b5bcf955'],
  karate: ['m22-dab1e0f7', 'm22-c19ac82e', 'm22-350e6667'],
  karate_vs: ['m22-dab1e0f7', 'm22-c19ac82e', 'm22-2ef63bb6'],
  mixedcombat: ['m22-dab1e0f7', 'm22-c19ac82e', 'm22-2ef63bb6', 'm22-350e6667'],
  onevone: ['m22-6d8c65ad', 'm22-dab1e0f7', 'm22-df555984', 'm22-2ef63bb6'],
  showdown: ['m22-dab1e0f7', 'm22-c19ac82e'],
  skateboard: ['m22-bb13bdbe', 'm22-242b6fd6', 'm22-5cf665ee', 'm22-bdb3bfb8', 'm22-c4822d61', 'm22-b3a4e54f'],
  snowboard_slalom: ['m22-242b6fd6', 'm22-350e6667'],
  soccer: ['m22-df555984'],
  sprint: ['m22-c19ac82e', 'm22-2ef63bb6', 'm22-367df58a'],
  surf: ['m22-4d4c6f8f', 'm22-feb2aabc', 'm22-bb13bdbe', 'm22-bdb3bfb8', 'm22-d81daaf0', 'm22-b3a4e54f', 'm22-f760a342'],
  tennis: ['m22-df555984', 'm22-c19ac82e', 'm22-421d2cdb', 'm22-9e24fc5b', 'm22-2d171b36', 'm22-b5bcf955'],
  threepoint: ['m22-6d8c65ad', 'm22-dab1e0f7', 'm22-df555984', 'm22-bb13bdbe'],
  threevthree: ['m22-6d8c65ad', 'm22-dab1e0f7', 'm22-df555984', 'm22-2ef63bb6'],
  volleyball: ['m22-2ef63bb6', 'm22-9e24fc5b', 'm22-367df58a', 'm22-4d4c6f8f', 'm22-feb2aabc', 'm22-bb13bdbe', 'm22-2d171b36', 'm22-d81daaf0'],
  who_scene_it: ['m22-50acc34e'],
};

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
export function rosterUrlFor(url: string, tint?: string, modeId?: string | null): string | null {
  if (!tint || ATHLETE_ROSTER.length === 0) return null;
  if (!HERO_URLS.has(url)) return null;              // caller asked for a specific body
  let h = 0;
  for (let i = 0; i < tint.length; i++) h = (h * 31 + tint.charCodeAt(i)) >>> 0;
  // phase 7: a mode with a CAST draws from it; the seed hashes over the cast so a 3v3 still never repeats a look
  const cast = modeId ? MODE_CAST[modeId] : undefined;
  if (cast && cast.length) { const pick = ATHLETE_ROSTER.find((a) => a.key === cast[h % cast.length]); if (pick) return pick.url; }
  return ATHLETE_ROSTER[h % ATHLETE_ROSTER.length].url;
}
