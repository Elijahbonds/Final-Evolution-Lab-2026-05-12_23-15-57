// _dribble-side-probe (HOOPS-DEPTH S8, 2026-09-23) — which side of the body the dribbled ball is on, against the dribbling shoulder.
// The runtime hoops rigs are mirrored (RightArm on the root's -x); a carry that put the ball on +x for 'Right' dribbled across the
// chest and straightened both arms. Samples 60 frames while the hero's carry is active (1v1 forces offence), in the root frame.
//   MODE=onevone|threevthree npx tsx scripts/probes/_dribble-side-probe.mts   (the lane dev server on :3011)
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const MODE = process.env.MODE ?? 'threevthree';
const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.addInitScript(`(() => { const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) }; window.__PAD = pad; navigator.getGamepads = () => [pad]; })()`);
await p.goto(`http://127.0.0.1:3011/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 }); await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first(); if (await start.count()) { await start.click(); await p.waitForTimeout(3500); }
const out = await p.evaluate(`new Promise((res) => {
  const dev = window.__FEL_DEV__, scene = dev.scene, pad = window.__PAD;
  const hero = dev.hero(); const under = new Set(hero.getDescendants(false));
  const bone = (n) => [...under].find((x) => new RegExp('(^|[:_])' + n + '(_c\\\\d+)?$').test(x.name));
  const RH = bone('RightHand'), LH = bone('LeftHand'), RS = bone('RightArm');
  const ball = scene.getMeshByName('ball');
  const rows = []; let f = 0;
  scene.onAfterRenderObservable.add(() => {
    f++; pad.axes[1] = -0.6; pad.axes[0] = 0; pad.timestamp = performance.now(); if (f === 30 && scene.metadata && scene.metadata.onevone && scene.metadata.onevone.offense) scene.metadata.onevone.offense();
    const md = scene.metadata && (scene.metadata.threevthree || scene.metadata.onevone); const c = md && md.carry ? md.carry() : null;
    if (!c || !c.active || rows.length >= 60) { if (rows.length >= 60) res(rows); return; }
    hero.computeWorldMatrix(true); const root = hero.getAbsolutePosition(); const right = hero.getDirection(new (root.constructor)(1, 0, 0));
    const side = (v) => +((v.x - root.x) * right.x + (v.z - root.z) * right.z).toFixed(2);
    const bp = ball.getAbsolutePosition(), rh = RH.getAbsolutePosition(), lh = LH.getAbsolutePosition(), rs = RS.getAbsolutePosition();
    rows.push({ f, carrySide: c.side, ballSide: side(bp), rHandSide: side(rh), lHandSide: side(lh), rShoulderSide: side(rs), handToBall: +Math.hypot(rh.x - bp.x, rh.z - bp.z).toFixed(2), ballY: +bp.y.toFixed(2), rhY: +rh.y.toFixed(2), scaleX: +hero.scaling.x.toFixed(2) });
  });
  setTimeout(() => res(rows), 50000);
})`) as Record<string, unknown>[];
for (const r of out.slice(0, 60).filter((_, i) => i % 6 === 0)) console.log(JSON.stringify(r));
await b.close();
