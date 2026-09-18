// _skate-legs — WHY do the skater's legs fold? (owner, 2026-09-15: "fix the glitched out legs ... in skateboarding")
//
// Per sampled frame on a live run: the clip(s) playing on the hero with their weights, and the LEG geometry in the
// rider's own frame — hip / knee / ankle heights, the knee's bend angle, and how far each ankle sits from the deck.
// A leg that folds shows up as a knee angle far past its range or an ankle metres off the board.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
// a production build has no /dev/mode routes; a dev server has them and needs no login — ROUTE picks which
const ROUTE = process.env.ROUTE ?? '/play/skateboard?agent=1';
const SEC = Number(process.env.SEC ?? 18);
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle'] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 640 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
{ const lp = await ctx.newPage(); await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); await lp.waitForTimeout(600);
  if (/\/login/.test(lp.url())) { await lp.fill('input[type="email"]', 'playtest@fel.local'); await lp.fill('input[type="password"]', 'playtest-local-only'); await lp.click('button[type="submit"]'); const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(lp.url())) await lp.waitForTimeout(300); } await lp.close(); }
const p = await ctx.newPage();
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
await p.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
const t0 = Date.now(); while (Date.now() - t0 < 120000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(400); }
await p.evaluate(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.__LEGS = [];
  const D = window.__FEL_DEV__;
  const s = (window.__FEL_QA__ && window.__FEL_QA__.scene && window.__FEL_QA__.scene()) || null;
  const hero = () => (window.__FEL_QA__ && window.__FEL_QA__.hero && window.__FEL_QA__.hero()) || null;
  const bone = (sk, n) => { const b = sk.bones.find((x) => x.name.replace(/_c\\d+$/, '') === n || x.name === n); return b && b.getTransformNode ? b.getTransformNode() : null; };
  setInterval(() => {
    if (!s) return;
    const h = hero(); if (!h) return;
    let root = h; while (root.parent) root = root.parent;
    const under = new Set(root.getDescendants(false));
    const sk = s.skeletons.find((k) => k.bones.some((x) => { const n = x.getTransformNode(); return n && under.has(n); }));
    if (!sk) return;
    const names = ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'Hips'];
    const pos = {};
    for (const n of names) { const b = bone(sk, n); if (b) { b.computeWorldMatrix(true); const q = b.getAbsolutePosition(); pos[n] = [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)]; } }
    const ang = (a, b2, c) => { if (!pos[a] || !pos[b2] || !pos[c]) return null;
      const v1 = [pos[a][0]-pos[b2][0], pos[a][1]-pos[b2][1], pos[a][2]-pos[b2][2]], v2 = [pos[c][0]-pos[b2][0], pos[c][1]-pos[b2][1], pos[c][2]-pos[b2][2]];
      const d = v1[0]*v2[0]+v1[1]*v2[1]+v1[2]*v2[2], m = Math.hypot(...v1)*Math.hypot(...v2);
      return m ? Math.round(Math.acos(Math.max(-1, Math.min(1, d/m))) * 180 / Math.PI) : null; };
    const groups = s.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && under.has(g.targetedAnimations[0].target))
      .map((g) => { const a = g.animatables && g.animatables[0]; return g.name + '@' + (a ? (a.weight < 0 ? 1 : a.weight).toFixed(2) : '1'); });
    const board = s.meshes.find((m) => /board|deck/i.test(m.name) && under.has(m));
    window.__LEGS.push({ t: Math.round(performance.now()), clips: groups.join(','), kneeL: ang('LeftUpLeg', 'LeftLeg', 'LeftFoot'), kneeR: ang('RightUpLeg', 'RightLeg', 'RightFoot'),
      hipY: pos.Hips ? pos.Hips[1] : null, lfY: pos.LeftFoot ? pos.LeftFoot[1] : null, rfY: pos.RightFoot ? pos.RightFoot[1] : null,
      boardY: board ? +board.getAbsolutePosition().y.toFixed(2) : null,
      boardName: board ? board.name : null,
      boardRot: board ? [+board.rotation.x.toFixed(2), +board.rotation.y.toFixed(2), +board.rotation.z.toFixed(2)] : null,
      boardPos: board ? [+board.position.x.toFixed(2), +board.position.y.toFixed(2), +board.position.z.toFixed(2)] : null,
      rootRot: [+root.rotation.x.toFixed(2), +root.rotation.y.toFixed(2), +root.rotation.z.toFixed(2)],
      rootY: +root.position.y.toFixed(3),
      deckTop: board ? +(board.getBoundingInfo().boundingBox.maximumWorld.y).toFixed(3) : null,
      deckBottom: board ? +(board.getBoundingInfo().boundingBox.minimumWorld.y).toFixed(3) : null,
      deckParts: s.meshes.filter((m) => /^deck_/.test(m.name) && under.has(m)).length,
      deckTopMesh: (() => { const ds = s.meshes.filter((m) => /^deck_(slab|grip)/.test(m.name) && under.has(m)); let y = null; for (const m of ds) { try { const q = m.getBoundingInfo().boundingBox.maximumWorld.y; if (y === null || q > y) y = q; } catch {} } return y === null ? null : +y.toFixed(3); })(),
      soleY: (() => { let y = null; for (const m of s.meshes) { if (!under.has(m) || !m.skeleton || m.getTotalVertices() < 100) continue;
        try { m.refreshBoundingInfo({ applySkeleton: true }); } catch { try { m.refreshBoundingInfo(true); } catch {} }
        const q = m.getBoundingInfo().boundingBox.minimumWorld.y; if (y === null || q < y) y = q; } return y === null ? null : +y.toFixed(3); })(),
      ankleL: pos.LeftFoot ? pos.LeftFoot[1] : null, ankleR: pos.RightFoot ? pos.RightFoot[1] : null,
      toeL: pos.LeftToeBase ? pos.LeftToeBase[1] : null, toeR: pos.RightToeBase ? pos.RightToeBase[1] : null,
      skate: (window.__FEL_DEV__ && window.__FEL_DEV__.skate) ? (() => { const k = window.__FEL_DEV__.skate(); return { speed01: +(k.speed01 ?? 0).toFixed(2), steer: +(k.steer ?? 0).toFixed(2), grounded: k.grounded, deck: k.deck, boardPitch: +(k.boardPitch ?? 0).toFixed(2) }; })() : null });
    if (window.__LEGS.length > 4000) window.__LEGS.shift();
  }, 200);
})()`);
const start = p.locator('text=/^(TAP TO START|START|PLAY)$/').first(); if (await start.count()) await start.first().click().catch(() => {});
await p.evaluate(`(() => { window.__PAD.axes[1] = -1; window.__PAD.timestamp = Date.now(); })()`);
const tEnd = Date.now() + SEC * 1000;
const POPS = process.env.POPS !== '0';
let shot = 0;
while (Date.now() < tEnd) {
  if (POPS) { await p.evaluate(`(() => { const b = window.__PAD.buttons[0]; b.pressed = true; b.value = 1; window.__PAD.timestamp = Date.now(); })()`); await p.waitForTimeout(80); await p.evaluate(`(() => { const b = window.__PAD.buttons[0]; b.pressed = false; b.value = 0; window.__PAD.timestamp = Date.now(); })()`); await p.waitForTimeout(700); }
  else await p.waitForTimeout(500);
  if (shot < 10) {
    const cur = await p.evaluate('(window.__LEGS[window.__LEGS.length - 1] || {}).clips || "none"') as string;
    await p.screenshot({ path: `/tmp/claude-skate-shot-${String(++shot).padStart(2, '0')}-${cur.replace(/[^a-z_]/gi, '').slice(0, 24)}.png` });
  }
}
const rows = await p.evaluate('window.__LEGS') as any[];
await p.screenshot({ path: '/tmp/claude-skate-legs.png' });
await b.close();
const bad = rows.filter((r) => (r.kneeL !== null && r.kneeL < 90) || (r.kneeR !== null && r.kneeR < 90));
console.log(`frames ${rows.length} · knees under 90° on ${bad.length}`);
for (const r of rows.slice(0, 6).concat(bad.slice(0, 8))) console.log(JSON.stringify(r));
