/**
 * rivals — the rival / NPC bodies, forged from MPFB2 (owner 2026-10-16: "the meshy opponents need to be replaced by our models
 * because they are broken, make our npcs look better than the meshy models, replace them all but my own"; decision: forge
 * bodies, made varied).
 *
 *   npx tsx scripts/avatar/rivals.mts [--only key,key] [--out public/models/rivals] [--blender /Applications/Blender.app/Contents/MacOS/Blender]
 *
 * Per rival: scripts/avatar/mpfb/rival.py builds the body in Blender (its own MakeHuman build — sex, age, muscle, weight, height,
 * proportions, the race weights that shape the face, two face targets — one of the pack's skins, one hair asset, brows, eyes, and
 * the kit's garment contract: Kit_<slot>_<itemId> with <jersey|shorts|shoes>.<itemId>), import-mpfb.mts folds it onto the 22-bone
 * FEL rig (Gate 0) with MPFB's own weights, and this script stamps the armature (extras.hairStyle — a runtime node key — and the
 * rival's key), re-encodes the textures for a body that stands back from the camera (skin 1024², hair 512², the rest 256², webp; no normal maps) and writes
 * <out>/<key>.glb + the sibling manifest the avatar gate reads (builtAtSpawn: the FEL clips are built at spawn).
 *
 * Why not the Meshy route any more: every Meshy body is one unrigged mesh given weights by nearest-vertex transfer from the owner's
 * scan (scripts/meshy/skin-transfer.py). It cannot weight fingers, faces or loose cloth (its own header says so); eleven bodies
 * tore badly enough to be retired (RETIRED_ATHLETES), the kept ones carry 13 hand vertices against the kit's 1,796
 * (PLAN-HOOPS-MOTION AI-ARMS), and one mesh with one material means no jersey slot — a team colour never reached a Meshy rival.
 *
 * Variety is the point (owner, 2026-09-19, when the kit roster was replaced: the same kit mesh eight times with a different tint
 * had no character). Every rival here is its own build and face and skin: six ethnic looks, ages 20s–40s, lean to heavy, 1.68 m
 * to 2.05 m; no two share a skin + hair + build. Names are generic (no real people).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, quantize } from '@gltf-transform/functions';
import sharp from 'sharp';
import { RIVAL_WEAR, garmentFor, TOP_ID, BOTTOM_ID, BAGGY, TONAL_LO } from './rivalWear.mts';
import { writePrints } from './rivalPrints.mts';

type Sex = 'male' | 'female';
type HairKey = 'cap' | 'afro' | 'buzz' | 'bun' | 'ponytail' | 'braids';
export interface RivalSpec {
  key: string; sex: Sex; note: string;
  macro: { age: number; muscle: number; weight: number; height: number; proportions: number; african: number; asian: number; caucasian: number };
  face: Record<string, number>;
  skin: string;
  /** an MPFB hair asset, or null (shaved) */
  hair: string | null; hairKey: HairKey | null;
  brows: string;
}
const M = (age: number, muscle: number, weight: number, height: number, proportions: number, african: number, asian: number, caucasian: number) => ({ age, muscle, weight, height, proportions, african, asian, caucasian });
/** The 24 rivals. Builds: lean / athletic / power / heavy; heights from the macro (0.4 ≈ 1.70 m … 0.95 ≈ 2.0 m on a male). */
export const RIVALS: RivalSpec[] = [
  { key: 'ace',   sex: 'male',   note: 'tall wing, lean',            macro: M(0.40, 0.70, 0.40, 0.90, 0.80, 0.90, 0.05, 0.05), face: { 'head-oval': 0.5, 'nose-scale-horiz-incr': 0.3 },      skin: 'young_african_male',                hair: 'short02', hairKey: 'buzz',     brows: 'eyebrow003' },
  { key: 'blaze', sex: 'male',   note: 'power guard, stocky',        macro: M(0.45, 0.90, 0.60, 0.45, 0.70, 0.10, 0.05, 0.85), face: { 'head-square': 0.6, 'chin-jaw-drop-incr': 0.2 },       skin: 'toigo_light_skin_male_ginger',      hair: 'short04', hairKey: 'cap',      brows: 'eyebrow005' },
  { key: 'colt',  sex: 'male',   note: 'young, wiry',                macro: M(0.30, 0.60, 0.35, 0.65, 0.75, 0.20, 0.70, 0.10), face: { 'head-round': 0.4, 'eyebrows-trans-up': 0.3 },         skin: 'young_asian_male',                  hair: 'cortu_short_messy_hair', hairKey: 'cap', brows: 'eyebrow001' },
  { key: 'dash',  sex: 'male',   note: 'quick guard, fade',          macro: M(0.35, 0.75, 0.40, 0.55, 0.75, 0.80, 0.00, 0.20), face: { 'head-invertedtriangular': 0.5 },                     skin: 'middleage_african_male',            hair: 'short03', hairKey: 'buzz',     brows: 'eyebrow002' },
  { key: 'echo',  sex: 'female', note: 'tall forward, braids',       macro: M(0.38, 0.75, 0.45, 0.85, 0.80, 0.85, 0.05, 0.10), face: { 'head-oval': 0.4 },                                   skin: 'young_african_female',              hair: 'braid01', hairKey: 'braids',   brows: 'eyebrow008' },
  { key: 'fable', sex: 'male',   note: 'veteran big, heavy',         macro: M(0.60, 0.70, 0.75, 0.85, 0.60, 0.15, 0.05, 0.80), face: { 'head-rectangular': 0.5, 'nose-scale-horiz-incr': 0.2 }, skin: 'middleage_caucasian_male',          hair: null,      hairKey: null,       brows: 'eyebrow006' },
  { key: 'grit',  sex: 'male',   note: 'enforcer, broad',            macro: M(0.48, 0.95, 0.65, 0.75, 0.65, 0.60, 0.00, 0.40), face: { 'head-square': 0.7 },                                 skin: 'mindfront_skin_male_african_middleage', hair: null, hairKey: null,         brows: 'eyebrow004' },
  { key: 'halo',  sex: 'female', note: 'point guard, ponytail',      macro: M(0.32, 0.65, 0.40, 0.45, 0.80, 0.05, 0.10, 0.85), face: { 'head-invertedtriangular': 0.4 },                                  skin: 'young_caucasian_female',            hair: 'ponytail01', hairKey: 'ponytail', brows: 'eyebrow007' },
  { key: 'jinx',  sex: 'male',   note: 'shooter, slim',              macro: M(0.33, 0.55, 0.35, 0.70, 0.80, 0.05, 0.20, 0.75), face: { 'head-triangular': 0.4 },                             skin: 'toigo_light_skin_male_freckles',    hair: 'culturalibre_hair_02', hairKey: 'cap', brows: 'eyebrow009' },
  { key: 'kite',  sex: 'female', note: 'athletic wing, bun',         macro: M(0.36, 0.75, 0.45, 0.70, 0.75, 0.10, 0.75, 0.15), face: { 'head-round': 0.3 },                                  skin: 'young_asian_female',                hair: 'rehmanpolanski_hair_bun_brown', hairKey: 'bun', brows: 'eyebrow001' },
  { key: 'lux',   sex: 'male',   note: 'showman, afro',              macro: M(0.34, 0.75, 0.45, 0.75, 0.75, 0.90, 0.00, 0.10), face: { 'head-diamond': 0.4 },                                skin: 'young_african_male',                hair: 'afro01',  hairKey: 'afro',     brows: 'eyebrow003' },
  { key: 'mako',  sex: 'male',   note: 'center, very tall',          macro: M(0.42, 0.80, 0.55, 0.98, 0.65, 0.30, 0.30, 0.40), face: { 'head-rectangular': 0.4, 'chin-jaw-drop-incr': 0.15 },  skin: 'middleage_asian_male',              hair: 'short01', hairKey: 'cap',      brows: 'eyebrow002' },
  { key: 'nyx',   sex: 'female', note: 'lockdown, cornrows',         macro: M(0.40, 0.85, 0.50, 0.65, 0.70, 0.75, 0.00, 0.25), face: { 'head-square': 0.3 },                                 skin: 'middleage_african_female',          hair: 'elvs_double_mh_braid', hairKey: 'braids', brows: 'eyebrow004' },
  { key: 'orbit', sex: 'male',   note: 'bruiser, heavy',             macro: M(0.52, 0.65, 0.85, 0.70, 0.55, 0.35, 0.05, 0.60), face: { 'head-round': 0.6 },                                  skin: 'toigo_light_skin_male_bronze',      hair: 'short03', hairKey: 'buzz',     brows: 'eyebrow006' },
  { key: 'quill', sex: 'female', note: 'shooter, bob',               macro: M(0.30, 0.55, 0.40, 0.55, 0.80, 0.05, 0.05, 0.90), face: { 'head-oval': 0.3 },                                   skin: 'young_caucasian_female2',           hair: 'bob02',   hairKey: 'cap',      brows: 'eyebrow009' },
  { key: 'rook',  sex: 'male',   note: 'grinder, compact',           macro: M(0.46, 0.85, 0.55, 0.40, 0.70, 0.25, 0.10, 0.65), face: { 'head-square': 0.5 },                                 skin: 'onlytheghosts_old_eurasian_male',   hair: 'short01', hairKey: 'cap',      brows: 'eyebrow005' },
  { key: 'sol',   sex: 'male',   note: 'athletic, south asian',      macro: M(0.38, 0.75, 0.45, 0.65, 0.75, 0.30, 0.55, 0.15), face: { 'head-oval': 0.4, 'nose-scale-horiz-incr': 0.2 },     skin: 'mindfront_aksel_skin',              hair: 'culturalibre_hair_05', hairKey: 'cap', brows: 'eyebrow002' },
  { key: 'tusk',  sex: 'male',   note: 'big man, beard-age',         macro: M(0.55, 0.80, 0.70, 0.92, 0.60, 0.70, 0.00, 0.30), face: { 'head-rectangular': 0.6 },                            skin: 'middleage_african_male',            hair: null,      hairKey: null,       brows: 'eyebrow006' },
  { key: 'umber', sex: 'female', note: 'power forward, afro',        macro: M(0.42, 0.85, 0.55, 0.80, 0.70, 0.80, 0.00, 0.20), face: { 'head-round': 0.3 },                                  skin: 'young_african_female',              hair: 'afro01',  hairKey: 'afro',     brows: 'eyebrow008' },
  { key: 'volt',  sex: 'male',   note: 'leaper, lean',               macro: M(0.28, 0.80, 0.35, 0.82, 0.85, 0.55, 0.05, 0.40), face: { 'head-invertedtriangular': 0.4 },                     skin: 'young_caucasian_male2',             hair: 'short02', hairKey: 'buzz',     brows: 'eyebrow001' },
  { key: 'wisp',  sex: 'female', note: 'quick, long hair',           macro: M(0.28, 0.60, 0.35, 0.50, 0.80, 0.20, 0.50, 0.30), face: { 'head-invertedtriangular': 0.3 },                                  skin: 'onlytheghosts_young_eurasian_female', hair: 'long01', hairKey: 'cap',      brows: 'eyebrow007' },
  { key: 'yara',  sex: 'female', note: 'wing, south asian',          macro: M(0.34, 0.70, 0.45, 0.65, 0.75, 0.30, 0.50, 0.20), face: { 'head-oval': 0.3 },                                   skin: 'cutoff3d_indian_female_skin',       hair: 'elvs_french_braid_variation', hairKey: 'braids', brows: 'eyebrow008' },
  { key: 'zeal',  sex: 'male',   note: 'two-way guard, tattooed',    macro: M(0.40, 0.80, 0.45, 0.60, 0.75, 0.05, 0.05, 0.90), face: { 'head-diamond': 0.3 },                                skin: 'ken1138_caucasian_male_tattooed_skin', hair: 'culturalibre_hair_06', hairKey: 'cap', brows: 'eyebrow003' },
  { key: 'bolt',  sex: 'male',   note: 'slasher, mid',               macro: M(0.32, 0.75, 0.45, 0.68, 0.75, 0.45, 0.25, 0.30), face: { 'head-triangular': 0.3 },                             skin: 'young_asian_male',                  hair: 'short04', hairKey: 'cap',      brows: 'eyebrow004' },
];

