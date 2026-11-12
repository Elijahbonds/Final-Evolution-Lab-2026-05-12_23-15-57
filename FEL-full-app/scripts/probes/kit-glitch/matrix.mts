// KIT-GLITCH capture matrix: who, in which pose, from where. rig.mts drives it; rig-entry.ts measures each cell.
// The Closet looks are built here with the Creator's own doc shape (never the test-only archetype fixtures, which no
// non-test file may import): code-built outfits and the extreme ends of the shape and girth sliders.
import type { CreatorCloth, CreatorDoc } from '../../../lib/creator/look/doc';

export interface Subject {
  id: string;
  modeId: string;
  /** the Closet's own scene (its camera planes and studio light, no ink) vs a mode's (light rig + ink) */
  closet: boolean;
  spawn: Record<string, unknown>;
  tiers?: string[];
  /** a reduced pose / camera set (the 24 rivals) */
  rivalPoses?: string[];
  cams?: string[];
}

const doc = (o: Partial<CreatorDoc>): CreatorDoc => ({ v: 1, parts: [], paint: [], colours: {}, shape: { face: {}, body: {} }, flags: { suit: false }, ...o } as CreatorDoc);
const cloth = (id: string, kind: CreatorCloth['kind'], style: CreatorCloth['style'], colour: string, extra: Partial<CreatorCloth> = {}): CreatorCloth => ({ id, kind, style, colour, ...extra } as CreatorCloth);
const GIRTH = (v: number) => ({ head: v, neck: v, chest: v, belly: v, upperArms: v, forearms: v, thighs: v, calves: v });

const HOODIE_OUTFIT = [cloth('t1', 'top', 'hoodie', '#2a3550'), cloth('b1', 'bottom', 'pants', '#1c1c22'), cloth('f1', 'feet', 'boots', '#5a4632')];
const TEE_OUTFIT = [cloth('t1', 'top', 'tee', '#c84b3e'), cloth('b1', 'bottom', 'shorts', '#20252e'), cloth('f1', 'feet', 'shoes', '#eeeeee')];
const TANK_OUTFIT = [cloth('t1', 'top', 'tank', '#e0b441'), cloth('b1', 'bottom', 'leggings', '#151515')];
const LAYERED = [cloth('t0', 'top', 'tee', '#eeeeee'), cloth('t1', 'top', 'jacket', '#2c6e55', { open: 0.6 }), cloth('b1', 'bottom', 'skirt', '#3a2e28', { flare: 0.6 }), cloth('g1', 'gloves', 'gloves', '#111111')];

/** Closet subjects: the player's own body in the Studio scene, and the same looks in a mode (ink, light rig). */
const closetLooks: { id: string; body: string; creator?: CreatorDoc; wardrobe?: Record<string, string>; frame?: { heightScale: number; buildScale: number } }[] = [
  { id: 'male-default', body: 'kit-male' },
  { id: 'female-default', body: 'kit-female' },
  { id: 'male-tank', body: 'kit-male', wardrobe: { tops: 'top_bonds', shorts: 'shorts_court', shoes: 'shoes_evo' } },
  { id: 'male-girth-max', body: 'kit-male', creator: doc({ shape: { face: {}, body: {}, girth: GIRTH(1.6) } }) },
  { id: 'female-girth-max', body: 'kit-female', creator: doc({ shape: { face: {}, body: {}, girth: GIRTH(1.6) } }) },
  { id: 'male-girth-min', body: 'kit-male', creator: doc({ shape: { face: {}, body: {}, girth: GIRTH(0.7) } }) },
  { id: 'male-frame-big', body: 'kit-male', creator: doc({ shape: { face: {}, body: { legs: 1.04, torso: 1.04, shoulders: 1.08 }, girth: GIRTH(1.3) } }), frame: { heightScale: 1.08, buildScale: 1.12 } },
  { id: 'male-hoodie', body: 'kit-male', creator: doc({ clothes: HOODIE_OUTFIT }) },
  { id: 'female-tee', body: 'kit-female', creator: doc({ clothes: TEE_OUTFIT }) },
  { id: 'female-tank', body: 'kit-female', creator: doc({ clothes: TANK_OUTFIT, shape: { face: {}, body: {}, girth: GIRTH(1.45) } }) },
  { id: 'male-layered', body: 'kit-male', creator: doc({ clothes: LAYERED }) },
];

