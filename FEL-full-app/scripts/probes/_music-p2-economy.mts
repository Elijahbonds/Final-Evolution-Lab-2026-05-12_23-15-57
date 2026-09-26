// MUSIC-SUITE P2 (2026-09-25) — the Groove Academy's shard economy, checked in a real browser on the lane's dev server
// (/dev/music: the real StudioMode with the dev loader's stand-ins — spendShards approves unless ?shop=<status>|offline,
// readOwnedKits answers ?owned= plus what this page load bought; window.__FEL_STUDIO__ counts spends and owned reads).
// P1 found: a kit/CELL tap charged with no ask, REMIX bought the track's kit, every failure read 'Not enough Shards',
// and kits lived in localStorage only (outbox musicsuite/understand-wf_3a55346f-032.json). What this checks, each with how:
//   1. ASK FIRST — tap NEON (locked): the inline confirm's words, and NO spend reached the shop; CANCEL: still none.
//      UNLOCK: exactly one spend, the kit loaded, the price gone from its button, the cache written.
//   2. CELL asks too — CANCEL leaves the grid empty and the shop untouched; BUY spends once (with a nonce) and lays it.
//   3. REAL WORDS — ?shop=401 / 409 / 500 / offline: the line inside the confirm, the kit still locked.
//   4. THE ACCOUNT, NOT THE DEVICE — a hand-edited cache '["street","neon","dust"]' with an account that owns nothing:
//      both prices come back and the cache is rewritten; ?owned=dust unlocks DUST from the account; with the shop
//      offline the cache stands.
//   5. REMIX NEVER BUYS — a library track on DUST, remixed by an account without DUST: no confirm, no spend, the room
//      opens it on STREET and says so under the banner; with ?owned=dust it opens on DUST and says nothing.
//   6. A frame of the confirm with a failure line on screen.
//
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p2-economy.mts   (BASE, OUT env override)
import { chromium, type Browser, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p2';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[econ +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music?stage=studio', pageErrors: [] as string[], checks: [] as Any[] };
const check = (name: string, pass: boolean, detail: Any) => { R.checks.push({ name, pass, detail }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail)); };

const GRID_EL = `[...document.querySelectorAll('div')].find((d) => (d.style.gridTemplateColumns || '').includes('repeat(16'))`;
const kitButton = (p: Page, label: string) => p.locator('button', { hasText: new RegExp(`^${label}( · \\d+◈)?$`) }).first();
const confirmText = (p: Page) => p.evaluate(() => document.querySelector('[data-qa="shop-confirm"]')?.textContent ?? null);
const errorText = (p: Page) => p.evaluate(() => document.querySelector('[data-qa="shop-error"]')?.textContent ?? null);
const probe = (p: Page) => p.evaluate(() => { const s = (window as Any).__FEL_STUDIO__; return { spends: s.spends.map((x: Any) => ({ ...x })), ownedReads: s.ownedReads }; });
const cache = (p: Page) => p.evaluate(() => localStorage.getItem('fel_studio_kits_v1'));
const kitLabels = (p: Page) => p.evaluate(() => {
  const row = [...document.querySelectorAll('span')].find((s) => s.textContent === 'KITS:')?.parentElement;
  return row ? [...row.querySelectorAll('button')].map((b) => b.textContent) : null;
});
const litCells = (p: Page) => p.evaluate(`(() => { const g = ${GRID_EL}; return g ? [...g.children].filter((c) => c.style.background === 'rgb(255, 179, 71)').length : -1; })()`);
const toast = (p: Page) => p.evaluate(() => [...document.querySelectorAll('div')].map((d) => d.textContent ?? '').filter((t) => /kit loaded|Remixing|foundation/.test(t)).pop() ?? null);

const DUST_TRACK = {
  id: 'trk_probe_dust', title: 'Dust Probe', authorId: 'okta_probe', authorName: 'Okta Probe', kit: 'dust', bpm: 88, swing: 0.1, polished: false,
  sequencer: {
    bpm: 88, steps: 16, swing: 0.1,
    tracks: ['kick', 'snare', 'hat', 'open', 'clap', 'bass', 'lead', 'fx'].map((id, i) => ({
      sampleId: id, pattern: Array.from({ length: 16 }, (_, s) => (i === 0 ? s % 4 === 0 : i === 1 ? s === 4 || s === 12 : false)),
      volume: 0.8, muted: false, pan: 0,
    })),
  },
  mixdownDataUrl: '', remixOf: null, streamingLinks: [], createdAt: 1, plays: 0, saves: 0,
};