/**
 * THE FIRST BUILD, MEASURED (/dev/model sheet + stretch, 2026-10-16): the height and muscle macros pushed past the kit's own
 * build broke import-mpfb's A→T rest bake — the tallest four came out 2.24–2.43 m with the shoulders blown into wings and 38–70
 * edges torn past 20 cm (every other rival 0) — and the short women 1.41–1.45 m. So the macros stay near the kit body's (height
 * 0.5; muscle ≤ 0.75; weight 0.35–0.65; proportions 0.6–0.8; age 24–35 — the first build's 0.28–0.36 made teenagers) and HEIGHT is the armature's uniform scale, roster-from-kit's
 * way: each scale is the rival's target height over the body's measured height at scale 1 (the sheet's report: the race and age
 * macros move it too — an Asian-weighted build stands lower), so the court reads 1.70–2.08 m: guards to a center.
 */
export function bakedMacro(m: RivalSpec['macro']): RivalSpec['macro'] {
  const c = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return { ...m, height: 0.5, muscle: c(m.muscle, 0.35, 0.75), weight: c(m.weight, 0.35, 0.65), proportions: c(m.proportions, 0.6, 0.8), age: 0.47 + c(m.age, 0, 1) * 0.15 };   // MakeHuman's age: 0.5 = 25 years, 0.3 ≈ 17 (a teen's head on a man) — adults only, 24–35
}
/** Each rival's height (the armature's scale). Its `jersey` / `shorts` are the first build's colourway, kept for the record: the
 *  style pass bakes rivalWear.mts's (RIVAL_WEAR[key].jersey / .shorts). */
