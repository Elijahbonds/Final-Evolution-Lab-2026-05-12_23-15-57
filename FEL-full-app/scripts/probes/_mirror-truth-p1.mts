// MIRROR-COACH P1 (2026-09-25) — the Mirror's truth fixes, looked at in a real browser on the lane's dev server.
//
// /dev/mirror-truth mounts the same MirrorHarness as /play/mirror without the sign-in gate (the lane's database is
// offline). A fake camera (Chromium's test pattern — no person in it) is enough to check what does not need a body:
//   1. the squat's four checks: the knee row says it is measured (not "recording"), never "fault"; the arm row names the sideways read
//   2. the guided squat runs its stage step live: 'breathe' → 'check' on the pose clock after 3 × 12 s
//   3. the screen picker: Full is selectable, and the screen session starts on it without an error
//   4. no page errors anywhere
// It cannot finish a screen (that needs a person in frame), so the not-graded panel is held by the unit tests.
//
// Run: node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-truth-p1.mts [outDir]
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
const OUT = process.argv[2] ?? '/tmp';
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

const browser = await chromium.launch({
  headless: true, executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const ctx = await browser.newContext({ viewport: { width: 1180, height: 1400 }, permissions: ['camera'] });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });

try {
  await page.goto(`${BASE}/dev/mirror-truth`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await page.getByRole('tab', { name: 'Corrective Squat' }).waitFor({ timeout: 240_000 });

  // hydration: a click on the server-rendered tab before React attaches does nothing, so click until it takes
  const selectTab = async (name: string) => {
    const tab = page.getByRole('tab', { name });
    for (let i = 0; i < 60; i++) {
      await tab.click();
      if ((await tab.getAttribute('aria-selected')) === 'true') return true;
      await page.waitForTimeout(1_000);
    }
    return false;
  };

  // 1. the four checks
  check('the squat tab takes (page hydrated)', await selectTab('Corrective Squat'));
  const checks = await page.locator('ul li').filter({ hasText: /Knees track over toes|Heels stay down|Shoulders stay centred|Weight stays centred/ }).allInnerTexts();
  const knee = checks.find((t) => /Knees track over toes/.test(t)) ?? '';
  check('before the camera starts, no row claims anything (was "Estimated stable")', checks.length === 4 && checks.every((t) => /Waiting for the camera/i.test(t) && !/stable|fault/i.test(t)), checks.map((t) => t.replace(/\n/g, ': ')).join(' | '));
  check('the knee row never says fault', !/fault/i.test(knee), JSON.stringify(knee));
  check('arm row names the sideways read', checks.some((t) => /Shoulders stay centred/.test(t)), checks.map((t) => t.split('\n')[0]).join(' | '));
  await page.screenshot({ path: `${OUT}/squat-checks-idle.png` });

  // 2. the live stage step: breathe → check on the pose clock
  await page.getByRole('button', { name: 'Start session' }).click();
  const live = await page.getByText('Live', { exact: true }).waitFor({ timeout: 180_000 }).then(() => true).catch(() => false);
  check('the squat session goes live on a fake camera', live);
  if (live) {
    // (the HUD chip is CSS-uppercased, so innerText reads BREATHE)
    const hud = page.locator('span').filter({ hasText: /^(breathe|check|work|review)$/i }).first();
    const first = (await hud.innerText().catch(() => '')).trim().toLowerCase();
    check('the session opens on the breath', first === 'breathe', first);
    await page.waitForTimeout(38_000);
    const later = (await hud.innerText().catch(() => '')).trim().toLowerCase();
    check('after three breath cycles the pure step hands over to the check', later === 'check', later);
    const rows = await page.locator('ul li').filter({ hasText: /Knees track over toes|Heels stay down|Shoulders stay centred|Weight stays centred/ }).allInnerTexts();
    check('live with no body in frame, every row says "Not in view" (was "Estimated stable")', rows.length === 4 && rows.every((t) => /Not in view/i.test(t) && !/stable/i.test(t)), rows.map((t) => t.replace(/\n/g, ': ')).join(' | '));
    const caption = await page.locator('p').filter({ hasText: 'The movement check.' }).first().innerText().catch(() => '');
    check('the check caption counts squat 1 of 3 and names shoulders, not chest', /shoulders and shift/.test(caption) && /Squat 1 of 3/.test(caption), caption.replace(/\s+/g, ' ').slice(0, 140));
    await page.screenshot({ path: `${OUT}/squat-live-check.png` });
    await page.getByRole('button', { name: 'End session' }).click();
  }

  // 3. the screen picker follows through to the session
  await selectTab('Movement Screen');
  const full = page.getByRole('button', { name: /Full screen/ });
  await full.click();
  check('Full is selectable', (await full.getAttribute('aria-pressed')) === 'true');
  await page.screenshot({ path: `${OUT}/screen-picker-full.png` });
  await page.getByRole('button', { name: 'Start session' }).click();
  const screenLive = await page.getByText('Live', { exact: true }).waitFor({ timeout: 180_000 }).then(() => true).catch(() => false);
  check('a Full screen session starts', screenLive);
  if (screenLive) {
    await page.waitForTimeout(3_000);
    const say = await page.locator('p').filter({ hasText: /Turn all the way around|Step back|Move|frame|camera/i }).first().innerText().catch(() => '');
    check('the screen HUD speaks its first station (positioning, no body in a test pattern)', say.length > 0, say.slice(0, 120));
    const bodyText = await page.locator('body').innerText();
    check('no "Red flags" label anywhere', !/Red flags/.test(bodyText));
    await page.screenshot({ path: `${OUT}/screen-live-full.png` });
    await page.getByRole('button', { name: 'End session' }).click();
  }
} catch (e) {
  check('probe ran to the end', false, String(e).slice(0, 300));
} finally {
  // Known and not this pass's: the lane has no public/models/candidate.glb (the overlay rig; the harness already
  // survives its absence), and MediaPipe's wasm logs its XNNPACK delegate on console.error.
  const real = errors.filter((e) => !/favicon|DevTools|Download the React DevTools|net::ERR_|Failed to load resource|WebGL|GPU stall|webpack-hmr|candidate\.glb|XNNPACK/i.test(e));
  check('no page errors', real.length === 0, real.slice(0, 5).join(' || '));
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nmirror-truth probe: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
