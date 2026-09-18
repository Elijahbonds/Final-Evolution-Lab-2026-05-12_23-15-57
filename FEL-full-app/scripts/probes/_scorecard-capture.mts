// _scorecard-capture — one measured session per game for the 10-point scorecard (docs/SCORECARD.md).
//
// Per shipping route, on a production build, logged in, desktop viewport, fake pad:
//   · starts the game and plays it for SEC seconds with the DELIBERATE driver (every live modeVerbs verb in turn, ~1 a second,
//     holds held, moving forward with a slow weave), sampling at 10 Hz:
//       - the hero body through __FEL_DEV__.anim() (production-safe): no clip playing, T-arms, an arms verdict failing its
//         window, the top clip (for jitter)
//       - in-page rAF fps
//   · reads window.__FEL_QA__ at the end: press → first-answer latency, answered share, the answer KINDS (juice / sfx /
//     impact vs HUD / clip), juice beats per minute, unexplained scores
//   · three frames for the frame review (opening, mid, late), console / page errors, [FEL-FRAME] lines, load time.
//
//   BASE=http://127.0.0.1:3096 MODES=all SEC=40 TAG=rc9 npx tsx scripts/probes/_scorecard-capture.mts
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
import type { ModeVerbConfig } from '../../lib/babylon/ui/modeVerbs';
const MV: any = await import('../../lib/babylon/ui/modeVerbs');
const { MODE_VERBS, BOOST_MODES } = (MV.MODE_VERBS ? MV : MV.default) as { MODE_VERBS: Record<string, ModeVerbConfig>; BOOST_MODES: ReadonlySet<string> };

const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const SEC = Number(process.env.SEC ?? 40);
const TAG = process.env.TAG ?? 'run';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/scorecard/${TAG}`;
fs.mkdirSync(OUT, { recursive: true });

import { SCORE_ROUTES } from './_scorecard-routes.mts';
const pick = (process.env.MODES ?? 'all').split(',');
const MODES = pick[0] === 'all' ? SCORE_ROUTES : SCORE_ROUTES.filter(([s]) => pick.includes(s));
const verbKey = (slug: string) => (slug === 'try' ? 'dunk' : slug);

const IDX: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, LT: 6, RT: 7, DPAD_LEFT: 14, DPAD_RIGHT: 15 };
function verbsFor(slug: string): { label: string; idx: number; holdMs: number }[] {
  const cfg = MODE_VERBS[verbKey(slug)] ?? MODE_VERBS.default;
  const out: { label: string; idx: number; holdMs: number }[] = [];
  for (const b of cfg.buttons) {
    const e = b.emit; if (!e || !b.label) continue;
    if (e.t === 'button') out.push({ label: b.label, idx: IDX[e.btn] ?? 0, holdMs: b.hold ? 700 : 90 });
    else if (e.t === 'trigger') out.push({ label: b.label, idx: e.side === 'R' ? IDX.RT : IDX.LT, holdMs: 700 });
  }
  if (slug === 'bigair' || slug === 'sprint') out.push({ label: 'STRIDE L', idx: IDX.DPAD_LEFT, holdMs: 90 }, { label: 'STRIDE R', idx: IDX.DPAD_RIGHT, holdMs: 90 });
  if (BOOST_MODES.has(verbKey(slug))) out.push({ label: 'BOOST', idx: IDX.R1, holdMs: 800 });
  return out;
}

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['camera'] });   // PROVE IT (/play/dunkduel) is a CAMERA contest: a fake device lets the headless session reach its flow
await ctx.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
// THE PROBE DECLARES ITSELF. `?agent=1` is remembered in sessionStorage, which is per TAB — and every route here opens
// its own tab, so a route that strips the query (/try lands clean, the carnival rewrites to ?carnival=1) mounted
// uninstrumented and scored 'no presses at all'. Setting the same flag the URL would set makes every tab a QA session.
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
await ctx.addInitScript(`(() => {
  const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad, null, null, null];
  let n = 0, t = performance.now(); window.__FPS = []; const f = (now) => { n++; if (now - t >= 500) { window.__FPS.push(Math.round(n * 1000 / (now - t))); n = 0; t = now; } requestAnimationFrame(f); }; requestAnimationFrame(f);
})()`);
{
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForTimeout(800);
  if (/\/login/.test(p.url())) { await p.fill('input[type="email"]', 'playtest@fel.local'); await p.fill('input[type="password"]', 'playtest-local-only'); await p.click('button[type="submit"]'); const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(p.url())) await p.waitForTimeout(300); }
  await p.close();
}

const pad = (p: Page, js: string) => p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`).catch(() => {});
const press = async (p: Page, idx: number, ms: number) => { await pad(p, `p.buttons[${idx}].pressed = true; p.buttons[${idx}].value = 1`); await p.waitForTimeout(ms); await pad(p, `p.buttons[${idx}].pressed = false; p.buttons[${idx}].value = 0`); };

