// _smooth-eye — the hoops lab's SMOOTH recorder for the modes the lab cannot drive: the DUNK CONTEST (fake pad) and the
// 3PT shootout (Space). Every rendered frame: hero root / hands / head, the rival (dunk) or nothing, the camera, the
// ball, the clips playing PER BODY; then the same counts the lab prints — pops, teleports, camera cuts, per-body clip
// flips, ball pops — with the worst contexts named.
//   BASE=http://127.0.0.1:3098 MODE=dunk|threepoint SECS=30 npx tsx scripts/probes/_smooth-eye.mts
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
import { analyseBallPath, printVerdicts, type Outcome } from './_ballpath.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const MODE = process.env.MODE ?? 'dunk';
const SECS = Number(process.env.SECS ?? 30);
const TAG = process.env.TAG ?? `smooth-${MODE}`;
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/hoops`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const logs: string[] = []; const outcomes: Outcome[] = []; let recT0 = 0;
p.on('console', (m) => { const t = m.text(); if (/MISSING|DUNK-|3PT|FEL-READY/.test(t)) logs.push(t.slice(0, 160));
  const now = Date.now() - recT0; if (recT0 && /-RIM\] /.test(t)) outcomes.push({ t: now, kind: 'miss', label: t.replace(/^.*-RIM\] /, '').slice(0, 26) });
  if (recT0 && /-NET\] /.test(t)) outcomes.push({ t: now, kind: 'make', label: t.replace(/^.*-NET\] /, '').slice(0, 26) }); });
await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(700);
if (/\/login/.test(p.url())) {
  await p.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
  await p.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
  await Promise.all([p.waitForResponse((r) => /\/api\/auth\/(callback|signin)/.test(r.url()), { timeout: 60000 }).catch(() => null), p.press('input[type="password"]', 'Enter')]);
  await p.waitForTimeout(2000);
}
await p.goto(`${BASE}/play/${MODE}${MODE === 'dunk' ? '?arena=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForSelector('canvas', { timeout: 180000 });
if (MODE === 'dunk') {
  await p.waitForFunction(() => /TAP TO START|FLIGHT NIGHT/i.test(document.body.innerText), { timeout: 180000 });
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    const pd: any = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__PAD = pd; (navigator as any).getGamepads = () => [pd];
    const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pd }); window.dispatchEvent(ev);
  });
  const start = p.getByRole('button', { name: /TAP TO START/i });
  if (await start.count()) await start.click({ force: true }).catch(() => {});
  await p.keyboard.press('Enter'); await p.mouse.click(500, 380); await p.waitForTimeout(400);
} else {
  const t0 = Date.now(); while (Date.now() - t0 < 300000) { const st = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => '') as string; if (st === 'loaded' || st === 'playing') break; await p.waitForTimeout(300); }
  await p.mouse.click(640, 400); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
}
// the recorder (the lab's, with the rival found through the dev seams the two modes offer)
recT0 = Date.now();
console.log('[SMOOTH] rec', await p.evaluate(`(() => { const dev = window.__FEL_DEV__; const q = window.__FEL_QA__; const s = (dev && dev.scene) || (q && q.scene && q.scene()); const heroNode = (dev && dev.hero && dev.hero()) || (q && q.hero && q.hero()); if (!s || !heroNode) return 'no scene/hero';
  const skOf = (n) => { const st = [n]; while (st.length) { const x = st.pop(); if (x.skeleton) return x.skeleton; for (const c of (x.getChildren ? x.getChildren() : [])) st.push(c); } return null; };
  const bone = (sk, name) => { const b = sk ? sk.bones.find((b) => b.name.indexOf(name) === 0) : null; return b && b.getTransformNode ? b.getTransformNode() : null; };
  const rig = (root) => { const sk = skOf(root); return { root, sk, rh: bone(sk, 'RightHand'), lh: bone(sk, 'LeftHand'), head: bone(sk, 'Head') }; };
  const P = (n) => { if (!n) return null; const pp = n.getAbsolutePosition ? n.getAbsolutePosition() : n.position; return [+pp.x.toFixed(3), +pp.y.toFixed(3), +pp.z.toFixed(3)]; };
  const clipsOf = (r) => (s.animationGroups || []).filter((g) => g.isPlaying && g.targetedAnimations && g.targetedAnimations.some((ta) => r.sk && r.sk.bones.some((b) => b.getTransformNode && b.getTransformNode() === ta.target))).map((g) => g.name);
  const hero = rig(heroNode);
  const rows = []; window.__smooth = rows; const t0 = performance.now();
  s.onAfterRenderObservable.add(() => { const ball = s.getMeshByName('ball') || s.getMeshByName('tp_ball'); const cam = s.activeCamera; const ballOn = ball && ball.isEnabled();
    rows.push({ t: Math.round(performance.now() - t0), h: [P(hero.root), P(hero.rh), P(hero.lh), P(hero.head)], f: null, cam: P(cam), ball: ballOn ? P(ball) : null, hc: clipsOf(hero), fc: [] }); });
  return 'recording'; })()`));
