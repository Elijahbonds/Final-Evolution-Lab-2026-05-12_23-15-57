// athleteRoster — distinct bodies for rivals/NPCs so a contested screen is not
// the hero GLB cloned with a tint. Built by scripts/avatar/rivals.mts into
// public/models/rivals/<key>.glb (2026-10-16: MPFB2 forge bodies; the Meshy athletes/ bodies before them are REPLACED_MESHY).
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

/**
 * THE MESHY BODIES ARE OFF THE ROSTER (owner, 2026-10-16: "the meshy opponents need to be replaced by our models because they are
 * broken, make our npcs look better than the meshy models, replace them all but my own"). Every one of these is a Meshy export
 * weighted by nearest-vertex transfer from the owner's scan (scripts/meshy/skin-transfer.py): eleven tore badly enough to retire
 * (above), and the kept ones were measured on /dev/model (STRETCH=1 _model-sheet.mts, the clips the retired list was measured on):
 * 40–81 triangle edges pulled past 20 cm and a 30–44 cm worst edge, against 0 edges and 5–19 cm on the forge rivals that replace
 * them — and ONE mesh with one material, so no team colour or fit ever reached a Meshy rival. The files stay on disk; the owner's
 * own hero (DEFAULT_HERO_URL) is not a roster body and is unchanged.
 */
export const REPLACED_MESHY: readonly string[] = [
  'sage', 'flint', 'onyx', 'dune', 'cobalt', 'vega', 'iris', 'm22-6d8c65ad', 'm22-dab1e0f7', 'm22-df555984', 'm22-c19ac82e', 'm22-2ef63bb6', 'm22-421d2cdb', 'm22-9e24fc5b', 'm22-367df58a', 'm22-4d4c6f8f', 'm22-feb2aabc', 'm22-bb13bdbe', 'm22-242b6fd6', 'm22-5cf665ee', 'm22-bdb3bfb8', 'm22-c4822d61', 'm22-350e6667', 'm22-50acc34e', 'm22-2d171b36', 'm22-d81daaf0', 'm22-b3a4e54f', 'm22-b5bcf955', 'm22-f760a342',
];

/**
 * THE FORGE RIVALS (2026-10-16; scripts/avatar/rivals.mts → public/models/rivals/): 24 people built from MPFB2 (MakeHuman, CC0) on
 * our own rig — each its own build (MakeHuman's sex, age, muscle, weight, proportions and race weights, two face targets, height
 * 1.70–2.08 m), skin, hair and brows, wearing the kit's garment contract (Kit_<slot>_<item>, jersey/shorts/shoes materials), so
 * applyKit dresses them for the sport, the fits colour them and a team's colour reaches their jersey. Generic names, no real people.
 */
export const ATHLETE_ROSTER: RosterAthlete[] = [
  { key: 'ace', url: '/models/rivals/ace.glb' },
  { key: 'blaze', url: '/models/rivals/blaze.glb' },
  { key: 'bolt', url: '/models/rivals/bolt.glb' },
  { key: 'colt', url: '/models/rivals/colt.glb' },
  { key: 'dash', url: '/models/rivals/dash.glb' },
  { key: 'echo', url: '/models/rivals/echo.glb' },
  { key: 'fable', url: '/models/rivals/fable.glb' },
  { key: 'grit', url: '/models/rivals/grit.glb' },
  { key: 'halo', url: '/models/rivals/halo.glb' },
  { key: 'jinx', url: '/models/rivals/jinx.glb' },
  { key: 'kite', url: '/models/rivals/kite.glb' },
  { key: 'lux', url: '/models/rivals/lux.glb' },
  { key: 'mako', url: '/models/rivals/mako.glb' },
  { key: 'nyx', url: '/models/rivals/nyx.glb' },
  { key: 'orbit', url: '/models/rivals/orbit.glb' },
  { key: 'quill', url: '/models/rivals/quill.glb' },
  { key: 'rook', url: '/models/rivals/rook.glb' },
  { key: 'sol', url: '/models/rivals/sol.glb' },
  { key: 'tusk', url: '/models/rivals/tusk.glb' },
  { key: 'umber', url: '/models/rivals/umber.glb' },
  { key: 'volt', url: '/models/rivals/volt.glb' },
  { key: 'wisp', url: '/models/rivals/wisp.glb' },
  { key: 'yara', url: '/models/rivals/yara.glb' },
  { key: 'zeal', url: '/models/rivals/zeal.glb' },
];

