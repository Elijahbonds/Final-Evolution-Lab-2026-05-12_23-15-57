// MUSIC-SUITE P10 FIX (2026-09-29) — MEMORY OVER REPEATED VISITS. The scorecard lane's perf-proof measured the heap left
// behind by ONE client-side exit (dance ~24 MB, the Academy ~8-9 MB over the blank route) and assumed the dance number
// was "DanceMode's singleton husk" — never traced, and never repeated. If each visit kept its own disposed scene, a
// player moving between the Cypher and the Academy would grow by ~24 MB a visit. This probe enters and leaves each room
// CYCLES times in ONE page (client-side both ways — window.next.router — so the heap, the registries and anything the
// rooms leave behind live on), and after every exit forces GC (_p10-lib heap(): 3× HeapProfiler.collectGarbage) and
// records: the heap over the blank route's floor, the live WebGL contexts, the live AudioContexts, and every Babylon
// scene / engine the rooms made (WeakRefs: collected / disposed-but-retained / LIVE). A plateau after the first visit
// supports the singleton reading; a line that climbs by the room's size each visit is a leak.
// Usage: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p10-cycles.mts
//        (CYCLES=4, ROOMS=dance,music, OUT_ROOT=…)
import fs from 'node:fs';
import type { Page } from 'playwright-core';
import { BASE, assertDisk, launch, newPage, cdpOf, heap, danceBegin, leaveRoom, writeJson, sleep, CONTEXTS, OUT_ROOT, DESKTOP, type Any } from './_p10-lib.mts';

const OUT = `${OUT_ROOT}/cycles`;
fs.mkdirSync(OUT, { recursive: true });
const CYCLES = Number(process.env.CYCLES ?? 4);
const ROOMS = (process.env.ROOMS ?? 'dance,music').split(',');
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p10-cycles +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const R: Any = { at: new Date().toISOString(), base: BASE, cycles: CYCLES, rooms: {}, errors: [] as string[] };
const CAL = `try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch (e) {}`;
const STUDIO_TIER = `try { if (!localStorage.getItem('fel-music-progress')) localStorage.setItem('fel-music-progress', '{"patternsMade":1,"sectionsSaved":2,"chainEntries":2}'); } catch (e) {}`;
/** Every Babylon scene / engine alive while a room runs, by WeakRef (accumulated across visits). */
const TAKE_SCENE_REFS = `(() => {
  let es = null; const r = window.__wreq || (window.__MOD('^$'), window.__wreq);
  for (const m of Object.values(r.c)) { try { const x = m && m.exports && m.exports.EngineStore; if (x && x.Instances) { es = x; break; } } catch (e) {} }
  window.__ES = es;
  const seen = window.__SEEN || (window.__SEEN = new WeakSet());
  window.__SCENES = window.__SCENES || []; window.__ENGINES = window.__ENGINES || [];
  if (es) for (const e of es.Instances) { if (!seen.has(e)) { seen.add(e); window.__ENGINES.push(new WeakRef(e)); } for (const s of e.scenes || []) if (!seen.has(s)) { seen.add(s); window.__SCENES.push(new WeakRef(s)); } }
  return { engines: window.__ENGINES.length, scenes: window.__SCENES.length };
})()`;
const STATES = `(() => {
  const st = (r) => { const x = r.deref(); return x ? (x.isDisposed === true || (typeof x.isDisposed === 'function' && x.isDisposed()) ? 'disposed-but-retained' : 'LIVE') : 'collected'; };
  const tally = (a) => a.reduce((m, k) => { m[k] = (m[k] || 0) + 1; return m; }, {});
  return { scenes: tally((window.__SCENES || []).map(st)), engines: tally((window.__ENGINES || []).map(st)), engineStoreInstances: window.__ES ? window.__ES.Instances.length : null };
})()`;

async function floor(p: Page): Promise<Any> {
  await p.goto(`${BASE}/dev/mode/p10-left`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => /no registry mode/.test(document.body.textContent ?? ''), undefined, { timeout: 120000 });
  const c = await cdpOf(p); const h = await heap(c); await c.detach();
  return h;
}
async function afterLeave(p: Page, base: Any): Promise<Any> {
  // the driver's own 1 ms interval must see `stop` and clear itself BEFORE anything is nulled: the first run nulled
  // __DRV under it, and the interval threw on every tick for the rest of the page (1,818 page errors) while its closure
  // kept that visit's DancePerformance reachable — the probe's own retention, not the room's
  await p.evaluate(() => { const w = window as Any; if (w.__DRV) w.__DRV.stop = true; });
  await sleep(300);
  await p.evaluate('window.__DPERF = null; window.__STAGE = null;').catch(() => undefined);
  await leaveRoom(p);
  const c = await cdpOf(p); const h = await heap(c); await c.detach();
  const ctx = await p.evaluate(CONTEXTS);
  const live = (ctx.acs as Any[]).filter((a) => a.state !== 'closed' && a.state !== 'collected');
  return {
    heapMB: h.usedMB, overFloorMB: Math.round((h.usedMB - base.usedMB) * 10) / 10, liveWebGl: ctx.liveGl, webglMade: ctx.gls.length,
    liveAudio: live.length, liveAudioSoundKit: live.filter((a: Any) => /SoundKit/.test(a.who)).length, audioMade: ctx.acs.length, ...(await p.evaluate(STATES)),
  };
}

