// DOES THE METER ACTUALLY MOVE, PER MODE (2026-09-14).
//
// Eleven modes were just wired to report into the shared Game-Breaker meter. The response is a crowd bed
// and a tier sting, neither of which a probe can hear — so without reading the live meter the only way to
// check a mode reports at all is to read its source and hope. `__FEL_DEV__.momentum()` exists for this.
//
// The test is not "does the number rise" — a bare `report()` would satisfy that from anywhere. It is:
// PLAY the mode with the agent bridge or a key driver, and see whether ordinary play moves the meter. A
// mode that only heats up when something exotic happens has been wired in the wrong place.

import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const MODES = (process.env.MODES ?? 'karate,karate_vs,velocitykart,tennis,threepoint').split(',');
const PLAY_SEC = Number(process.env.PLAY_SEC ?? 26);

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });

type Row = { mode: string; frames: number; peak: number; tier: string; samples: number[]; err: string };
const rows: Row[] = [];

for (const mode of MODES) {
  const page: Page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  await page.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  try {
    await page.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !!(window as any).__FEL_DEV__?.momentum, null, { timeout: 120000 });
    await page.waitForTimeout(2000);

    const frames = await page.evaluate(`(async () => {
      const s = window.__FEL_DEV__.scene; const f0 = s.getFrameId();
      await new Promise(r => setTimeout(r, 1000)); return s.getFrameId() - f0;
    })()`) as number;

    // Start, then mash. A key masher is a poor player, which is the point: if only expert play moves the
    // meter, ordinary play never hears the crowd.
    const out = await page.evaluate(`(async () => {
      const d = window.__FEL_DEV__, bus = d.input;
      const ev = (t, code, key) => window.dispatchEvent(new KeyboardEvent(t, { code, key, bubbles: true }));
      ev('keydown','Space',' '); await new Promise(r=>setTimeout(r,120)); ev('keyup','Space',' ');
      await new Promise(r => setTimeout(r, 5000));
      bus.emit({ t: 'trigger', side: 'R', value: 1 });
      const keys = ['KeyJ','KeyK','KeyL','Space','KeyW','KeyA','KeyD'];
      const samples = []; let peak = 0, tier = 'cold';
      for (let i = 0; i < ${PLAY_SEC} * 4; i++) {
        const k = keys[i % keys.length];
        ev('keydown', k, k.slice(3).toLowerCase());
        await new Promise(r => setTimeout(r, 60));
        ev('keyup', k, k.slice(3).toLowerCase());
        await new Promise(r => setTimeout(r, 190));
        const m = d.momentum();
        if (m.score01 > peak) { peak = m.score01; tier = m.tier; }
        if (i % 8 === 0) samples.push(+m.score01.toFixed(3));
      }
      return { peak: +peak.toFixed(3), tier, samples };
    })()`) as { peak: number; tier: string; samples: number[] };

    rows.push({ mode, frames, peak: out.peak, tier: out.tier, samples: out.samples, err: errs.slice(0, 1).join('') });
  } catch (e) {
    rows.push({ mode, frames: 0, peak: -1, tier: 'ERROR', samples: [], err: String(e).slice(0, 120) });
  }
  await page.close();
}

console.log('\nmode            frames  peak   tier      trace');
for (const r of rows) {
  console.log(
    `${r.mode.padEnd(15)} ${String(r.frames).padStart(5)}  ${String(r.peak).padStart(5)}  ${r.tier.padEnd(8)}  ${JSON.stringify(r.samples)}${r.err ? '  !! ' + r.err : ''}`,
  );
}
const moved = rows.filter((r) => r.peak > 0).length;
console.log(`\n[VERDICT] ${moved}/${rows.length} modes heated up under a key masher.`);
console.log('[VERDICT] a 0 peak means ordinary play never reaches the meter in that mode — wired in the wrong place, or the driver never made it play.');

await browser.close();
