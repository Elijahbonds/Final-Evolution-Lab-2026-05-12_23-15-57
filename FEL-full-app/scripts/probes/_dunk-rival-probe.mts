// DUNK MOTION phase 11 — the rival plays (owner: "fix the rivals dunk, it needs to look like one of the users attempts or like
// another person was playing"). Plays the player's dunks of round 1 on a fake pad, then WATCHES the rival's turn: his plan
// ([DUNK-RIVAL]), the clips his body runs, how high his root flies, what the banners say, the score moving, and that the runway
// comes back to the player for round 2. Frames of his attempts go to the outbox as a contact sheet.
//
//   BASE=http://127.0.0.1:3011 TAG=p11a node node_modules/tsx/dist/cli.mjs scripts/probes/_dunk-rival-probe.mts
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import sharp from 'sharp';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3011';
const TAG = process.env.TAG ?? 'rival';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/dunkmotion/${TAG}`;
fs.mkdirSync(OUT, { recursive: true });

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.__name = window.__name || function (f) { return f; };
})()`;
const WATCH = `(() => {
  const S = window.__rv = { marks: [], hud: [], samples: [] };
  for (const k of ['info', 'log', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { const s = String(a[0]); if (/^\\[(DUNK-[A-Z-]+|HANDS|JUDGE-WHY)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 200) }); o(...a); }; }
  const hud = () => { try { return JSON.parse(document.querySelector('pre').textContent || '{}'); } catch (e) { return {}; } };
  window.__hud = hud; let last = '';
  setInterval(() => { const h = hud(); const s = [h.banner, h.hint, 'P' + h.score + ' R' + h.rivalScore, h.round, h.dunkNum].filter(Boolean).join(' | '); if (s !== last) { last = s; S.hud.push({ t: performance.now(), s }); } }, 60);
  const dev = window.__FEL_DEV__;
  setInterval(() => {
    const hero = dev.hero && dev.hero(); if (!hero) return;
    const anims = dev.scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations.some((ta) => ta.target && ta.target.isDescendantOf && ta.target.isDescendantOf(hero))).map((g) => g.name.replace(/_c\\d+$/, ''));
    S.samples.push({ t: performance.now(), y: +hero.position.y.toFixed(3), z: +hero.position.z.toFixed(2), name: hero.name, clips: anims.slice(0, 3) });
  }, 50);
  window.__armSlam = () => { const t0 = performance.now(); const tick = () => { if (performance.now() - t0 > 4000) return; if (hud().hint !== 'NOW!') { requestAnimationFrame(tick); return; } const b = window.__PAD.buttons[0]; b.pressed = true; b.value = 1; window.__PAD.timestamp = performance.now(); setTimeout(() => { b.pressed = false; b.value = 0; window.__PAD.timestamp = performance.now(); }, 60); }; requestAnimationFrame(tick); };
})()`;

async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
const text = async (p: Page): Promise<string> => p.evaluate('document.body.innerText') as Promise<string>;

async function playerDunk(p: Page): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 30000 && !/HOLD to run|FINAL ROUND/.test(await text(p))) await p.waitForTimeout(150);
  await p.waitForTimeout(400);
  await padSet(p, 'p.axes[1] = -1; p.buttons[7].pressed = true; p.buttons[7].value = 1');
  const l0 = Date.now();
  while (Date.now() - l0 < 5000) { const m = await p.evaluate(`window.__rv.marks.some((m) => m.t > performance.now() - 4000 && /DUNK-LAUNCH|JUICE-SOFT\\] launch/.test(m.msg))`); if (m) break; await p.waitForTimeout(40); }
  await padSet(p, 'p.axes[1] = 0; p.buttons[7].pressed = false; p.buttons[7].value = 0');
  await p.evaluate('window.__armSlam()');
  await p.waitForTimeout(3000);
}

const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(PAD_INIT);
const p = await ctx.newPage();
const errors: string[] = [];
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon|gamepad/.test(t)) errors.push(t.slice(0, 200)); });
p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForSelector('canvas', { timeout: 120000 });
await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
await p.evaluate(WATCH);
await padSet(p, 'p.buttons[0].pressed = true; p.buttons[0].value = 1'); await p.waitForTimeout(70); await padSet(p, 'p.buttons[0].pressed = false; p.buttons[0].value = 0');
await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
await p.waitForTimeout(2500);

const ROUNDS = Number(process.env.ROUNDS ?? 1);
const shots: Buffer[] = [];
for (let r = 1; r <= ROUNDS; r++) {
  for (let i = 0; i < 2; i++) { await playerDunk(p); console.log(`round ${r}: player dunk ${i + 1} thrown`); }
  // the rival's turn: screenshots until the runway comes back (the next round) or the night ends, 150 s at most
  const r0 = Date.now();
  while (Date.now() - r0 < 150000) {
    const t = await text(p);
    if (r < 2 && /ROUND 2/.test(t) && /HOLD to run|FINAL ROUND/.test(t) && Date.now() - r0 > 5000) break;
    if (/CONTEST_WON|CONTEST_LOST|GO AGAIN|NIGHT \d+ ·|YOU WIN|YOU LOSE/i.test(t) && Date.now() - r0 > 5000) { console.log('night over'); break; }
    if (Date.now() - r0 > 2500 && shots.length < 64) { const png = await p.screenshot({ type: 'png' }); shots.push(await sharp(png).resize(320, 200).png().toBuffer()); }
    await p.waitForTimeout(600);
  }
}
const rv = await p.evaluate('window.__rv') as { marks: { t: number; msg: string }[]; hud: { t: number; s: string }[]; samples: { t: number; y: number; z: number; name: string; clips: string[] }[] };
const rivalMarks = rv.marks.filter((m) => /DUNK-RIVAL|IS UP|air |spin|DUNK-TRICK|DUNK-SLAM|JUDGE-WHY|launch/.test(m.msg));
console.log('\n── marks'); for (const m of rivalMarks.slice(-40)) console.log('  ', m.msg);
console.log('\n── hud'); for (const h of rv.hud.slice(-30)) console.log('  ', h.s);
const heroes = [...new Set(rv.samples.map((s) => s.name))];
console.log('\n── heroes seen', heroes.join(', '));
const clipSeq: string[] = []; for (const s of rv.samples) { const c = s.clips[0]; if (c && clipSeq[clipSeq.length - 1] !== c) clipSeq.push(c); }
console.log('── clip sequence (hero):', clipSeq.slice(-60).join(' → '));
const maxY = Math.max(...rv.samples.map((s) => s.y)); console.log('── hero max root y', maxY.toFixed(2));
console.log('── errors', errors.length ? errors.slice(0, 5) : 'none');
fs.writeFileSync(`${OUT}/rival.json`, JSON.stringify({ marks: rv.marks, hud: rv.hud, samples: rv.samples, errors }, null, 1));
if (shots.length) {
  const cols = 8, rows = Math.ceil(shots.length / cols);
  const sheet = sharp({ create: { width: cols * 320, height: rows * 200, channels: 3, background: '#111' } }).composite(shots.map((input, i) => ({ input, left: (i % cols) * 320, top: Math.floor(i / cols) * 200 })));
  await sheet.png().toFile(`${OUT}/rival-sheet.png`);
  console.log(`sheet → ${OUT}/rival-sheet.png (${shots.length} frames)`);
}
await b.close();
