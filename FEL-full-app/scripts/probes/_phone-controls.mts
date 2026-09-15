// PHONE CONTROLS — the friend-test bar's last line: "phone controls work" (FINISH-RELEASE, 2026-09-15).
// Per shipping route on a touch phone viewport (390×844, hasTouch, isMobile): sign in, open, start with a TAP, then check the
// touch rig is on screen (the MOVE stick + the live verb buttons from modeVerbs), tap-and-hold every live verb, and read
// window.__FEL_QA__ (lib/babylon/core/QaTrace) to prove each tap reached the mode as a press AND got a perceivable answer.
//   BASE=http://127.0.0.1:3096 MODES=all npx tsx scripts/probes/_phone-controls.mts
import { chromium, devices } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const MV: any = await import('../../lib/babylon/ui/modeVerbs');
const { MODE_VERBS } = (MV.MODE_VERBS ? MV : MV.default);
const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/phone`; fs.mkdirSync(OUT, { recursive: true });
const ROUTES: [string, string][] = [
  ['dunk', '/play/dunk'], ['karate', '/play/karate'], ['football', '/play/football'], ['skateboard', '/play/skateboard'],
  ['snowboard_slalom', '/play/snowboard'], ['surf', '/play/surf'], ['tennis', '/play/tennis'], ['derby', '/play/baseball'],
  ['penalty', '/play/soccer'], ['golf', '/play/golf'], ['onevone', '/play/onevone'], ['threevthree', '/play/threevthree'],
  ['karate_vs', '/play/karate-vs'], ['mixedcombat', '/play/mixedcombat'], ['sprint', '/play/sprint'], ['showdown', '/play/showdown'],
  ['duel', '/play/duel'], ['volleyball', '/play/volleyball'], ['dance', '/play/dance'], ['who_scene_it', '/play/who-scene-it'],
  ['freerun', '/play/freerun'], ['threepoint', '/play/threepoint'], ['bigair', '/play/big-air'], ['aeroaces', '/play/aero-aces'],
  ['velocitykart', '/play/velocity-kart'], ['brainbrawl', '/play/brain-brawl'],
];
const pick = (process.env.MODES ?? 'all').split(',');
const run = pick[0] === 'all' ? ROUTES : ROUTES.filter(([s]) => pick.includes(s));
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
await ctx.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
{
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForTimeout(800);
  if (/\/login/.test(p.url())) { await p.fill('input[type="email"]', 'playtest@fel.local'); await p.fill('input[type="password"]', 'playtest-local-only'); await p.click('button[type="submit"]'); const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(p.url())) await p.waitForTimeout(300); }
  await p.close();
}
const rows: Record<string, unknown>[] = [];
for (const [slug, path] of run) {
  const p = await ctx.newPage();
  const errs: string[] = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  const row: Record<string, unknown> = { slug };
  try {
    await p.goto(`${BASE}${path}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const lobby = p.getByRole('button', { name: /START THE NIGHT/i }); await p.waitForTimeout(1500); if (await lobby.count()) await lobby.first().tap().catch(() => {});
    const t0 = Date.now(); let st = '';
    while (Date.now() - t0 < 120000) { st = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (st === 'loaded') break; await p.waitForTimeout(400); }
    if (st !== 'loaded') { row.note = `not ready (${st}) at ${p.url()} after ${Math.round((Date.now() - t0) / 1000)}s`; await p.screenshot({ path: `${OUT}/${slug}-noready.png` }); throw new Error('not ready'); }
    await p.waitForTimeout(600);
    const start = p.getByRole('button', { name: /TAP TO START/i });
    if (await start.count()) await start.first().tap(); else await p.tap('canvas');
    await p.waitForTimeout(1200);
    row.playing = (await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '')) === 'playing';
    const cfg = MODE_VERBS[slug] ?? MODE_VERBS.default;
    const live = cfg.buttons.filter((x: any) => x.emit && x.label);
    row.stick = await p.getByText('MOVE', { exact: true }).count() > 0;
    const results: Record<string, string> = {};
    for (const v of live) {
      const btn = p.locator('button', { hasText: new RegExp(`^${v.label}$`) }).first();
      if (!(await btn.count())) { results[v.label] = 'MISSING'; continue; }
      const from = await p.evaluate(() => (window as any).__FEL_QA__?.now() ?? 0);
      const box = await btn.boundingBox();
      if (!box) { results[v.label] = 'NO BOX'; continue; }
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const cdp = await ctx.newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await p.waitForTimeout(v.hold ? 700 : 90);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(500);
      const s = await p.evaluate((f) => { const q = (window as any).__FEL_QA__; if (!q) return null; const sum = q.summary(900, f); return { presses: sum.presses, answered: sum.answered }; }, from);
      // a tap must reach the mode as a PRESS (a held trigger counts when it crosses half); a hold's answer is often motion the
      // tracer does not count (speed, a throttle), so a hold passes on the press alone, a tap needs a perceivable answer too
      results[v.label] = !s ? 'no QA' : s.presses === 0 ? 'NO PRESS' : s.answered > 0 || v.hold ? 'ok' : 'SILENT';
    }
    row.verbs = results;
    await p.screenshot({ path: `${OUT}/${slug}.png` });
    const bad = Object.values(results).filter((r) => r !== 'ok');
    row.pass = !!row.playing && !!row.stick && bad.length === 0 && errs.length === 0;
  } catch (e) { if (!row.note) row.note = String((e as Error).message).slice(0, 120); row.pass = false; }
  row.errors = errs.slice(0, 3);
  rows.push(row); console.log(JSON.stringify(row));
  await p.close();
}
fs.writeFileSync(`${OUT}/phone-controls.json`, JSON.stringify(rows, null, 1));
console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} PASS`);
for (const r of rows as any[]) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${String(r.slug).padEnd(16)} playing=${r.playing} stick=${r.stick} ${JSON.stringify(r.verbs ?? {})} ${r.note ?? ''}`);
await b.close();
