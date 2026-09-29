// MUSIC-SUITE P4 (2026-09-25): a live smoke of the engine contract in the room — /dev/music on :3121 builds the P4 desk on a
// real AudioContext, PLAY schedules steps, no page errors. Run: node tsx scripts/probes/_music-p4-engine-smoke.mts
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ARGS });
const errors: string[] = [];
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console ' + m.text().slice(0, 200)); });
  await p.goto('http://127.0.0.1:3121/dev/music?stage=studio', { timeout: 240000 });
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await p.waitForTimeout(2500);
  const before = await p.evaluate(() => (window as any).__FEL_STUDIO__?.engine() ?? null);
  // light a few kicks through the probe-free way: click the first PLAY
  const play = p.getByRole('button', { name: 'PLAY', exact: true }).first();
  const hasPlay = await play.count();
  if (hasPlay) await play.click();
  await p.waitForTimeout(1500);
  const after = await p.evaluate(() => { const s = (window as any).__FEL_STUDIO__; return s ? { engine: s.engine(), steps: s.steps.length, now: s.now() } : null; });
  console.log(JSON.stringify({ hasPlay, before, after, errors }, null, 1).slice(0, 3000));
} finally { await browser.close(); }
