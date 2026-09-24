// DUNK MOTION phase 12 — THE SHOW. One made dunk with a trick on a fake pad, SLAM on the beat, the d-pad thrown for a celebration
// after the make (CELEB=down|up|left|right, default down = Ruffin's Spider-Man splits); frames from the take-off through the triple
// cut, the poster and the celebration to the outbox; the show's own log ([DUNK-CALL] [DUNK-SHOW] [DUNK-CELEB] [JUICE-LOOK]) and what
// the HUD carried (cut / call / poster).
//
//   BASE=http://127.0.0.1:3011 TAG=p12a TRICK=windmill node node_modules/tsx/dist/cli.mjs scripts/probes/_dunk-show-probe.mts
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
  for (const k of ['info', 'log', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { const s = String(a[0]); if (/^\\[(DUNK-[A-Z-]+|HANDS|JUDGE-WHY|JUICE-LOOK)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 200) }); o(...a); }; }
  const hud = () => { try { return JSON.parse(document.querySelector('pre').textContent || '{}'); } catch (e) { return {}; } };
  window.__hud = hud; let last = '';
  setInterval(() => { const h = hud(); const s = [h.banner, h.cut && ('CUT ' + h.cut), h.call && ('CALL ' + h.call), h.poster && ('POSTER ' + (h.poster.title || '')), 'P' + h.score].filter(Boolean).join(' | '); if (s !== last) { last = s; S.hud.push({ t: performance.now(), s }); } }, 60);
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

const AIR: Record<string, [number, number]> = { windmill: [12, 0], spin360: [15, 1], spin720: [15, 1], eastbay: [13, 3], scorpion: [15, 3], tomahawk: [12, 3] };   // d-pad index, face button index (spin720: the 360 pressed twice)
const DPAD: Record<string, number> = { up: 12, down: 13, left: 14, right: 15 };
const TRICK = process.env.TRICK ?? 'windmill', CELEB = process.env.CELEB ?? 'down';
const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(PAD_INIT);
const p = await ctx.newPage();
const errors: string[] = [];
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon|gamepad/.test(t)) errors.push(t.slice(0, 200)); });
p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForSelector('canvas', { timeout: 120000 });
await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 180000 });
await p.evaluate(WATCH);
await padSet(p, 'p.buttons[0].pressed = true; p.buttons[0].value = 1'); await p.waitForTimeout(70); await padSet(p, 'p.buttons[0].pressed = false; p.buttons[0].value = 0');
await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
await p.waitForTimeout(2500);
{ const t0 = Date.now(); while (Date.now() - t0 < 30000 && !/HOLD to run/.test(await text(p))) await p.waitForTimeout(150); }
await p.waitForTimeout(400);
await padSet(p, 'p.axes[1] = -1; p.buttons[7].pressed = true; p.buttons[7].value = 1');
{ const l0 = Date.now(); while (Date.now() - l0 < 6000) { if (await p.evaluate(`window.__rv.marks.some((m) => /DUNK-LAUNCH|JUICE-SOFT\\] launch/.test(m.msg))`)) break; await p.waitForTimeout(30); } }
await padSet(p, 'p.axes[1] = 0; p.buttons[7].pressed = false; p.buttons[7].value = 0');
const air = AIR[TRICK];
if (air) { await padSet(p, `p.buttons[${air[0]}].pressed = true; p.buttons[${air[0]}].value = 1`); await p.waitForTimeout(80); await padSet(p, `p.buttons[${air[1]}].pressed = true; p.buttons[${air[1]}].value = 1`); await p.waitForTimeout(60); if (TRICK === 'spin720') { await padSet(p, `p.buttons[${air[1]}].pressed = false; p.buttons[${air[1]}].value = 0`); await p.waitForTimeout(100); await padSet(p, `p.buttons[${air[1]}].pressed = true; p.buttons[${air[1]}].value = 1`); await p.waitForTimeout(60); }
  await padSet(p, `p.buttons[${air[1]}].pressed = false; p.buttons[${air[1]}].value = 0; p.buttons[${air[0]}].pressed = false; p.buttons[${air[0]}].value = 0`); }