/** A fresh context (its own localStorage), a page on /dev/music with `query`, past the splash, grid on screen. */
async function open(browser: Browser, query: string, seed: { kits?: string; tracks?: boolean } = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([kits, tracks]) => {
    try {
      if (kits) localStorage.setItem('fel_studio_kits_v1', kits as string);
      if (tracks) localStorage.setItem('fel_studio_tracks_v1', tracks as string);
    } catch { /* none */ }
  }, [seed.kits ?? null, seed.tracks ? JSON.stringify([DUST_TRACK]) : null]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(`${query}: ${String(e)}`));
  await p.goto(`${BASE}/dev/music?stage=studio${query}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.getByRole('button', { name: 'TAP TO START' }).waitFor({ timeout: 240000 });
  await p.getByRole('button', { name: 'TAP TO START' }).click();
  await p.waitForFunction(`(${GRID_EL}) != null`, undefined, { timeout: 60000 });
  await p.waitForFunction(() => ((window as Any).__FEL_STUDIO__?.ownedReads ?? 0) > 0, undefined, { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(400);
  return p;
}
async function close(p: Page): Promise<void> { await p.context().close(); }

async function run(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ARGS });
  try {
    // ── 1. ask first: a locked kit ──
    {
      const p = await open(browser, '');
      const before = await probe(p);
      check('owned kits read from the account at mount', before.ownedReads >= 1, { ownedReads: before.ownedReads, kits: await kitLabels(p) });
      await kitButton(p, 'NEON').click();
      await p.waitForTimeout(250);
      const asked = await confirmText(p);
      const afterTap = await probe(p);
      check('a tap on NEON only asks', asked !== null && asked.startsWith('Unlock NEON for 200 Shards?') && /UNLOCK/.test(asked) && /CANCEL/.test(asked) && afterTap.spends.length === 0,
        { confirm: asked, spends: afterTap.spends.length });
      await p.getByRole('button', { name: 'CANCEL', exact: true }).click();
      await p.waitForTimeout(250);
      const afterCancel = await probe(p);
      check('CANCEL closes it and nothing was charged', (await confirmText(p)) === null && afterCancel.spends.length === 0 && (await kitLabels(p))?.includes('NEON · 200◈') === true,
        { spends: afterCancel.spends.length, kits: await kitLabels(p) });
      await kitButton(p, 'NEON').click();
      await p.getByRole('button', { name: 'UNLOCK', exact: true }).click();
      await p.waitForTimeout(900);
      const afterYes = await probe(p);
      check('UNLOCK spends exactly once, loads the kit, drops its price, writes the cache',
        afterYes.spends.length === 1 && afterYes.spends[0].reason === 'unlock kit neon' && (await confirmText(p)) === null
          && (await kitLabels(p))?.includes('NEON') === true && (await cache(p)) === '["street","neon"]',
        { spends: afterYes.spends, kits: await kitLabels(p), cache: await cache(p) });
      // an owned kit is a load, never another ask
      await kitButton(p, 'STREET').click();
      await kitButton(p, 'NEON').click();
      await p.waitForTimeout(500);
      check('an owned kit loads with no ask and no spend', (await confirmText(p)) === null && (await probe(p)).spends.length === 1, { spends: (await probe(p)).spends.length });

      // ── 2. CELL asks too ──
      const lit0 = await litCells(p);
      await p.getByRole('button', { name: /CELL: LAY A FOUNDATION/ }).click();
      await p.waitForTimeout(250);
      const cellAsk = await confirmText(p);
      await p.getByRole('button', { name: 'CANCEL', exact: true }).click();
      await p.waitForTimeout(250);
      check('CELL asks ("Lay a Cell foundation for 50 Shards?  BUY / CANCEL"); CANCEL lays nothing, spends nothing',
        cellAsk !== null && cellAsk.startsWith('Lay a Cell foundation for 50 Shards?') && /BUY/.test(cellAsk) && (await litCells(p)) === lit0 && (await probe(p)).spends.length === 1,
        { confirm: cellAsk, litBefore: lit0, litAfter: await litCells(p) });
      await p.getByRole('button', { name: /CELL: LAY A FOUNDATION/ }).click();
      await p.getByRole('button', { name: 'BUY', exact: true }).click();
      await p.waitForTimeout(600);
      const cellBuy = await probe(p);
      const last = cellBuy.spends[cellBuy.spends.length - 1];
      check('BUY spends once, with a nonce, and lays the foundation', cellBuy.spends.length === 2 && last.reason === 'cell foundation' && typeof last.nonce === 'string' && (await litCells(p)) > lit0,
        { last, litAfter: await litCells(p) });
      await close(p);
    }

    // ── 3. real words ──
    const words: Record<string, string> = {
      '401': 'Sign in to unlock', '409': 'Not enough Shards',
      '500': "Couldn't reach the shop — nothing was charged", offline: "Couldn't reach the shop — nothing was charged",
    };
    for (const [shop, want] of Object.entries(words)) {
      const p = await open(browser, `&shop=${shop}`);
      await kitButton(p, 'DUST').click();
      await p.getByRole('button', { name: 'UNLOCK', exact: true }).click();
      await p.waitForTimeout(500);
      const err = await errorText(p);
      check(`?shop=${shop} says "${want}", keeps the confirm, leaves DUST locked`,
        err === want && (await confirmText(p)) !== null && (await kitLabels(p))?.includes('DUST · 400◈') === true,
        { error: err, kits: await kitLabels(p) });
      if (shop === '409') await p.screenshot({ path: `${OUT}/music-economy-confirm-p2.png` });
      await close(p);
    }

    // ── 4. the account, not the device ──
    {
      const p = await open(browser, '', { kits: '["street","neon","dust"]' });
      check('a hand-edited cache is overruled by the account (owns nothing): both prices back, cache rewritten',
        JSON.stringify(await kitLabels(p)) === JSON.stringify(['STREET', 'NEON · 200◈', 'DUST · 400◈']) && (await cache(p)) === '["street"]',
        { kits: await kitLabels(p), cache: await cache(p) });
      await close(p);
    }
    {
      const p = await open(browser, '&owned=dust');
      check('?owned=dust: DUST unlocked from the account on a device that never cached it',
        JSON.stringify(await kitLabels(p)) === JSON.stringify(['STREET', 'NEON · 200◈', 'DUST']) && (await cache(p)) === '["street","dust"]',
        { kits: await kitLabels(p), cache: await cache(p) });
      await close(p);
    }
    {
      const p = await open(browser, '&shop=offline', { kits: '["street","neon"]' });
      check('the account unreachable: the cache stands', JSON.stringify(await kitLabels(p)) === JSON.stringify(['STREET', 'NEON', 'DUST · 400◈']),
        { kits: await kitLabels(p), cache: await cache(p) });
      await close(p);
    }

    // ── 5. remix never buys ──
    for (const owned of ['', '&owned=dust']) {
      const p = await open(browser, owned, { tracks: true });
      await p.getByRole('button', { name: 'LIBRARY', exact: true }).click();
      await p.getByRole('button', { name: 'REMIX', exact: true }).first().click();
      await p.waitForTimeout(900);
      const note = await p.evaluate(() => document.querySelector('[data-qa="remix-kit-note"]')?.textContent ?? null);
      const selected = await p.evaluate(() => {
        const row = [...document.querySelectorAll('span')].find((s) => s.textContent === 'KITS:')?.parentElement;
        return row ? [...row.querySelectorAll('button')].find((b) => (b as HTMLElement).style.background.includes('122, 92, 158'))?.textContent ?? null : null;
      });
      const pr = await probe(p);
      if (!owned) {
        check('REMIX of a DUST track without DUST: no ask, no spend, opens on STREET and says so',
          pr.spends.length === 0 && (await confirmText(p)) === null && selected === 'STREET'
            && note === "This remix opens on STREET: the original uses DUST, which you haven't unlocked (400 Shards in KITS). Nothing was charged.",
          { spends: pr.spends.length, selected, note, toast: await toast(p) });
        await p.screenshot({ path: `${OUT}/music-economy-remix-p2.png` });
      } else {
        check('REMIX with DUST owned: opens on DUST, nothing said, nothing spent', pr.spends.length === 0 && selected === 'DUST' && note === null,
          { spends: pr.spends.length, selected, note });
      }
      await close(p);
    }
  } finally {
    await browser.close();
  }
  R.passed = R.checks.filter((c: Any) => c.pass).length;
  R.failed = R.checks.filter((c: Any) => !c.pass).map((c: Any) => c.name);
  fs.writeFileSync(`${OUT}/music-economy-p2.json`, JSON.stringify(R, null, 2));
  log(`done: ${R.passed}/${R.checks.length} passed; page errors ${R.pageErrors.length}`);
  if (R.failed.length || R.pageErrors.length) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exitCode = 2; });
