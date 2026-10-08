// _visual-foundation-probe — before/after frames and draw counts for the shared look (visual-foundation, 2026-10-06).
//
// For each mode, mounts /dev/mode/<key> twice on ONE build: `?look=legacy` (the shared look as it shipped before the
// pass: pixel-budget tier demotion, FXAA only, the venue's grade, declared moods, no kicker, full ink, no glow) and the
// current look (optionally `?tier=`), presses START, lets the scene settle, then records the [FEL-TIER] / [FEL-MOOD]
// lines, the engine's real draw calls (SceneInstrumentation through __FEL_DEV__) and a 1920x1080 frame.
//   PORT=3200 OUT=/tmp/vf MODES=dunk,golf SWIFT=1 npx tsx scripts/probes/_visual-foundation-probe.mts
// PNG=dunk,golf keeps those modes' frames as PNG; the rest are JPEG (q 82) to keep the set to a few MB.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3200', OUT = process.env.OUT ?? '/tmp/visual-foundation';
const MODES = (process.env.MODES ?? 'dunk,golf,karate_vs,dance,velocitykart').split(',');
const PNG = new Set((process.env.PNG ?? '').split(',').filter(Boolean));
const AFTER = process.env.AFTER_QUERY ?? '';               // e.g. tier=high
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 9000);   // SwiftShader draws a few frames a second
fs.mkdirSync(OUT, { recursive: true });
const GL = process.env.SWIFT ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--ignore-gpu-blocklist'];
const b = await chromium.launch({ executablePath: chromiumExe(), args: GL });
const rows: string[] = [];
const t0 = Date.now();
const step = (s: string) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
/** SwiftShader can hold the page's main thread for seconds per frame: never let one call hang the run. */
const within = <T,>(ms: number, p: Promise<T>, fallback: T): Promise<T> => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

async function shot(key: string, variant: 'before' | 'after', query: string): Promise<void> {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const log: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (/\[FEL-(TIER|MOOD|GLOW|CANVAS)\]|NEXUS\] mountVenue|WebGL|GL_INVALID|shader/i.test(t)) log.push(t.slice(0, 200)); });
  p.on('pageerror', (e) => log.push('PAGEERROR ' + e.message.slice(0, 200)));
  const url = `http://localhost:${PORT}/dev/mode/${key}${query ? `?${query}` : ''}`;
  step(`${key} ${variant}: goto ${url}`);
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  const readPhase = () => within(20000, p.evaluate(() => (document.body.innerText.match(/· (loading|ready|countdown|playing|paused|ended|error)/) || [])[1] || ''), '?');
  let phase = '';
  for (let i = 0; i < 120; i++) {
    phase = await readPhase();
    if (phase === 'ready' || phase === 'playing' || phase === 'error') break;
    await p.waitForTimeout(2000);
  }
  step(`${key} ${variant}: phase ${phase}`);
  if (phase === 'ready') { await within(30000, p.locator('text=/^START$/').first().click({ timeout: 25000 }).catch(() => {}), undefined); }
  await p.waitForTimeout(SETTLE_MS);
  step(`${key} ${variant}: measuring draws`);
  const draws = await within(60000, p.evaluate(async () => {
    const dev = (window as unknown as { __FEL_DEV__?: { instrument(): { drawCallsCounter: { current: number; lastSecAverage: number }; dispose(): void } } }).__FEL_DEV__;
    if (!dev) return null;
    const inst = dev.instrument();
    await new Promise((r) => setTimeout(r, 2500));
    const d = { current: inst.drawCallsCounter.current, avg: Math.round(inst.drawCallsCounter.lastSecAverage) };
    inst.dispose();
    return d;
  }), null);
  phase = await readPhase();
  step(`${key} ${variant}: screenshot`);
  const png = PNG.has(key);
  const file = `${OUT}/${key}-${variant}.${png ? 'png' : 'jpg'}`;
  await p.screenshot({ path: file, type: png ? 'png' : 'jpeg', timeout: 180000, ...(png ? {} : { quality: 82 }) }).catch((e) => step(`screenshot failed: ${String(e).slice(0, 120)}`));
  const line = `${key.padEnd(13)} ${variant.padEnd(6)} phase=${phase.padEnd(8)} draws=${draws ? `${draws.current} (avg ${draws.avg})` : 'n/a'}  ${file}`;
  rows.push(line, ...log.map((l) => `    ${l}`));
  console.log(line); for (const l of log) console.log('    ' + l);
  await ctx.close();
}

for (const key of MODES) {
  await shot(key, 'before', 'look=legacy');
  await shot(key, 'after', AFTER);
}
fs.writeFileSync(`${OUT}/probe.txt`, rows.join('\n') + '\n');
await b.close();