export const RIVAL_LOOK: Readonly<Record<string, { scale: number; jersey: string; shorts: string }>> = {
  ace:   { scale: 1.07, jersey: '#f2f2ee', shorts: '#1d2a6b' }, blaze: { scale: 1.034, jersey: '#c8102e', shorts: '#111114' },
  colt:  { scale: 1.082, jersey: '#2e8b57', shorts: '#f0f0ea' }, dash:  { scale: 1.0, jersey: '#ffb81c', shorts: '#4b2e83' },
  echo:  { scale: 1.106, jersey: '#5b2a86', shorts: '#e9e3d6' }, fable: { scale: 1.147, jersey: '#2a2a2e', shorts: '#8a8d91' },
  grit:  { scale: 1.1, jersey: '#7a1f2b', shorts: '#e8c547' }, halo:  { scale: 1.055, jersey: '#00a3ad', shorts: '#14213d' },
  jinx:  { scale: 1.08, jersey: '#ff6f3c', shorts: '#232323' }, kite:  { scale: 1.146, jersey: '#e4007c', shorts: '#1b1b1f' },
  lux:   { scale: 1.054, jersey: '#ffd23f', shorts: '#0b3d91' }, mako:  { scale: 1.175, jersey: '#0a6e5c', shorts: '#d9d9d6' },
  nyx:   { scale: 1.059, jersey: '#101418', shorts: '#c1272d' }, orbit: { scale: 1.106, jersey: '#3c6e71', shorts: '#e0e0dc' },
  quill: { scale: 1.061, jersey: '#7fb7be', shorts: '#2b2d42' }, rook:  { scale: 1.028, jersey: '#5d576b', shorts: '#f4a259' },
  sol:   { scale: 1.08, jersey: '#f25c54', shorts: '#2f2f33' }, tusk:  { scale: 1.133, jersey: '#e9ecef', shorts: '#6a040f' },
  umber: { scale: 1.082, jersey: '#386641', shorts: '#f2e8cf' }, volt:  { scale: 1.077, jersey: '#4cc9f0', shorts: '#1a1a2e' },
  wisp:  { scale: 1.062, jersey: '#b5179e', shorts: '#f7f7f2' }, yara:  { scale: 1.099, jersey: '#ff9f1c', shorts: '#2ec4b6' },
  zeal:  { scale: 1.05, jersey: '#222831', shorts: '#00adb5' }, bolt:  { scale: 1.062, jersey: '#d00000', shorts: '#ffba08' },
};
const hexRgb = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)]; };

