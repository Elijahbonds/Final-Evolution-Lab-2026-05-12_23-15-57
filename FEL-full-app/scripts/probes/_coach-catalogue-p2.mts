// MIRROR-COACH P2 (2026-09-25) — LIVE PROOF of the catalogue plumbing on the lane's dev server (:3131).
//
// /dev/coach-catalogue renders the production Exercises tab (app/coach/_components/exercise-catalogue.tsx +
// my-catalogue.tsx) as a coach, with its catalogue fetches pointed at the real service over an in-memory store (the
// lane's database is offline). This drives it the way a coach would, one page, headless chromium:
//   1. the knowledge base with FEL's tags; open Crocodile Breathing → "Add to my catalogue"; the same for the pogos;
//      the posture audit says it is an assessment and offers no button
//   2. My catalogue lists the two copies with their tags
//   3. New exercise "Goblet Squat" — a name another coach (dev-other-coach) already owns — tagged squat / set / Strength,
//      a set-up cue from FEL's pick-list, a fault; saved; the store shows BOTH coaches own "Goblet Squat"
//   4. the same coach typing "goblet squat" again is refused, with the reason on the field
//   5. a `javascript:` video link is refused on the field
//   6. edit: link the Goblet Squat's easier version to another of the coach's own rows and see "easier:" on the row
// Frames at phone width (390) and desktop (900). Console errors are collected.
//
// Run from FEL-full-app: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_coach-catalogue-p2.mts <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
const OUT = process.argv[2] ?? '/tmp/coach-catalogue-p2';
mkdirSync(OUT, { recursive: true });
const out: Record<string, unknown> = { base: BASE, date: new Date().toISOString(), steps: [] as unknown[] };
const step = (name: string, data: Record<string, unknown> = {}) => { (out.steps as unknown[]).push({ name, ...data }); console.log(name, JSON.stringify(data)); };

// sonner's toasts are position:fixed and smear across a full-page capture, so a frame waits for them to leave first
async function shot(page: Page, name: string) {
  await page.locator('[data-sonner-toast]').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
}
const all = async () => (await (await fetch(`${BASE}/dev/coach-catalogue/api?op=all`)).json()) as { coachId: string; name: string }[];

async function run(width: number, tag: string) {
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(`${BASE}/dev/coach-catalogue?reset=1`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.getByText('Crocodile Breathing').first().waitFor({ timeout: 120_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    step(`${tag}: KB loaded`, { horizontalOverflowPx: overflow });
    await shot(page, `${tag}-1-kb`);

    // 1. Add to my catalogue from the KB detail
    await page.getByText('Crocodile Breathing').first().click();
    await page.getByRole('button', { name: /Add to my catalogue/ }).waitFor();
    await shot(page, `${tag}-2-kb-detail-croc`);
    await page.getByRole('button', { name: /Add to my catalogue/ }).click();
    await page.getByRole('button', { name: /In your catalogue/ }).waitFor({ timeout: 20_000 });
    step(`${tag}: croc added`, { button: 'In your catalogue · open it' });
    await shot(page, `${tag}-3-kb-detail-croc-added`);
    await page.keyboard.press('Escape');
    await page.locator('button:has(svg.lucide-x)').first().click().catch(() => {});
    await page.getByText('Single-Leg Pogo Hops').first().click();
    await page.getByRole('button', { name: /Add to my catalogue/ }).click();
    await page.getByRole('button', { name: /In your catalogue/ }).waitFor({ timeout: 20_000 });
    await page.locator('button:has(svg.lucide-x)').first().click();
    await page.getByText('Aston Postural Audit').first().click();
    const auditText = await page.getByText(/is an assessment, not an exercise/).textContent();
    const auditButton = await page.getByRole('button', { name: /Add to my catalogue/ }).count();
    step(`${tag}: audit`, { text: auditText, addButtons: auditButton });
    await shot(page, `${tag}-4-kb-detail-audit`);
    await page.locator('button:has(svg.lucide-x)').first().click();

    // 2. My catalogue
    await page.getByRole('tab', { name: /My catalogue/ }).click();
    await page.getByText('My catalogue · 2 exercises').waitFor();
    const tabLabel = await page.getByRole('tab', { name: /My catalogue/ }).textContent();
    step(`${tag}: my catalogue`, { tabLabel, rows: await page.getByRole('button', { name: /^Edit / }).count() });
    await shot(page, `${tag}-5-mine`);

    // 3. New exercise with a name another coach owns
    await page.getByRole('button', { name: /New exercise/ }).click();
    await page.getByPlaceholder('e.g. Goblet Squat').fill('Goblet Squat');
    const selects = page.locator('select');
    await selects.nth(0).selectOption('lower-body');
    await selects.nth(1).selectOption('squat');
    await selects.nth(2).selectOption('set');
    await selects.nth(3).selectOption('strength');
    await page.getByPlaceholder('Cue 1').fill('Elbows inside the knees');
    await page.getByRole('button', { name: 'Heel, big toe, little toe: press all three into the floor.' }).click();
    await page.getByPlaceholder('Fault').first().fill('Heels lift');
    await page.getByPlaceholder('Cue for it').first().fill('Press the whole foot down');
    await page.getByPlaceholder('https://...').fill('https://video.example/goblet.mp4');
    await shot(page, `${tag}-6-editor-filled`);
    await page.getByRole('button', { name: 'Add to catalogue' }).click();
    await page.getByRole('button', { name: /New exercise/ }).waitFor({ timeout: 20_000 });
    const owners = (await all()).filter((r) => r.name === 'Goblet Squat').map((r) => r.coachId);
    await page.getByRole('tab', { name: 'My catalogue (3)' }).waitFor({ timeout: 10_000 });
    step(`${tag}: goblet saved`, { gobletOwners: owners, tabLabel: await page.getByRole('tab', { name: /My catalogue/ }).textContent() });
    await shot(page, `${tag}-7-mine-with-goblet`);

    // 4. same coach, same name in another case
    await page.getByRole('button', { name: /New exercise/ }).click();
    await page.getByPlaceholder('e.g. Goblet Squat').fill('goblet squat');
    await page.getByRole('button', { name: 'Add to catalogue' }).click();
    const dupe = await page.getByText('You already have an exercise with that name.').textContent({ timeout: 20_000 });
    step(`${tag}: duplicate refused`, { message: dupe });

    // 5. a javascript: video link
    await page.getByPlaceholder('e.g. Goblet Squat').fill('Box Squat');
    await page.getByPlaceholder('https://...').fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Add to catalogue' }).click();
    const vid = await page.getByText('The video link has to start with http:// or https://.').textContent({ timeout: 20_000 });
    step(`${tag}: bad video refused`, { message: vid });
    await shot(page, `${tag}-8-editor-errors`);
    await page.getByRole('button', { name: 'Cancel' }).click();

    // 6. edit: link an easier version
    await page.getByRole('button', { name: 'Edit Goblet Squat' }).click();
    await page.locator('select').nth(4).selectOption({ label: 'Single-Leg Pogo Hops' });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('easier: Single-Leg Pogo Hops').waitFor({ timeout: 20_000 });
    step(`${tag}: edit linked easier version`);
    await shot(page, `${tag}-9-mine-edited`);
  } finally {
    step(`${tag}: console errors`, { errors });
    await browser.close();
  }
}

await run(390, 'phone');
await run(900, 'desktop');
writeFileSync(join(OUT, 'live-proof.json'), `${JSON.stringify(out, null, 2)}\n`);
