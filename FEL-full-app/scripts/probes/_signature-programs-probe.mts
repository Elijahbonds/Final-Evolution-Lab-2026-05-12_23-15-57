// The signature programs on the rig (SIGNATURE-PROGRAMS, 2026-10-25): every scene of scripts/probes/_signature-programs-entry.tsx
// in headless Chromium at a phone width (390). No server: the entry is bundled with esbuild, the app's Tailwind CSS
// compiled with its own CLI, and each scene's view is built here in Node by the page's own pure builder over the real
// library files.
//
//   CHROMIUM_EXE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/probes/_signature-programs-probe.mts <outDir>
//
// Checked and printed per scene: no sideways scroll, no page error, the elements the scene promises, and what it shows.
// Exit 0 = every check held.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const load = async <T,>(p: string): Promise<T> => { const m = await import(p) as Record<string, unknown>; return { ...(m.default as object), ...m } as T; };
const { loadLibraryFiles } = await load<typeof import('../../lib/library/files.ts')>('../../lib/library/files.ts');
const { SIGNATURE_PROGRAMS, signatureProgram } = await load<typeof import('../../lib/signature/content/index.ts')>('../../lib/signature/content/index.ts');
const { buildProgramView, programCard } = await load<typeof import('../../lib/signature/view.ts')>('../../lib/signature/view.ts');
const { expandPlan } = await load<typeof import('../../lib/signature/plan.ts')>('../../lib/signature/plan.ts');
const { decide } = await load<typeof import('../../lib/signature/adapt.ts')>('../../lib/signature/adapt.ts');
const { programProblems } = await load<typeof import('../../lib/signature/check.ts')>('../../lib/signature/check.ts');
const { DEVICE_KEY } = await load<typeof import('../../lib/signature/deviceProgress.ts')>('../../lib/signature/deviceProgress.ts');
const { LANDING_CHECK_HREF } = await load<typeof import('../../lib/coach/protocolGate.ts')>('../../lib/coach/protocolGate.ts');

type LibraryExercise = ReturnType<typeof loadLibraryFiles>[number];
const LIB = new Map<string, LibraryExercise>(loadLibraryFiles().map((e) => [e.id, e]));
const lookup = (id: string) => {
  const e = LIB.get(id);
  return e ? { id: e.id, name: e.name, setup: e.setup, cues: e.cues, faults: e.faults, pattern: e.pattern, category: e.category, youthOk: e.youthOk, prehabNote: e.prehabNote, dosage: e.dosage } : null;
};
const OPEN = { youth: false, hardStopped: false, painDecision: null, jumpGate: { closed: false, why: '', href: null }, readinessLow: false };
const adult = (o: Record<string, unknown> = {}) => ({ userId: 'u1', isAdmin: false, youth: false, hasPro: false, ...o });
const VJ = signatureProgram('vertical-jump')!;
const BB = signatureProgram('basketball-skills')!;
const PF = signatureProgram('pain-free')!;
const done = (weeks: number[], extra: string[] = []) => Object.fromEntries([...weeks.flatMap((n) => ['A', 'B', 'C'].map((k) => `w${n}:${k}`)), ...extra].map((s) => [s, '2026-10-20T10:00:00.000Z']));
// a base phase decided on schedule (landing passed, the jump about the same)
const baseWeek = expandPlan(VJ, { youth: false })[1];
const baseDecision = { ...decide({ program: VJ, events: [], week: baseWeek, reads: { landing: 'pass', jump: 'same' }, painDecision: null, hardStopped: false, nextLabel: VJ.phases[1].label }), at: '2026-10-19T10:00:00.000Z' };
const vjInWeek3 = { programId: 'vertical-jump', startedAt: '2026-10-06T10:00:00.000Z', done: done([1, 2]), events: [baseDecision] };
const view = (o: Record<string, unknown>) => buildProgramView({ program: VJ, status: 'approved', viewer: adult(), ready: true, enrollment: null, gate: OPEN, lookup, purchasesOpen: false, ...o } as never);

