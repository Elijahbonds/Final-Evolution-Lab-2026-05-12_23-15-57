// VENICE-SKATE-THPS (2026-09-09) — the boardSuite is SHARED. Skate, surf, snowboard and big air all ride the same
// clips, so re-authoring the arms on pose targets has to be checked on the three modes the tip never mentions.
// Per mode: 12 s of held forward on a fake pad, then the elbow angles off the live rig (180 = the locked T-pose the
// suite used to hold), the clips that actually played, and every console error.
//
// Usage: npx tsx scripts/probes/_board-family-smoke.mts <port> <outdir> [mode,mode,...]

import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.argv[2] ?? '3009';
const OUT = process.argv[3] ?? '/tmp/board-family';
const MODES = (process.argv[4] ?? 'surf,snowboard,bigair').split(',');
fs.mkdirSync(OUT, { recursive: true });

async function run(p: Page, mode: string): Promise<Record<string, unknown>> {
  const logs: string[] = [];
  const onMsg = (t: string) => { if (/ERROR|MISSING|Error|WARN/i.test(t)) logs.push(t.slice(0, 200)); };
  p.on('console', (m) => onMsg(m.text()));
  p.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForSelector('canvas', { timeout: 240000 });
  for (let i = 0; i < 120; i++) {
    const txt = await p.evaluate(() => document.body.innerText);
    if (/playing/i.test(txt)) break;
    if (/ready/i.test(txt)) await p.keyboard.press('Space');
    await p.waitForTimeout(1000);
  }
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    const w = window as any, dev = w.__FEL_DEV__;
    if (!dev?.scene) { w.__BF = { err: 'no scene' }; return; }
    const root = dev.hero ? dev.hero() : null;
    const under: any[] = root ? root.getDescendants(false) : [];
    const by = (b: string) => under.find((n: any) => n.name === b || new RegExp('(^|[:_])' + b + '(_c\\d+)?$').test(n.name));
    const B = { LS: by('LeftArm'), LE: by('LeftForeArm'), LH: by('LeftHand'), RS: by('RightArm'), RE: by('RightForeArm'), RH: by('RightHand') };
    const ang = (a: any, b: any, c: any) => {
      if (!a || !b || !c) return null;
      const p1 = a.getAbsolutePosition(), p2 = b.getAbsolutePosition(), p3 = c.getAbsolutePosition();
      const u = p1.subtract(p2), v = p3.subtract(p2), d = u.length() * v.length();
      return d < 1e-6 ? null : Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / d))) * 180 / Math.PI;
    };
    const rows: any[] = []; w.__BF = { rows };
    dev.scene.onAfterRenderObservable.add(() => {
      const wt = (g: any) => (g.weight === undefined || g.weight < 0 ? 1 : g.weight);
      const rp = root ? root.getAbsolutePosition() : null;
      rows.push({
        // phase 8: the root's position and the frame's dt — speed and distance are computed off these in Node
        px: rp ? rp.x : null, py: rp ? rp.y : null, pz: rp ? rp.z : null, dt: dev.scene.getEngine().getDeltaTime() / 1000,
        eL: ang(B.LS, B.LE, B.LH), eR: ang(B.RS, B.RE, B.RH),
        clips: dev.scene.animationGroups.filter((g: any) => g.isPlaying && wt(g) > 0.02).map((g: any) => g.name),
      });
      if (rows.length > 20000) rows.shift();
    });
  });
  await p.evaluate(() => { const pad = (window as any).__PAD; if (pad) { pad.axes[1] = -1; pad.timestamp = Date.now(); } });
  await p.waitForTimeout(12000);
  await p.screenshot({ path: `${OUT}/${mode}.png` });
  const rows: any[] = await p.evaluate(() => (window as any).__BF?.rows ?? []);
  const arms = rows.filter((r) => r.eL != null);
  const tee = arms.filter((r) => r.eL > 160 && r.eR > 160).length;
  const clips: Record<string, number> = {};
  for (const r of rows) for (const c of r.clips ?? []) clips[c] = (clips[c] ?? 0) + 1;
  const board = Object.entries(clips).filter(([k]) => /^board_|^skate_/.test(k)).sort((a, b) => b[1] - a[1]);
  // phase 5: WHICH clip the T-pose frames sat under (a locked T is a clip that never reached the arms or a bind pose)
  const teeBy: Record<string, number> = {};
  for (const r of arms) if (r.eL > 160 && r.eR > 160) for (const c of (r.clips?.length ? r.clips : ['<none>'])) teeBy[c] = (teeBy[c] ?? 0) + 1;
  const allClips = Object.entries(clips).sort((a, b) => b[1] - a[1]).slice(0, 8);
  // phase 8: SPEED — per-frame ground speed off consecutive root positions (a teleport > 8 m in a frame is a respawn, skipped)
  const speeds: number[] = []; let dist = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (a.px == null || b.px == null || !b.dt || b.dt <= 0) continue;
    const d = Math.hypot(b.px - a.px, b.pz - a.pz);
    if (d > 8) continue;
    speeds.push(d / b.dt); dist += d;
  }
  const sorted = [...speeds].sort((x, y) => x - y);
  const speed = speeds.length ? { mean: +(speeds.reduce((s, v) => s + v, 0) / speeds.length).toFixed(2), p90: +(sorted[Math.floor(sorted.length * 0.9)] ?? 0).toFixed(2), peak: +(sorted[sorted.length - 1] ?? 0).toFixed(2), dist: +dist.toFixed(1) } : null;
  return { mode, frames: rows.length, armFrames: arms.length, tee, teeBy, speed, boardClips: board, clips: allClips, errors: logs.slice(0, 6) };
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await p.addInitScript(() => {
    const pad: any = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__PAD = pad; (navigator as any).getGamepads = () => [pad];
  });
  const out: unknown[] = [];
  for (const m of MODES) { const r = await run(p, m); out.push(r); console.log(JSON.stringify(r)); }
  fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
