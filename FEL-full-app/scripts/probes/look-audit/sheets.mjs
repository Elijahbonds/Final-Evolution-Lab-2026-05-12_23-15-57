// LOOK-AUDIT (2026-11-24): the before-state contact sheets, one per area, from look-walk.mts's pictures.
//   node scripts/probes/look-audit/sheets.mjs <shotsDir> <outDir> [tag=b1]
// Each sheet is one area at the three sizes (upright phone, sideways phone, desktop), the same moments in the same order, so a
// phase's "after" sheet (the same command on its own shots, another tag) lines up tile for tile with this one.
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [shots, out, tag = 'b1'] = process.argv.slice(2);
if (!shots || !out) { console.error('usage: sheets.mjs <shotsDir> <outDir> [tag]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const SHEET = join(dirname(fileURLToPath(import.meta.url)), '../improve-audit/sheet.mjs');
const TIERS = ['portrait', 'landscape', 'desktop'];
// area -> [shot suffix, caption]; a page shot is `<id>`, a game moment `<id>-<a-loading|b-ready|c-play|d-play|e-end>`
const AREAS = {
  '1-first-run': [['home', 'home'], ['try', '/try guest'], ['signup', 'sign-up'], ['login', 'sign-in'], ['play', '/play picker']],
  '2-menus': [['modes', '/modes'], ['store', '/store'], ['account', '/account'], ['train', '/train'], ['groups', '/groups'], ['closet', '/closet']],
  '3-hoops-1v1-3v3': [['onevone-a-loading', '1v1 loading'], ['onevone-c-play', '1v1 play'], ['onevone-d-play', '1v1 play +6s'], ['threevthree-c-play', '3v3 play'], ['threevthree-d-play', '3v3 play +6s']],
  '4-hoops-3pt-dunk': [['threepoint-b-ready', '3PT ready'], ['threepoint-d-play', '3PT play'], ['threepoint-e-end', '3PT end card'], ['dunk-a-loading', 'Dunk loading'], ['dunk-c-play', 'Dunk play'], ['dunk-d-play', 'Dunk play +6s']],
  '5-physics-arena': [['arena-hoops-a-loading', 'arena loading'], ['arena-hoops-d-play', 'arena 1v1'], ['arena-threes-d-play', 'arena 3v3'], ['arena-threepoint-d-play', 'arena 3PT']],
  '6-story-zones': [['adventure-b-first', 'story partner'], ['adventure-b-ready', 'story ready'], ['adventure-d-play', 'story play'], ['venice-a-loading', 'Venice loading'], ['venice-d-play', 'Venice'], ['coast-d-play', 'Coast'], ['tennis-d-play', 'tennis (control)']],
};
for (const [area, items] of Object.entries(AREAS)) {
  for (const t of TIERS) {
    const files = items.map(([s, cap]) => [join(shots, `${tag}-${t}-${s}.jpg`), `${cap} (${t})`]).filter(([f]) => existsSync(f));
    if (!files.length) continue;
    const w = t === 'portrait' ? 260 : 420;
    const file = join(out, `look-before-${area}-${t}.jpg`);
    execFileSync(process.execPath, [SHEET, file, String(Math.min(files.length, t === 'portrait' ? 7 : 3)), String(w), ...files.map(([f, c]) => `${f}=${c}`)], { stdio: 'inherit' });
  }
}
