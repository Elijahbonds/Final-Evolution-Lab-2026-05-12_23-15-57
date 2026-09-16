// _hoops-lab — one competent player, N possessions, and everything the mode says about each one.
//
// THE 10-PHASE PASS ON 1v1 AND 3v3 (owner, 2026-09-16) needs an instrument before it needs an opinion, exactly as the
// dunk pass did. The scorecard capture plays a verb a second and tells you whether presses were answered; it cannot
// tell you whether the shot you released on the green went in, what the defender did about it, or whether a game ever
// reaches eleven. This drives the mode the way somebody who knows it drives it — carry, attack, gather, release — and
// records, per possession:
//
//   the shot        (meter value at release, shot type, made/missed, points)
//   the defender    ([1V1-DEF] / [1V1-CONTACT]: contest, block, strip, the hand up)
//   the ball        ([1V1-BOARD] / [1V1-RIM]: the rebound, the putback, the loose ball)
//   the whistle     ([1V1-REF]: fouls, violations)
//   the score       (both ends, and whether the game ends)
//
// WHAT THE FIRST RUNS ESTABLISHED, before this could measure a single shot:
//
//   1v1 PLAYS MAKE-IT-TAKE-IT, AND IT IS MERCILESS. An idle player never touches the ball: the AI scores, keeps it
//   (`MAKE IT, TAKE IT — DEFEND!`), scores again. Twelve unanswered points in about thirty seconds against a player
//   who does nothing. That is correct behaviour and worth knowing on its own — there is no mercy rule, no reset, and
//   nothing that hands the ball over.
//
//   THE MODE'S PROBE SEAM IS DEV-ONLY. `scene.metadata.onevone` — `defend()`, `offense()`, the possession machine —
//   is built inside `if (process.env.NODE_ENV === 'development')`, so it does not exist in the production build a
//   `next start` serves. A probe cannot take a possession here; it has to EARN one by playing defence, which is the
//   honest instrument anyway and is what the next phase of this needs.
//
//   BASE=http://127.0.0.1:3096 MODE=onevone POSSESSIONS=6 RELEASE=green npx tsx scripts/probes/_hoops-lab.mts
//   RELEASE=green|early|late  — where in the meter the shot goes up (the A/B rig for shot timing)
//   MODE=onevone|threevthree
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const MODE = process.env.MODE ?? 'onevone';
const POSSESSIONS = Number(process.env.POSSESSIONS ?? 6);
const RELEASE = (process.env.RELEASE ?? 'green') as 'green' | 'early' | 'late';
const TAG = process.env.TAG ?? `hoops-${MODE}`;
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/hoops`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const page = await ctx.newPage();
await page.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const log: string[] = [];
page.on('console', (m) => { const t = m.text(); if (/\[1V1|\[3V3|\[HOOPS|\[REF|\[BOARD/.test(t)) log.push(`${Date.now()} ${t.slice(0, 190)}`); });

{ // login
  const lp = await ctx.newPage();
  await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (/\/login/.test(lp.url())) {
    await lp.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
    await lp.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
    await lp.click('button[type="submit"]');
    const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(lp.url())) await lp.waitForTimeout(300);
  }
  await lp.close();
}
await page.goto(`${BASE}/play/${MODE}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
{ const t = Date.now(); while (Date.now() - t < 180000) { const s = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded' || s === 'playing') break; await page.waitForTimeout(400); } }

// THE PAD, AND THE RELEASE ARMED IN THE PAGE. A shot meter is a number that moves every frame; polling it from node
// costs 30–50 ms a round trip, which is most of a green window. The release is decided in the page, on the frame it
// means to be, and records the meter value it actually let go on — the same lesson the dunk lab learned about SLAM.
await page.evaluate(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.dispatchEvent(new Event('gamepadconnected'));
  window.__hudNow = () => { const q = window.__FEL_QA__; return q && q.rawHud ? q.rawHud() : {}; };

  window.__HUD = []; let last = '';
  setInterval(() => {
    const h = window.__hudNow();
    const s = JSON.stringify([h.score, h.foeScore, h.banner, h.shotType, h.hint]);
    if (s !== last) { last = s; window.__HUD.push({ t: Date.now(), score: h.score, foeScore: h.foeScore, banner: h.banner, shotType: h.shotType, hint: h.hint }); }
  }, 50);

  // the shot: hold the trigger to gather, let go at the target point of the meter
  window.__shotAt = null;
  window.__armRelease = (where) => {
    window.__shotAt = null;
    const t0 = performance.now();
    const trig = () => window.__PAD.buttons[7];
    const setTrig = (v) => { const b = trig(); b.pressed = v > 0.5; b.value = v; window.__PAD.timestamp = Date.now(); };
    setTrig(1);
    const want = where === 'green' ? 0.82 : where === 'early' ? 0.45 : 0.98;
    const tick = () => {
      if (performance.now() - t0 > 3500) { setTrig(0); return; }
      const h = window.__hudNow();
      const m = typeof h.shotMeterT === 'number' ? h.shotMeterT : 0;
      if (m >= want) { window.__shotAt = { meter: +m.toFixed(3), type: h.shotType || '' }; setTrig(0); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
})()`);
const startBtn = page.locator('text=/^(TAP TO START|START|PLAY)$/').first();
if (await startBtn.count()) await startBtn.first().click().catch(() => {});
await page.waitForTimeout(2500);

const stick = async (x: number, y: number) => page.evaluate(`(() => { const p = window.__PAD; p.axes[0] = ${x}; p.axes[1] = ${y}; p.timestamp = Date.now(); })()`);
const press = async (i: number, ms = 70) => {
  await page.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = true; b.value = 1; window.__PAD.timestamp = Date.now(); })()`);
  await page.waitForTimeout(ms);
  await page.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = false; b.value = 0; window.__PAD.timestamp = Date.now(); })()`);
};

interface Poss { n: number; meter?: number; shotType?: string; made?: boolean; scored?: number; score?: number; foeScore?: number; banners: string[]; beats: string[]; note?: string }
const rows: Poss[] = [];
let logMark = 0;

for (let n = 0; n < POSSESSIONS; n++) {
  const mark = Date.now();
  const p: Poss = { n: n + 1, banners: [], beats: [] };

  // TAKE THE POSSESSION THROUGH THE MODE'S OWN SEAM. The first two runs of this drove and pulled the trigger while on
  // DEFENCE, measured nothing, and reported it as four missed shots — with the AI scoring twelve unanswered behind it.
  // That is not a bug in the mode: 1v1 plays make-it-take-it (`MAKE IT, TAKE IT — DEFEND!`), so an idle player
  // concedes for ever and never touches the ball, which is correct and is worth knowing on its own. The mode already
  // exposes `scene.metadata.onevone.defend()` / `.offense()` for exactly this — "so a probe can reach either
  // possession deterministically".
  const beforeScore = await page.evaluate('(window.__hudNow().score ?? 0)') as number;
  const onOffense = await page.evaluate(`(() => {
    const q = window.__FEL_QA__; const scene = q && q.scene ? q.scene() : null;
    const seam = scene && scene.metadata && (scene.metadata.onevone || scene.metadata.threevthree);
    if (!seam || !seam.offense) return false;
    seam.offense();
    return true;
  })()`) as boolean;
  if (!onOffense) p.note = 'no probe seam in a production build (it is dev-gated) — could not take a possession';
  await page.waitForTimeout(700);

  // CARRY IT AT THE RIM. Up-court is −y on the stick; a couple of seconds of drive puts a shot inside the arc.
  await stick(0, -1);
  await page.waitForTimeout(1600);
  await stick(0, 0);

  await page.evaluate(`window.__armRelease(${JSON.stringify(RELEASE)})`);
  { const t = Date.now(); while (Date.now() - t < 4000) { if (await page.evaluate('window.__shotAt !== null')) break; await page.waitForTimeout(40); } }
  const shot = await page.evaluate('window.__shotAt') as { meter: number; type: string } | null;
  if (shot) { p.meter = shot.meter; p.shotType = shot.type; }
  else p.note = p.note ?? 'the meter never reached the release point';

  await page.waitForTimeout(3200);   // the arc, the board, the whistle

  const hud = await page.evaluate('window.__HUD') as { t: number; score?: number; foeScore?: number; banner?: string }[];
  const mine = hud.filter((r) => r.t >= mark);
  p.banners = [...new Set(mine.map((r) => r.banner).filter((b): b is string => !!b))];
  p.score = mine.map((r) => r.score).filter((s): s is number => typeof s === 'number').pop();
  p.foeScore = mine.map((r) => r.foeScore).filter((s): s is number => typeof s === 'number').pop();
  const fresh = log.slice(logMark); logMark = log.length;
  p.beats = fresh.map((l) => l.replace(/^\d+ /, '')).slice(0, 12);
  // MADE means MY score went up. The first run of this matched the banner "THEY SCORE — LEFT WIDE OPEN" and reported
  // the opponent's buckets as the player's.
  const afterScore = await page.evaluate('(window.__hudNow().score ?? 0)') as number;
  p.made = afterScore > beforeScore;
  p.scored = afterScore - beforeScore;
  rows.push(p);
  console.log(`#${p.n} meter ${String(p.meter ?? '—').padEnd(6)} ${String(p.shotType ?? '').padEnd(10)} ${p.made ? 'MADE ' : 'miss '} ${p.score ?? '?'}-${p.foeScore ?? '?'}  ${p.banners.slice(0, 2).join(' / ')}`);
  if (n < 2) await page.screenshot({ path: `${OUT}/${TAG}-poss${p.n}.png` });
}

const made = rows.filter((r) => r.made).length;
const out = { tag: TAG, mode: MODE, release: RELEASE, possessions: rows.length, made, rows, log: log.slice(-160) };
fs.writeFileSync(`${OUT}/hoops-lab-${TAG}.json`, JSON.stringify(out, null, 1));
console.log(`\n${rows.length} possessions · ${made} made · release=${RELEASE} · ${OUT}/hoops-lab-${TAG}.json`);
await browser.close();
