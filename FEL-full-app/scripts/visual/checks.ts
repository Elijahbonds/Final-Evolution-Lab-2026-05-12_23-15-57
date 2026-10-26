// THE VISUAL GATE's checks (QG-02, quality-gates lane, 2026-10-25). Owner, quality round 2026-10-20: "screenshot diffs
// of key screens, plus one frame per mode on the static rig."
//
// Each check drives a page to one fixed state and photographs it. The photo is compared with the baseline in
// scripts/visual/baselines/<name>.png (scripts/visual/compare.ts): a check FAILS when more of the screen changed than
// its threshold. A screen that SHOULD look different is re-baselined on purpose:
//   npx tsx scripts/visual-tests.ts --update [--only name,…]
// and the new PNGs are in the PR diff, where the owner sees the before and after side by side.
//
// Key screens run in CI on every PR (scripts/visual-tests.ts, through ci-suite). One frame per MODE is the sweep:
// `--modes all` (every registry mode; ~1–2 min each on software GL), run by the dedicated CI job proposed in
// docs/QUALITY-GATES-PROPOSAL.md and locally under the heavy lock. The per-PR run keeps one sentinel mode (SENTINEL_MODES).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { ROOT, assert, type ApiHandler, type PageDef } from '../e2e/rig';
import type { Flow, FlowContext } from '../e2e/flow';
import { advanceFrames, openMode } from '../e2e/mode';
import { FakeAuth } from '../../tests/e2e/fakes/auth';
import { compare, hasBaseline, toBaseline } from './compare';

export const BASELINES = join(ROOT, 'scripts/visual/baselines');
/** Screens are deterministic DOM: 1.5% of the (downscaled) screen may move. Mode frames are 3D on software GL: 8%. */
export const SCREEN_THRESHOLD = 0.015;
export const MODE_THRESHOLD = 0.08;
export const SENTINEL_MODES = ['golf'];

const PLAYER = { id: 'v-1', email: 'visual@example.com', password: 'x', name: 'Visual Rig' };

interface Shot {
  name: string;
  title: string;
  threshold: number;
  timeoutMs?: number;
  take(ctx: FlowContext): Promise<Buffer>;
}

