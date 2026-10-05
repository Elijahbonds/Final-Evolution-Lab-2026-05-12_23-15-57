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

/**
 * RETIRED BODIES (asset-polish, owner 2026-10-05: "some of the models are broken … make sure all the models actually work
 * and aren't bugged out"). Every one of these passed every existing check (22 joints, 276 clips, conforms) and every one
 * renders broken, because skin weights pull vertices to the wrong bones once the body moves. Measured by /dev/model's
 * stretch(): each triangle edge in the posed, CPU-skinned mesh against the same edge at rest, after removing the import
 * scale, over idle_stand, run, dunk_finish_tomahawk and jumpshot. Two faults:
 *   TORN  >= 300 edges grow past 20 cm (a limb sheared into flaps);
 *   SPIKE  any edge grows >= 55 cm (one vertex flung off the body: a hair wire, a finger to the floor).
 * Calibrated on bodies seen with the eye: amir (torn), titan (torn), frost (spike), against m22-dab1e0f7 and fel-hero (clean).
 * The 30 kept bodies top out at 177 torn edges and a 45 cm spike; the retired start at 410 and 55 cm. Nothing sits on
 * the line. The files stay on disk (like wren and bramble); they come back when they are re-skinned and measure clean.
 */
export const RETIRED_ATHLETES: Readonly<Record<string, string>> = {
  atlas: 'torn: 410 edges past 20 cm',
  blitz: 'torn: 607 edges, a 93 cm spike',
  nova: 'torn: 730 edges',
  titan: 'torn: 854 edges (the shredded left forearm)',
  ember: 'torn: 688 edges',
  frost: 'spike: 66 cm (a hair strand wired off the ponytail)',
  vex: 'torn: 932 edges',
  ranger: 'spike: 85 cm in run',
  juno: 'spike: 95 cm in the dunk',
  lyra: 'spike: 120 cm in the dunk',
  amir: 'torn: 1,112 edges (the arm smeared into a plank off the head)',
};

export const ATHLETE_ROSTER: RosterAthlete[] = [
  // Phase 3 (2026-09-02): four more bodies so a 3v3 never repeats a look.
  { key: 'sage', url: '/models/athletes/sage.glb' },
  // Phase 6 (owner, 2026-09-19: "rig the other models … same normal static posture as the ones that animate", then
  // "separate those models"). The Meshy people who were not basketball players carried no rig, so nothing could spawn
  // them — and they do not come one to a file: "Athletic Male NPC 1" is FIVE men standing shoulder to shoulder inside
  // a single mesh. Fed whole to the skin transfer all five were skinned to one skeleton and the idle tore the sheet
  // apart, which is exactly what it did the first time. They are cut into people first (scripts/meshy/split-row.py,
  // at the valleys in the vertex histogram — the one thing that separates figures standing in a line), then each one
  // goes through the same transfer onto the same 22-bone skeleton as the eight. One rig, one clip set, one idle.
  { key: 'flint', url: '/models/athletes/flint.glb' },
  { key: 'onyx', url: '/models/athletes/onyx.glb' },
  { key: 'dune', url: '/models/athletes/dune.glb' },
  { key: 'cobalt', url: '/models/athletes/cobalt.glb' },
  { key: 'vega', url: '/models/athletes/vega.glb' },
  { key: 'iris', url: '/models/athletes/iris.glb' },
  // wren and the crowd's bramble are BUILT but OUT: on those two the transfer bound the arms to the chest — not a
  // vertex reached an arm bone — so the anatomical repair below has no arm cluster to split and their arms would
  // swing from the sternum. The files stay on disk; they are not spawned until the transfer can find their arms.
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

/**
 * Which roster body a tinted/opponent spawn gets.
 *
 * ROTATION (asset-polish, owner 2026-10-05: "make sure the rival that you play against alternates and it's not the same
 * person each time"). This used to be a pure hash of the seed, documented as "the same rival color is always the same
 * body within and across sessions", and the commonest seed is `opponent-0` (the first untinted opponent in every
 * scene), so the first rival of every match in every mode was the same person, forever. `rotation` shifts the pick
 * along the pool: CharacterLibrary takes one rotation per scene (one match) from `takeRivalRotation`, which advances it
 * every match, so consecutive matches always land on a different body. Within a match the rotation is fixed, so a
 * given seed still means one body, and seeds that were distinct stay distinct (a 3v3 still never repeats a look).
 */
export function rosterUrlFor(url: string, tint?: string, modeId?: string | null, rotation = 0): string | null {
  if (!tint || ATHLETE_ROSTER.length === 0) return null;
  if (!HERO_URLS.has(url)) return null;              // caller asked for a specific body
  let h = 0;
  for (let i = 0; i < tint.length; i++) h = (h * 31 + tint.charCodeAt(i)) >>> 0;
  const shift = Number.isFinite(rotation) ? Math.max(0, Math.floor(rotation)) : 0;
  // phase 7: a mode with a CAST draws from it; the seed hashes over the cast so a 3v3 still never repeats a look
  const cast = modeId ? MODE_CAST[modeId] : undefined;
  if (cast && cast.length) { const pick = ATHLETE_ROSTER.find((a) => a.key === cast[(h + shift) % cast.length]); if (pick) return pick.url; }
  return ATHLETE_ROSTER[(h + shift) % ATHLETE_ROSTER.length].url;
}

/** A named body's URL, for a character who wears one specific person (the Dunk's named rivals). Null when the key is
 *  not on the roster (retired or misspelled), so the caller falls back instead of loading a 404. */
export function rosterBodyUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return ATHLETE_ROSTER.find((a) => a.key === key)?.url ?? null;
}

const ROTATION_KEY = 'fel.rivalRotation';
let rotationFallback = 0;

/**
 * The rival rotation for a match that is starting, advanced so the NEXT match gets the next one. Kept in localStorage
 * so it survives a reload or tomorrow's visit (that is the point: coming back must not mean the same person). Any
 * storage failure (private mode, blocked site data, SSR) falls back to an in-memory counter, which still rotates
 * within the visit and can never throw into a spawn.
 */
export function takeRivalRotation(): number {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const cur = Number.parseInt(window.localStorage.getItem(ROTATION_KEY) ?? '', 10);
      const n = Number.isFinite(cur) && cur >= 0 ? cur : 0;
      window.localStorage.setItem(ROTATION_KEY, String((n + 1) % 1_000_000));
      return n;
    }
  } catch { /* fall through to the in-memory counter */ }
  return rotationFallback++;
}