// drive it
const t0 = Date.now();
if (MODE === 'dunk') {
  await p.waitForTimeout(3600);
  for (let attempt = 0; attempt < 3 && Date.now() - t0 < SECS * 1000; attempt++) {
    await p.evaluate(() => { const pd: any = (window as any).__PAD;
      pd.axes[1] = -1; pd.buttons[7].pressed = true; pd.buttons[7].value = 1; pd.timestamp = Date.now();
      setTimeout(() => { pd.buttons[7].pressed = false; pd.buttons[7].value = 0; pd.timestamp = Date.now(); }, 1750);
      setTimeout(() => { pd.buttons[0].pressed = true; pd.buttons[0].value = 1; pd.timestamp = Date.now(); }, 2320);
      setTimeout(() => { pd.buttons[0].pressed = false; pd.buttons[0].value = 0; pd.axes[1] = 0; pd.timestamp = Date.now(); }, 2900); });
    await p.waitForTimeout(9000);   // the flight, the judges, the rival's turn
  }
} else {
  while (Date.now() - t0 < SECS * 1000) { await p.keyboard.down('Space'); await p.waitForTimeout(90); await p.keyboard.up('Space'); await p.waitForTimeout(1500); }
}
const rows = await p.evaluate('window.__smooth || []') as { t: number; h: (number[] | null)[]; f: (number[] | null)[] | null; cam: number[] | null; ball: number[] | null; hc: string[]; fc: string[] }[];
const dist = (a: number[] | null, b: number[] | null) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0);
const pops: { t: number; part: string; d: number; clips: string[]; prev: string[] }[] = []; let maxD = 0, teleports = 0, ySnaps = 0;
for (let i = 1; i < rows.length; i++) {
  const a = rows[i - 1].h, b = rows[i].h; const dt = Math.max(1, rows[i].t - rows[i - 1].t) / 1000; if (dt > 0.1) continue;
  const dRoot = dist(a[0], b[0]); if (dRoot / dt > 14) teleports++;
  if (a[0] && b[0] && Math.abs(a[0][1] - b[0][1]) > 0.3) ySnaps++;
  for (const [k, part] of [[1, 'rh'], [2, 'lh'], [3, 'head']] as const) { const rel = Math.abs(dist(a[k], b[k]) - dRoot); if (rel > maxD) maxD = rel; if (rel > 0.22) pops.push({ t: rows[i].t, part, d: +rel.toFixed(2), clips: rows[i].hc.filter((c) => !/idle_stand|^run$|^walk$/.test(c)), prev: rows[i - 1].hc.filter((c) => !/idle_stand|^run$|^walk$/.test(c)) }); }
}
let camCuts = 0, camMax = 0; const camCutAt: { t: number; d: number }[] = [];
for (let i = 1; i < rows.length; i++) { const d = dist(rows[i - 1].cam, rows[i].cam); const dt = Math.max(1, rows[i].t - rows[i - 1].t) / 1000; if (dt > 0.1) continue; if (d > camMax) camMax = d; if (d > 0.6) { camCuts++; if (camCutAt.length < 8) camCutAt.push({ t: rows[i].t, d: +d.toFixed(2) }); } }
let flips = 0; const flipAt: string[] = [];
const key = (r: typeof rows[number]) => (r.hc || []).filter((c) => !/idle_stand|^run$|^walk$/.test(c)).sort().join('+');
for (let i = 4; i < rows.length; i++) { const a = key(rows[i - 4]), b = key(rows[i - 2]), c = key(rows[i]); if (a && b && a !== b && c === a) { flips++; if (flipAt.length < 6) flipAt.push(`${rows[i].t}ms ${a} ↔ ${b}`); } }
const ballPopAt: { t: number; d: number; y: number; clips: string[] }[] = [];
for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i]; if (a.ball && b.ball && b.t - a.t < 100 && dist(a.ball, b.ball) > 0.9) ballPopAt.push({ t: b.t, d: +dist(a.ball, b.ball).toFixed(2), y: b.ball[1], clips: b.hc.slice(0, 3) }); }
const summary = { frames: rows.length, pops: pops.length, maxHandJump: +maxD.toFixed(2), teleports, ySnaps, camCuts, camMax: +camMax.toFixed(2), camCutAt, clipFlips: flips, flipAt, ballPops: ballPopAt.length, ballPopAt: ballPopAt.slice(0, 8), worst: pops.sort((x, y) => y.d - x.d).slice(0, 8) };
fs.writeFileSync(`${OUT}/smooth-${TAG}.json`, JSON.stringify({ summary, rows }));
console.log(`SMOOTH ${TAG}: hero pops ${summary.pops} (max ${summary.maxHandJump} m) teleports ${teleports} ySnaps ${ySnaps} · cam cuts ${camCuts} (max ${camMax.toFixed(2)} m/frame) · clip flips ${flips} · ball pops ${ballPopAt.length} · ${rows.length} frames`);
for (const w of summary.worst) console.log(`  pop ${w.part} ${w.d} m @${w.t}ms  ${w.prev.join('+') || '-'} → ${w.clips.join('+') || '-'}`);
for (const c of camCutAt) console.log(`  cam cut ${c.d} m @${c.t}ms`);
for (const f of flipAt) console.log(`  clip flip ${f}`);
for (const b of ballPopAt.slice(0, 8)) console.log(`  ball pop ${b.d} m @${b.t}ms y ${b.y} ${b.clips.join('+')}`);
console.log(logs.filter((l) => /MISSING/.test(l)).slice(0, 4).join('\n'));
printVerdicts(TAG, analyseBallPath(rows, outcomes));
await browser.close();
