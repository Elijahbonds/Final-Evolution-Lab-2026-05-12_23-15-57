// curate-props — ship pass 4, phase 2: the venue prop set, copied from the Kenney CC0 kits
// (owner-approved 2026-09-04, fetched to ~/Developer/FEL-swarm/tools/kenney) into
// public/models/props/<kit>/ with each kit's Textures folder and a manifest that records
// the licence. Only the props a venue uses ship; the kits stay in tools.
//   npx tsx scripts/venue/curate-props.mts
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const KITS = join(process.env.HOME!, 'Developer/FEL-swarm/tools/kenney/3d');
const OUT = 'public/models/props';
// venue → kit → models (names without .glb)
export const VENUE_PROPS: Record<string, Record<string, string[]>> = {
  'venice-court':  { nature: ['tree_palm', 'tree_palmDetailedTall', 'tree_palmShort', 'tree_palmBend'], 'city-suburban': ['fence-1x3', 'fence-low', 'planter'], racing: ['lightPostModern', 'grandStand'], 'mini-arena': ['banner'] },
  'dojo':          { 'mini-arena': ['column', 'banner', 'statue', 'wall', 'wall-gate', 'tree', 'floor-detail'], nature: ['tree_pineRoundA', 'rock_smallFlatA'] },
  'links':         { nature: ['tree_oak', 'tree_default', 'tree_detailed', 'plant_bushLarge', 'plant_bush', 'rock_largeA', 'rock_largeB', 'fence_simple', 'grass_large'], minigolf: ['flag-red', 'flag-large-red'], racing: ['tent', 'flagRed'] },
  'ballpark':      { racing: ['grandStandCovered', 'grandStand', 'lightPostLarge', 'barrierWall', 'flagRed', 'bannerTowerRed'], nature: ['tree_default', 'tree_tall'] },
  'stadium':       { racing: ['grandStandCoveredRound', 'grandStandRound', 'barrierWhite', 'lightPostLarge', 'bannerTowerGreen', 'flagGreen'] },
  'gridiron':      { racing: ['grandStandCovered', 'overheadLights', 'lightPostLarge', 'barrierWall', 'flagCheckers', 'bannerTowerRed'] },
  'skatepark':     { 'mini-skate': ['half-pipe', 'obstacle-box', 'obstacle-middle', 'obstacle-end', 'rail-low', 'rail-high', 'rail-curve', 'rail-slope'], 'city-suburban': ['fence-1x4', 'fence-low'], nature: ['tree_palm', 'tree_palmTall'], racing: ['lightPostModern'] },
  'slope':         { nature: ['tree_pineTallA', 'tree_pineTallB', 'tree_pineSmallA', 'tree_pineSmallB', 'tree_pineRoundB', 'rock_tallA', 'rock_tallB', 'rock_largeD'], racing: ['flagRed', 'tent', 'fenceStraight'] },
  'surf-break':    { nature: ['tree_palmBend', 'tree_palmDetailedShort', 'rock_largeC', 'rock_smallG'], racing: ['tent', 'flagGreen', 'tentRoof'] },
  'gym':           { 'mini-arena': ['banner', 'block', 'border-straight'], racing: ['grandStand', 'overheadLights'] },
};

const copied = new Map<string, Set<string>>();
for (const venue of Object.values(VENUE_PROPS)) for (const [kit, models] of Object.entries(venue)) {
  const set = copied.get(kit) ?? new Set<string>(); copied.set(kit, set);
  for (const m of models) set.add(m);
}
let files = 0, bytes = 0; const missing: string[] = [];
for (const [kit, models] of copied) {
  mkdirSync(join(OUT, kit), { recursive: true });
  for (const m of models) {
    const src = join(KITS, kit, `${m}.glb`);
    if (!existsSync(src)) { missing.push(`${kit}/${m}`); continue; }
    copyFileSync(src, join(OUT, kit, `${m}.glb`)); files++; bytes += statSync(src).size;
  }
  const tex = join(KITS, kit, 'Textures');
  if (existsSync(tex)) { mkdirSync(join(OUT, kit, 'Textures'), { recursive: true }); for (const f of readdirSync(tex)) { copyFileSync(join(tex, f), join(OUT, kit, 'Textures', f)); bytes += statSync(join(tex, f)).size; } }
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), licence: 'CC0 1.0 — Kenney (kenney.nl), via github.com/shorepine/kenney', kits: Object.fromEntries([...copied].map(([k, v]) => [k, [...v].sort()])), venues: VENUE_PROPS }, null, 2) + '\n');
console.log(`curate-props: ${files} models, ${(bytes / 1024 / 1024).toFixed(1)} MB (with textures) → ${OUT}/ · missing: ${missing.join(', ') || 'none'}`);
