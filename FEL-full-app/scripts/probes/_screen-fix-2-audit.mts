// SCREEN-FIX-2 audit probe (2026-09-29): THE BASIS FOR CYBER'S LIVE AUDIT (FE PM, retest 1 item 7h; storage rule from
// the FE PM + Research amend, 11:50 AM PT). Re-run it after any change to the Quick Screen.
//
// A full screen, kid AND adult, in a real Chromium on the lane's dev server (the fake camera loads the pose model for
// real, then PR #20's synthetic athlete plays the checks through window.__FEL_POSE_FEED__), a fresh signed-out context
// per band; a kid runs it twice ("Run it again"). It passes only when:
//   · NO POST and NO upload: no request other than GET/HEAD, no request with a body, no fetch / XHR / sendBeacon /
//     WebSocket carrying data from the page, no multipart or Blob upload. (Next's dev-only hot-reload socket,
//     /_next/webpack-hmr, is listed apart: it does not exist in a production build.)
//   · STORAGE: 18 or older write only fel.screen.* keys in sessionStorage (the age answer and their results, this tab);
//     under 13, 13–17 and "rather not say" write EXACTLY ONE key, the age answer (fel.screen.age), and nothing else
//     anywhere. Nobody writes localStorage (fel.pose.model included), IndexedDB or a cookie.
//   · no response sets a cookie, and the cookie jar is empty at the end.
//
// Run from FEL-full-app (Node 26), the lane's dev server up:
//   SCREEN_BASE=http://127.0.0.1:3221 node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/probes/_screen-fix-2-audit.mts
// Writes ~/Claude/outbox/SCREEN-FIX-2-shots/audit.json and prints its verdict line; exits 1 on a FAIL.
import {
  BASE, DEV_TOOLING, LIVE, ORIGIN, audit, cameraUp, feedAllowed, jar, launch, open, results, runChecks, save, sleep, toCamera, type Json,
} from './_screen-fix-2-lib.mts';

if (LIVE) { console.error('the audit drives the QA feed, which only a dev server has: point SCREEN_BASE at the lane server'); process.exit(2); }
const BANDS = (process.env.BANDS ?? '18+,13-17,under-13,unknown').split(',');
const AGE_KEY = 'fel.screen.age';
const report: Json = { what: "basis for Cyber's live audit", base: BASE, date: new Date().toISOString(), bands: {} };
const browser = await launch();

try {
  for (const band of BANDS) {
    const kid = band !== '18+';
    const p = await open(browser, `audit-${band.replace('+', 'plus')}`);
    const out: Json = { kid, screens: 0 };
    try {
      await p.page.goto(`${BASE}/screen?src=qr`);
      for (let n = 0; n < (kid ? 2 : 1); n++) {
        await toCamera(p, band, {}, { fromStart: n === 0 });
        await cameraUp(p, {});
        if (!(await feedAllowed(p.page))) throw new Error('no QA feed on this server');
        await runChecks(p, {}, n === 0 ? 0.40 : 0.45);
        out.results = await results(p);
        out.screens++;
        if (kid && n === 0) await p.page.click('[data-run-again]');
      }
      await sleep(1500);
      const a = await audit(p);
      const j = await jar(p);
      const appSends = a.sends.filter((s: Json) => !DEV_TOOLING(s.url));
      const reqs = p.reqs.filter((r) => !DEV_TOOLING(r.url));
      out.posts = reqs.filter((r) => !['GET', 'HEAD'].includes(r.method)).map((r) => `${r.method} ${r.url}`);
      out.uploads = [
        ...reqs.filter((r) => r.bodyBytes > 0).map((r) => `request body ${r.bodyBytes} B: ${r.method} ${r.url}`),
        ...appSends.filter((s: Json) => s.bodyBytes > 0 || !['GET', 'HEAD'].includes(s.method)).map((s: Json) => `${s.how} ${s.method} ${s.url} (${s.bodyBytes} B)`),
        ...p.wsSent.filter((w) => !DEV_TOOLING(w.url)).map((w) => `websocket frame ${w.bytes} B: ${w.url}`),
      ];
      out.offsite = reqs.filter((r) => { try { return new URL(r.url).origin !== ORIGIN; } catch { return false; } }).map((r) => r.url);
      out.writes = a.writes;
      out.sends = appSends.map((s: Json) => `${s.how} ${s.method} ${String(s.url).replace(ORIGIN, '')}`);
      out.setCookies = p.setCookies;
      out.jar = j;
      out.devToolingWs = { frames: p.wsSent.filter((w) => DEV_TOOLING(w.url)).length, note: 'Next dev hot reload only; absent from a production build' };
      const setItems = a.writes.filter((w: Json) => w.op === 'setItem');
      out.poseModelLocal = a.writes.filter((w: Json) => w.where === 'localStorage' && w.key === 'fel.pose.model').length;
      out.nonSessionWrites = a.writes.filter((w: Json) => w.where !== 'sessionStorage').length;
      if (kid) {
        out.kidWritesBeyondAge = a.writes.filter((w: Json) => !(w.where === 'sessionStorage' && w.op === 'setItem' && w.key === AGE_KEY)).length;
        out.ageWrites = setItems.filter((w: Json) => w.key === AGE_KEY).length;
        out.pass = out.posts.length === 0 && out.uploads.length === 0 && out.kidWritesBeyondAge === 0 && out.ageWrites === 1
          && Object.keys(j.session).join() === AGE_KEY && !Object.keys(j.local).length && !j.idb.length && !j.cookies.length && !p.setCookies.length
          && out.results?.kind === 'kid';
      } else {
        out.adultOnlyScreenSession = a.writes.every((w: Json) => w.where === 'sessionStorage' && String(w.key).startsWith('fel.screen.'));
        out.pass = out.posts.length === 0 && out.uploads.length === 0 && out.adultOnlyScreenSession
          && Object.keys(j.session).every((k) => k.startsWith('fel.screen.')) && !Object.keys(j.local).length && !j.idb.length && !j.cookies.length
          && !p.setCookies.length && out.results?.kind === 'adult';
      }
    } catch (e) {
      out.error = String(e); out.pass = false; out.errorShot = await p.shot('error').catch(() => null);
      out.jar = await jar(p).catch(() => null);
      out.writes = (await audit(p).catch(() => ({ writes: [] }))).writes;
    }
    out.pageErrors = p.errors;
    report.bands[band] = out;
    save('audit', report);
    await p.ctx.close();
  }
} finally {
  await browser.close();
}

const bands = Object.values(report.bands) as Json[];
report.verdict = {
  pass: bands.every((b) => b.pass),
  posts: bands.reduce((n, b) => n + (b.posts?.length ?? 0), 0),
  uploads: bands.reduce((n, b) => n + (b.uploads?.length ?? 0), 0),
  adultWritesSessionOnly: bands.filter((b) => !b.kid).every((b) => b.adultOnlyScreenSession),
  kidWritesBeyondAge: bands.filter((b) => b.kid).reduce((n, b) => n + (b.kidWritesBeyondAge ?? 0), 0),
  kidAgeWrites: bands.filter((b) => b.kid).map((b) => b.ageWrites),
  poseModelLocalStorage: bands.reduce((n, b) => n + (b.poseModelLocal ?? 0), 0),
  setCookies: bands.reduce((n, b) => n + (b.setCookies?.length ?? 0), 0),
};
const f = save('audit', report);
console.log(`AUDIT ${report.verdict.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(report.verdict)} → ${f}`);
process.exit(report.verdict.pass ? 0 : 1);
