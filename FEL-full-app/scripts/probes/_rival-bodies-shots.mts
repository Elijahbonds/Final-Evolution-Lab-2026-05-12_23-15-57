// _rival-bodies-shots — the rival bodies in the modes that show them (2026-10-16, the forge rivals replacing the Meshy ones):
// one page per mode on BASE, the intro skipped by a pad press, then a still of the play camera and of the scene's rival bodies,
// and what the roster dealt (every skinned body under the scene with the GLB it came from). Run on a before tree and an after
// tree with the same SEED to compare.
//   BASE=http://127.0.0.1:3363 OUT=~/Claude/outbox/hoops-gameplay/bodies/shots/after MODES=threevthree,onevone,dunk,karate_vs npx tsx scripts/probes/_rival-bodies-shots.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
/** Before the app boots: a seeded Math.random and a fake pad in getGamepads() slot 0 (the H2 reel's, trimmed). */
const initScript = (seed: number): string => `(() => { let s = ${seed} >>> 0 || 1; Math.random = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pad = { index: 0, id: 'fake-dualshock (standard)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad]; window.__name = window.__name || ((f) => f); })()`;

const BASE = process.env.BASE ?? 'http://127.0.0.1:3363';
const OUT = (process.env.OUT ?? '/tmp/rival-shots').replace(/^~/, process.env.HOME ?? '');
const MODES = (process.env.MODES ?? 'threevthree,onevone').split(',');
const SEED = Number(process.env.SEED ?? 1016);
const WAIT_MS = Number(process.env.WAIT_MS ?? 4500);
const EXE = process.env.CHROMIUM_EXE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, headless: false, args: ['--window-size=1300,820', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const rows: Record<string, unknown>[] = [];
for (const mode of MODES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(initScript(SEED));
  await page.goto(`${BASE}/dev/mode/${mode}?tier=rookie`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  for (let i = 0; i < 240; i++) { if (await page.evaluate(() => !!(window as any).__FEL_DEV__?.scene).catch(() => false)) break; await page.waitForTimeout(500); }
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const p = (window as any).__PAD; p.buttons[0].pressed = true; p.buttons[0].value = 1; setTimeout(() => { p.buttons[0].pressed = false; p.buttons[0].value = 0; }, 80); });   // the first input skips the intro
  await page.waitForTimeout(WAIT_MS);
  await page.screenshot({ path: `${OUT}/${mode}.png` });
  const dealt = await page.evaluate(() => {
    const s = (window as any).__FEL_DEV__.scene;
    const out: string[] = [];
    for (const m of s.meshes) { if (!m.skeleton || !m.isEnabled()) continue; const root = (() => { let n = m; while (n.parent) n = n.parent; return n; })(); const url = root.metadata?.felUrl ?? root.name; if (!out.includes(url)) out.push(url); }
    return { skeletons: s.skeletons.length, bodies: out.slice(0, 12) };
  });
  rows.push({ mode, ...dealt });
  console.log(mode, JSON.stringify(dealt));
  await ctx.close();
}
fs.writeFileSync(`${OUT}/shots.json`, JSON.stringify(rows, null, 1));
await browser.close();
