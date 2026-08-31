// Generic mode loader — boot ANY registered mode and report what happened.
//
// The /dev/mode/[key] runner reaches modes that /play/* gates behind an account,
// which is how a mode with no guest route gets looked at at all.
//
//   URL=http://localhost:3000/dev/mode/threevthree npx tsx scripts/capture-mode-load.mts
//
// Watch the mesh count in the perf overlay: a mode whose HUD streams happily
// while the canvas shows an empty void is the StrictMode double-mount, and it
// reads as ~5 meshes.

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
mkdirSync('docs/shots/3v3', { recursive: true });
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args:['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const logs: string[] = [];
p.on('console', m => { const t=m.text(); logs.push(`[${m.type()}] ${t.slice(0,180)}`); });
const url = process.env.URL ?? 'http://localhost:3000/dev/mode/threevthree';
await p.goto(url, { waitUntil: 'networkidle' });
console.log('landed on:', new URL(p.url()).pathname, ' canvas:', await p.locator('canvas').count());
await p.getByText(/TAP TO START|START/i).first().click({ force: true }).catch(()=>{});
await p.waitForTimeout(6000);
await p.screenshot({ path: 'docs/shots/3v3/3v3-load.png' });
console.log('body:', (await p.evaluate<string>('document.body.innerText')).replace(/\n+/g,' | ').slice(0,240));
console.log('--- console ---');
for (const l of logs.filter(l=>/FEL-SPAWN|FEL-FRAME|error|warn|black|watchdog|venue|VENUE/i.test(l)).slice(0,20)) console.log(' ', l);
await b.close();