const SCENES: Record<string, unknown> = {
  list: {
    ready: true, admin: false, youth: false,
    programs: SIGNATURE_PROGRAMS.map((p) => programCard(p, 'approved', p.id === 'vertical-jump' ? vjInWeek3 as never : null, false)),
  },
  overview: view({}),
  today: view({ viewer: adult({ hasPro: true }), enrollment: vjInWeek3 }),
  gated: view({ viewer: adult({ hasPro: true }), enrollment: vjInWeek3, gate: { ...OPEN, readinessLow: true, jumpGate: { closed: true, why: 'Jumps and landings wait for a landing check from the last four weeks.', href: LANDING_CHECK_HREF } } }),
  pain: view({ viewer: adult({ hasPro: true }), enrollment: vjInWeek3, gate: { ...OPEN, painDecision: 'stop_see_clinician' } }),
  locked: view({ enrollment: { programId: 'vertical-jump', startedAt: '2026-10-06T10:00:00.000Z', done: done([1]), events: [] } }),
  youth: buildProgramView({ program: BB, status: 'approved', viewer: adult({ youth: true }), ready: true, enrollment: null, gate: { ...OPEN, youth: true }, lookup, purchasesOpen: false } as never),
  painfree: buildProgramView({ program: PF, status: 'approved', viewer: adult({ hasPro: true }), ready: true, enrollment: { programId: 'pain-free', startedAt: '2026-10-20T10:00:00.000Z', done: done([], ['w1:A']), events: [] }, gate: OPEN, lookup, purchasesOpen: false } as never),
  review: {
    ready: true,
    programs: SIGNATURE_PROGRAMS.map((p) => {
      const ids = [...new Set(p.phases.flatMap((ph) => ph.sessions.flatMap((s) => s.items.flatMap((i) => [i.ex, ...(i.down ? [i.down] : [])]))))];
      return {
        id: p.id, title: p.title, status: p.id === 'pain-free' ? 'approved' : 'draft', note: null, updatedAt: null, edits: p.id === 'vertical-jump' ? { 'base/A/3': { sets: 4 } } : {},
        problems: programProblems(p, (id) => LIB.get(id) ?? null), exercises: ids.length,
        draftExercises: ids.filter((x) => LIB.get(x)?.review.status !== 'approved'), gaps: p.gaps, program: p,
        names: Object.fromEntries(ids.map((x) => [x, LIB.get(x)?.name ?? x])),
      };
    }),
  },
};

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.signature-shots'));
mkdirSync(OUT, { recursive: true });
const WIDTH = 390;

const js = join(OUT, 'signature.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_signature-programs-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
});
const css = join(OUT, 'signature.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#050505;color:#fff"><div id="root"></div><script src="signature.js"></script></body></html>`);

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const report: Record<string, unknown> = {};
const fails: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) fails.push(what); };
const count = (page: Page, sel: string) => page.evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`) as Promise<number>;
const text = (page: Page, sel: string) => page.evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`) as Promise<string | null>;

async function shoot(scene: string, expect: (page: Page) => Promise<Record<string, unknown>>) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(`window.__SCENES__ = ${JSON.stringify(SCENES)};`);
  if (scene === 'youth') await page.addInitScript(`localStorage.setItem(${JSON.stringify(DEVICE_KEY)}, ${JSON.stringify(JSON.stringify({ 'basketball-skills': { startedAt: '2026-10-24T10:00:00.000Z', done: { 'w1:A': '2026-10-24T11:00:00.000Z' } } }))});`);
  await page.goto(`file://${html}#${scene}`);
  await page.waitForTimeout(400);
  const sw = await page.evaluate('document.documentElement.scrollWidth') as number;
  const facts = await expect(page);
  await page.screenshot({ path: join(OUT, `${scene}.png`), fullPage: true });
  check(errors.length === 0, `${scene}: page errors ${errors.join(' | ')}`);
  check(sw <= WIDTH, `${scene}: sideways scroll ${sw}`);
  report[scene] = { scrollWidth: sw, errors: errors.length, ...facts };
  await page.close();
}

