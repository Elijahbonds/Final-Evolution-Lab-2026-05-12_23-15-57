// SCREEN-SHIP Squad probe: gate 4, a denied and a missing camera, portrait, on the production build at :3141. The
// camera is stubbed in the page (getUserMedia rejects with NotAllowedError, or NotFoundError with no devices), and
// counted: each shows a FULL-SCREEN card (no header, no banner) with a reason, Retry and a next step; Retry asks once
// more. Also: /play/mirror/assess renders for a guest with 0 page errors and 0 console errors.
//
// Run from FEL-full-app (Node 26): node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/probes/_screen-squad-camera.mts
import { BASE, launch, portrait, save, type Json } from './_screen-squad-lib.mts';

const STUB = (name: 'NotAllowedError' | 'NotFoundError') => `
  window.__gum = 0;
  const md = navigator.mediaDevices || (navigator.mediaDevices = {});
  md.getUserMedia = () => { window.__gum++; return Promise.reject(new DOMException('stubbed', '${name}')); };
  md.enumerateDevices = () => Promise.resolve(${name === 'NotFoundError' ? '[]' : "[{ kind: 'videoinput', deviceId: 'x', label: '', groupId: 'g' }]"});
`;
const report: Json = { base: BASE, date: new Date().toISOString() };
const browser = await launch();
try {
  for (const [kind, err] of [['denied', 'NotAllowedError'], ['missing', 'NotFoundError']] as const) {
    const p = await portrait(browser, `G4-${kind}`, { init: STUB(err) });
    await p.page.goto(`${BASE}/play/mirror/assess`);
    await p.page.waitForSelector('[data-step="start"]');
    await p.page.click('[data-step="start"] [data-primary]');
    await p.page.click('[data-age="18+"]');
    await p.page.click('[data-pain="no"]');
    await p.page.waitForSelector('[data-camera-card]', { timeout: 20_000 });
    const box = await p.page.locator('[data-camera-card]').boundingBox();
    const vp = p.page.viewportSize()!;
    const out: Json = {
      card: await p.page.getAttribute('[data-camera-card]', 'data-camera-card'),
      fullScreen: !!box && box.x === 0 && box.y === 0 && Math.round(box.width) === vp.width && Math.round(box.height) >= vp.height,
      // an error banner would be a header, or an alert/banner with words in it (Next's route announcer is an empty alert)
      box, header: await p.page.locator('header').count(),
      banner: await p.page.locator('[role="alert"], [role="banner"]').evaluateAll((els) => els.filter((e) => (e.textContent ?? '').trim().length > 0).length),
      title: await p.page.locator('#camera-card-title').textContent(),
      text: (await p.page.locator('[data-camera-card]').innerText()).slice(0, 600),
      gumBefore: await p.page.evaluate(() => (window as unknown as { __gum: number }).__gum),
      shot: await p.shot('card'),
    };
    await p.page.click('[data-retry]');
    await p.page.waitForTimeout(1500);
    out.gumAfterRetry = await p.page.evaluate(() => (window as unknown as { __gum: number }).__gum);
    out.stillCard = await p.page.getAttribute('[data-camera-card]', 'data-camera-card');
    out.errors = p.errors; out.consoleErrors = p.consoleErrors;
    report[kind] = out;
    await p.ctx.close();
  }
  // the guest render check
  {
    const p = await portrait(browser, 'R-assess-guest');
    await p.page.goto(`${BASE}/play/mirror/assess`);
    await p.page.waitForSelector('[data-step="start"]');
    await p.page.waitForTimeout(1500);
    report.render = {
      title: await p.page.locator('h1').first().textContent(), start: await p.page.locator('[data-step="start"] [data-primary]').textContent(),
      preview: await p.page.locator('[data-preview-label]').first().textContent(), errors: p.errors, consoleErrors: p.consoleErrors,
      requests: p.reqs.map((r) => `${r.method} ${r.url.replace(BASE, '')} ${r.type}`), shot: await p.shot('start'),
    };
    await p.ctx.close();
  }
  // PR #22's /play/mirror alongside PR #20: sign-in only by its own design (a guest gets /login), so rendered signed in
  // with the throwaway account in the throwaway database
  if (process.env.SCREEN_PW_FILE) {
    const p = await portrait(browser, 'R-mirror-signed-in');
    const pw = (await import('node:fs')).readFileSync(process.env.SCREEN_PW_FILE, 'utf8').trim();
    const csrf = await (await p.ctx.request.get(`${BASE}/api/auth/csrf`)).json();
    await p.ctx.request.post(`${BASE}/api/auth/callback/credentials`, { form: { csrfToken: csrf.csrfToken, email: 'screen-ship-adult@throwaway.test', password: pw, json: 'true' }, maxRedirects: 0 });
    const doc = await p.ctx.request.get(`${BASE}/play/mirror`, { maxRedirects: 0 });
    p.errors.length = 0; p.consoleErrors.length = 0;
    await p.page.goto(`${BASE}/play/mirror`);
    await p.page.waitForLoadState('networkidle').catch(() => {});
    await p.page.waitForTimeout(2500);
    report.mirrorSignedIn = {
      status: doc.status(), url: p.page.url(), title: (await p.page.locator('h1, h2').first().textContent().catch(() => null)),
      errors: p.errors, consoleErrors: p.consoleErrors, shot: await p.shot('mirror'),
    };
    await p.ctx.close();
  }
} finally {
  await browser.close();
}
save('camera-report', report);
console.log(JSON.stringify(report, null, 1).slice(0, 5000));
