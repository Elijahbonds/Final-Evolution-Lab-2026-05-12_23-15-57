// hoops-builder: photographs of the builder screen at phone portrait (390 × 844), phone landscape (844 × 390), 150 % text and 200 %
// zoom, and checks it does not scroll sideways and every control is at least 44 px. No server, no database (the route is answered
// in the page: scripts/probes/hoops-builder/entry.tsx).
//   /home/user/wt/gate-run.sh 300 npx tsx scripts/probes/hoops-builder/shots.mts <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { buildRig } from '../../a11y/rig.mts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.resolve(process.argv[2] ?? 'hoops-builder-shots');
fs.mkdirSync(OUT, { recursive: true });
const BUILD = path.join(OUT, 'build');
const { html } = await buildRig(BUILD, { entry: path.join(ROOT, 'scripts/probes/hoops-builder/entry.tsx') });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--no-sandbox'] });
const report: Record<string, unknown> = {};
const run = async (name: string, scene: string, vp: { width: number; height: number }, o: { font150?: boolean; zoom?: number; full?: boolean; press?: string[] } = {}) => {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: o.zoom ? 1 : 2, isMobile: !o.zoom, hasTouch: !o.zoom, allowFileAccess: true } as never);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await p.goto(`file://${html}#${scene}`);
  if (o.font150) await p.addStyleTag({ content: 'html{font-size:150% !important}' });
  if (o.zoom) await p.evaluate((z) => { (document.documentElement.style as unknown as { zoom: string }).zoom = String(z); }, o.zoom);
  await p.waitForFunction(() => !document.body.innerText.includes('Loading your ratings'), null, { timeout: 15000 });
  for (const label of o.press ?? []) await p.click(`[aria-label="${label}"]`);
  await p.waitForTimeout(300);
  const m = await p.evaluate(() => {
    const doc = document.documentElement;
    const small = [...document.querySelectorAll('button, a')].map((e) => { const r = e.getBoundingClientRect(); return { t: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((x) => x.w > 0 && (x.h < 44 || x.w < 44));
    return { sideways: doc.scrollWidth - doc.clientWidth, small, height: doc.scrollHeight };
  });
  report[name] = { ...m, errors };
  await p.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 80, fullPage: o.full ?? false });
  await ctx.close();
};
await run('1-phone-fresh', 'fresh', { width: 390, height: 844 });
await run('2-phone-earned-top', 'earned', { width: 390, height: 844 });
await run('3-phone-earned-full', 'earned', { width: 390, height: 844 }, { full: true, press: ['Raise Shooting', 'Raise Shooting', 'Raise Handle'] });
await run('4-phone-landscape', 'earned', { width: 844, height: 390 });
await run('5-font150', 'earned', { width: 390, height: 844 }, { font150: true, full: true });
await run('6-zoom200', 'earned', { width: 1280, height: 800 }, { zoom: 2, full: true });
await b.close();
fs.rmSync(BUILD, { recursive: true, force: true });
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
