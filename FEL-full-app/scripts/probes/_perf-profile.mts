// PERF PROFILE — real per-pass timings, not guesses (2026-09-12).
//
// The locomotion mission's Phase 3 gate is "animation pass <= 4 ms" and the mode gap audit had to
// report it UNJUDGEABLE, because nothing had ever captured a profile. Babylon's SceneInstrumentation
// exposes exactly that number (animationsTimeCounter), plus physics, draw calls and frame time, so
// this stops being an opinion.
//
// Usage: npx tsx scripts/probes/_perf-profile.mts <port> <outdir> <mode[,mode...]> [seconds]
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.argv[2] ?? '3009';
const OUT = process.argv[3] ?? '/tmp/fel-perf';
const MODES = (process.argv[4] ?? 'dunk').split(',');
const SECONDS = Number(process.argv[5] ?? 12);
fs.mkdirSync(OUT, { recursive: true });

async function profile(p: Page, mode: string) {
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForSelector('canvas', { timeout: 240000 });
  for (let i = 0; i < 150; i++) {
    const txt = await p.evaluate(() => document.body.innerText);
    if (/playing/i.test(txt)) break;
    if (/ready/i.test(txt)) await p.keyboard.press('Space');
    await p.waitForTimeout(1000);
  }
  await p.waitForTimeout(2000);   // let the scene settle before measuring

  const ok = await p.evaluate(() => {
    const w = window as any;
    const dev = w.__FEL_DEV__;
    if (!dev?.scene) return 'no __FEL_DEV__.scene';
    if (typeof dev.instrument !== 'function') return 'no dev.instrument — harness too old';
    const scene = dev.scene;
    const si = dev.instrument();
    si.captureActiveMeshesEvaluationTime = true;
    si.captureRenderTime = true;
    si.captureFrameTime = true;
    si.captureAnimationsTime = true;
    si.capturePhysicsTime = true;
    w.__PERF = { frames: [] as unknown[] };
    scene.onAfterRenderObservable.add(() => {
      w.__PERF.frames.push({
        frame: si.frameTimeCounter.current,
        render: si.renderTimeCounter.current,
        anim: si.animationsTimeCounter.current,
        physics: si.physicsTimeCounter.current,
        meshEval: si.activeMeshesEvaluationTimeCounter.current,
        draws: si.drawCallsCounter.current,
        meshes: scene.getActiveMeshes().length,
      });
    });
    return 'instrumented';
  });

  await p.waitForTimeout(SECONDS * 1000);

  const rows: any[] = await p.evaluate(() => (window as any).__PERF?.frames ?? []);
  const pick = (k: string) => rows.map((r) => r[k]).filter((n) => typeof n === 'number' && isFinite(n));
  const stat = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return {
      n: s.length,
      avg: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2),
      p50: +s[Math.floor(s.length * 0.5)].toFixed(2),
      p95: +s[Math.floor(s.length * 0.95)].toFixed(2),
      max: +s[s.length - 1].toFixed(2),
    };
  };
  const frame = stat(pick('frame'));
  const out = {
    mode, capture: ok, frames: rows.length,
    fps: frame ? +(1000 / frame.avg).toFixed(1) : null,
    frameMs: frame,
    animMs: stat(pick('anim')),
    physicsMs: stat(pick('physics')),
    renderMs: stat(pick('render')),
    meshEvalMs: stat(pick('meshEval')),
    drawCalls: stat(pick('draws')),
    activeMeshes: stat(pick('meshes')),
  };
  await p.screenshot({ path: `${OUT}/${mode}.png` });
  return out;
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  const all: unknown[] = [];
  for (const m of MODES) {
    try { const r = await profile(p, m); all.push(r); console.log(JSON.stringify(r)); }
    catch (e) { const r = { mode: m, error: String(e).slice(0, 160) }; all.push(r); console.log(JSON.stringify(r)); }
  }
  fs.writeFileSync(`${OUT}/profile.json`, JSON.stringify(all, null, 2));
  console.log(`-> ${OUT}/profile.json`);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