for (const [slug, path] of MODES) {
  const p = await ctx.newPage();
  const errors: string[] = []; const frames: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 40[14]|favicon|FEL-FRAME/.test(t)) errors.push(t.slice(0, 200)); if (/hero off-screen/.test(t)) frames.push(t.slice(0, 160)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  const row: Record<string, unknown> = { slug, path, tag: TAG };
  const t0 = Date.now();
  try {
    await p.goto(`${BASE}${path}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForTimeout(1200);
    const lobby = p.getByRole('button', { name: /START THE NIGHT/i }); if (await lobby.count()) await lobby.first().click().catch(() => {});
    let st = '';
    while (Date.now() - t0 < 150000) { st = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (st === 'loaded' || st === 'failed') break; await p.waitForTimeout(300); }
    row.loadMs = Date.now() - t0;
    if (st !== 'loaded') { row.note = `not ready (${st})`; throw new Error('not ready'); }
    await p.waitForTimeout(700);
    const start = p.getByRole('button', { name: /^(TAP TO START|START|PLAY)$/i });
    if (await start.count()) await start.first().click().catch(() => {}); else await p.keyboard.press('Space');
    await p.waitForTimeout(800);
    // who scene it: its own PLAY
    const play = p.getByRole('button', { name: /^PLAY$/ }); if (await play.count()) await play.first().click().catch(() => {});
    const from = await p.evaluate(() => (window as any).__FEL_QA__?.now() ?? 0);
    // 10 Hz body sampler in the page
    // WHICH CLIP (2026-09-15): the tallies alone say "1.5% T-arms" and leave the next hour to guessing. Every fault
    // frame now also names the clip that was on top of the blend, so a deduction points at a file.
    await p.evaluate(`(() => { window.__BODY = { n: 0, noClip: 0, tee: 0, awkward: 0, noHero: 0, clipChanges: 0, last: '', teeBy: {}, awkBy: {}, churnBy: {} };
      window.__BODYI = setInterval(() => { const d = window.__FEL_DEV__; const r = d && d.anim ? d.anim() : null; const B = window.__BODY; B.n++;
        const h = r && r.hero; if (!h) { B.noHero++; return; }
        if (!h.playing.length) B.noClip++;
        const top = h.playing.length ? h.playing.slice().sort((a, b) => b.weight - a.weight)[0].clip : '';
        const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
        if (h.arms && h.arms.tee) { B.tee++; bump(B.teeBy, top || '(no clip)'); }
        if (h.arms && !h.arms.ok && !h.arms.tee) { B.awkward++; bump(B.awkBy, top || '(no clip)'); }
        if (top !== B.last) { B.clipChanges++; bump(B.churnBy, (B.last || '(none)') + '→' + (top || '(none)')); B.last = top; } }, 100); })()`);
    const verbs = verbsFor(slug);
    const tPlay = Date.now(); let k = 0;
    while ((Date.now() - tPlay) / 1000 < SEC) {
      const state = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => '');
      if (state === 'ended') break;
      const el = (Date.now() - tPlay) / 1000;
      if (k === 2) await p.screenshot({ path: `${OUT}/${slug}-1-open.png` });
      if (Math.abs(el - SEC * 0.5) < 0.6 && !fs.existsSync(`${OUT}/${slug}-2-mid.png`)) await p.screenshot({ path: `${OUT}/${slug}-2-mid.png` });
      if (Math.abs(el - SEC * 0.85) < 0.6 && !fs.existsSync(`${OUT}/${slug}-3-late.png`)) await p.screenshot({ path: `${OUT}/${slug}-3-late.png` });
      await pad(p, `p.axes[0] = ${(0.45 * Math.sin(k * 0.7)).toFixed(2)}; p.axes[1] = -0.75`);
      const v = verbs[k++ % Math.max(1, verbs.length)];
      if (v) await press(p, v.idx, v.holdMs);
      await p.waitForTimeout(900);
    }
    row.playSec = Math.round((Date.now() - tPlay) / 1000);
    if (!fs.existsSync(`${OUT}/${slug}-3-late.png`)) await p.screenshot({ path: `${OUT}/${slug}-3-late.png` });
    const body = await p.evaluate(() => { clearInterval((window as any).__BODYI); return (window as any).__BODY; });
    row.body = body;
    // RECOGNISABLE: every request another clip answered this session ("requested→played"), scored by anim/recognisable
    row.stoodIn = await p.evaluate(() => { const d = (window as any).__FEL_DEV__; const r = d && d.anim ? d.anim() : null; return r?.stoodIn ?? null; }).catch(() => null);
    const fps = (await p.evaluate(() => (window as any).__FPS)) as number[];
    const sorted = [...fps.slice(2)].sort((a, b) => a - b);
    row.fpsP50 = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; row.fpsP10 = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : null;
    const playMin = Math.max(0.1, (Date.now() - tPlay) / 60000);
    const qa = await p.evaluate(([f, playMin]) => {
      const q = (window as any).__FEL_QA__; if (!q) return null;
      const sum = q.summary(450, f); const ev = q.events(20000).filter((e: any) => e.t >= f);
      const resp = ev.filter((e: any) => e.kind !== 'press' && e.kind !== 'score');
      const lat: number[] = []; let rich = 0, answered = 0;
      for (const pr of ev.filter((e: any) => e.kind === 'press')) {
        const win = resp.filter((r: any) => r.t >= pr.t && r.t <= pr.t + 450);
        if (!win.length) continue;
        answered++; lat.push(win[0].t - pr.t);
        if (win.some((r: any) => r.kind === 'juice' || r.kind === 'sfx' || r.kind === 'impact')) rich++;
      }
      lat.sort((a, b) => a - b);
            const juice = ev.filter((e: any) => e.kind === 'juice' || e.kind === 'impact').length;
      return { presses: sum.presses, silentPct: sum.silentPct, silentBy: Object.fromEntries(Object.entries(sum.byBtn as Record<string, { presses: number; answered: number }>).map(([k, r]) => [k, `${r.presses - r.answered}/${r.presses}`])), unexplainedScores: sum.unexplainedScores, latMedian: lat.length ? lat[Math.floor(lat.length / 2)] : null, rich: answered ? rich / answered : 0, juicePerMin: juice / playMin };
    }, [from, playMin] as [number, number]);
    row.qa = qa;
    // what the session actually reached (score, gates, laps): the evidence behind a low juice or feel number
    row.hud = await p.evaluate(() => { const q = (window as any).__FEL_QA__; return q?.rawHud ? q.rawHud() : null; }).catch(() => null);
    row.feltFrame = frames.length;
  } catch (e) { if (!row.note) row.note = String((e as Error).message).slice(0, 160); }
  row.errors = [...new Set(errors)].slice(0, 5); row.errorCount = errors.length;
  fs.writeFileSync(`${OUT}/${slug}.json`, JSON.stringify(row, null, 1));
  console.log(JSON.stringify({ slug, loadMs: row.loadMs, fps: row.fpsP10, body: row.body, qa: row.qa, frames: row.feltFrame, errs: row.errorCount, note: row.note }));
  await p.close();
}
await browser.close();