function screen(name: string, title: string, o: {
  path: string; pages: Record<string, PageDef>; api?: ApiHandler; viewport?: { width: number; height: number };
  ready(page: Page): Promise<void>;
}): Shot {
  return {
    name, title, threshold: SCREEN_THRESHOLD,
    async take(ctx) {
      const auth = new FakeAuth([PLAYER], PLAYER.email);
      const s = ctx.session({ viewport: o.viewport ?? { width: 390, height: 844 }, pages: o.pages, api: (req) => auth.handle(req) ?? o.api?.(req) ?? { json: {} } });
      const page = await s.open(o.path);
      await o.ready(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      return page.screenshot({ fullPage: false, animations: 'disabled', caret: 'hide' });
    },
  };
}

const SLOTS = [{ startsAt: '2026-11-02T17:00:00.000Z', label: 'Mon', durationMin: 30 }, { startsAt: '2026-11-03T18:30:00.000Z', label: 'Tue', durationMin: 30 }];
const LISTING = { id: 'lst_live30', title: 'Live 1-on-1 jump session', priceUsd: 4900, manifest: JSON.stringify({ kind: 'live_1on1', durationMin: 30 }) };

export const SCREENS: Shot[] = [
  screen('signup-age', 'Sign-up: the age question, before any credential field', {
    path: '/signup', pages: { '/signup': { entry: 'tests/e2e/entries/signup.tsx' } },
    ready: (p) => p.getByText('Select year').first().waitFor({ state: 'attached' }),
  }),
  screen('signup-form', 'Sign-up: the account form after the year is locked', {
    path: '/signup', pages: { '/signup': { entry: 'tests/e2e/entries/signup.tsx' } },
    async ready(p) {
      await p.locator('select').first().selectOption('1995');
      await p.getByLabel('Month').fill('6'); await p.getByLabel('Day').fill('15');
      await p.getByRole('button', { name: /continue/i }).first().click();
      await p.locator('input[type="email"]').waitFor();
      await p.locator('input[type="email"]').scrollIntoViewIfNeeded();
    },
  }),
  screen('coach-invite', "Coach: the 'Add an athlete' panel with no open invites", {
    path: '/coach', pages: { '/coach': { entry: 'tests/e2e/entries/coach-invite.tsx' } },
    api: (r) => (r.path === '/api/coach/invite' ? { json: { invites: [] } } : undefined),
    ready: (p) => p.getByText('No open invites.').waitFor(),
  }),
  screen('coach-book', 'Coach store: booking a live 1-on-1, slots loaded', {
    path: '/coach/elijah/book/lst_live30', pages: { '/coach/elijah/book/lst_live30': { entry: 'tests/e2e/entries/coach-book.tsx', rig: { slug: 'elijah', listing: LISTING } } },
    api: (r) => (r.path === '/api/coach-store/elijah/slots' ? { json: { slots: SLOTS } } : undefined),
    ready: (p) => p.waitForFunction(() => document.querySelectorAll('select option').length >= 3).then(() => undefined),
  }),
  screen('coach-thanks', 'Coach store: the thanks page once the booking is paid', {
    path: '/coach/thanks?row=bk_1&session_id=cs_test_0', pages: { '/coach/thanks': { entry: 'tests/e2e/entries/coach-thanks.tsx', rig: { item: LISTING.title, price: '$49.00' } } },
    api: (r) => (r.path === '/api/coach-store/rows/bk_1/status' ? { json: { status: 'PAID', kind: 'live_1on1' } } : r.path === '/api/stripe/verify-session' ? { json: { status: 'fulfilled', product: 'coach_store' } } : undefined),
    ready: (p) => p.getByText('Payment status: PAID.').waitFor(),
  }),
  screen('end-screen', 'The end screen: a won run with its rewards (the fixture case "win")', {
    path: '/dev/end-screen', pages: { '/dev/end-screen': { entry: 'scripts/visual/entries/end-screen.tsx', rig: { case: 'win' } } },
    ready: (p) => p.locator('[data-end-screen][data-reveal="done"]').waitFor({ timeout: 30_000 }),
  }),
  screen('whats-new', "What's new: the newest release's public notes", {
    path: '/whats-new', pages: { '/whats-new': { entry: 'scripts/visual/entries/whats-new.tsx' } },
    ready: (p) => p.locator('[data-whats-new] [data-release]').first().waitFor(),
  }),
];

function modeShot(mode: string): Shot {
  return {
    name: `mode-${mode}`, title: `${mode}: one frame, half a second of play after START (seeded, virtual clock)`, threshold: MODE_THRESHOLD, timeoutMs: 360_000,
    async take(ctx) {
      const { page, loadS } = await openMode(ctx, { mode, viewport: { width: 480, height: 270 }, query: '?perf=off' });
      await advanceFrames(page, 30);
      ctx.log(`${mode}: playing after ${loadS.toFixed(0)} s`);
      // the frame only: the dev runner's HUD readout and the diagnostics panel print live numbers (fps, frame times)
      // that no two runs share, so every element but the canvas is hidden for the photo
      await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
      return page.screenshot({ timeout: 120_000, animations: 'allow' });
    },
  };
}

export function registryModes(): string[] {
  const src = readFileSync(join(ROOT, 'lib/babylon/modes/registry.ts'), 'utf8');
  const body = src.slice(src.indexOf('export const MODES'), src.indexOf('};', src.indexOf('export const MODES')));
  return [...body.matchAll(/^\s+([a-z_0-9]+):\s+[A-Z]\w+,/gm)].map((m) => m[1]);
}

export function modeShots(which: 'sentinel' | 'all' | string[]): Shot[] {
  const list = which === 'sentinel' ? SENTINEL_MODES : which === 'all' ? registryModes() : which;
  return list.map(modeShot);
}

/** A shot as a gate check: photograph, compare with the baseline (or write it under --update). */
export function asFlow(s: Shot, update: boolean): Flow {
  return {
    name: s.name, title: s.title, timeoutMs: s.timeoutMs ?? 120_000,
    async run(ctx) {
      const png = await s.take(ctx);
      writeFileSync(join(ctx.out, 'current.png'), png);
      const file = join(BASELINES, `${s.name}.png`);
      if (update) {
        mkdirSync(BASELINES, { recursive: true });
        writeFileSync(file, await toBaseline(png));
        ctx.log(`baseline written: scripts/visual/baselines/${s.name}.png`);
        return;
      }
      assert(hasBaseline(file), `no baseline for ${s.name}: run npx tsx scripts/visual-tests.ts --update --only ${s.name}, look at the PNG, commit it`);
      const d = await compare(png, file, join(ctx.out, 'diff.png'));
      const line = `${(d.changed * 100).toFixed(2)}% of the screen changed (limit ${(s.threshold * 100).toFixed(1)}%), mean channel difference ${d.mean.toFixed(1)}`;
      ctx.log(line);
      // on a CI runner, a failing check prints its photo (scaled as the baseline is) so the run's log alone shows what
      // the runner saw, and a baseline taken there can be restored from it: VISUAL-CURRENT <name> <base64 png>
      if (d.changed > s.threshold && process.env.CI) console.log(`VISUAL-CURRENT ${s.name} ${(await toBaseline(png)).toString('base64')}`);
      assert(d.changed <= s.threshold, `${s.name}: ${line}. Look at ${join(ctx.out, 'diff.png')} (magenta = changed) and current.png. If the change is intended: npx tsx scripts/visual-tests.ts --update --only ${s.name}`);
    },
  };
}
