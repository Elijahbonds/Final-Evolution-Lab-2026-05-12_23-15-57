// MUSIC-SUITE family smoke (2026-09-25): the modes that share the timing host or SoundKit load, start, play 8 s and
// throw nothing. Usage: tsx scripts/probes/_music-family-smoke.mts [port] [key,key,...]
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const PORT = process.argv[2] ?? '3121';
const KEYS = (process.argv[3] ?? 'tennis,volleyball,golf,derby,penalty,dance,skateboard,karate').split(',');
const b = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const out: Record<string, unknown> = {};
for (const key of KEYS) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await p.addInitScript(() => {
    const pad: any = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__PAD = pad; (navigator as any).getGamepads = () => [pad];
  });
  const errs: string[] = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  let status = 0;
  try {
    const r = await p.goto(`http://127.0.0.1:${PORT}/dev/mode/${key}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    status = r?.status() ?? 0;
    await p.waitForSelector('canvas', { timeout: 240000 });
    let playing = false;
    for (let i = 0; i < 40 && !playing; i++) {
      playing = await p.evaluate(() => /playing/i.test(document.body.innerText)).catch(() => false);
      if (playing) break;
      await p.keyboard.press('Space').catch(() => {});
      await p.evaluate(() => { const g = (window as any).__PAD; g.buttons[0] = { pressed: true, touched: true, value: 1 }; g.timestamp = Date.now(); });
      await p.waitForTimeout(120);
      await p.evaluate(() => { const g = (window as any).__PAD; g.buttons[0] = { pressed: false, touched: false, value: 0 }; g.timestamp = Date.now(); });
      await p.waitForTimeout(600);
    }
    await p.waitForTimeout(8000);
    const alive = await p.evaluate(() => /playing|ended|result/i.test(document.body.innerText)).catch(() => false);
    out[key] = { status, playing, alive, errors: errs.filter((e) => !/Failed to load resource|favicon|DevTools|\[FEL-ANIM\]|WebGL|GPU stall/i.test(e)).slice(0, 6) };
  } catch (e) { out[key] = { status, error: String(e).slice(0, 200), errors: errs.slice(0, 6) }; }
  await ctx.close();
  console.log(key, JSON.stringify(out[key]));
}
await b.close();
