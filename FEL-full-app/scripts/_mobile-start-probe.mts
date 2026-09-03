// Sample the hero and camera over the first frames of a mode on a PORTRAIT phone
// viewport (the mobile skateboard start-of-run frame-guard flake).
//   URL=http://localhost:3000/dev/mode/skateboard?agent=1 npx tsx scripts/_mobile-start-probe.mts
import { chromium } from 'playwright-core';
const URL_ = process.env.URL ?? 'http://localhost:3000/dev/mode/skateboard?agent=1';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const p = await ctx.newPage();
const frames: string[] = [];
p.on('console', (m) => { const t = m.text(); if (t.includes('[FEL-FRAME]')) frames.push(t.slice(0, 200)); });
await p.goto(URL_, { waitUntil: 'networkidle' }); await p.waitForSelector('canvas', { timeout: 30000 }); await p.waitForTimeout(1500);
await p.keyboard.press('Enter');
const js = [
  "(() => {",
  "  const a = window.__NEXUS_AGENT__; const s = a && a.host && a.host.scene; if (!s) return 'no scene';",
  "  const h = a.state && a.state().hero; const c = s.activeCamera;",
  "  const hp = h && h.position ? h.position : (s.meshes.find(m => m.skeleton) || {}).absolutePosition;",
  "  return JSON.stringify({ hero: hp ? [hp.x, hp.y, hp.z].map(v => +v.toFixed(2)) : null, cam: [c.position.x, c.position.y, c.position.z].map(v => +v.toFixed(2)), fwd: (() => { const f = c.getForwardRay().direction; return [f.x, f.y, f.z].map(v => +v.toFixed(2)); })(), aspect: +(s.getEngine().getRenderWidth() / s.getEngine().getRenderHeight()).toFixed(2) });",
  "})()",
].join(String.fromCharCode(10));
for (const ms of [50, 150, 300, 600, 1000, 1500, 2500]) { await p.waitForTimeout(ms); console.log(`t+${ms}ms`, await p.evaluate(js)); }
console.log('frame-guard lines:', frames.length, frames.slice(0, 3).join(' | '));
await b.close();
