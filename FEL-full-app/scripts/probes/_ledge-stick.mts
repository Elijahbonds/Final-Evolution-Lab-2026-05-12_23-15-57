// _ledge-stick — ride INTO every skate-park feature and flag the ones that pin the rider (owner 2026-09-15: "stuck to walls",
// skate park edges / ledges). Dev build. For each feature (ramp, funbox, stair, bowl bank, quarter, kicker, totem, props…) the
// hero is placed 7 m out on the park-centre side, then steers at the feature's centre holding forward for 5 s. A PIN is a 1.5 s
// window with forward held and < 0.8 m moved. The rider's height is logged so a snap-up (y jump) is visible too.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const TAG = process.env.TAG ?? 'run';
const MODE = process.env.MODE ?? 'skateboard';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 640 } });
await ctx.addInitScript({ content: `window.__name = window.__name || function (f) { return f; };
  (() => { const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__PAD = pad; navigator.getGamepads = () => [pad, null, null, null]; })();` });
const p = await ctx.newPage();
await p.goto(`${BASE}/dev/mode/${MODE}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(500); }
await p.waitForTimeout(1500); await p.keyboard.press('Space'); await p.waitForTimeout(2500);
const res = await p.evaluate(async ([skip, take]) => {
  const W = window as any; const pad = W.__PAD; const dev = W.__FEL_DEV__; const scene = dev.scene;
  const feats = scene.meshes.filter((m: any) => m.isEnabled() && m.getTotalVertices?.() > 0 && /ramp|bowl|funbox|stair|lane|totem|quarter|kicker|ledge|bench|planter|rail|coping|bank|pyramid|hubba|manny|prop|bin|table|car|barrier|crate/i.test(m.name) && !/^rail$|fence/.test(m.name))
    .map((m: any) => { const bb = m.getBoundingInfo().boundingBox; const c = bb.centerWorld; return { name: m.name, cx: c.x, cz: c.z, top: bb.maximumWorld.y, sx: bb.maximumWorld.x - bb.minimumWorld.x, sz: bb.maximumWorld.z - bb.minimumWorld.z }; })
    .filter((f: any) => f.top > 0.12 && f.top < 8 && f.sx < 40 && f.sz < 40);
  // one per distinct place
  const seen: any[] = []; for (const f of feats) if (!seen.some((s) => Math.hypot(s.cx - f.cx, s.cz - f.cz) < 3)) seen.push(f);
  const out: any[] = []; let sign = 1;
  for (const f of seen.slice(skip, skip + take)) {
    if (document.getElementById('fel-ready')?.dataset.state === 'ended') { out.push({ feat: 'RUN ENDED', at: [0, 0], top: 0, pins: 0, maxY: 0, end: [0, 0, 0], hud: '' }); break; }
    const h = dev.hero(); if (!h) break;
    const len = Math.hypot(f.cx, f.cz) || 1; const ux = -f.cx / len, uz = -f.cz / len;   // toward park centre
    const r = 7 + Math.max(f.sx, f.sz) / 2;
    h.position.x = f.cx + ux * r; h.position.z = f.cz + uz * r; h.position.y = 0.2;
    await new Promise((res) => setTimeout(res, 400));
    const track: { t: number; x: number; y: number; z: number }[] = []; const t0 = performance.now(); let pins = 0, lastPin = -9, maxY = 0; let prevErr = 0;
    while (performance.now() - t0 < 5000) {
      const t = (performance.now() - t0) / 1000; const P = h.position;
      const want = Math.atan2(f.cx - P.x, f.cz - P.z); let err = want - h.rotation.y; err = Math.atan2(Math.sin(err), Math.cos(err));
      if (t > 0.6 && Math.abs(err) > Math.abs(prevErr) + 0.25 && Math.abs(err) > 0.8) sign = -sign;   // mirrored camera: flip the stick sense
      prevErr = err;
      pad.axes[0] = Math.max(-1, Math.min(1, sign * err * 1.5)); pad.axes[1] = -1; pad.timestamp = performance.now();
      track.push({ t, x: P.x, y: P.y, z: P.z }); maxY = Math.max(maxY, P.y);
      const n = track.length;
      if (n > 15) { const a = track[n - 16]; const moved = Math.hypot(P.x - a.x, P.z - a.z); if (moved < 0.8 && t - lastPin > 1.5 && t > 1.6) { pins++; lastPin = t; } }
      await new Promise((res) => setTimeout(res, 100));
    }
    pad.axes[0] = 0; pad.axes[1] = 0;
    const last = track[track.length - 1];
    out.push({ feat: f.name, at: [+f.cx.toFixed(1), +f.cz.toFixed(1)], top: +f.top.toFixed(2), pins, maxY: +maxY.toFixed(2), end: [+last.x.toFixed(1), +last.y.toFixed(2), +last.z.toFixed(1)], hud: W.__FEL_QA__?.hud?.()?.banner ?? '' });
  }
  return out;
}, [Number(process.env.SKIP ?? 0), Number(process.env.TAKE ?? 12)] as [number, number]);
for (const r of res) console.log(`${r.pins ? 'PIN ' : 'ok  '} ${r.feat.padEnd(28)} at ${r.at} top ${r.top} pins ${r.pins} maxY ${r.maxY} end ${r.end} ${r.hud}`);
fs.mkdirSync(`${process.env.HOME}/Claude/outbox/finish-release/walls`, { recursive: true });
fs.writeFileSync(`${process.env.HOME}/Claude/outbox/finish-release/walls/ledges-${MODE}-${TAG}.json`, JSON.stringify(res, null, 1));
await b.close();