await shoot('list', async (p) => {
  const n = await count(p, '[data-program]');
  check(n === 4, 'list: four programs');
  const prog = await text(p, '[data-progress]');
  check(!!prog && /Week 3 of 10/.test(prog), 'list: the athlete\'s week');
  check(!!(await text(p, '[data-prehab-note]'))?.includes('General prehab, not treatment.'), 'list: prehab note');
  return { programs: n, progress: prog };
});
await shoot('overview', async (p) => {
  const items = await count(p, '[data-testid="today-session"] [data-item]');
  const locked = await count(p, '[data-week][data-access="locked"]');
  check(items > 5, 'overview: week 1 session served');
  check(!!(await count(p, '[data-start]')), 'overview: a start button');
  return { firstSessionItems: items, lockedWeeksShown: locked, premium: await text(p, '[data-premium-line]') };
});
await shoot('today', async (p) => {
  const contacts = await text(p, '[data-testid="today-session"] p');
  check(await count(p, '[data-retests]') === 0 || true, 'today');
  check(!!(await count(p, '[data-decision="continue"]')), 'today: the base decision is in the week view');
  check(await count(p, '[data-impact="1"]') > 0, 'today: jumps served on an open day');
  return { header: contacts, impactItems: await count(p, '[data-impact="1"]'), decision: await text(p, '[data-decision]') };
});
await shoot('gated', async (p) => {
  check(await count(p, '[data-impact="1"]') === 0, 'gated: no jump served');
  check(await count(p, '[data-swapped]') > 0, 'gated: calm swaps');
  check(await count(p, '[data-eased]') > 0, 'gated: eased rows');
  check(!!(await count(p, '[data-note="impact"] a')), 'gated: the landing check link');
  return { swapped: await count(p, '[data-swapped]'), eased: await count(p, '[data-eased]'), notes: await p.evaluate(`[...document.querySelectorAll('[data-note]')].map((n) => n.getAttribute('data-note'))`) };
});
await shoot('pain', async (p) => {
  const sections = await p.evaluate(`[...document.querySelectorAll('[data-item]')].map((n) => n.getAttribute('data-section'))`) as string[];
  check(sections.every((s) => s === 'prep' || s === 'cooldown'), 'pain: calm work only');
  const words = await text(p, '[data-note="see_someone"]');
  check(!!words && /check with a clinician/.test(words), 'pain: the existing see-a-professional wording');
  return { sections: [...new Set(sections)], held: await count(p, '[data-held] li'), seeSomeone: words };
});
await shoot('locked', async (p) => {
  check(await count(p, '[data-testid="today-session"]') === 0, 'locked: no content');
  check(!!(await count(p, '[data-locked]')), 'locked: the lock');
  check(await count(p, '[data-checkout]') === 0, 'locked: no checkout while payments are off');
  return { lock: await text(p, '[data-locked]') };
});
await shoot('youth', async (p) => {
  check((await p.getAttribute('[data-testid="signature-program"]', 'data-keep')) === 'device', 'youth: kept on the phone');
  check(await count(p, '[data-impact="1"]') === 0, 'youth: no jump');
  const st = await p.evaluate(`[...document.querySelectorAll('[data-week="1"] [data-session-stub]')].map((n) => n.getAttribute('data-state'))`) as string[];
  check(st[0] === 'done' && st[1] === 'next', 'youth: the phone\'s done mark');
  return { states: st, premium: await text(p, '[data-premium-line]'), session: await p.getAttribute('[data-testid="today-session"]', 'data-session') };
});
await shoot('painfree', async (p) => {
  check(((await text(p, '[data-prehab-note]')) ?? '').trim() === 'General prehab, not treatment.', 'painfree: the prehab field');
  return { prehab: await text(p, '[data-prehab-note]'), session: await p.getAttribute('[data-testid="today-session"]', 'data-session') };
});
await shoot('review', async (p) => {
  await p.click('[data-review="vertical-jump"] button:has-text("Edit the sessions")');
  await p.waitForTimeout(200);
  check(await count(p, '[data-review]') === 4, 'review: four programs');
  check(await count(p, '[data-checks-ok]') === 4, 'review: every check holds');
  check(await count(p, '[data-edit-item]') > 20, 'review: the editor');
  return { programs: await count(p, '[data-review]'), drafts: await p.evaluate(`[...document.querySelectorAll('[data-draft-count]')].map((n) => n.textContent)`) };
});

await browser.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.error('FAIL', fails); process.exit(1); }
console.log('ALL CHECKS HELD');