const flag = (name: string, dflt: string): string => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT_DIR = flag('--out', 'public/models/rivals');
const BLENDER = flag('--blender', '/Applications/Blender.app/Contents/MacOS/Blender');
const ONLY = new Set(flag('--only', '').split(',').filter(Boolean));
const HERE = resolve('scripts/avatar');
const TMP = join(tmpdir(), `fel-rivals-${process.pid}`);
mkdirSync(OUT_DIR, { recursive: true }); mkdirSync(TMP, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

if (process.argv[1]?.endsWith('rivals.mts')) {
  for (const r of RIVALS) {
    if (ONLY.size && !ONLY.has(r.key)) continue;
    // THE CASUAL WARDROBE (style pass, owner 2026-10-16; rivalWear.ts): one garment per slot — applyKit shows a slot's only
    // garment in every mode — the top and the bottom printed and shaped in Blender (mpfb/style.py)
    const w = RIVAL_WEAR[r.key];
    if (!w) throw new Error(`${r.key}: no wardrobe in rivalWear.ts`);
    const topId = TOP_ID[w.top], botId = BOTTOM_ID[w.bottom];
    const topPrints = await writePrints(TMP, `${r.key}-top`, w.front, w.back);
    const spec = { key: r.key, sex: r.sex, macro: bakedMacro(r.macro), face: r.face, skin: r.skin, hair: r.hair, hairKey: r.hairKey, brows: r.brows,
      tops: { [topId]: garmentFor(w.top, r.sex, r.key) }, shorts: { [botId]: garmentFor(w.bottom, r.sex, r.key) },
      shoes: { shoes_evo: w.shoes[0], shoes_flight: w.shoes[1] },
      style: {
        tops: { [topId]: { ...(w.top === 'tank' ? { sleeveless: { threshold: 0.5 } } : {}), print: { size: 512, lo: TONAL_LO[w.top], ...topPrints, frontAt: w.top === 'tank' ? 'chestBig' : 'chest', bands: w.topBands ?? [] } } },
        shorts: { [botId]: { ...(w.bottom === 'baggy' ? { baggy: BAGGY } : {}), print: { size: 256, lo: TONAL_LO[w.bottom], bands: w.bottomBands ?? [] } } },
      } };
    const specFile = join(TMP, `${r.key}.json`), raw = join(TMP, `${r.key}-mpfb.glb`), fel = join(TMP, `${r.key}-fel.glb`);
    writeFileSync(specFile, JSON.stringify(spec));
    const t0 = Date.now();
    const log = execFileSync(BLENDER, ['-b', '--python', join(HERE, 'mpfb/rival.py'), '--', '--spec', specFile, '--out', raw], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const failed = log.split('\n').filter((l) => /^(RIVAL|STYLE) .*FAILED/.test(l));
    if (process.env.STYLE_LOG) for (const l of log.split('\n').filter((x) => /^STYLE /.test(x))) console.log(`   ${r.key} ${l}`);
    if (!existsSync(raw)) { console.error(`✘ ${r.key}: Blender wrote nothing\n${log.slice(-2000)}`); process.exitCode = 1; continue; }
    execFileSync('npx', ['tsx', join(HERE, 'import-mpfb.mts'), raw, fel, '--no-quantize'], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
    const doc = await io.readBinary(new Uint8Array(readFileSync(fel)));
    const root = doc.getRoot();
    const skin = root.listSkins()[0]; const hips = skin.listJoints()[0]; const armature = hips.getParentNode() ?? root.listNodes()[0];
    // `look`: the rival's accessory signature (CharacterLibrary hangs it instead of a seeded deal)
    armature.setExtras({ ...(armature.getExtras() ?? {}), hairStyle: r.hairKey ?? 'bald', athlete: r.key, look: w.look });
    const look = { scale: (RIVAL_LOOK[r.key] ?? { scale: 1 }).scale, jersey: w.jersey, shorts: w.shorts };
    armature.setScale([look.scale, look.scale, look.scale]);
    // THE CLOTH'S OWN MAP IS THE PRINT (style pass). MakeHuman's garments carry their own colour maps (the keyhole tank a leopard
    // pattern) under every tint — the fits and the team colours multiply the map (playerIdentity.tintSlot). style.py replaced the
    // top's and the bottom's with a TONAL print (grey on white: the garment's own seams and pockets, the graphic, the bands), so
    // that map stays and anything else on the cloth goes; the colourway is the base colour. The shoes keep their maps.
    const printOf = (m: ReturnType<typeof root.listMaterials>[number]) => { const t = m.getBaseColorTexture(); return t && /felprint/.test(`${t.getName()} ${t.getURI()}`) ? t : null; };
    for (const mat of root.listMaterials()) {
      const n = mat.getName();
      const hex = n.startsWith('jersey') ? look.jersey : n.startsWith('shorts') ? look.shorts : null;
      if (!hex) continue;
      if (!printOf(mat)) mat.setBaseColorTexture(null);
      const [cr, cg, cb] = hexRgb(hex); mat.setBaseColorFactor([cr, cg, cb, 1]); mat.setMetallicFactor(0); mat.setRoughnessFactor(0.78);
    }
    // A BODY THAT STANDS BACK FROM THE CAMERA, ON A PHONE BUDGET. Measured in play (1v1, first build): vram 262 → 352 MB against the
    // Meshy rivals — a forge body carried 16 MB of maps (a Meshy one 10.6). The skin keeps its colour map at 1024² (the face), the
    // hair at 512², everything else at 256² (eyes, brows, shoes: a few dozen pixels on screen); no normal, occlusion or
    // metal-roughness map survives on a rival (the cloth weave and the shoe tread are not visible from the play camera). ≈ 8 MB.
    for (const mat of root.listMaterials()) { mat.setNormalTexture(null); mat.setOcclusionTexture(null); mat.setMetallicRoughnessTexture(null); }
    const skinMaps = new Set(root.listMaterials().filter((m) => m.getName() === 'skin').map((m) => m.getBaseColorTexture()).filter(Boolean));
    const hairMaps = new Set(root.listMaterials().filter((m) => m.getName().startsWith('hair')).map((m) => m.getBaseColorTexture()).filter(Boolean));
    const topPrint = new Set(root.listMaterials().filter((m) => m.getName().startsWith('jersey')).map(printOf).filter(Boolean));   // the graphic and the number: 512² to read at play distance
    for (const t of root.listTextures()) {
      const img = t.getImage(); if (!img) continue;
      const px = skinMaps.has(t) ? 1024 : hairMaps.has(t) || topPrint.has(t) ? 512 : 256;
      t.setImage(new Uint8Array(await sharp(img).resize(px, px, { fit: 'fill' }).webp({ quality: 80 }).toBuffer())).setMimeType('image/webp');
    }
    // ONE SKELETON A BODY. MPFB exports every garment with its own glTF skin over the same 22 joints, and Babylon makes a Skeleton
    // per skin: the first build put 9 skeletons in every rival (3v3 went from 23 skeletons in the scene to 99). Unquantized, the
    // skins carry the same joints and the same inverse binds, so every mesh takes the first; quantized over ONE volume (the scene's,
    // not each mesh's — a per-mesh volume is written into each skin's inverse binds) they stay one.
    const skins = root.listSkins(), s0 = skins[0];
    const ib0 = s0.getInverseBindMatrices()?.getArray();
    for (const sk of skins.slice(1)) {
      const ib = sk.getInverseBindMatrices()?.getArray(); let d = 0;
      if (ib && ib0) for (let i = 0; i < ib.length; i++) d = Math.max(d, Math.abs(ib[i] - ib0[i]));
      const same = sk.listJoints().length === s0.listJoints().length && sk.listJoints().every((j, i) => j === s0.listJoints()[i]);
      if (!same || d > 1e-4) throw new Error(`${r.key}: skin ${sk.getName()} differs from the body's (joints ${same ? 'same' : 'differ'}, inverse binds Δ ${d})`);
    }
    for (const n of root.listNodes()) if (n.getSkin() && n.getSkin() !== s0) n.setSkin(s0);
    await doc.transform(prune(), quantize({ quantizationVolume: 'scene', quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8, quantizeGeneric: 8 }));   // (prune also takes the dropped cloth maps)
    const glb = await io.writeBinary(doc);
    writeFileSync(join(OUT_DIR, `${r.key}.glb`), glb);
    writeFileSync(join(OUT_DIR, `${r.key}.json`), JSON.stringify({ fps: 30, clips: [], builtAtSpawn: true, athlete: r.key, sex: r.sex, note: r.note,
      source: 'MPFB2 (MakeHuman, CC0) — scripts/avatar/rivals.mts', rig: 'MPFB2 mixamo rig folded to the 22-bone FEL spec (scripts/avatar/import-mpfb.mts)',
      skin: r.skin, hair: r.hair, macro: bakedMacro(r.macro), look }, null, 2) + '\n');
    console.log(`✔ ${r.key.padEnd(6)} ${r.sex.padEnd(6)} ${(glb.byteLength / 1024).toFixed(0).padStart(5)} KB  ${((Date.now() - t0) / 1000).toFixed(0)} s  ${r.note}${failed.length ? `  [${failed.join(' | ')}]` : ''}`);
  }
  rmSync(TMP, { recursive: true, force: true });
}
