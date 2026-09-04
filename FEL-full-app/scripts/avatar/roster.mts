/**
 * ARCHIVED 2026-09-04 (ship pass 3): the roster now comes from the kit bodies —
 * scripts/avatar/roster-from-kit.mts. This script bakes variants of the FORGE
 * hero, which lives on under public/models/_forge/ for A/B and rollback.
 *
 * FEL ATHLETE ROSTER — turns the pipeline-cleaned template into N distinct
 * athletes so modes stop fielding clones.
 *
 *   npx tsx scripts/avatar/roster.mts
 *
 * Input : public/models/fel-hero.glb  (forged — MUST already be pipeline-cleaned)
 * Output: public/models/athletes/<key>.glb + <key>.json manifest per athlete
 *
 * What makes an athlete distinct here (baked, not runtime):
 *   - proportions  — uniform scale baked onto the Armature root (skeleton is
 *                    its child, so bone world transforms scale; local-space
 *                    animation translation tracks are unaffected)
 *   - kit colorway — material baseColorFactor multiplies the texture
 *   - warm/cool grade on the texture so two athletes never read as the same
 *     body under arena light
 *
 * These are VARIANTS OF THE FORGED TEMPLATE. To add a new body, extend the
 * forge (scripts/avatar/forge.mts) or run pipeline.mts on a new source, then
 * add an entry here — the runtime (lib/babylon/core/athleteRoster.ts) picks
 * up anything listed in this directory.
 *
 * The forged hero's materials are the customization contract — skin / jersey
 * / shorts / shoes / hair. The roster tints CLOTHING and SKIN separately so
 * athletes differ in body AND kit, never as clones with a color wash.
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';

const TEMPLATE = 'public/models/fel-hero.glb';
const OUT_DIR = 'public/models/athletes';

interface Athlete {
  key: string;
  scale: number;                    // baked height/bulk multiplier
  skin: [number, number, number];   // baseColorFactor on the skin material
  jersey: [number, number, number]; // kit primary
  shorts: [number, number, number]; // kit secondary
  shoes: [number, number, number];
  hair: [number, number, number];
  /** Forge hair node shown for this athlete (lib/babylon/core/hairStyles.ts keys). */
  hairStyle: 'cap' | 'afro' | 'buzz' | 'bun' | 'ponytail' | 'braids' | 'hijab';
  note: string;
}

// Eight bodies (Phase 3 "more looks", 2026-09-02): skin tones span the Closet's
// inclusive range, every hair node ships on someone, kits never repeat.
const ATHLETES: Athlete[] = [
  { key: 'atlas', scale: 1.07, skin: [0.45, 0.30, 0.20], jersey: [0.10, 0.55, 0.60], shorts: [0.06, 0.20, 0.24], shoes: [0.90, 0.90, 0.88], hair: [0.05, 0.04, 0.03], hairStyle: 'buzz',     note: 'tall, teal kit' },
  { key: 'blitz', scale: 0.94, skin: [0.85, 0.60, 0.42], jersey: [0.85, 0.20, 0.16], shorts: [0.10, 0.10, 0.12], shoes: [0.75, 0.16, 0.14], hair: [0.35, 0.20, 0.08], hairStyle: 'cap',      note: 'compact, red kit' },
  { key: 'nova',  scale: 1.00, skin: [0.62, 0.42, 0.28], jersey: [0.45, 0.30, 0.80], shorts: [0.16, 0.10, 0.30], shoes: [0.92, 0.85, 0.60], hair: [0.02, 0.02, 0.03], hairStyle: 'braids',   note: 'violet kit' },
  { key: 'titan', scale: 1.12, skin: [0.72, 0.50, 0.34], jersey: [0.90, 0.60, 0.15], shorts: [0.30, 0.18, 0.06], shoes: [0.20, 0.20, 0.22], hair: [0.16, 0.10, 0.06], hairStyle: 'afro',     note: 'big, amber kit' },
  { key: 'ember', scale: 0.97, skin: [0.36, 0.22, 0.14], jersey: [0.95, 0.45, 0.10], shorts: [0.12, 0.08, 0.06], shoes: [0.95, 0.95, 0.92], hair: [0.03, 0.02, 0.02], hairStyle: 'ponytail', note: 'deep skin, orange kit' },
  { key: 'frost', scale: 1.03, skin: [0.93, 0.80, 0.70], jersey: [0.20, 0.35, 0.85], shorts: [0.95, 0.95, 0.95], shoes: [0.15, 0.15, 0.18], hair: [0.80, 0.68, 0.40], hairStyle: 'bun',      note: 'pale skin, royal blue kit' },
  { key: 'sage',  scale: 1.00, skin: [0.55, 0.36, 0.24], jersey: [0.15, 0.60, 0.30], shorts: [0.06, 0.18, 0.10], shoes: [0.85, 0.85, 0.80], hair: [0.08, 0.05, 0.03], hairStyle: 'hijab',    note: 'green kit, hijab' },
  { key: 'vex',   scale: 1.09, skin: [0.78, 0.56, 0.40], jersey: [0.08, 0.08, 0.10], shorts: [0.85, 0.15, 0.55], shoes: [0.85, 0.15, 0.55], hair: [0.55, 0.05, 0.10], hairStyle: 'cap',      note: 'black and magenta kit' },
];

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

mkdirSync(OUT_DIR, { recursive: true });
const manifest = JSON.parse(readFileSync(TEMPLATE.replace(/\.glb$/, '.json'), 'utf8'));

for (const a of ATHLETES) {
  const doc = await io.read(TEMPLATE);
  const root = doc.getRoot();

  const armature = root.listNodes().find((n) => n.getName() === 'Armature');
  if (!armature) throw new Error('template has no Armature root — run pipeline.mts first');
  armature.setScale([a.scale, a.scale, a.scale]);
  // The runtime (CharacterLibrary) reads this off the root node's extras and
  // shows the matching Hair_<key> node instead of the default cap.
  armature.setExtras({ ...(armature.getExtras() ?? {}), hairStyle: a.hairStyle });

  // Per-material colorway — the forge's named materials are the contract.
  for (const mat of root.listMaterials()) {
    const rgb = mat.getName() === 'skin' ? a.skin
      : mat.getName() === 'jersey' ? a.jersey
      : mat.getName() === 'shorts' ? a.shorts
      : mat.getName() === 'shoes' ? a.shoes
      : mat.getName() === 'hair' ? a.hair
      : null;
    if (rgb) mat.setBaseColorFactor([rgb[0], rgb[1], rgb[2], 1]);
  }

  const glbPath = join(OUT_DIR, `${a.key}.glb`);
  await io.write(glbPath, doc);
  writeFileSync(join(OUT_DIR, `${a.key}.json`), JSON.stringify({ ...manifest, athlete: a.key, note: a.note }, null, 2) + '\n');
  console.log(`  ✔ ${a.key}.glb — scale ×${a.scale}, jersey rgb(${a.jersey.join(', ')}) — ${a.note}`);
}

console.log(`\n✔ ROSTER GREEN — ${ATHLETES.length} athletes in ${OUT_DIR}/`);
console.log('  Render gate: npx tsx scripts/avatar/validate-render.mts ' + join(OUT_DIR, ATHLETES[0].key + '.glb'));