export const RIVALS = ['ace', 'blaze', 'bolt', 'colt', 'dash', 'echo', 'fable', 'grit', 'halo', 'jinx', 'kite', 'lux', 'mako', 'nyx', 'orbit', 'quill', 'rook', 'sol', 'tusk', 'umber', 'volt', 'wisp', 'yara', 'zeal'];

export const SUBJECTS: Subject[] = [
  ...closetLooks.map((l) => ({ id: `closet-${l.id}`, modeId: 'closet', closet: true, spawn: { kind: 'player', body: l.body, creator: l.creator ?? null, wardrobe: l.wardrobe, frame: l.frame } })),
  ...closetLooks.slice(0, 4).concat(closetLooks.filter((l) => /hoodie|tee$/.test(l.id))).map((l) => ({ id: `game-${l.id}`, modeId: 'dunk', closet: false, spawn: { kind: 'player', body: l.body, creator: l.creator ?? null, wardrobe: l.wardrobe, frame: l.frame } })),
  // the rivals in a hoops mode (their sport kit) through the real roster path: an opponent on the rival's own file
  ...RIVALS.map((r) => ({ id: `rival-${r}`, modeId: 'onevone', closet: false, spawn: { kind: 'rival', url: `/models/rivals/${r}.glb`, name: r.toUpperCase() }, rivalPoses: ['idle', 'run', 'dunk', 'squat', 'overhead', 'kick', 'celebrate'], cams: ['mid-front', 'mid-back', 'far-front'] })),
  // the kit packs (Meshy garments skinned to the rig, attached late): football and baseball tops on a rival
  { id: 'pack-football', modeId: 'football', closet: false, spawn: { kind: 'rival', url: '/models/rivals/grit.glb', name: 'GRIT' } },
  { id: 'pack-baseball', modeId: 'derby', closet: false, spawn: { kind: 'rival', url: '/models/rivals/rook.glb', name: 'ROOK' } },
];

/** Poses: the clip (first one this body carries) and where in it. */
export const POSES: { id: string; clips: string[]; frac: number }[] = [
  { id: 'idle', clips: ['idle_stand'], frac: 0.3 },
  { id: 'run', clips: ['run', 'bball_mc_run'], frac: 0.25 },
  { id: 'run2', clips: ['run', 'bball_mc_run'], frac: 0.75 },
  { id: 'dunk', clips: ['dunk_mc_tomahawk', 'tomahawk', 'dunk_finish_tomahawk', 'windmill'], frac: 0.55 },
  { id: 'jump', clips: ['jumpshot', 'bball_mc_jumpshot'], frac: 0.5 },
  { id: 'squat', clips: ['ex_deep_squat_rock', 'ex_fast_squat', 'squat', 'ex_chair_squat', 'dunk_land_crouch', 'crouch'], frac: 0.5 },
  { id: 'lunge', clips: ['bball_def_lunge_left', 'ex_curtsy_lunge', 'lunge'], frac: 0.5 },
  { id: 'overhead', clips: ['dunk_mc_tomahawk_air', 'tomahawk', 'jumpshot'], frac: 0.35 },
  { id: 'kick', clips: ['karate_mc_high_kick', 'high_kick', 'cap_au_kick'], frac: 0.5 },
  { id: 'celebrate', clips: ['dunk_mc_celebrate_big', 'dunk_celebrate_big', 'celebrate', 'bball_score_celebrate'], frac: 0.5 },
];

/** Cameras: distance (m), yaw from the front (deg), pitch (deg), target lift off the body's centre (m). */
export const CAMS: { id: string; dist: number; yaw: number; pitch: number; dy: number }[] = [
  { id: 'close-front', dist: 1.5, yaw: 25, pitch: 5, dy: 0.15 },
  { id: 'close-side', dist: 1.5, yaw: 95, pitch: 0, dy: -0.15 },
  { id: 'mid-front', dist: 3.2, yaw: -20, pitch: 8, dy: 0 },
  { id: 'mid-back', dist: 3.2, yaw: 160, pitch: 12, dy: 0 },
  { id: 'far-front', dist: 9, yaw: 10, pitch: 15, dy: 0 },
];
