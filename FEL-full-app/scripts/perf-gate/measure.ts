// THE PERF GATE's measurement (QG-03, quality-gates lane, 2026-10-25): a mode's phone cost, re-measured on every PR and
// held to its row in lib/babylon/config/mobileBudget.json.
//
// Owner, quality round 2026-10-20: "a phone-profile perf budget gate against mobileBudget.json. Going over budget fails
// the PR unless the owner approves a raised row." scripts/mobile-budget-tests.ts holds the TABLE to its rules (a budget
// is a measurement plus headroom); nothing re-measured a MODE in CI, so a mode could grow past its row and stay green.
// This measures the same five numbers the table holds, the same way the probe that wrote it does
// (scripts/probes/_perf-sweep.mts: the phone profile, ?perf=off, a seeded venue, a fake pad playing, the backing cut
// RASTER× so software GL draws the same scene faster — same draws, meshes and CPU work), and fails a mode whose worst
// frame is over its budget. A row is raised only by re-measuring with the probe (WRITE_TABLE=1) in a commit the owner
// approves; this gate never writes the table (perf-load owns it).
//
// The numbers are COUNTS (draw calls, meshes, bodies, texture MB, live particles), which do not depend on how fast the
// box is: SwiftShader on a CI runner draws the same scene as a phone, only slower. Frame time is not gated here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { ROOT, assert } from '../e2e/rig';
import type { Flow, FlowContext } from '../e2e/flow';
import { advanceFrames, openMode } from '../e2e/mode';

export const TABLE = 'lib/babylon/config/mobileBudget.json';
export const METRICS = ['drawCalls', 'activeMeshes', 'skinnedBodies', 'textureMb', 'particles'] as const;
export type Metric = (typeof METRICS)[number];
export type Nums = Record<Metric, number>;
interface Table { modes: Record<string, { measured: Nums; budget: Nums }>; knownOver?: Record<string, Metric[]> }

/** The per-PR modes: cheap to load on a runner and each with a budget row. The full table is `--modes all`. */
export const SENTINEL_MODES = ['golf'];
export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, mobile: true } as const;
export const RASTER = 4;
export const PLAY_FRAMES = 90;   // 1.5 s of game time on the virtual clock

export function readTable(): Table { return JSON.parse(readFileSync(join(ROOT, TABLE), 'utf8')) as Table; }

const PAD_AND_RECORDER = `(() => {
  const dev = window.__FEL_DEV__; const scene = dev.scene; const engine = scene.getEngine();
  const pad = { index: 0, id: 'fake-pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  navigator.getGamepads = () => [pad];
  const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev);
  const si = dev.instrument();
  const R = window.__PERF = { frames: [], t0: performance.now() };
  engine.onEndFrameObservable.add(() => {
    const g = (performance.now() - R.t0) / 1000;
    pad.axes[0] = Math.sin(g * 0.7) * 0.8; pad.axes[1] = -0.6 + Math.cos(g * 0.5) * 0.3;
    const a = (g % 1.5) < 0.12; pad.buttons[0].pressed = a; pad.buttons[0].value = a ? 1 : 0; pad.timestamp = performance.now();
    let parts = 0; for (const ps of scene.particleSystems) parts += ps.getActiveCount ? ps.getActiveCount() : 0;
    R.frames.push({ draws: si.drawCallsCounter.current, meshes: scene.getActiveMeshes().length, parts });
  });
  return 'ok';
})()`;

const SNAPSHOT = `(() => {
  const scene = window.__FEL_DEV__.scene; const engine = scene.getEngine();
  const RT = new Set([5, 6, 12, 14]); let texB = 0;
  for (const t of engine._internalTexturesCache || []) {
    if (RT.has(t.source)) continue;
    texB += t.width * t.height * 4 * (t.generateMipMaps ? 1.33 : 1) * (t.isCube ? 6 : 1) * (t.is3D ? Math.max(1, t.depth) : 1);
  }
  const bodies = scene.skeletons.filter((sk) => scene.meshes.some((m) => m.skeleton === sk && m.isEnabled() && m.isVisible)).length;
  return { texMb: texB / 1048576, bodies, frames: window.__PERF.frames };
})()`;

/** Mount, play, and read the mode's worst frame — the numbers the table holds. */
export async function measureMode(ctx: FlowContext, mode: string): Promise<{ m: Nums; frames: number; loadS: number; page: Page }> {
  const { page, loadS } = await openMode(ctx, { mode, ...PHONE, query: '?perf=off' });
  await page.evaluate(`(() => { const e = window.__FEL_DEV__.scene.getEngine(); e.setHardwareScalingLevel(e.getHardwareScalingLevel() * ${RASTER}); })()`);
  await page.evaluate(PAD_AND_RECORDER);
  await advanceFrames(page, PLAY_FRAMES);
  const snap = (await page.evaluate(SNAPSHOT)) as { texMb: number; bodies: number; frames: Array<{ draws: number; meshes: number; parts: number }> };
  const f = snap.frames.slice(Math.min(30, Math.floor(snap.frames.length / 4)));   // as the probe: the first frames settle
  assert(f.length > 10, `${mode}: only ${snap.frames.length} frames recorded`);
  const max = (k: 'draws' | 'meshes' | 'parts') => Math.max(...f.map((x) => x[k]));
  return {
    m: { drawCalls: Math.round(max('draws')), activeMeshes: Math.round(max('meshes')), skinnedBodies: snap.bodies, textureMb: Math.round(snap.texMb), particles: Math.round(max('parts')) },
    frames: f.length, loadS, page,
  };
}

/** Pure verdict: every metric at or under the row's budget. */
export function overBudget(m: Nums, budget: Nums): string[] {
  return METRICS.filter((k) => m[k] > budget[k]).map((k) => `${k} ${m[k]} > budget ${budget[k]}`);
}

export function perfFlow(mode: string, table: Table = readTable()): Flow {
  return {
    name: `perf-${mode}`, title: `${mode} on the phone profile, inside its mobileBudget.json row`, timeoutMs: 420_000,
    async run(ctx) {
      const row = table.modes[mode];
      assert(row, `${mode} has no row in ${TABLE}: measure it with scripts/probes/_perf-sweep.mts (WRITE_TABLE=1) first`);
      const { m, frames, loadS } = await measureMode(ctx, mode);
      ctx.log(`${mode}: ${METRICS.map((k) => `${k} ${m[k]}/${row.budget[k]}`).join(' · ')} (${frames} frames, playing after ${loadS.toFixed(0)} s)`);
      const over = overBudget(m, row.budget);
      assert(!over.length, `${mode} is over its phone budget: ${over.join('; ')}. Trim the mode, or — if the owner approves the growth — re-measure the row with scripts/probes/_perf-sweep.mts WRITE_TABLE=1 and say why in the commit`);
    },
  };
}
