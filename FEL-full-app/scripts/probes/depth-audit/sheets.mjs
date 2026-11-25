// DEPTH-AUDIT (2026-11-25): the depth pass's contact sheets, from depth-walk.mts's pictures.
//   node scripts/probes/depth-audit/sheets.mjs <shotsDir> <outDir> [tag=d0] [prefix=depth-before]
// One sheet per area and size, the same tiles in the same order, so a phase's "after" sheet (its own tag and prefix, e.g.
// `d3-after-1 depth-after-d3`) lines up tile for tile with the before. Plus the phone-vs-high-tier A/B (`ab` tag), which shows
// what the phone tier draws without (SSAO, cascades, MSAA, fixture lights, the glossy floor) at the same upright size.
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [shots, out, tag = 'd0', prefix = 'depth-before'] = process.argv.slice(2);
if (!shots || !out) { console.error('usage: sheets.mjs <shotsDir> <outDir> [tag] [prefix]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const SHEET = join(dirname(fileURLToPath(import.meta.url)), '../improve-audit/sheet.mjs');
const TIERS = ['portrait', 'landscape', 'desktop'];
const AREAS = {
  '1-hoops-venice': [['onevone-c-play', '1v1 Venice'], ['onevone-d-play', '1v1 +6s'], ['threevthree-c-play', '3v3 Venice'], ['dunk-c-play', 'Dunk'], ['dunk-d-play', 'Dunk +6s'], ['threepoint-d-play', '3-Point']],
  '2-hoops-courts': [['onevone-canopy-c-play', '1v1 Canopy'], ['onevone-canopy-d-play', 'Canopy +6s'], ['onevone-blossom-c-play', '1v1 Blossom'], ['onevone-blossom-d-play', 'Blossom +6s']],
  '3-physics-arena': [['arena-hoops-d-play', 'arena 1v1'], ['arena-threes-d-play', 'arena 3v3'], ['arena-threepoint-d-play', 'arena 3-Point'], ['arena-soccer-d-play', 'arena soccer']],
  '4-zones-story': [['venice-d-play', 'Venice hub'], ['coast-d-play', 'Coast'], ['adventure-d-play', 'story'], ['tennis-d-play', 'tennis (control)']],
  '5-screens': [['home', 'home'], ['try', '/try'], ['play', '/play'], ['onevone-a-loading', '1v1 loading card'], ['venice-a-loading', 'Venice loading']],
};
for (const [area, items] of Object.entries(AREAS)) {
  for (const t of TIERS) {
    const files = items.map(([s, cap]) => [join(shots, `${tag}-${t}-${s}.jpg`), `${cap} (${t})`]).filter(([f]) => existsSync(f));
    if (!files.length) continue;
    const w = t === 'portrait' ? 260 : 420;
    execFileSync(process.execPath, [SHEET, join(out, `${prefix}-${area}-${t}.jpg`), String(Math.min(files.length, t === 'portrait' ? 6 : 3)), String(w), ...files.map(([f, c]) => `${f}=${c}`)], { stdio: 'inherit' });
  }
}
// the phone tier against the high tier, same upright phone, same moment (before sheets only)
if (tag === 'd0') {
  const ab = [];
  for (const [id, cap] of [['onevone', '1v1'], ['dunk', 'Dunk'], ['arena-hoops', 'arena 1v1']]) {
    for (const m of ['c-play', 'd-play']) {
      const a = join(shots, `d0-portrait-${id}-${m}.jpg`), b = join(shots, `ab-portrait-${id}-high-${m}.jpg`);
      if (existsSync(a) && existsSync(b)) ab.push(`${a}=${cap} ${m} PHONE tier`, `${b}=${cap} ${m} HIGH tier`);
    }
  }
  if (ab.length) execFileSync(process.execPath, [SHEET, join(out, 'depth-ab-phone-vs-high-tier.jpg'), '4', '260', ...ab], { stdio: 'inherit' });
}
