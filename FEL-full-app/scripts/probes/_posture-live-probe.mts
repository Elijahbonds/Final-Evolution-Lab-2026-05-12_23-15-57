// IS THE POSTURE LAYER ACTUALLY MOVING BONES (2026-09-14).
//
// "I mounted a posture layer" is a claim about source. What matters is whether the layer produces a POSE
// on a running game and whether that pose CHANGES as the fighter does something — a layer that mounts and
// then returns the same numbers forever is indistinguishable from no layer at all, and reads as one.
//
// Reads __FEL_DEV__.combatPosture (the seam karate_vs has carried since BIOMECH-WAVE2) and samples it
// across a fight, reporting the window it resolved and whether any pose value moved.

import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const MODES = (process.env.MODES ?? 'duel,showdown,karate_vs').split(',');

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });

for (const mode of MODES) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  await page.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
  try {
    await page.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 180000 });
    await page.waitForTimeout(4000);

    const out = await page.evaluate(`(async () => {
      const d = window.__FEL_DEV__, s = d.scene;
      const f0 = s.getFrameId(); await new Promise(r => setTimeout(r, 800));
      const frames = s.getFrameId() - f0;
      if (!d.combatPosture) return { frames, seam: false };

      const ev = (t, code, key) => window.dispatchEvent(new KeyboardEvent(t, { code, key, bubbles: true }));
      ev('keydown','Space',' '); await new Promise(r=>setTimeout(r,120)); ev('keyup','Space',' ');
      await new Promise(r => setTimeout(r, 5200));

      // move and swing, then sample: a pose that never moves is a layer that is not doing anything
      const keys = ['KeyW','KeyD','KeyJ','KeyK','KeyA','KeyJ'];
      const poses = [], windows = new Set();
      for (let i = 0; i < 18; i++) {
        const k = keys[i % keys.length];
        ev('keydown', k, k.slice(3).toLowerCase());
        await new Promise(r => setTimeout(r, 90));
        ev('keyup', k, k.slice(3).toLowerCase());
        await new Promise(r => setTimeout(r, 140));
        const p = d.combatPosture.me();
        const b = d.combatPosture.bio();
        if (b && b.me) windows.add(String(b.me.striking) + '|' + String(b.me.blocking) + '|' + b.me.strafe);
        if (p) poses.push(JSON.stringify(p).length ? JSON.stringify(p).slice(0, 0) + JSON.stringify(p) : null);
      }
      const uniq = new Set(poses.filter(Boolean));
      return { frames, seam: true, samples: poses.length, distinctPoses: uniq.size, distinctBios: windows.size,
               example: poses.length ? String(poses[Math.floor(poses.length/2)]).slice(0, 150) : null };
    })()`) as Record<string, unknown>;

    console.log(`\n[${mode}]`, JSON.stringify(out, null, 1).slice(0, 700));
    console.log(`[${mode}] errors: ${errs.length}${errs.length ? ' :: ' + errs[0] : ''}`);
  } catch (e) {
    console.log(`\n[${mode}] FAILED: ${String(e).slice(0, 160)}`);
  }
  await page.close();
}
await browser.close();
