// MIRROR-COACH P3 (2026-09-26) — PROOF, the coach-prescription lane.
//
// PART 1, always (node): for every fixture case (app/dev/coach-prescribe/fixture.ts — screens stored the way POST
// /api/mirror/screen stores them), the draft GET /api/coach/prescribe returns (lib/coach/mirrorToProgram.ts coachDraft),
// the coach's panel and the athlete's card as their first paint (the real components, server-rendered), the one-tap add
// through the builder's own builderAction over an in-memory program, and an honesty sweep of every rendered word.
// PART 2, only when the lane's dev server answers (default http://127.0.0.1:3131): /dev/coach-prescribe in headless
// chromium — the panel, one tap, the Prep section a fresh load returns, the athlete's card, and 390 px with no overflow.
//
// Run from FEL-full-app:
//   /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-p3-coach-prescribe-proof.mts <outDir>
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

(globalThis as unknown as { React: typeof React }).React = React;   // the components compile to the classic runtime here
const OUT = process.argv[2] ?? '/tmp/mirror-p3-coach-prescribe';
const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
mkdirSync(OUT, { recursive: true });

const { DEV_CASES, FIXTURE_CATALOGUE, FIXTURE_PROGRAM, COACH, fixtureScreens } = await import('../../app/dev/coach-prescribe/fixture');
const { coachDraft, blockAddBodies } = await import('../../lib/coach/mirrorToProgram');
const { builderAction, loadProgram } = await import('../../lib/coach/builderServer');
const { builderMemoryDb, createProgram, newBuilderStore } = await import('../../lib/coach/builderMemoryDb');
const { CAMERA_NOT_DIAGNOSIS } = await import('../../lib/mirror/screenCorrectives');
const { screenText } = await import('../../lib/share/screen');
const panel: any = await import('../../components/coach/screen-prescriptions');
const card: any = await import('../../components/mirror/screen-next-steps');

type Json = Record<string, any>;
const out: Json = { date: new Date().toISOString(), cases: {}, oneTap: null, honesty: {}, live: null };
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const catalogue = FIXTURE_CATALOGUE.map((e: Json) => ({ id: e.id, name: e.name, category: e.category, pattern: e.pattern, skillLayer: e.skillLayer, defaultTempo: e.defaultTempo }));

// ── PART 1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
for (const c of DEV_CASES) {
  const f = fixtureScreens(c);
  const draft = JSON.parse(JSON.stringify(coachDraft(f.rows, catalogue)));
  const panelText = text(renderToStaticMarkup(React.createElement(panel.DraftView, {
    clientId: 'dev-client', draft, sessions: [{ id: 's1', label: 'Week 1 · Day 1' }], into: 's1', onInto: () => {}, added: {}, onAddOne: () => {}, onAddBlock: () => {},
  })));
  const cardText = text(renderToStaticMarkup(React.createElement(card.ScreenNextSteps, { screen: f.screen, grades: f.grades })));
  out.cases[c] = {
    reason: draft.reason ?? null, complete: draft.complete ?? null, provisional: draft.provisional ?? null, serverGraded: draft.serverGraded ?? null,
    newerRunAt: draft.newerRunAt ?? null, screenAt: draft.screenAt, retests: draft.retests ?? null,
    camera: (draft.review?.camera ?? []).map((r: Json) => ({ check: r.title, status: r.status, value: r.value, fix: r.fix, block: r.block?.title ?? null, retest: r.retest })),
    answers: (draft.review?.answers ?? []).map((a: Json) => a.said),
    coachChecks: (draft.review?.coachChecks ?? []).map((x: Json) => x.label),
    prescriptions: draft.prescriptions.map((p: Json) => ({ for: p.title, exercise: p.exercise?.name ?? null, matchedBy: p.matchedBy, dose: `${p.sets}×${p.reps}`, section: p.section, because: p.because })),
    panelText, cardText,
  };
  const scrub = (t: string) => t.split(CAMERA_NOT_DIAGNOSIS).join('');
  out.honesty[c] = {
    panelFlags: screenText(scrub(panelText)).map((x: Json) => x.found),
    cardFlags: screenText(scrub(cardText)).map((x: Json) => x.found),
    verdictWords: [...`${scrub(panelText)} ${scrub(cardText)}`.matchAll(/\b(fail\w*|dysfunction\w*|injur\w*|risk\w*|prevent\w*|diagnos\w*)\b/gi)].map((m) => m[0]),
    saysNotADiagnosis: panelText.includes(CAMERA_NOT_DIAGNOSIS) && cardText.includes(CAMERA_NOT_DIAGNOSIS),
  };
}

