// _hoops-seq-eye — frames of ONE scoring / defending sequence, cropped around the hero, for the eye (2026-09-17).
//   BASE=http://127.0.0.1:3098 MODE=onevone PLAY=jumper|pullup|layup|dunk|standing|baseline|defence FRAMES=8 DT=140 \
//   npx tsx scripts/probes/_hoops-seq-eye.mts
// Writes ~/Claude/outbox/finish-release/hoops/seq/<mode>-<play>-<i>.png (a 560×620 crop centred on the hero, plus the
// full frame for i=0) and prints, per frame, the tree's held clip and the HUD's shot type / banner.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const MODE = process.env.MODE ?? 'onevone';
const PLAY = process.env.PLAY ?? 'jumper';
const FRAMES = Number(process.env.FRAMES ?? 10);
const DT = Number(process.env.DT ?? 120);
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/hoops/seq`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
{ const lp = await ctx.newPage();
  for (let attempt = 0; attempt < 3; attempt++) {
    await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    if (await lp.evaluate(`fetch('/api/auth/session').then((r) => r.json()).then((j) => !!(j && j.user)).catch(() => false)`)) break;
    if (!/\/login/.test(lp.url())) break;
    await lp.waitForSelector('button[type="submit"]', { timeout: 120000 }); await lp.waitForTimeout(1200);
    await lp.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
    await lp.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
    await Promise.all([lp.waitForResponse((r) => /\/api\/auth\/(callback|signin)/.test(r.url()), { timeout: 60000 }).catch(() => null), lp.press('input[type="password"]', 'Enter')]);
    const t = Date.now(); while (Date.now() - t < 45000) { if (await lp.evaluate(`fetch('/api/auth/session').then((r) => r.json()).then((j) => !!(j && j.user)).catch(() => false)`)) break; await lp.waitForTimeout(400); }
  }
  await lp.close(); }
const page = await ctx.newPage();
const logs: string[] = [];
page.on('console', (m) => { const t = m.text(); if (/\[1V1|\[3V3|\[FEL-ANIM\] MISSING/.test(t)) logs.push(t.slice(0, 160)); });
await page.goto(`${BASE}/play/${MODE}?agent=1${process.env.HANDLE ? `&handle=${Number(process.env.HANDLE)}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
{ const t = Date.now(); while (Date.now() - t < 300000) { const st = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => '') as string; if (st === 'loaded' || st === 'playing') break; await page.waitForTimeout(300); } }
await page.evaluate(`(() => {
  const MODE = ${JSON.stringify(MODE)};
  window.__dev = () => { const q = window.__FEL_QA__; const s = q && q.scene ? q.scene() : null; return (s && s.metadata && s.metadata[MODE]) || null; };
  window.__hudNow = () => { const q = window.__FEL_QA__; return q && q.rawHud ? q.rawHud() : {}; };
  // the hero's screen position (for the crop): project the root through the active camera
  window.__heroScreen = () => { const q = window.__FEL_QA__; const s = q && q.scene ? q.scene() : null; const hn = q && q.hero ? q.hero() : null; const p = hn && (hn.position || hn); if (!s || !p || !s.activeCamera) return null;
    const V = p.constructor; const cam = s.activeCamera; const e = s.getEngine(); const vp = cam.viewport.toGlobal(e.getRenderWidth(), e.getRenderHeight());
    const c = V.Project(new V(p.x, p.y + 0.9, p.z), hn.getWorldMatrix ? hn.getWorldMatrix().clone().setTranslation(new V(0,0,0)).multiply(V.Zero().constructor === V ? new (hn.getWorldMatrix().constructor)() : null) : null, s.getTransformMatrix(), vp);
    return { x: c.x / e.getRenderWidth(), y: c.y / e.getRenderHeight() }; };
  // camera-relative steer (the lab's)
  window.__steer = (tx, tz, ms) => { const q = window.__FEL_QA__; const a = window.__NEXUS_AGENT__; const scene = q && q.scene ? q.scene() : null; const cam = window.__eyeCam ? window.__eyeCam.prev : (scene && scene.activeCamera); const hn = q && q.hero ? q.hero() : null; const me = hn && (hn.position || hn);
    if (!cam || !me || !a || typeof me.x !== 'number') return false; const wx = tx - me.x, wz = tz - me.z; const wl = Math.hypot(wx, wz); if (wl < 0.25) return false; const f = cam.getForwardRay ? cam.getForwardRay().direction : null; if (!f) return false; const fl = Math.hypot(f.x, f.z) || 1; const fx = f.x / fl, fz = f.z / fl;
    a.do('move', { x: (wx * fz - wz * fx) / wl, y: (wx * fx + wz * fz) / wl, ms: ms || 130 }); return true; };
})()`);
const agent = async (expr: string) => page.evaluate(`(async () => { const a = window.__NEXUS_AGENT__; if (!a) return 'no bridge'; return await (${expr}); })()`);
const steerTo = async (x: number, z: number, maxMs: number) => { const t0 = Date.now(); while (Date.now() - t0 < maxMs) { const there = await page.evaluate(`window.__steer(${x}, ${z}, 140) === false`); if (there) return true; await page.waitForTimeout(130); } return false; };
await agent('a.start(30000)');
await page.waitForTimeout(1200);

// the hero's screen position: simpler and robust — Vector3.Project with identity world (the position is world already)
await page.evaluate(`window.__heroScreen = () => { const q = window.__FEL_QA__; const s = q && q.scene ? q.scene() : null; const hn = q && q.hero ? q.hero() : null; const p = hn && (hn.position || hn); if (!s || !p || !s.activeCamera) return null;
  const V = p.constructor; const cam = s.activeCamera; const e = s.getEngine(); const vp = cam.viewport.toGlobal(e.getRenderWidth(), e.getRenderHeight());
  const M = s.getTransformMatrix().constructor; const c = V.Project(new V(p.x, p.y + 0.9, p.z), M.Identity(), cam.getViewMatrix().multiply(cam.getProjectionMatrix()), vp);
  return { x: c.x / e.getRenderWidth(), y: c.y / e.getRenderHeight() }; }`);

const SIDE = process.env.SIDE ?? '3.6,1.3,0.4';   // camera offset from the hero (x = his side, y up, z toward the rim side) — '' for the game camera
const sideCam = async (on: boolean) => page.evaluate(`(() => { const q = window.__FEL_QA__; const s = q && q.scene ? q.scene() : null; if (!s) return 'no scene';
  if (!${on}) { if (window.__eyeCam) { s.activeCamera = window.__eyeCam.prev; s.onBeforeRenderObservable.remove(window.__eyeCam.obs); window.__eyeCam.cam.dispose(); window.__eyeCam = null; } return 'off'; }
  const hn = q.hero ? q.hero() : null; const p = hn && (hn.position || hn); if (!p) return 'no hero';
  const V = p.constructor; const prev = s.activeCamera; const C = prev.constructor; const off = [${SIDE}];
  const cam = new C('eye_cam', new V(p.x + off[0], p.y + off[1], p.z + off[2]), s); cam.minZ = 0.05; cam.fov = prev.fov;
  const obs = s.onBeforeRenderObservable.add(() => { const pp = hn.position || hn; cam.position.set(pp.x + off[0], pp.y + off[1], pp.z + off[2]); cam.setTarget(new V(pp.x, pp.y + 1.0, pp.z)); });
  s.activeCamera = cam; window.__eyeCam = { cam, prev, obs }; return 'on'; })()`);
// world direction → stick for the ACTIVE camera (the mode maps every stick through the active camera's floor basis)
await page.evaluate(`window.__stick = (wx, wz) => { const q = window.__FEL_QA__; const s = q && q.scene ? q.scene() : null; const cam = window.__eyeCam ? window.__eyeCam.prev : (s && s.activeCamera); if (!cam) return { x: 0, y: 0 };
  const f = cam.getForwardRay().direction; const fl = Math.hypot(f.x, f.z) || 1; const fx = f.x / fl, fz = f.z / fl; const wl = Math.hypot(wx, wz) || 1;
  return { x: (wx * fz - wz * fx) / wl, y: (wx * fx + wz * fz) / wl }; };
  window.__toRim = () => { const q = window.__FEL_QA__; const hn = q && q.hero ? q.hero() : null; const p = hn && (hn.position || hn); return p ? window.__stick(0 - p.x, -0.6 - p.z) : { x: 0, y: 1 }; };`);
const stickToRim = async () => page.evaluate('window.__toRim()') as Promise<{ x: number; y: number }>;
const turboTo = async (x: number, z: number, maxMs: number) => { const t0 = Date.now(); while (Date.now() - t0 < maxMs) { const st = await page.evaluate(`(() => { const q = window.__FEL_QA__; const hn = q.hero(); const p = hn.position || hn; const d = Math.hypot(${x} - p.x, ${z} - p.z); if (d < 0.35) return null; return window.__stick(${x} - p.x, ${z} - p.z); })()`) as { x: number; y: number } | null; if (!st) return true; await agent(`a.do('turbo', { x: ${st.x}, y: ${st.y}, ms: 140 })`); await page.waitForTimeout(120); } return false; };
const capture = async (tag: string) => {
  for (let i = 0; i < FRAMES; i++) {
    const t0 = Date.now();
    const hs = await page.evaluate('window.__heroScreen()') as { x: number; y: number } | null;
    const dev = await page.evaluate(`(() => { const d = window.__dev(); const h = window.__hudNow(); const p = d && d.post ? d.post() : {}; return { held: p.held, gather: p.gather, finish: p.finish, shooting: p.shooting, shot: h.shotType, banner: h.banner, meter: h.shotMeterT }; })()`);
    const cx = SIDE ? 640 : (hs ? Math.round(hs.x * 1280) : 640), cy = SIDE ? 400 : (hs ? Math.round(hs.y * 800) : 420);
    const clip = { x: Math.max(0, Math.min(1280 - 560, cx - 280)), y: Math.max(0, Math.min(800 - 620, cy - 330)), width: 560, height: 620 };
    const file = `${OUT}/${MODE}-${tag}-${i}.png`;
    await page.screenshot({ path: file, clip });
    if (i === 0) await page.screenshot({ path: `${OUT}/${MODE}-${tag}-full.png` });
    console.log(`[SEQ] ${tag} #${i} t+${Date.now() - t0}ms hero@(${cx},${cy}) ${JSON.stringify(dev)}`);
    const wait = DT - (Date.now() - t0); if (wait > 0) await page.waitForTimeout(wait);
  }
};

