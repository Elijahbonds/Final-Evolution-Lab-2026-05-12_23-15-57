// SCREEN-FIX-2 off-site probe (2026-09-29): the Quick Screen's own requests, in a real browser, from /screen?src=qr.
//
//   OFFSITE   per age band: the whole screen (the fake camera loads the pose wasm and model for real; on a dev server the
//             synthetic athlete then plays to the results; a kid runs it twice, "Run it again"). Every request: url,
//             status, initiator. Lists each 404 and each request to another origin (item 1, Step 2), every Set-Cookie
//             (item 2), and storage and cookies at the end (items 2 and 3).
//   WALK      from a kid's results, every link, followed page by page while it stays in the screen: where each goes, and
//             any Set-Cookie on the way (item 7a, S-11).
//   CAMP      signed out, from /, /screen and /elijah (when it exists): every link two clicks deep, looking for Camp
//             (amend 5). Dev server only (it compiles each page it opens).
//
// Run from FEL-full-app (Node 26), the server up:
//   SCREEN_BASE=http://127.0.0.1:3221 PHASE=after node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/probes/_screen-fix-2-offsite.mts
//   SCREEN_BASE=https://final-evolution-lab.web.app PHASE=live …   (read-only: no sign-in, no form, no POST; stops at the camera check)
// Writes ~/Claude/outbox/SCREEN-FIX-2-shots/offsite-<phase>-<dev|live>.json (and offsite.json for PHASE=after on dev).
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTH_COOKIE, BASE, DEV_TOOLING, LIVE, ORIGIN, OUT, audit, cameraUp, feedAllowed, jar, launch, open, requestSummary, results, runChecks,
  save, sleep, toCamera, type Json, type Probe,
} from './_screen-fix-2-lib.mts';

const PHASE = process.env.PHASE ?? 'after';
const RUNS = (process.env.RUNS ?? (LIVE ? 'OFFSITE' : 'OFFSITE,WALK,CAMP')).split(',');
const BANDS = (process.env.BANDS ?? (LIVE ? '18+,under-13' : '18+,13-17,under-13,unknown')).split(',');
const isQuickScreen = (p: string) => /^\/(screen|play\/mirror\/assess)(\/|$)/.test(p);
const KID = (b: string) => b !== '18+';

const report: Json = { phase: PHASE, base: BASE, live: LIVE, date: new Date().toISOString(), runs: {} };
const browser = await launch();
const done = async (p: Probe) => { try { await p.ctx.close(); } catch { /* closed */ } };

