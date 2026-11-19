// hoops-followups (2026-11-18): every-screen reads /play/onevone and /play/threevthree on their loading card — its browser has no WebGL,
// so the game never reaches READY and the touch deck PR #665 changed (the 44 px d-pad, the hollow cross on 1v1 / 3v3) is never on
// screen. This opens the same production build on the same rig (scripts/every-screen/rig.mts: next start, the local throwaway database,
// signed in as the rig's adult "solo"), in Chromium with SwiftShader WebGL as a touch phone, waits for TAP TO START, taps it, plays a
// few seconds, and reads what is on screen in play:
//   the touch deck's controls as drawn (each one's rect, the smallest, overlaps between them, any outside the screen), the d-pad's
//   shape (hollow / row / cross) and whether a hollow cross takes taps, every other visible control under 44 px, page errors;
//   and a JPG per page and orientation.
//   ES_OUT=<dir> ES_PORT=3821 ES_PG_PORT=55821 ES_PG_DIR=... ES_DIST=.next-es-hf \
//     /home/user/wt/gate-run.sh 1500 npx tsx scripts/probes/hoops-followups/inplay.mts <outDir>
// Control: the page must reach 'playing' (TAP TO START gone, the deck mounted), or the row says so and is not read as a pass.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { dbUp, people as makePeople, serve, storageState, ORIGIN } from '../../every-screen/rig.mts';

const out = path.resolve(process.argv[2] ?? '.');
fs.mkdirSync(out, { recursive: true });
const ROUTES = (process.env.ROUTES ?? '/play/onevone,/play/threevthree').split(',');
const VIEWS = (process.env.VIEWS ?? '390x844,844x390').split(',').map((v) => v.split('x').map(Number) as [number, number]);
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));

