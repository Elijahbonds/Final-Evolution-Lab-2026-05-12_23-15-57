// _dunk-eye — the DUNK CONTEST's flight from the side, frame by frame (DUNK-JOINTS pass, 2026-09-17).
// A fake pad runs the runway (RT held), plants, throws a trick (d-pad + button) and slams; a second camera on the hero's
// flank renders the frames (the mode's own camera keeps its job); a burst of crops every 90 ms from the takeoff.
//   BASE=http://127.0.0.1:3098 TRICK=none|windmill|eastbay|tomahawk|betweenlegs|scorpion|cradle|clutch|spin360 npx tsx scripts/probes/_dunk-eye.mts
// Frames: ~/Claude/outbox/finish-release/hoops/seq/dunk-<trick>-<i>.png; per frame: clip names playing, hero y, the ball's
// height, and the hand-to-ball gap (the joint truth the eye cannot read at 560 px).
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const TRICK = process.env.TRICK ?? 'none';
const SIDE = process.env.SIDE ?? '3.4,1.4,0.6';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/hoops/seq`;
fs.mkdirSync(OUT, { recursive: true });
// d-pad index + face button index on a standard pad (DunkSystem: dir + btn) — 12 up, 13 down, 14 left, 15 right; A 0, B 1, X 2, Y 3
const TRICKS: Record<string, { dpad: number; btn: number } | null> = {
  none: null, windmill: { dpad: 12, btn: 0 }, spin360: { dpad: 15, btn: 1 }, eastbay: { dpad: 13, btn: 3 }, tomahawk: { dpad: 12, btn: 3 },
  betweenlegs: { dpad: 13, btn: 1 }, scorpion: { dpad: 15, btn: 3 }, cradle: { dpad: 15, btn: 0 }, clutch: { dpad: 13, btn: 0 }, hideseek: { dpad: 14, btn: 0 }, lostfound: { dpad: 14, btn: 1 },
};
const trick = TRICKS[TRICK] ?? null;

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/DUNK-|HANDS|JUICE|MISSING|FEL-DUNK/i.test(t)) logs.push(t.slice(0, 180)); });
await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(700);
if (/\/login/.test(p.url())) {
  await p.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
  await p.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
  await Promise.all([p.waitForResponse((r) => /\/api\/auth\/(callback|signin)/.test(r.url()), { timeout: 60000 }).catch(() => null), p.press('input[type="password"]', 'Enter')]);
  await p.waitForTimeout(2000);
}
await p.goto(`${BASE}/play/dunk?arena=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForSelector('canvas', { timeout: 180000 });
await p.waitForFunction(() => /TAP TO START|FLIGHT NIGHT/i.test(document.body.innerText), { timeout: 180000 });
await p.waitForTimeout(900);
// the fake pad
await p.evaluate(() => {
  const pd: any = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  (window as any).__PAD = pd; (navigator as any).getGamepads = () => [pd];
  const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pd }); window.dispatchEvent(ev);
});
const start = p.getByRole('button', { name: /TAP TO START/i });
if (await start.count()) await start.click({ force: true }).catch(() => {});
await p.keyboard.press('Enter'); await p.mouse.click(500, 380); await p.waitForTimeout(400);
await p.waitForFunction(() => /READY|RUN|HOLD/i.test(document.body.innerText), { timeout: 60000 }).catch(() => null);
await p.waitForTimeout(3600);   // the 3-2-1
// the eye camera + the recorder (hero y, ball y, hand→ball gap, clips)
console.log('[EYE] cam', await p.evaluate(`(() => { const dev = window.__FEL_DEV__; const s = dev && dev.scene; const hn = dev && dev.hero ? dev.hero() : null; if (!s || !hn) return 'no scene/hero';
  const p = hn.position; const V = p.constructor; const prev = s.activeCamera; const C = prev.constructor; const off = [${SIDE}];
  const cam = new C('eye_cam', new V(p.x + off[0], p.y + off[1], p.z + off[2]), s); cam.minZ = 0.05; cam.fov = prev.fov;
  const obs = s.onBeforeRenderObservable.add(() => { const pp = hn.position; cam.position.set(pp.x + off[0], pp.y + off[1], pp.z + off[2]); cam.setTarget(new V(pp.x, pp.y + 1.1, pp.z)); });
  s.activeCamera = cam; window.__eyeCam = { cam, prev, obs };
  window.__read = () => { const ball = s.getMeshByName('ball'); let sk = null; const st = [hn]; while (st.length && !sk) { const n = st.pop(); if (n.skeleton) { sk = n.skeleton; break; } for (const c of (n.getChildren ? n.getChildren() : [])) st.push(c); }
    const hand = sk ? sk.bones.find((b) => b.name.indexOf('RightHand') === 0) : null; const hp = hand && hand.getTransformNode ? hand.getTransformNode().getAbsolutePosition() : null; const bp = ball ? ball.getAbsolutePosition() : null;
    const clips = (s.animationGroups || []).filter((g) => g.isPlaying).map((g) => g.name).filter((n) => !/idle_stand|run|walk/.test(n)).slice(0, 4);
    return { y: +p.y.toFixed(2), ball: bp ? +bp.y.toFixed(2) : null, gap: hp && bp ? +Math.hypot(hp.x - bp.x, hp.y - bp.y, hp.z - bp.z).toFixed(2) : null, clips }; };
  return 'on'; })()`));