try {
  if (RUNS.includes('OFFSITE')) for (const band of BANDS) {
    const tag = `offsite-${PHASE}-${LIVE ? 'live' : 'dev'}-${band.replace('+', 'plus')}`;
    const p = await open(browser, tag);
    const out: Json = { band, screens: [] };
    try {
      await p.page.goto(`${BASE}/screen?src=qr`);
      for (let n = 0; n < (KID(band) && !LIVE ? 2 : 1); n++) {
        const s: Json = {};
        await toCamera(p, band, s, { fromStart: n === 0 });
        await cameraUp(p, s);
        if (!LIVE && await feedAllowed(p.page)) {
          await runChecks(p, s, n === 0 ? 0.40 : 0.45);
          s.results = await results(p);
          s.shot = await p.shot(`results-${n + 1}`);
          if (n === 0 && KID(band)) {
            // in the page: the same person, again (a build without the button: one screen only)
            if (!(await p.page.locator('[data-run-again]').count())) { out.screens.push(s); out.runAgain = 'no "Run it again" on this build'; break; }
            await p.page.click('[data-run-again]');
          }
        } else {
          await sleep(4000);                                                   // the model and wasm settle; no feed here
          s.stoppedAt = 'camera check (no QA feed on this server)';
        }
        out.screens.push(s);
      }
    } catch (e) { out.error = String(e); out.errorShot = await p.shot('error').catch(() => null); }
    // storage and the page's own record, whatever happened above
    await sleep(1500);
    out.jar = await jar(p).catch((e) => ({ error: String(e) }));
    out.audit = await audit(p).catch((e) => ({ error: String(e), writes: [], sends: [] }));
    out.requests = requestSummary(p.reqs);
    out.allRequests = p.reqs.map((r) => ({ url: r.url.replace(ORIGIN, ''), method: r.method, status: r.status, type: r.type, initiator: r.initiator, phase: r.phase }));
    out.setCookies = p.setCookies;
    out.authSetCookies = p.setCookies.filter((c) => c.names.some((n) => AUTH_COOKIE.test(n)));
    out.wsSent = p.wsSent.filter((w) => !DEV_TOOLING(w.url));
    out.devToolingWsFrames = p.wsSent.filter((w) => DEV_TOOLING(w.url)).length;
    out.pageErrors = p.errors;
    report.runs[tag] = out;
    save(`offsite-${PHASE}-${LIVE ? 'live' : 'dev'}`, report);
    await done(p);
  }

  if (RUNS.includes('WALK') && !LIVE) {
    const p = await open(browser, `walk-${PHASE}`);
    const out: Json = { hops: [], outside: [] };
    try {
      await p.page.goto(`${BASE}/screen?src=qr`);
      await toCamera(p, '13-17', {}, { fromStart: true });
      await cameraUp(p, {});
      await runChecks(p, {}, 0.4);
      const start = await results(p);
      out.from = { kind: start.kind, links: start.links };
      const queue: { href: string; from: string }[] = start.links.map((l: Json) => ({ href: l.href, from: 'kid results' }));
      const seen = new Set<string>();
      while (queue.length) {
        const { href, from } = queue.shift()!;
        if (seen.has(href)) continue;
        seen.add(href);
        const u = new URL(href, BASE);
        if (u.origin !== ORIGIN || !isQuickScreen(u.pathname)) { out.outside.push({ href, from }); continue; }
        const before = p.setCookies.length;
        await p.page.goto(u.toString());
        await p.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
        const links = await p.page.evaluate('Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"))') as string[];
        out.hops.push({ href, from, landed: p.page.url().replace(ORIGIN, ''), links, setCookies: p.setCookies.slice(before) });
        for (const l of links) if (!seen.has(l)) queue.push({ href: l, from: href });
      }
      out.cookiesAtEnd = (await jar(p)).cookies;
      out.setCookies = p.setCookies;
    } catch (e) { out.error = String(e); }
    report.runs.walk = out;
    save(`offsite-${PHASE}-dev`, report);
    await done(p);
  }

  if (RUNS.includes('CAMP') && !LIVE) {
    const p = await open(browser, `camp-${PHASE}`);
    const out: Json = { starts: {}, campLinks: [], pages: 0 };
    const CAP = Number(process.env.CAMP_CAP ?? 30), DEPTH = 2;
    const seen = new Set<string>();
    const queue: { path: string; depth: number; from: string; start: string }[] = ['/', '/screen', '/elijah'].map((s) => ({ path: s, depth: 0, from: '(start)', start: s }));
    while (queue.length && out.pages < CAP) {
      const q = queue.shift()!;
      if (seen.has(q.path)) continue;
      seen.add(q.path);
      const res = await p.page.goto(`${BASE}${q.path}`, { timeout: 120_000 }).catch((e) => { out.starts[q.path] = String(e); return null; });
      out.pages++;
      await p.page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      const landed = p.page.url().replace(ORIGIN, '');
      const links = await p.page.evaluate('Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"))').catch(() => []) as string[];
      if (q.depth === 0) out.starts[q.path] = { status: res?.status() ?? null, landed, links: links.length };
      for (const l of links) if (/(^|\/)camp(\/|$|\?)/i.test(l)) out.campLinks.push({ href: l, on: landed, from: q.from, start: q.start });
      if (q.depth < DEPTH) for (const l of links) {
        if (!l.startsWith('/') || l.startsWith('//')) continue;
        const path = new URL(l, BASE).pathname;
        if (!seen.has(path) && !/^\/(api|_next)\//.test(path)) queue.push({ path, depth: q.depth + 1, from: landed, start: q.start });
      }
    }
    out.visited = [...seen];
    out.unvisited = queue.length;
    report.runs.camp = out;
    save(`offsite-${PHASE}-dev`, report);
    await done(p);
  }
} finally {
  await browser.close();
}

const f = save(`offsite-${PHASE}-${LIVE ? 'live' : 'dev'}`, report);
if (PHASE === 'after' && !LIVE) copyFileSync(f, join(OUT, 'offsite.json'));
const runs = Object.values(report.runs) as Json[];
console.log(JSON.stringify({
  file: f,
  offsite: runs.flatMap((r) => r.requests?.offsite ?? []).length,
  notFound: runs.flatMap((r) => r.requests?.notFound ?? []).map((x: Json) => x.url),
  authSetCookies: runs.flatMap((r) => r.authSetCookies ?? []).length,
  cookiesAtEnd: runs.map((r) => r.jar?.cookies ?? r.cookiesAtEnd ?? null),
  walkOutside: report.runs.walk?.outside ?? null,
  campLinks: report.runs.camp?.campLinks ?? null,
  errors: runs.map((r) => r.error).filter(Boolean),
}, null, 2));
