// SCREEN-SHIP Squad probe: privacy (gate 5) and the pain gate, portrait, on the production build at :3141, WITHOUT
// ?agent=1 (so no QA key is stored either). getUserMedia is counted (never granted).
//
//   P1  /screen?src=qr → the start → the age question: every request logged; none may be made after the document and
//       its same-origin static assets (no /api/*, no analytics, no third party); every storage empty before the answer.
//   P2  an adult who says something hurts: the pain stop, no camera asked for, nothing stored, nothing sent.
//   P3  under 18 and "rather not say": nothing stored before consent; a reload or the back button at the consent step
//       lands back at the start, with nothing stored.
//   P4  deep links to the results and the lane page in a fresh tab: "Your results aren't saved", nothing stored; Back
//       and reload the same.
//
// Run from FEL-full-app (Node 26): node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/probes/_screen-squad-privacy.mts
import { BASE, classify, launch, portrait, save, storage, type Json, type Probe } from './_screen-squad-lib.mts';

const COUNT_GUM = `
  window.__gum = 0;
  const md = navigator.mediaDevices;
  if (md) {
    const real = md.getUserMedia?.bind(md);
    md.getUserMedia = (c) => { window.__gum++; return real ? real(c) : Promise.reject(new DOMException('no', 'NotAllowedError')); };
  }
`;
const empty = (s: Json) => Object.keys(s.local).length === 0 && Object.keys(s.session).length === 0 && s.idb.length === 0 && s.cookies.length === 0;
const report: Json = { base: BASE, date: new Date().toISOString() };
const offenders = (p: Probe, phase?: string) => p.reqs.filter((r) => !phase || r.phase === phase).map((r) => ({ url: r.url, method: r.method, type: r.type, kind: classify(r) })).filter((r) => !['document', 'static'].includes(r.kind));

const browser = await launch();
try {
  // P1 + P2
  {
    const p = await portrait(browser, 'P1-adult', { init: COUNT_GUM });
    p.phase.v = 'before-age';
    await p.page.goto(`${BASE}/screen?src=qr`);
    await p.page.waitForSelector('[data-step="start"]');
    const atStart = await storage(p);
    await p.page.click('[data-step="start"] [data-primary]');
    await p.page.waitForSelector('[data-step="age"]');
    await p.page.waitForTimeout(1500);                    // anything a page would send on its own, it has sent by now
    const atAge = await storage(p);
    const beforeAge = p.reqs.map((r) => ({ url: r.url.replace(BASE, ''), method: r.method, type: r.type, kind: classify(r) }));
    await p.shot('age');
    p.phase.v = 'after-age';
    await p.page.click('[data-age="18+"]');
    await p.page.waitForSelector('[data-step="pain"]');
    await p.page.click('[data-pain="yes"]');
    await p.page.waitForSelector('[data-step="pain-stop"]');
    await p.page.waitForTimeout(1000);
    const stopText = await p.page.locator('[data-pain-stop]').textContent();
    report.P1 = {
      landed: p.page.url(), storageAtStart: atStart, storageAtAge: atAge, emptyBeforeAge: empty(atStart) && empty(atAge),
      beforeAge, notAllowedBeforeAge: beforeAge.filter((r) => !['document', 'static'].includes(r.kind)),
      errors: p.errors, consoleErrors: p.consoleErrors,
    };
    report.P2 = {
      stopText, gumCalls: await p.page.evaluate(() => (window as unknown as { __gum: number }).__gum), checkScreens: await p.page.locator('[data-step="camera"], [data-rep-dots]').count(),
      storage: await storage(p), afterAgeRequests: offenders(p, 'after-age'), shot: await p.shot('pain-stop'),
    };
    await p.ctx.close();
  }
  // P3: under 18, and an age not given
  for (const age of ['under-18', 'unknown'] as const) {
    const p = await portrait(browser, `P3-${age}`, { init: COUNT_GUM });
    await p.page.goto(`${BASE}/screen`);
    await p.page.waitForSelector('[data-step="start"]');
    await p.page.click('[data-step="start"] [data-primary]');
    await p.page.click(`[data-age="${age}"]`);
    await p.page.waitForSelector('[data-step="consent"]');
    const atConsent = await storage(p);
    await p.shot('consent');
    const continueDisabled = await p.page.locator('[data-step="consent"] [data-primary]').isDisabled();
    await p.page.reload();
    await p.page.waitForSelector('[data-step]');
    const afterReload = { step: await p.page.getAttribute('[data-step]', 'data-step'), storage: await storage(p) };
    await p.page.click('[data-step="start"] [data-primary]');
    await p.page.click(`[data-age="${age}"]`);
    await p.page.waitForSelector('[data-step="consent"]');
    await p.page.goBack().catch(() => null);
    await p.page.goForward().catch(() => null);
    await p.page.waitForSelector('[data-step]');
    const afterBack = { url: p.page.url(), step: await p.page.getAttribute('[data-step]', 'data-step'), storage: await storage(p) };
    // a deep link to the results in this tab, mid-consent
    await p.page.goto(`${BASE}/play/mirror/assess/results`);
    await p.page.waitForSelector('[data-not-saved], [data-screen-results]');
    const deep = { notSaved: await p.page.locator('[data-not-saved]').count() === 1, storage: await storage(p) };
    report[`P3-${age}`] = {
      atConsent, emptyAtConsent: empty(atConsent), continueDisabled, afterReload, afterBack, deep,
      gumCalls: await p.page.evaluate(() => (window as unknown as { __gum: number }).__gum), requests: offenders(p), errors: p.errors, consoleErrors: p.consoleErrors,
    };
    await p.ctx.close();
  }
  // P4: deep links in a fresh tab
  {
    const p = await portrait(browser, 'P4-deeplink');
    const out: Json = {};
    for (const path of ['/play/mirror/assess/results', '/screen/program/dunking', '/screen/program/posture']) {
      await p.page.goto(`${BASE}${path}`);
      await p.page.waitForSelector('[data-not-saved], [data-screen-results], [data-lane-page]');
      const one: Json = { notSaved: await p.page.locator('[data-not-saved]').count() === 1, lane: await p.page.locator('[data-lane-page]').count(), storage: await storage(p), shot: await p.shot(path.replace(/\W+/g, '_')) };
      await p.page.reload();
      await p.page.waitForSelector('[data-not-saved], [data-screen-results], [data-lane-page]');
      one.afterReload = await p.page.locator('[data-not-saved]').count() === 1;
      out[path] = one;
    }
    await p.page.goBack();
    await p.page.waitForSelector('[data-not-saved], [data-screen-results], [data-lane-page]');
    out.afterBack = { url: p.page.url(), notSaved: await p.page.locator('[data-not-saved]').count() === 1 };
    out.requests = offenders(p); out.errors = p.errors; out.consoleErrors = p.consoleErrors;
    report.P4 = out;
    await p.ctx.close();
  }
} finally {
  await browser.close();
}
save('privacy-report', report);
console.log(JSON.stringify(report, (k, v) => (k === 'beforeAge' ? v.length : v), 1).slice(0, 7000));