// the run, scheduled in-page (a screenshot costs ~150 ms; the flight is ~1.4 s)
await p.evaluate(([dp, bt]) => {
  const pd: any = (window as any).__PAD;
  pd.axes[1] = -1; pd.buttons[7].pressed = true; pd.buttons[7].value = 1; pd.timestamp = Date.now();
  setTimeout(() => { pd.buttons[7].pressed = false; pd.buttons[7].value = 0; pd.timestamp = Date.now(); }, 1750);   // release: the plant
  if (dp >= 0) {
    setTimeout(() => { pd.buttons[dp].pressed = true; pd.buttons[dp].value = 1; pd.timestamp = Date.now(); }, 1980);
    setTimeout(() => { pd.buttons[bt].pressed = true; pd.buttons[bt].value = 1; pd.timestamp = Date.now(); }, 2020);
    setTimeout(() => { pd.buttons[bt].pressed = false; pd.buttons[bt].value = 0; pd.buttons[dp].pressed = false; pd.buttons[dp].value = 0; pd.timestamp = Date.now(); }, 2140);
  }
  setTimeout(() => { pd.buttons[0].pressed = true; pd.buttons[0].value = 1; pd.timestamp = Date.now(); }, 2320);    // the SLAM, held for the rim hang
  setTimeout(() => { pd.buttons[0].pressed = false; pd.buttons[0].value = 0; pd.timestamp = Date.now(); }, 2900);
}, [trick ? trick.dpad : -1, trick ? trick.btn : -1] as [number, number]);
// wait for the takeoff, then burst
const t0 = Date.now(); let up = false;
while (Date.now() - t0 < 6000) { const r = await p.evaluate('window.__read()') as { y: number }; if (r && r.y > 0.08) { up = true; break; } await p.waitForTimeout(30); }
if (!up) console.log('[EYE] never left the floor');
for (let i = 0; i < 14; i++) {
  const r = await p.evaluate('window.__read()');
  await p.screenshot({ path: `${OUT}/dunk-${TRICK}-${i}.png`, clip: { x: 360, y: 60, width: 560, height: 660 } });
  console.log(`[EYE] #${i} ${JSON.stringify(r)}`);
  await p.waitForTimeout(90);
}
await p.evaluate(() => { const pd: any = (window as any).__PAD; pd.axes[1] = 0; pd.timestamp = Date.now(); });
console.log(logs.filter((l) => /SLAM|HANDS|DUNK-TRICK|MISSING|CONTACT/.test(l)).slice(-8).join('\n'));
await browser.close();