await p.evaluate('window.__armSlam()');
// frames: every 180 ms for 9 s; the celebration thrown on the d-pad once the ball is through
const shots: Buffer[] = []; let thrown = false; const s0 = Date.now();
while (Date.now() - s0 < Number(process.env.SHOW_MS ?? 9000)) {
  if (!thrown && (await p.evaluate(`window.__rv.marks.some((m) => /through the net|feet down, live/.test(m.msg))`))) {
    thrown = true; const d = DPAD[CELEB]; await padSet(p, `p.buttons[${d}].pressed = true; p.buttons[${d}].value = 1`); await p.waitForTimeout(80); await padSet(p, `p.buttons[${d}].pressed = false; p.buttons[${d}].value = 0`);
  }
  const png = await p.screenshot({ type: 'png' });
  shots.push(await sharp(png).resize(320, 200).png().toBuffer());
  // SNAP=1: full-size frames of the poster freeze and the celebration (after the cut)
  if (process.env.SNAP === '1') {
    const hudNow = await p.evaluate('JSON.stringify(window.__hud())') as string;
    const cutEnd = await p.evaluate(`(window.__rv.marks.find((m) => /triple cut end/.test(m.msg)) || {}).t || 0`) as number;
    const since = cutEnd ? (await p.evaluate('performance.now()') as number) - cutEnd : -1;
    if (/THE POSTER/.test(hudNow) && !fs.existsSync(`${OUT}/snap-poster.png`)) fs.writeFileSync(`${OUT}/snap-poster.png`, png);
    for (const [k, at] of [['a', 400], ['b', 1100], ['c', 1900]] as const) if (since >= at && !fs.existsSync(`${OUT}/snap-celeb-${k}.png`)) fs.writeFileSync(`${OUT}/snap-celeb-${k}.png`, png);
  }
  await p.waitForTimeout(180);
}
const rv = await p.evaluate('window.__rv') as { marks: { t: number; msg: string }[]; hud: { t: number; s: string }[]; samples: { t: number; y: number; clips: string[] }[] };
{ const c0 = rv.marks.find((m) => /DUNK-CELEB\] (spiderman|itsover|roar|toosmall|armsup) \(/.test(m.msg))?.t ?? 0;
  const seq: string[] = []; let last = ''; for (const sm of rv.samples.filter((x) => x.t >= c0 - 200)) { const c = sm.clips.join('+'); if (last !== c) { seq.push(`${Math.round(sm.t - c0)}ms ${c}`); last = c; } }
  for (const m of rv.marks.filter((m) => m.t >= c0 - 300 && m.t <= c0 + 3000)) console.log(`   ${Math.round(m.t - c0)}ms ${m.msg.slice(0, 110)}`);
  console.log('── hero clips from the celebration:', seq.slice(0, 12).join(' → ')); }
console.log('── the show'); for (const m of rv.marks.filter((m) => /DUNK-CALL|DUNK-SHOW|DUNK-CELEB|JUICE-LOOK\] (the glass|punch)|triple cut|feet down|off the iron|DUNK-SLAM/.test(m.msg))) console.log('  ', m.msg);
console.log('── hud'); for (const h of rv.hud.filter((h) => /CUT|CALL|POSTER/.test(h.s)).slice(0, 20)) console.log('  ', h.s.slice(0, 180));
console.log('── errors', errors.length ? errors.slice(0, 5) : 'none');
fs.writeFileSync(`${OUT}/show.json`, JSON.stringify({ marks: rv.marks, hud: rv.hud, samples: rv.samples, errors }, null, 1));
const cols = 8, rows = Math.ceil(shots.length / cols);
await sharp({ create: { width: cols * 320, height: rows * 200, channels: 3, background: '#111' } }).composite(shots.map((input, i) => ({ input, left: (i % cols) * 320, top: Math.floor(i / cols) * 200 }))).png().toFile(`${OUT}/show-sheet.png`);
console.log(`sheet → ${OUT}/show-sheet.png (${shots.length})`);
await b.close();