/** MODELS PASS phase 7: which roster bodies a mode's rivals and crowd draw from (the whole roster when a mode has none). The
 *  modeId is the registry's modeId (`baseball`, `soccer`, `snowboard_slalom`, …), read off `scene.metadata.felModeId`.
 *
 * ASSET-POLISH (2026-10-05): the rival now rotates every match, so a one- or two-body cast meant the same face every
 * time or a flip-flop between two. Every rival cast is at least four now (freerun and sprint keep their three runners).
 * FORGE RIVALS (2026-10-16): recast from the 24 forge rivals by build — leapers and bigs for the dunks, shooters for the
 * three-point line, the broad and the compact for the fights, the lighter builds for the boards and the snow, everyone for the
 * party modes; hoops casts mix men and women. Every cast is still ≥ 3 and repeats no body. (The Meshy casts are in git.)
 */
export const MODE_CAST: Record<string, readonly string[]> = {
  baseball: ['blaze', 'rook', 'orbit', 'sol', 'zeal', 'fable'],
  bigair: ['colt', 'jinx', 'wisp', 'volt', 'kite'],
  brainbrawl: ['halo', 'sol', 'quill', 'fable', 'yara', 'rook', 'kite', 'zeal'],
  carnival: ['lux', 'halo', 'jinx', 'umber', 'wisp', 'bolt'],
  dance: ['lux', 'echo', 'kite', 'yara', 'volt', 'nyx'],
  duel: ['grit', 'blaze', 'rook', 'nyx', 'zeal'],
  dunk: ['ace', 'lux', 'volt', 'grit', 'mako', 'tusk', 'bolt', 'umber'],
  dunkduel: ['ace', 'lux', 'volt', 'grit', 'mako', 'tusk', 'bolt', 'umber'],
  football: ['grit', 'orbit', 'tusk', 'blaze', 'fable', 'dash'],
  freerun: ['volt', 'colt', 'wisp', 'dash'],
  golf: ['fable', 'rook', 'quill', 'sol', 'halo', 'jinx', 'zeal'],
  karate: ['grit', 'blaze', 'rook', 'nyx', 'zeal', 'orbit'],
  karate_vs: ['grit', 'blaze', 'rook', 'nyx', 'zeal', 'orbit'],
  mixedcombat: ['grit', 'blaze', 'rook', 'nyx', 'zeal', 'tusk'],
  onevone: ['ace', 'lux', 'volt', 'dash', 'grit', 'bolt', 'echo', 'umber'],
  showdown: ['grit', 'blaze', 'rook', 'nyx', 'zeal', 'tusk'],
  skateboard: ['colt', 'jinx', 'wisp', 'zeal', 'sol', 'quill'],
  snowboard_slalom: ['colt', 'kite', 'jinx', 'wisp', 'quill'],
  soccer: ['dash', 'sol', 'volt', 'halo', 'kite', 'colt'],
  sprint: ['volt', 'dash', 'echo', 'ace'],
  surf: ['colt', 'wisp', 'jinx', 'yara', 'lux', 'kite', 'sol'],
  tennis: ['halo', 'quill', 'jinx', 'sol', 'kite', 'dash'],
  threepoint: ['jinx', 'quill', 'dash', 'sol', 'halo', 'colt'],
  threevthree: ['ace', 'lux', 'volt', 'dash', 'grit', 'mako', 'tusk', 'orbit', 'echo', 'umber', 'nyx', 'bolt'],
  volleyball: ['echo', 'umber', 'kite', 'yara', 'halo', 'volt', 'mako', 'wisp'],
  who_scene_it: ['fable', 'quill', 'sol', 'halo', 'rook', 'yara'],
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