dbUp();
const stop = await serve(path.join(out, 'server.log'));
const rows: Record<string, unknown>[] = [];
try {
  const ppl = await makePeople();
  const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const route of ROUTES) for (const [w, h] of VIEWS) {
    const ctx = await b.newContext({ storageState: storageState(ppl, 'solo') as never, viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    // tsx wraps named arrow functions in __name(); the page has no such helper (the perf sweep shims it the same way)
    await ctx.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
    const p = await ctx.newPage();
    const errs: string[] = [];
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
    const t0 = Date.now();
    const row: Record<string, unknown> = { route, view: `${w}x${h}` };
    try {
      await p.goto(ORIGIN + route, { waitUntil: 'domcontentloaded', timeout: 120000 });
      const start = p.getByText(/^TAP TO START$/).first();
      await start.waitFor({ state: 'visible', timeout: 420000 });
      row.readyS = Math.round((Date.now() - t0) / 1000);
      await p.waitForTimeout(1500);
      const box = await start.boundingBox();
      if (box) await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await p.waitForTimeout(6000);
      row.startGone = !(await start.isVisible().catch(() => false));
      Object.assign(row, await p.evaluate(() => {
        const r = (el: Element) => { const q = el.getBoundingClientRect(); return { x: +q.left.toFixed(1), y: +q.top.toFixed(1), w: +q.width.toFixed(1), h: +q.height.toFixed(1) }; };
        const seen = (el: Element) => { const q = el.getBoundingClientRect(); const s = getComputedStyle(el); return q.width > 0 && q.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
        const deck = document.querySelector('[data-touch-deck]');
        const ctrls = deck ? [...deck.querySelectorAll('button, [data-float-stick], div.h-24.w-24.rounded-full')].filter(seen) : [];
        const label = (e: Element) => (e.getAttribute('aria-label') || e.textContent || (e.hasAttribute('data-float-stick') ? 'MOVE(float)' : '')).trim().slice(0, 18);
        const deckCtrls = ctrls.map((e) => ({ label: label(e), dpad: e.getAttribute('data-dpad'), ...r(e) }));
        const shape = deck?.querySelector('[data-dpad-shape]');
        const hollow = deck?.querySelector('[data-dpad-shape="hollow"]');
        const hollowTakesTaps = hollow ? getComputedStyle(hollow).pointerEvents !== 'none' || !!hollow.querySelector('button') : null;
        const interactive = [...document.querySelectorAll('button, a[href], [role="button"], input, select, textarea')].filter(seen)
          .filter((e) => !e.closest('[aria-hidden="true"]'));
        // dock-sideways: the tap area AS THE BROWSER HIT-TESTS IT (elementFromPoint over the control and 20 px around it, 1 px steps):
        // an invisible box (a pseudo-element, a padded wrapper) counts, a control something else covers does not
        const hit = (el: Element) => {
          const q = el.getBoundingClientRect(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (let y = Math.floor(q.top - 20); y <= q.bottom + 20; y++) for (let x = Math.floor(q.left - 20); x <= q.right + 20; x++) {
            const e = document.elementFromPoint(x + 0.5, y + 0.5);
            if (e && (e === el || el.contains(e))) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          }
          return x1 < x0 ? { hitW: 0, hitH: 0 } : { hitW: x1 - x0 + 1, hitH: y1 - y0 + 1 };
        };
        const small = interactive.map((e) => ({ label: label(e), ...r(e), ...hit(e) })).filter((q) => Math.min(q.w, q.h) < 44);
        const dock = [...document.querySelectorAll('[data-fel-corner] a, [data-fel-corner] button, [data-capture-ui] button')].filter(seen)
          .map((e) => ({ label: label(e), ...r(e), ...hit(e) }));
        return { deckMounted: !!deck, dpadShape: shape?.getAttribute('data-dpad-shape') ?? null, hollowRect: hollow ? r(hollow) : null, hollowTakesTaps, deckCtrls,
          smallControls: small, smallHit: small.filter((q) => Math.min(q.hitW, q.hitH) < 44), dock, phase: (window as unknown as { __phase?: string }).__phase ?? null };
      }));
      const dc = row.deckCtrls as Array<{ label: string; x: number; y: number; w: number; h: number }>;
      const ov = (a: typeof dc[0], c: typeof dc[0]) => Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
      row.smallestDeckPx = dc.length ? Math.min(...dc.map((c) => Math.min(c.w, c.h))) : null;
      row.deckOverlaps = dc.flatMap((a, i) => dc.slice(i + 1).filter((c) => ov(a, c) > 0.5).map((c) => `${a.label} x ${c.label} ${ov(a, c).toFixed(0)} px2`));
      row.deckOffScreen = dc.filter((c) => c.x < -0.5 || c.y < -0.5 || c.x + c.w > w + 0.5 || c.y + c.h > h + 0.5).map((c) => c.label);
      const shot = path.join(out, `inplay-${route.split('/').pop()}-${w}x${h}.jpg`);
      await p.screenshot({ path: shot, type: 'jpeg', quality: 80 });
      row.shot = shot;
    } catch (e) {
      row.failed = String((e as Error).message).slice(0, 200);
      const shot = path.join(out, `inplay-${route.split('/').pop()}-${w}x${h}-failed.jpg`);
      await p.screenshot({ path: shot, type: 'jpeg', quality: 70 }).catch(() => {});
    }
    row.pageErrors = errs;
    row.realS = Math.round((Date.now() - t0) / 1000);
    rows.push(row);
    fs.writeFileSync(path.join(out, 'inplay.json'), JSON.stringify(rows, null, 1));
    const dc = (row.deckCtrls as Array<{ label: string; w: number; h: number }> | undefined) ?? [];
    console.log(`${route.padEnd(18)} ${row.view} ${row.failed ? `FAILED ${row.failed}` : `ready ${row.readyS}s · started ${row.startGone} · d-pad ${row.dpadShape} (hollow takes taps: ${row.hollowTakesTaps}) · deck ${dc.map((c) => `${c.label} ${c.w}x${c.h}`).join(', ')} · smallest ${row.smallestDeckPx} · overlaps ${(row.deckOverlaps as string[]).length} · off screen ${(row.deckOffScreen as string[]).join(',') || 'none'} · small controls (by tap area) ${JSON.stringify(row.smallHit)} · dock ${((row.dock ?? []) as Array<{ label: string; w: number; h: number; hitW: number; hitH: number }>).map((d) => `${d.label} drawn ${d.w}x${d.h} taps ${d.hitW}x${d.hitH}`).join(', ') || 'none'}`} · errors ${errs.length}`);
    await ctx.close();
  }
  await b.close();
} finally { stop(); }