async function danceVisit(p: Page, i: number): Promise<Any> {
  await p.evaluate(() => (window as Any).next.router.push('/dev/mode/dance?track=warmup&place=home'));
  await p.waitForFunction(() => /· ready|· playing/.test(document.querySelector('pre')?.previousElementSibling?.textContent ?? ''), undefined, { timeout: 240000 });
  const begin = await danceBegin(p);
  await sleep(8000);   // the song running, the driver dancing, the camera moving
  const refs = await p.evaluate(TAKE_SCENE_REFS);
  const judge = await p.evaluate(() => { const d = (window as Any).__DPERF; return d ? { score: d.score, combo: d.combo } : null; });
  await p.evaluate(() => { const w = window as Any; if (w.__DRV) w.__DRV.stop = true; });
  if (i === 0) await p.screenshot({ path: `${OUT}/dance-visit.png` });
  return { planned: begin.plan?.planned ?? null, refs, judge };
}
async function musicVisit(p: Page, i: number): Promise<Any> {
  await p.evaluate(() => (window as Any).next.router.push('/dev/music?stage=studio&player=p10cycles'));
  const start = p.getByRole('button', { name: 'TAP TO START' }); await start.waitFor({ timeout: 300000 }); await start.click(); await sleep(700);
  await p.waitForFunction(() => !!document.querySelector('[data-qa="cell"]'), undefined, { timeout: 60000 });
  for (const s of [0, 4, 8, 12]) { const c = p.locator(`[data-qa="cell"][data-row="kick"][data-step="${s}"]`); if (await c.count() && (await c.getAttribute('data-on')) !== '1') await c.click(); }
  await p.getByRole('button', { name: 'PLAY', exact: true }).first().click();
  await p.waitForFunction(() => { const e = (window as Any).__FEL_STUDIO__?.engine(); return !!e && e.running; }, undefined, { timeout: 20000 });
  await sleep(4000);
  await p.getByRole('button', { name: 'FLIP', exact: true }).click();   // the Flip decodes its pack: the room's biggest buffers
  await p.waitForFunction(() => !!((window as Any).__FEL_FLIP__ && (window as Any).__FEL_FLIP__.decoded), undefined, { timeout: 90000 }).catch(() => undefined);
  await sleep(2000);
  if (i === 0) await p.screenshot({ path: `${OUT}/music-visit.png` });
  return { flipDecoded: await p.evaluate(() => !!(window as Any).__FEL_FLIP__?.decoded) };
}

for (const room of ROOMS) {
  const out: Any = { disk: assertDisk(`cycles-${room}`), visits: [] as Any[] };
  R.rooms[room] = out;
  const b = await launch();
  try {
    const ctx = await b.newContext(DESKTOP);
    for (const s of [CAL, STUDIO_TIER]) await ctx.addInitScript({ content: s });
    const p = await newPage(ctx, R.errors, `cycles-${room}`);
    out.floor = await floor(p);
    log(room, 'floor', JSON.stringify(out.floor));
    for (let i = 0; i < CYCLES; i++) {
      const visit = room === 'dance' ? await danceVisit(p, i) : await musicVisit(p, i);
      const left = await afterLeave(p, out.floor);
      out.visits.push({ i: i + 1, visit, left });
      log(room, `visit ${i + 1}`, JSON.stringify(left));
      writeJson(`${OUT}/cycles-proof.json`, R);
    }
    const o = out.visits.map((v: Any) => v.left.overFloorMB as number);
    out.summary = {
      overFloorMB: o,
      perVisitDeltaMB: o.slice(1).map((x: number, k: number) => Math.round((x - o[k]) * 10) / 10),
      firstMB: o[0], lastMB: o[o.length - 1],
      growthAfterFirstMB: Math.round((o[o.length - 1] - o[0]) * 10) / 10,
      meanGrowthPerVisitAfterFirstMB: o.length > 1 ? Math.round(((o[o.length - 1] - o[0]) / (o.length - 1)) * 10) / 10 : null,
    };
    log(room, 'summary', JSON.stringify(out.summary));
    await ctx.close();
  } catch (e) { out.fatal = String((e as Error)?.stack ?? e).slice(0, 1500); log(room, 'FATAL', out.fatal.slice(0, 300)); }
  finally { await b.close(); }
  writeJson(`${OUT}/cycles-proof.json`, R);
}
R.runtimeSec = Math.round((Date.now() - t0) / 1000);
writeJson(`${OUT}/cycles-proof.json`, R);
log('wrote', `${OUT}/cycles-proof.json`, R.errors.length ? `errors ${R.errors.length}: ${R.errors.slice(0, 3).join(' | ')}` : 'no page errors');
