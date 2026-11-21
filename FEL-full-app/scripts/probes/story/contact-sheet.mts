// STORY rig: one contact sheet (JPG) of the story's screens from a story-rig.mts run — each picture with its file name as a caption.
//   npx tsx scripts/probes/story/contact-sheet.mts <rig-out-dir> [out.jpg]      (runs a local browser on file:// pictures; no server)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';

const DIR = path.resolve(process.argv[2] ?? '.');
const OUT = path.resolve(process.argv[3] ?? path.join(DIR, 'story-contact-sheet.jpg'));
const pics = fs.readdirSync(DIR).filter((f) => /^\d\d-.*\.jpg$/.test(f)).sort();
const COLS = 6, W = 220, H = Math.round((W * 844) / 390);
const cells = pics.map((f) => `<figure><img src="file://${path.join(DIR, f)}"><figcaption>${f.replace(/\.jpg$/, '')}</figcaption></figure>`).join('');
const html = `<!doctype html><html><body style="margin:0;background:#111;color:#eee;font:600 12px system-ui"><div style="display:grid;grid-template-columns:repeat(${COLS},${W}px);gap:8px;padding:8px">${cells}</div>
<style>figure{margin:0}img{width:${W}px;height:${H}px;object-fit:cover;display:block;border-radius:6px}figcaption{padding:3px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style></body></html>`;
const file = path.join(DIR, 'contact-sheet.html');
fs.writeFileSync(file, html);
const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: COLS * (W + 8) + 8, height: 600 }, deviceScaleFactor: 1 });
await page.goto(`file://${file}`);
await page.waitForTimeout(800);
await page.screenshot({ path: OUT, type: 'jpeg', quality: 72, fullPage: true });
await browser.close();
console.log(OUT, pics.length, 'pictures');