// one tap on the 'flags' case: every matched corrective through the builder's own add path, then a fresh load
{
  const store = newBuilderStore();
  store.fac = [{ userId: COACH, certificationStatus: 'certified' }];
  store.pe = FIXTURE_CATALOGUE.map((e: Json) => ({ ...e, coachId: COACH }));
  const p = createProgram(store, FIXTURE_PROGRAM);
  const db: any = builderMemoryDb(store);
  const day1 = store.session[0].id;
  const draft = coachDraft(fixtureScreens('flags').rows, catalogue);
  const bodies = blockAddBodies(draft.prescriptions, day1);
  const answers = [];
  for (const b of bodies) { const r = await builderAction(db, COACH, p.id, b); answers.push(r.ok ? 'ok' : `${r.status} ${r.error}`); }
  const loaded = await loadProgram(db, COACH, p.id);
  const ex = loaded.ok ? loaded.program.tree.blocks[0].sessions[0].exercises : [];
  out.oneTap = {
    bodies, answers,
    day1: ex.map((e: Json) => ({ section: e.section, name: e.name, dose: `${e.sets}×${e.reps}`, load: e.load, tempo: e.tempo, rest: e.restSeconds, workSeconds: e.workSeconds, note: e.coachNote })),
  };
}
writeFileSync(join(OUT, 'proof.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log('part 1 written');

// ── PART 2 (live) ───────────────────────────────────────────────────────────────────────────────────────────────────
const up = await fetch(`${BASE}/dev/coach-prescribe/api?op=load&case=flags`).then((r) => r.status).catch(() => 0);
if (up !== 200) {
  out.live = { ran: false, why: `${BASE} did not answer (status ${up || 'no connection'}); the lane's dev server was not up and this lane does not start servers` };
} else {
  const { chromium } = await import('playwright-core');
  const { chromiumExe } = await import('./_chromium.mts');
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const live: Json = { ran: true };
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 1600 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/dev/coach-prescribe?case=flags&reset=1`, { waitUntil: 'networkidle', timeout: 240_000 });
    await page.waitForSelector('[data-screen-review]', { timeout: 120_000 });
    live.groups = await page.$$eval('[data-group]', (els) => els.map((e) => e.getAttribute('data-group')));
    live.cameraRows = await page.$$eval('[data-check]', (els) => els.map((e) => `${e.getAttribute('data-check')}:${e.getAttribute('data-status')}`));
    live.prepBefore = await page.$$eval('[data-prep-exercise]', (els) => els.length);
    await page.screenshot({ path: join(OUT, 'coach-panel-1180.png'), fullPage: true });
    const block = await page.$('[data-add-block]');
    live.oneTapLabel = block ? (await block.textContent())?.trim() : null;
    if (block) {
      await block.click();
      await page.waitForFunction((n) => document.querySelectorAll('[data-prep-exercise]').length >= n, bodiesCount(), { timeout: 60_000 });
    }
    live.prepAfter = await page.$$eval('[data-prep-exercise]', (els) => els.map((e) => (e.textContent ?? '').trim()));
    live.inPrepMarks = await page.$$eval('[data-prescription]', (els) => els.map((e) => (e.textContent ?? '').includes('In Prep')));
    live.athleteCard = await page.$eval('[data-next-steps]', (e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim());
    await page.screenshot({ path: join(OUT, 'coach-panel-after-one-tap-1180.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 1600 });
    await page.goto(`${BASE}/dev/coach-prescribe?case=flags&reset=1`, { waitUntil: 'networkidle', timeout: 240_000 });
    await page.waitForSelector('[data-screen-review]', { timeout: 120_000 });
    live.overflow390 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    live.smallTargets = await page.$$eval('[data-screen-review] button', (els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length);
    await page.screenshot({ path: join(OUT, 'coach-panel-390.png'), fullPage: true });
    live.errors = errors;
  } finally {
    await browser.close();
  }
  out.live = live;
}
function bodiesCount(): number { return (out.oneTap?.bodies ?? []).length; }
writeFileSync(join(OUT, 'proof.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ honesty: out.honesty, oneTap: out.oneTap?.answers, live: out.live?.ran ?? out.live }, null, 1));
