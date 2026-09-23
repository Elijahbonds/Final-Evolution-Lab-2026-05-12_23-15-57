// _race-lab — the racing pass's instrument (2026-09-23): run each racer to ITS OWN END under a driver and write down the
// result the mode reports, the place and time off its probe seam, the callouts it made, what the player could hear and
// read, and every console error.
//
//   PORT=3011 MODES=velocitykart,aeroaces,freerun,sprint DRIVER=intent|idle MAXMS=240000 OUT=<dir> QUERY='map=x' START=rocket|early|late
//     npx tsx scripts/probes/_race-lab.mts
//
// DRIVER=intent installs the mode's INTENT_DRIVERS entry (under ?agent=1); DRIVER=idle touches nothing (does an idle
// race end, and what does it say?). One JSON row per mode on stdout, prefixed ROW.
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { INTENT_DRIVERS } from './_intent-drivers.mts';

const PORT = process.env.PORT ?? '3011';
const MODES = (process.env.MODES ?? 'velocitykart,aeroaces,freerun,sprint').split(',');
const DRIVER = process.env.DRIVER ?? 'intent';
const MAXMS = Number(process.env.MAXMS ?? 240000);
const OUT = process.env.OUT ?? '/tmp/race-lab';
const QUERY = process.env.QUERY ?? '';
fs.mkdirSync(OUT, { recursive: true });
const TAGS = /\[(RACE|FEL-KART|FEL-AERO|FR-FLOW|FR-JUICE|SPRINT-JUICE|RACE-FIELD|RACE-END)\]/;
const SEAM: Record<string, string> = { velocitykart: 'kart', aeroaces: 'aero', freerun: 'freerun' };

const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();

async function run(p: Page, mode: string): Promise<Record<string, unknown>> {
  const ledger: string[] = [], errs: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (TAGS.test(t)) ledger.push(t.slice(0, 160)); if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(t)) errs.push(t.slice(0, 160)); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 160)));
  const q = ['agent=1', QUERY].filter(Boolean).join('&');   // the QA bridge (result, rawHud) needs agent=1 whatever the driver
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/${mode}${q ? `?${q}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForSelector('canvas', { timeout: 240000 });
  for (let i = 0; i < 120; i++) {
    const txt = await p.evaluate(() => document.body.innerText);
    if (/playing/i.test(txt)) break;
    if (/ready/i.test(txt)) await p.keyboard.press('Space');
    await p.waitForTimeout(1000);
  }
  await p.waitForTimeout(800);
  // the banner and callouts the player READS, and the frame rate, sampled in the page
  await p.evaluate(`(() => {
    window.__RL = { banners: {}, fps: [] };
    setInterval(() => { try { const Q = window.__FEL_QA__; const h = Q && Q.rawHud ? Q.rawHud() : null; const b = h && h.banner; if (b) window.__RL.banners[b] = (window.__RL.banners[b] || 0) + 1; } catch (e) {} }, 100);
    setInterval(() => { try { const e = window.__FEL_DEV__.scene.getEngine(); window.__RL.fps.push(Math.round(e.getFps())); } catch (e) {} }, 500);
    // the seam every 0.5 s: speed, off-road / off-line, place — a driver's quality separated from the field's pace
    window.__RL.trace = [];
    setInterval(() => { try { const m = window.__FEL_DEV__.scene.metadata['${SEAM[mode] ?? 'none'}']; if (!m) return; const s = m.state(); if (s.done) return;
      window.__RL.trace.push({ v: s.speed, lat: s.lateral, on: s.onRoad, place: s.place ?? (s.race && s.race.place), lap: s.lap }); } catch (e) {} }, 500);
  })()`);
  if (process.env.START) await p.evaluate(`window.__START = '${process.env.START}'`);   // phase 4: the driver's start timing
  if (process.env.PLAIN === '1') await p.evaluate('window.__PLAIN = 1');   // phase 6: the line alone, no skill verbs
  if (process.env.LANE) await p.evaluate(`window.__LANE = '${process.env.LANE}'`);   // phase 7: the Free Run lane the driver runs
  if (DRIVER === 'intent') {
    if (!INTENT_DRIVERS[mode]) throw new Error(`no intent driver for ${mode}`);
    await p.evaluate(INTENT_DRIVERS[mode]);
  }
  const t0 = Date.now(); let res: unknown = null; let shot = 0;
  while (Date.now() - t0 < MAXMS) {
    res = await p.evaluate('window.__FEL_QA__ && window.__FEL_QA__.result ? window.__FEL_QA__.result() : null');
    if (res) break;
    if (shot < 2 && Date.now() - t0 > (shot ? 45000 : 12000)) { await p.screenshot({ path: `${OUT}/${mode}-${DRIVER}-${shot ? 'mid' : 'early'}.png` }); shot++; }
    await p.waitForTimeout(500);
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${mode}-${DRIVER}-end.png` });
  const seam = SEAM[mode] ? await p.evaluate(`(() => { try { const s = window.__FEL_DEV__.scene.metadata.${SEAM[mode]}.state(); delete s.pieces; delete s.verbs; return s; } catch (e) { return null; } })()`) : null;
  const rl = await p.evaluate('window.__RL') as { banners: Record<string, number>; fps: number[]; trace: { v: number; lat: number; on?: boolean; place?: number }[] };
  const tr = rl.trace ?? [];
  const drive = tr.length ? { samples: tr.length, meanSpeed: +(tr.reduce((a, r) => a + (r.v || 0), 0) / tr.length).toFixed(1),
    offRoadPct: Math.round(100 * tr.filter((r) => r.on === false).length / tr.length), meanAbsLat: +(tr.reduce((a, r) => a + Math.abs(r.lat || 0), 0) / tr.length).toFixed(1),
    placeByTenth: Array.from({ length: 10 }, (_, i) => tr[Math.min(tr.length - 1, Math.floor(i * tr.length / 10))]?.place ?? null) } : null;
  const fps = [...rl.fps].slice(4).sort((a, b) => a - b);
  const tally: Record<string, number> = {};
  for (const l of ledger) { const m = l.match(TAGS); const rest = l.slice(l.indexOf(']') + 1).trim().split(/[ (:]/)[0]; const k = `${m![1]} ${rest}`; tally[k] = (tally[k] ?? 0) + 1; }
  return {
    mode, driver: DRIVER, ended: !!res, secs, result: res, drive, seam,
    banners: Object.keys(rl.banners).slice(0, 30), fpsMedian: fps[Math.floor(fps.length / 2)] ?? 0, fpsP10: fps[Math.floor(fps.length * 0.1)] ?? 0,
    tally, ledgerTail: ledger.slice(-6), errors: errs.slice(0, 6),
  };
}

const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
for (const mode of MODES) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(`(() => {
    const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__PAD = pad; navigator.getGamepads = () => [pad];
  })()`);
  const p = await ctx.newPage();
  try { console.log('ROW ' + JSON.stringify(await run(p, mode))); }
  catch (e) { console.log('ROW ' + JSON.stringify({ mode, driver: DRIVER, crash: String(e).slice(0, 200) })); }
  await ctx.close();
}
await b.close();
