// _wall-stick — does a board rider get PINNED to a wall / ledge / edge? (owner 2026-09-15: "fix the glitch where you get stuck to walls")
// Holds the stick forward with a slow steering pattern for SEC seconds per mode (fake pad, dev build) and samples the hero at 10 Hz.
// A STICK is a 1.5 s window where forward was held the whole time and the hero moved < 0.8 m. Each stick records where it happened
// and the nearest scene meshes (the wall, ledge or prop it is pinned against).
//   BASE=http://127.0.0.1:3098 MODES=skateboard,snowboard_slalom,surf SEC=60 TAG=before npx tsx scripts/probes/_wall-stick.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const SEC = Number(process.env.SEC ?? 60);
const TAG = process.env.TAG ?? 'run';
const MODES = (process.env.MODES ?? 'skateboard,snowboard_slalom,surf').split(',');
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/walls`;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal', '--window-size=1100,760'] });
const all: any[] = [];
for (const mode of MODES) {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } });
  await ctx.addInitScript({ content: `window.__name = window.__name || function (f) { return f; };
    (() => { const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
      window.__PAD = pad; navigator.getGamepads = () => [pad, null, null, null]; })();` });
  const p = await ctx.newPage();
  const errs: string[] = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(500); }
  await p.waitForTimeout(1500); await p.keyboard.press('Space'); await p.waitForTimeout(1200);
  const res = await p.evaluate(async ([sec, mode]) => {
    const W = window as any; const pad = W.__PAD; const dev = W.__FEL_DEV__;
    const steerPlan = mode === 'surf' ? [1, 0.6, -1, -0.6, 1, -1] : [0, 0.35, 0, -0.35, 1, 0, -1, 0.15];
    const samples: { t: number; x: number; y: number; z: number; spd: number }[] = []; const sticks: any[] = [];
    const t0 = performance.now(); let lastStick = -9;
    await new Promise<void>((done) => {
      const iv = setInterval(() => {
        const t = (performance.now() - t0) / 1000;
        if (t > sec) { clearInterval(iv); pad.axes[0] = 0; pad.axes[1] = 0; done(); return; }
        const seg = Math.floor(t / 3.5); const steer = steerPlan[seg % steerPlan.length];
        pad.axes[0] = steer; pad.axes[1] = mode === 'surf' ? 0 : -1; pad.timestamp = performance.now();
        const h = dev?.hero?.(); if (!h) return;
        const P = h.position; samples.push({ t, x: P.x, y: P.y, z: P.z, spd: 0 });
        const n = samples.length; if (n < 16) return;
        const a = samples[n - 16], c = samples[n - 1];
        const moved = Math.hypot(c.x - a.x, c.z - a.z);
        // surf rides WITH the wave (z always advances): judge lateral travel only while steering hard
        const lateral = Math.abs(c.x - a.x);
        const pinned = mode === 'surf' ? (Math.abs(steer) > 0.5 && lateral < 0.4) : moved < 0.8;
        if (pinned && t - lastStick > 1.5 && t > 2) {
          lastStick = t;
          const scene = dev.scene;
          const near = scene.meshes.filter((m: any) => m.isEnabled() && m.isVisible && m.getBoundingInfo).map((m: any) => {
            const bb = m.getBoundingInfo().boundingBox; const mn = bb.minimumWorld, mx = bb.maximumWorld;
            const dx = Math.max(mn.x - P.x, 0, P.x - mx.x), dz = Math.max(mn.z - P.z, 0, P.z - mx.z), dy = Math.max(mn.y - (P.y + 0.5), 0, (P.y + 0.5) - mx.y);
            return { name: m.name, d: Math.hypot(dx, dz, dy), top: +mx.y.toFixed(2) };
          }).filter((m: any) => m.d < 1.2 && !/hero|athlete|board|shadow|Body|mesh_|__root__|spray|particle|sky|ocean|water/i.test(m.name)).sort((a: any, b: any) => a.d - b.d).slice(0, 3);
          sticks.push({ t: +t.toFixed(1), x: +P.x.toFixed(1), y: +P.y.toFixed(2), z: +P.z.toFixed(1), steer, moved: +moved.toFixed(2), near: near.map((m: any) => `${m.name}(d${m.d.toFixed(2)} top${m.top})`), hud: W.__FEL_QA__?.hud?.() ?? null });
        }
      }, 100);
    });
    const dist = samples.reduce((s, c, i) => (i ? s + Math.hypot(c.x - samples[i - 1].x, c.z - samples[i - 1].z) : 0), 0);
    return { mode, samples: samples.length, travelled: Math.round(dist), avgSpeed: +(dist / sec).toFixed(2), sticks };
  }, [SEC, mode] as [number, string]);
  (res as any).errors = errs;
  console.log(`${mode.padEnd(18)} travelled ${res.travelled} m · avg ${res.avgSpeed} m/s · STICKS ${res.sticks.length}`);
  for (const s of res.sticks) console.log(`   t${s.t} (${s.x}, ${s.y}, ${s.z}) steer ${s.steer} moved ${s.moved} near ${s.near.join(' ')}`);
  all.push(res);
  await ctx.close();
}
fs.writeFileSync(`${OUT}/walls-${TAG}.json`, JSON.stringify(all, null, 1));
await b.close();
