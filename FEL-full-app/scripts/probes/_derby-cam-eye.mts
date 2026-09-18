// _derby-cam-eye — the batting camera looks out to the outfield (owner 2026-09-15). Frames through a pitch and a swing, plus
// FEL-FRAME lines and the batter's and pitcher's on-screen positions.
//   BASE=http://127.0.0.1:3098 npx tsx scripts/probes/_derby-cam-eye.mts
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/derby-cam`;
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const frame: string[] = [];
p.on('console', (m) => { if (/FEL-FRAME/.test(m.text())) frame.push(m.text().slice(0, 160)); });
await p.goto(`${BASE}/dev/mode/derby`, { waitUntil: 'domcontentloaded', timeout: 180000 });
const t0 = Date.now();
while (Date.now() - t0 < 180000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(500); }
await p.waitForTimeout(1500);
await p.keyboard.press('Space');
const where = () => p.evaluate(`(() => { const d = window.__FEL_DEV__; if (!d) return null; const s = d.scene, cam = s.activeCamera, e = s.getEngine(); const W = e.getRenderWidth(), H = e.getRenderHeight(); const tf = s.getTransformMatrix().m;
  const proj = (v) => { const cx = tf[0]*v.x+tf[4]*v.y+tf[8]*v.z+tf[12], cy = tf[1]*v.x+tf[5]*v.y+tf[9]*v.z+tf[13], cw = tf[3]*v.x+tf[7]*v.y+tf[11]*v.z+tf[15]; return cw <= 0 ? 'behind' : [Math.round((cx/cw*0.5+0.5)*100), Math.round((1-(cy/cw*0.5+0.5))*100)]; };
  const hero = d.hero(); const hp = hero.getAbsolutePosition(); const pit = { x: 0, y: 1.4, z: 18 };
  return { cam: [cam.position.x, cam.position.y, cam.position.z].map((n) => +n.toFixed(2)), batterPct: proj({ x: hp.x, y: hp.y + 1.2, z: hp.z }), pitcherPct: proj(pit) }; })()`).catch(() => null);
for (const [i, ms] of [1500, 1200, 400, 300, 600, 2500, 2500].entries()) {
  await p.waitForTimeout(ms);
  if (i === 3) await p.keyboard.press('Space');   // swing into the pitch
  console.log(i, JSON.stringify(await where()));
  await p.screenshot({ path: `${OUT}/derby-${i}.png` });
}
console.log('FEL-FRAME lines:', frame.length, frame.slice(0, 3));
await b.close();
