// sportKitDefaults — the per-sport DEFAULT kit (owner decision 2026-09-05: "Per-sport defaults").
//
// Until today the hero wore one outfit in every sport: the Closet's catalogue default (`top_lab`, `shorts_court`,
// `shoes_flight`) on /play, and the body's FIRST garment per slot in the dev harness (kit.applyKit's fallback). A
// gi-less karate fighter and a tennis player in boots read wrong. This table names a kit per sport from the garments
// the body actually carries (scripts/avatar/mpfb/dress-kit.py — two tops, two shorts, two shoes; ids from
// lib/closet/wearable-catalog.ts, never invented here).
//
// RULE: a Closet pick always wins. The sport default fills only a slot the Closet left empty, or every slot when no
// Closet answered (guests, the dev harness, rivals spawned from the kit body). applyKit consults it; nothing else.
//
// Keyed by the harness's `def.modeId` (what ModeHarness stamps on `scene.metadata.felModeId`); the registry keys
// that differ from their modeId (snowboard_slalom→snowboard, derby→baseball, penalty→soccer, karate_vs→karate-vs)
// are listed too so either name resolves.
import { WEARABLES } from '../../closet/wearable-catalog';
import type { KitSlot } from './kit';

export type SportKit = Readonly<Record<KitSlot, string>>;

// The two tops: `top_lab` is the crude tee (MakeHuman elvs_crude_t-shirt — the plainer, looser cut);
// `top_bonds` is the keyhole tank (the jersey read). Shorts: `shorts_court` and `shorts_glitch` are the SAME
// source garment and share one material today (measured 2026-09-05), so `shorts_court` is the plain short.
// Shoes: `shoes_evo` is the hi-top; `shoes_flight` is the low trainer once garmentFixes brings it to the ankle.
const COMBAT: SportKit = { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_evo' };
const BOARD: SportKit = { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' };
const COURT: SportKit = { tops: 'top_bonds', shorts: 'shorts_court', shoes: 'shoes_evo' };
const FIELD: SportKit = { tops: 'top_bonds', shorts: 'shorts_court', shoes: 'shoes_flight' };
// owner approval 2026-09-05 ("skinning of the rigs"): the Meshy baseball jersey, fitted and skinned in Blender, ships as a kit pack
const BASEBALL: SportKit = { tops: 'top_baseball', shorts: 'shorts_court', shoes: 'shoes_flight' };
const FOOTBALL: SportKit = { tops: 'top_football', shorts: 'shorts_court', shoes: 'shoes_flight' };   // the Meshy football jersey (kit pack)

/** Every mode without its own row wears this — the court fit, the body's most complete read. */
export const FALLBACK_KIT: SportKit = COURT;

export const SPORT_KIT_DEFAULTS: Readonly<Record<string, SportKit>> = {
  // combat
  karate: COMBAT, 'karate-vs': COMBAT, karate_vs: COMBAT, mixedcombat: COMBAT, duel: COMBAT, showdown: COMBAT,
  // board
  skateboard: BOARD, surf: BOARD, snowboard: BOARD, snowboard_slalom: BOARD, bigair: BOARD,
  // court
  tennis: COURT, volleyball: COURT, onevone: COURT, threevthree: COURT, dunk: COURT, dunkduel: COURT, threepoint: COURT,
  carnival: COURT,
  // field / track / studio — a jersey and the low trainer
  football: FOOTBALL, sprint: FIELD, soccer: FIELD, penalty: FIELD, baseball: BASEBALL, derby: BASEBALL, golf: FIELD,
  gymnastics: FIELD, dance: FIELD,
};

/** The default kit for a mode; an unknown or missing id takes FALLBACK_KIT. Pure. */
export function sportKitDefault(modeId: string | null | undefined): SportKit {
  return (modeId && SPORT_KIT_DEFAULTS[modeId]) || FALLBACK_KIT;
}

/** Ids the catalogue sells for the three kit slots — what a table entry must be drawn from. */
export function catalogueKitIds(): ReadonlySet<string> {
  return new Set(WEARABLES.filter((w) => w.slot === 'tops' || w.slot === 'shorts' || w.slot === 'shoes').map((w) => w.itemId));
}