const dev = (expr: string) => page.evaluate(`(() => { const d = window.__dev(); return d ? (${expr}) : null; })()`);
const hold = async (mul: number, extra = '') => { const st = await stickToRim(); void agent(`a.act({ moveX: ${st.x * mul}, moveY: ${st.y * mul}, actionHeld: 0.8 ${extra} }, 480).then(() => a.act({ moveX: ${st.x * mul}, moveY: ${st.y * mul}, actionHeld: 0, action: true ${extra} }, 80))`); };
const begin = async (offense = true) => { await dev(offense ? 'd.offense()' : 'd.defend()'); await page.waitForTimeout(700); if (SIDE) console.log('[SEQ] side cam', await sideCam(true)); await page.waitForTimeout(150); };
if (PLAY === 'jumper') { await begin(); void agent('a.do("shoot", { charge: 0.8 })'); await capture('jumper'); }
else if (PLAY === 'pullup') { await begin(); await steerTo(0.2, 3.3, 2500); await hold(0.6); await capture('pullup'); }
else if (PLAY === 'layup') { await begin(); await steerTo(0.3, 1.5, 3000); await hold(0.6); await capture('layup'); }
else if (PLAY === 'dunk') { await begin(); await turboTo(0.1, 2.4, 2500); await hold(1, ', sprint: true, turbo: true'); await capture('dunk'); }
else if (PLAY === 'standing') { await begin(); await steerTo(0.2, 0.75, 3500); await agent('a.act({ moveX: 0, moveY: 0 }, 350)'); await hold(0.25, ', sprint: true, turbo: true'); await capture('standing'); }
else if (PLAY === 'baseline') { await begin(); await steerTo(4.4, -0.5, 4500); await agent('a.act({ moveX: 0, moveY: 0 }, 200)'); await turboTo(1.6, -0.6, 1200); await hold(1, ', sprint: true, turbo: true'); await capture('baseline'); }
else if (PLAY === 'post') { await begin(); await steerTo(0.9, 1.6, 3000); const st = await stickToRim(); void agent(`a.act({ moveX: ${st.x * 0.4}, moveY: ${st.y * 0.4}, brace: true }, 900).then(() => a.act({ moveX: ${st.x * 0.3}, moveY: ${st.y * 0.3}, brace: true, actionHeld: 0.8 }, 480)).then(() => a.act({ moveX: ${st.x * 0.3}, moveY: ${st.y * 0.3}, brace: true, actionHeld: 0, action: true }, 80))`); await page.waitForTimeout(400); await capture('post'); }
else if (PLAY === 'handle') { await begin(); void (async () => { for (let i = 0; i < 4; i++) { const sx = i % 2 === 0 ? 1 : -1; const a1 = await page.evaluate(`window.__stick(${sx}, 0)`) as { x: number; y: number }; const a2 = await page.evaluate(`window.__stick(${-sx}, 0)`) as { x: number; y: number }; await agent(`a.do('move', { x: ${a1.x}, y: ${a1.y}, ms: 170 })`); await agent(`a.do('move', { x: ${a2.x}, y: ${a2.y}, ms: 170 })`); if (i === 1) { const b = await page.evaluate('window.__stick(0, 1)') as { x: number; y: number }; await agent(`a.do('move', { x: ${b.x}, y: ${b.y}, ms: 200 })`); } } })(); await capture('handle'); }
else if (PLAY === 'defence') { await begin(false); void (async () => { const l = await page.evaluate('window.__stick(1, 0)') as { x: number; y: number }; const r = await page.evaluate('window.__stick(-1, 0)') as { x: number; y: number }; const b = await page.evaluate('window.__stick(0, -1)') as { x: number; y: number }; await agent(`a.act({ moveX: ${l.x}, moveY: ${l.y} }, 550)`); await agent(`a.act({ moveX: ${r.x}, moveY: ${r.y} }, 550)`); await agent(`a.act({ moveX: ${b.x}, moveY: ${b.y}, intense: true }, 500)`); })(); await capture('defence'); }
if (SIDE) await sideCam(false);
console.log(logs.filter((l) => /MISSING|MOVE\]|finish|gather|release/.test(l)).slice(-12).join('\n'));
await browser.close();
