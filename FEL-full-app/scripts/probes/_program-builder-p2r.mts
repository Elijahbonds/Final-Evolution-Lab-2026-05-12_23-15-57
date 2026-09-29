// MIRROR-COACH P2 review (2026-09-26) — the builder's two new lines, live on the lane's dev server (/dev/program-builder,
// the REAL builder over the in-memory store; the lane's database is offline on purpose): a load whose RPE contradicts
// the band says so, and a timed item shows an "Each set" box that keeps "each side". Desktop and phone frames.
// Run: /opt/homebrew/Cellar/node/26.8.2/bin/node --experimental-strip-types scripts/probes/_program-builder-p2r.mts <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
const OUT = process.argv[2] ?? '/tmp/program-builder-p2r';
mkdirSync(OUT, { recursive: true });
const checks: { name: string; pass: boolean; detail?: unknown }[] = [];
const check = (name: string, pass: boolean, detail?: unknown) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`, detail ?? ''); };

for (const [tag, width] of [['desktop', 1280], ['phone', 390]] as const) {
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(`${BASE}/dev/program-builder?reset=1`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.getByTestId('program-builder').getByText('Day 1 — lower').waitFor({ timeout: 120_000 });
    const d1 = page.locator('[data-session]').first();
    // a breath item added to the cool-down starts with NO load (it read "@ RPE7" on the client's Today)
    await d1.getByLabel('Exercise to add').selectOption('pe-breath');
    await d1.getByLabel('Section to add into').selectOption('cooldown');
    await d1.getByRole('button', { name: 'Add exercise' }).click();
    await page.getByRole('button', { name: /^Edit Crocodile/ }).waitFor({ timeout: 30_000 });
    const rowText = await d1.innerText();
    check(`${tag}: a breath item added to the cool-down carries no "@ RPE7"`, !/RPE7/.test(rowText), rowText.split('\n').filter((l) => /×/.test(l)));
    await d1.getByLabel('Exercise to add').selectOption('pe-tbdl');
    await d1.getByLabel('Section to add into').selectOption('key');
    await d1.getByRole('button', { name: 'Add exercise' }).click();
    const edit = page.getByRole('button', { name: 'Edit Trap-bar deadlift' });
    await edit.waitFor({ timeout: 30_000 });
    await edit.click();
    const editor = page.getByTestId('exercise-editor');
    await editor.waitFor();
    // the band contradiction
    await editor.getByText('Load', { exact: true }).locator('..').locator('input').fill('RPE7');
    await editor.getByRole('radio', { name: /^Surge/ }).click();
    const mismatch = editor.getByRole('status');
    const text = (await mismatch.count()) ? await mismatch.innerText() : '';
    check(`${tag}: a load RPE7 beside Surge is flagged`, /reads as Drive, but the band is Surge/.test(text), text);
    // the timed per-set text
    await editor.getByText('Timed', { exact: true }).click();
    await editor.getByText('Work s / set', { exact: true }).locator('..').locator('input').fill('30');
    const each = editor.getByPlaceholder('e.g. each side');
    check(`${tag}: a timed item shows the "Each set" box`, (await each.count()) === 1);
    if (await each.count()) await each.fill('each side');
    await page.waitForTimeout(250);
    await editor.screenshot({ path: join(OUT, `${tag}-editor.png`) });
    check(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 3));
  } catch (e) {
    check(`${tag}: ran`, false, String(e).slice(0, 300));
    await page.screenshot({ path: join(OUT, `${tag}-error.png`), fullPage: true }).catch(() => {});
  } finally { await browser.close(); }
}
writeFileSync(join(OUT, 'proof.json'), `${JSON.stringify({ base: BASE, date: new Date().toISOString(), checks }, null, 2)}\n`);
process.exitCode = checks.every((c) => c.pass) ? 0 : 1;
