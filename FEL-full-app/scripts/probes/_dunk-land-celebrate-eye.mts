// DUNK-LAND-CELEBRATE — frame strip + webm of the live landing and celebration (one make, one miss).
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3211';
const OUT = process.env.OUT ?? '/opt/cursor/artifacts/dunk-land-celebrate';
const phase = process.env.PHASE ?? 'after';
fs.mkdirSync(path.join(OUT, phase), { recursive: true });

async function pad(page: Page) {
  await page.evaluate(() => {
    const p: any = {
      index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0], timestamp: Date.now(),
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as any).__PAD = p;
    (navigator as any).getGamepads = () => [p];
    const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: p });
    window.dispatchEvent(ev);
  });
}

async function installRecorder(page: Page) {
  await page.evaluate(() => {
    const dev: any = (window as any).__FEL_DEV__;
    const scene: any = dev?.scene;
    if (!scene) return;
    const log: any[] = []; (window as any).__LAND_LOG = log;
    const t0 = performance.now();
    scene.onAfterRenderObservable.add(() => {
      const hero: any = dev.hero?.();
      if (!hero) return;
      const clips = (scene.animationGroups ?? []).filter((g: any) => g.isPlaying).map((g: any) => g.name);
      log.push({ t: Math.round(performance.now() - t0), y: +hero.position.y.toFixed(3), clips });
    });
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: phase === 'after' ? { dir: path.join(OUT, 'video'), size: { width: 1280, height: 720 } } : undefined });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'networkidle', timeout: 120_000 });
  await pad(page);
  await installRecorder(page);
  await page.waitForTimeout(3000);
  const log = await page.evaluate(() => (window as any).__LAND_LOG ?? []);
  fs.writeFileSync(path.join(OUT, phase, 'timeline.json'), JSON.stringify(log, null, 2));
  console.info(`[dunk-land-celebrate-eye] ${phase}: ${log.length} frames → ${OUT}/${phase}`);
  await ctx.close();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
