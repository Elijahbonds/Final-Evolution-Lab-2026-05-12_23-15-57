// _scorecard-frames-sheet — the Visuals frame review in a few images (docs/SCORECARD.md §4).
//
// The capture saves three frames per game (open / mid / late). A reviewer scores five checks per game from them; reading
// 87 full-size frames one by one is slow and loses the comparison between games. This tiles them: one row per game, the
// three frames side by side with the slug and the frame name, PER sheets rows to an image.
//   TAG=rc10 PER=3 npx tsx scripts/probes/_scorecard-frames-sheet.mts   → ~/Claude/outbox/finish-release/scorecard/<TAG>/FRAMES-<n>.png
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
import { SCORE_ROUTES } from './_scorecard-routes.mts';

const TAG = process.env.TAG ?? 'run';
const PER = Number(process.env.PER ?? 3);
const DIR = `${process.env.HOME}/Claude/outbox/finish-release/scorecard/${TAG}`;
const pick = (process.env.MODES ?? 'all').split(',');
const slugs = SCORE_ROUTES.map(([s]) => s).filter((s) => pick[0] === 'all' || pick.includes(s));
const img = (f: string) => (fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : '');
const b = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
let n = 0;
for (let i = 0; i < slugs.length; i += PER) {
  const rows = slugs.slice(i, i + PER).map((slug) => `<div style="margin-bottom:6px"><div style="font:bold 16px monospace;color:#fde047;margin:2px 0">${slug}</div><div style="display:flex;gap:4px">${['1-open', '2-mid', '3-late'].map((k) => {
    const src = img(`${DIR}/${slug}-${k}.png`);
    return `<div><img src="${src}" style="width:492px;height:308px;object-fit:cover;background:#300"><div style="font:12px monospace;color:#aaa">${src ? k : k + ' (missing)'}</div></div>`;
  }).join('')}</div></div>`).join('');
  await p.setContent(`<body style="margin:0;padding:4px;background:#111">${rows}</body>`);
  await p.screenshot({ path: `${DIR}/FRAMES-${++n}.png`, fullPage: true });
}
await b.close();
console.log(`${n} sheets in ${DIR}`);
