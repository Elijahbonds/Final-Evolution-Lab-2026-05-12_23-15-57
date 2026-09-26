// MUSIC-SUITE P1 (2026-09-25) — the Groove Academy's browser baseline, on the dev-only /dev/music route (the real
// StudioMode, no GameShell, shards approved). Before this there was no auth-free way into the Academy, so none of the
// map's Academy findings (understand-wf_3a55346f-032.json) had been measured in a browser — only read from code.
//
// What it measures (every number is written to the JSON with how it was taken):
//   1. WORK SURVIVAL — build a 14-cell pattern and save one section, then: FLIP tab and back, PERFORM and back, END SET +
//      REPLAY (the shell's remount), reload. Lit cells (DOM), sections (window.__FEL_SONG__), the Flip source
//      (window.__FEL_FLIP__) after each step.
//   2. HIDDEN BUT AUDIBLE — the engine's track list vs the rows the grid draws, after SEND TO TRACK + ARM REC pad taps
//      and after CELL, and the hits the scheduler actually started over two bars (window.__FEL_STUDIO__, the dev route's
//      hook on AudioEngine.setState / scheduleStep).
//   3. CELL SIZE — a grid cell's box at 1280×800 and at 375×812 (a fresh context, so the first-visit 4-row tier).
//   4. PUBLISH UNTIL IT FAILS — PUBLISH TO LIBRARY with a title, repeatedly, until the library stops growing; what the UI
//      showed (button, toast, title field) and the page errors.
//   5. PERFORM — TAP at set offsets from a scheduled kick note (audio clock), on the CELL pattern and on an empty grid;
//      the judgement the status line showed, and the END SET result.
//   6. LIVE SWING — the scheduled step times over two bars at 92 BPM / 15 % swing vs the unswung bar (the drift finding).
// Frames: studio desktop, studio phone, flip tab, perform (+ publish failure).
//
// MUSIC-SUITE P3 (2026-09-25), "Keep my work" — THE SAME PROBE, EXTENDED, so the P3 proof is P1's numbers taken again on
// the same route and not a different measure that happens to pass. What changed, and why:
//   * THE WORK-SURVIVAL MATRIX is now its own context and asks more of the room. P1 built 14 cells + 1 section and only
//     read lit cells / sections / the Flip source; P3 promises grid, sections, chain, takes AND chops come back. So the
//     build is: the 14-cell beat, PLAYED (the chain opens on a played pattern now — MusicTiers), section 1, one more hit and
//     section 2 (2 sections chained = THE STUDIO, where RECORD TAKE lives — reached the way a player reaches it, no seeded
//     progress), two edited chops on the FLIP tab (pad 3 reversed, pad 2 at −5), pad 2 sent to the grid with two hits on
//     its row, and a take on the fake mic (--use-fake-device-for-media-stream). Then EIGHT transitions, each read the same
//     way — the STUDIO view (lit kit + Flip-row cells, sections, chain entries + bars, takes + takes decoded, same project)
//     and then the FLIP view (source, slices, edited chops, decoded) — and each row passes only if ALL of it came back:
//       1 FLIP tab and back · 2 LIBRARY + LISTEN tabs and back · 3 PERFORM and back (the in-room toggle) ·
//       4 END SET + REPLAY (the dev end card remounts the room exactly as GameShell's REPLAY does) ·
//       5 navigate away and back (another URL, then /dev/music — the room mounts from nothing) · 6 page reload ·
//       7 open straight into the PERFORM stage (?stage=perform) and back to BUILD · 8 close the tab, open a new one.
//     The stored record (IndexedDB 'fel-studio', read directly) is summarised after each row too, so "it came back" is
//     checked against what the store holds, not only what the screen shows. Then MY PROJECTS: a second project, and OPEN
//     the first again (a 9th read, reported beside the matrix, not in the 8).
//   * THE GRID READER. P1 read the one div whose grid-template-columns has repeat(16) and took its children in 17s; P3 draws
//     the Flip rows in a SECOND grid (data-qa flip-grid), so that reader saw only the kit rows and would have called every
//     drawn Flip row "not drawn". It now reads the data-qa rows/cells the room renders (StudioMode.tsx:1102-1118), both
//     grids, and says which rows are Flip rows.
//   * HIDDEN BUT AUDIBLE also reports hits written on rows the tier does not draw (silent by design since P3, and said in
//     the room's data-qa hidden-hits line) apart from rows the scheduler actually started — P1's number is the second.
//   * DANCE EXPORT AT THE GRID TIER — P1/P2 had it in SongPanel, which mounts only at THE CHAIN (StudioMode.tsx:762 and
//     SongPanel.tsx:162-170 at 8346808f): measured on the first-visit grid before anything is played.
//   * PUBLISH: 20 in a row (P1 stopped at the first failure: the 4th), then DELETE one from the LIBRARY; the index, the
//     IndexedDB audio keys and localStorage size after each. It still stops at the first publish that fails.
//   * PERFORM ON AN EMPTY GRID: P1 got its empty grid from REPLAY (which cleared the grid). P3 keeps the beat across REPLAY,
//     so the empty grid now comes from MY PROJECTS' + NEW PROJECT.
//   * OUT defaults to the p3 folder: never point it at p1 (the baseline this is compared with).
//
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-baseline.mts   (BASE, OUT env override; ONLY=matrix|main|phone)
import { chromium, type Page, type Browser, type BrowserContext } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p3';
fs.mkdirSync(OUT, { recursive: true });
// MUSIC-SUITE P3: the fake capture device, so RECORD TAKE records (a steady test tone) with no dialog.
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
const ONLY = process.env.ONLY ?? '';
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[music +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music', frames: {}, pageErrors: [] as string[], notes: [] as string[], checks: [] as Any[] };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got).slice(0, 400)); };
/** MUSIC-SUITE P3: every frame but the publish failure waits out the room's toast first (toastGone), so the frame shows
 *  the controls under it; the toast's words are kept in the JSON where they matter. */
const frame = async (p: Page, name: string, fullPage = false, keepToast = false) => {
  if (!keepToast) await toastGone(p);
  const path = `${OUT}/music-${name}.png`; await p.screenshot({ path, fullPage }); R.frames[name] = path; log('frame', path);
};

/**
 * The grid as drawn. MUSIC-SUITE P3: the data-qa rows and cells (StudioMode.tsx:1102-1118) of BOTH grids — the kit rows
 * (data-qa kit-grid) and the Flip rows under them (data-qa flip-grid) — visible ones only. `ids` are the rows' sampleIds,
 * so the hidden-rows check compares ids with ids (P1 compared labels and guessed "flip N" → flip_{N-1}).
 */
const GRID = `(() => {
  const vis = (e) => e.offsetParent !== null;
  const labels = [...document.querySelectorAll('[data-qa="grid-row"]')].filter(vis);
  if (!labels.length) return null;
  const cells = [...document.querySelectorAll('[data-qa="cell"]')].filter(vis);
  const rows = labels.map((l) => ({ id: l.dataset.row, label: l.textContent,
    lit: cells.filter((c) => c.dataset.row === l.dataset.row && c.dataset.on === '1').map((c) => Number(c.dataset.step)) }));
  const kit = rows.filter((r) => !r.id.startsWith('flip_')); const flip = rows.filter((r) => r.id.startsWith('flip_'));
  const sum = (rs) => rs.reduce((n, r) => n + r.lit.length, 0);
  const first = document.querySelector('[data-qa="kit-grid"] [data-qa="cell"]');
  const box = first ? first.getBoundingClientRect() : { width: 0, height: 0 };
  const g = document.querySelector('[data-qa="kit-grid"]');
  return { rows: rows.length, kitRows: kit.length, flipRows: flip.length, ids: rows.map((r) => r.id), labels: rows.map((r) => r.label),
    lit: sum(rows), kitLit: sum(kit), flipLit: sum(flip), perRow: rows.map((r) => ({ id: r.id, lit: r.lit })),
    cellW: +box.width.toFixed(1), cellH: +box.height.toFixed(1), gridW: g ? +g.getBoundingClientRect().width.toFixed(1) : null, vw: innerWidth,
    hiddenHitsLine: document.querySelector('[data-qa="hidden-hits"]')?.textContent ?? null };
})()`;
const grid = (p: Page) => p.evaluate(GRID) as Promise<Any>;
const song = (p: Page) => p.evaluate(() => (window as Any).__FEL_SONG__ ?? null);
const flip = (p: Page) => p.evaluate(() => (window as Any).__FEL_FLIP__ ?? null);
const engine = (p: Page) => p.evaluate(() => (window as Any).__FEL_STUDIO__?.engine() ?? null);
const proj = (p: Page) => p.evaluate(() => (window as Any).__FEL_PROJECT__ ?? null);
const KIT_ROWS = ['kick', 'snare', 'hat', 'open', 'clap', 'bass', 'lead', 'fx'];

async function clickCellId(p: Page, row: string, step: number): Promise<void> {
  await p.locator(`[data-qa="cell"][data-row="${row}"][data-step="${step}"]`).first().click();
}
async function clickCell(p: Page, row: number, step: number): Promise<void> { await clickCellId(p, KIT_ROWS[row], step); }
/** The 14-cell pattern: kick 0/4/8/12, snare 4/12, hats on the eighths. */
async function buildPattern(p: Page): Promise<void> {
  for (const s of [0, 4, 8, 12]) await clickCell(p, 0, s);
  for (const s of [4, 12]) await clickCell(p, 1, s);
  for (let s = 0; s < 16; s += 2) await clickCell(p, 2, s);
  await p.waitForTimeout(150);
}
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();
/** The room's toast lines (StudioMode S.toast, cleared after 2.2 s — MUSIC-SUITE P4: fixed, [data-qa="toast"]) and the lasting library line. */
// MUSIC-SUITE P4 (grid-ui): [data-qa="toast"] (fixed now, clear of the grid) and the lasting [data-qa="library-line"]
const toastsNow = (p: Page) => p.evaluate(() => [...document.querySelectorAll('[data-qa="toast"], [data-qa="library-line"] > span')].map((d) => d.textContent ?? '').map((t) => t.replace(/^LIBRARY: /, '')).filter(Boolean));
/** MUSIC-SUITE P3: a frame taken while a toast is up shows the toast over whatever sits at the bottom of the view (the
 *  dance-export button, a library card's delete question) — wait it out (≤ 3 s) so the frame shows the control itself. */
async function toastGone(p: Page): Promise<void> {
  await p.waitForFunction(() => !document.querySelector('[data-qa="toast"]'), undefined, { timeout: 3000 }).catch(() => undefined);
}
/** MUSIC-SUITE P2 (2026-09-25): a spend opens the inline confirm; note it (and any spend before the yes), then BUY. */
async function confirmThenYes(p: Page, spendsBefore: number): Promise<{ confirmShown: boolean; spentBeforeYes: number; text: string | null }> {
  const conf = p.locator('[data-qa="shop-confirm"]');
  const shown = (await conf.count()) > 0;
  const spentBeforeYes = (await p.evaluate(() => (window as Any).__FEL_STUDIO__.spends.length)) - spendsBefore;
  const text = shown ? await conf.textContent() : null;
  if (shown) { await p.locator('[data-qa="shop-yes"]').click(); await p.waitForTimeout(500); }
  return { confirmShown: shown, spentBeforeYes, text };
}

async function startRoom(p: Page): Promise<void> {
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await p.waitForFunction(`${GRID} !== null`, undefined, { timeout: 60000 });
  await p.waitForTimeout(300);
}
/** MUSIC-SUITE P3: wait for the autosave ("Saved on this device · HH:MM"); returns the status line either way. */
async function saved(p: Page, ms = 5000): Promise<string> {
  await p.waitForFunction(() => /Saved on this device ·/.test(document.querySelector('[data-qa="save-status"]')?.textContent ?? ''), undefined, { timeout: ms }).catch(() => undefined);
  return (await p.locator('[data-qa="save-status"]').textContent().catch(() => null)) ?? '';
}
async function setRange(p: Page, selector: string, v: number): Promise<void> {
  await p.locator(selector).first().evaluate((el, val) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, String(val));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
  await p.waitForTimeout(80);
}

/** Play `bars` bars and return what the scheduler started, plus the live step clock. */
async function playBars(p: Page, bars: number, bpm = 92): Promise<Any> {
  await p.evaluate(() => (window as Any).__FEL_STUDIO__.reset());
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(Math.round((bars * 16 * 60 / bpm / 4) * 1000) + 250);
  const audible = await p.evaluate(() => ({ ...(window as Any).__FEL_STUDIO__.audible }));
  const steps = await p.evaluate(() => [...(window as Any).__FEL_STUDIO__.steps]);
  await btn(p, 'STOP').click();
  return { audible, steps };
}

/**
 * Rows the engine plays that the grid does not draw. P1's number is `audibleNotDrawn`: sampleIds the scheduler STARTED
 * (the dev hook counts starts, with scheduleStep's own skips) that no drawn row carries. MUSIC-SUITE P3 adds:
 * `drawnButSilent` (a drawn row with hits that cannot sound: no buffer, or left out of the engine's selection) and
 * `hiddenWritten` (hits on rows the tier does not draw — silent by design, and the room says so in its hidden-hits line).
 */
function hiddenAudible(eng: Any, g: Any, audible: Any): Any {
  const drawn = new Set<string>(g?.ids ?? []);
  const tracks = (eng?.tracks ?? []) as Any[];
  const notDrawn = tracks.filter((t) => !drawn.has(t.sampleId));
  return {
    engineTracks: tracks.length, drawnRows: g?.rows ?? 0, drawnIds: g?.ids ?? [],
    notDrawn: notDrawn.map((t) => ({ ...t, audibleHits: audible?.[t.sampleId] ?? 0 })),
    audibleNotDrawn: Object.keys(audible ?? {}).filter((id) => (audible[id] ?? 0) > 0 && !drawn.has(id)),
    writtenButSilent: tracks.filter((t) => t.hits > 0 && !t.loaded).map((t) => t.sampleId),
    drawnButSilent: tracks.filter((t) => drawn.has(t.sampleId) && t.hits > 0 && !t.muted && (!t.loaded || t.heard === false)).map((t) => t.sampleId),
    hiddenWritten: notDrawn.filter((t) => t.hits > 0).map((t) => ({ sampleId: t.sampleId, hits: t.hits, heard: t.heard })),
    hiddenHitsLine: g?.hiddenHitsLine ?? null,
  };
}

/** TAP at `offsetMs` from the next scheduled step-0 note, on the engine's clock; the status line's text right after. */
const TAP_AT = `async (offsetMs) => {
  const P = window.__FEL_STUDIO__;
  const tapBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'TAP');
  const status = tapBtn.nextElementSibling;
  const seen = [];
  const mo = new MutationObserver(() => seen.push({ at: P.now(), text: status.textContent }));
  mo.observe(status, { childList: true, characterData: true, subtree: true });
  let target = null; const w0 = performance.now();
  while (!target && performance.now() - w0 < 8000) {
    const now = P.now();
    target = P.steps.find((s) => s.step === 0 && s.time - now > Math.max(0.03, -offsetMs / 1000 + 0.02));
    if (!target) await new Promise((r) => setTimeout(r, 4));
  }
  if (!target) { mo.disconnect(); return { err: 'no step-0 note scheduled' }; }
  const at = target.time + offsetMs / 1000;
  while (P.now() < at) await new Promise((r) => setTimeout(r, 1));
  const tapAt = P.now();
  tapBtn.click();
  await new Promise((r) => setTimeout(r, 0));
  const right = status.textContent;
  await new Promise((r) => setTimeout(r, 60));
  mo.disconnect();
  const afterTap = seen.filter((s) => s.at >= tapAt);
  return { offsetMs, dtMs: +((tapAt - target.time) * 1000).toFixed(1), statusRightAfter: right, firstChangeAfterTap: afterTap[0]?.text ?? null };
}`;

/** MUSIC-SUITE P3: the library as stored — the index (localStorage fel_studio_library_v2), IndexedDB audio keys, LS size. */
const LIB_STATE = `(async () => {
  let used = 0; const keys = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const v = localStorage.getItem(k) || ''; used += k.length + v.length; if (k.startsWith('fel_studio')) keys[k] = v.length; }
  let index = null; try { const o = JSON.parse(localStorage.getItem('fel_studio_library_v2') || 'null'); index = o && { n: o.tracks.length, titles: o.tracks.map((t) => t.title), ids: o.tracks.map((t) => t.id), hasDataUrl: JSON.stringify(o).includes('data:audio') }; } catch (e) { index = 'unreadable'; }
  const legacy = localStorage.getItem('fel_studio_tracks_v1');
  const idb = await new Promise((res) => {
    let creating = false;
    const r = indexedDB.open('fel-studio');
    r.onupgradeneeded = () => { creating = true; r.transaction.abort(); };   // never CREATE the database from here
    r.onerror = () => res(creating ? { libraryKeys: 0, bytes: 0, note: 'no database yet' } : { error: String(r.error) });
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('audio')) { db.close(); res({ libraryKeys: 0, note: 'no audio table' }); return; }
      const tx = db.transaction('audio', 'readonly'); const st = tx.objectStore('audio');
      const kr = st.getAllKeys(); const vr = st.getAll();
      tx.oncomplete = () => { const ks = kr.result.map(String); let bytes = 0; const lib = [];
        ks.forEach((k, i) => { if (k.startsWith('library/')) { lib.push(k); bytes += vr.result[i]?.bytes ?? vr.result[i]?.blob?.size ?? 0; } });
        db.close(); res({ libraryKeys: lib.length, keys: lib, bytes }); };
    };
  });
  return { usedChars: used, keys, legacyChars: legacy ? legacy.length : 0, index, idb };
})()`;

/** MUSIC-SUITE P3: the OPEN project as the store holds it (IndexedDB 'fel-studio', meta openProject:<player> → projects). */
const STORED = `(async () => new Promise((res) => {
  let creating = false;
  const r = indexedDB.open('fel-studio');
  r.onupgradeneeded = () => { creating = true; r.transaction.abort(); };
  r.onerror = () => res(creating ? { note: 'no database yet' } : { error: String(r.error) });
  r.onsuccess = () => {
    const db = r.result;
    if (!['projects', 'meta', 'audio'].every((t) => db.objectStoreNames.contains(t))) { db.close(); res({ note: 'tables missing' }); return; }
    const tx = db.transaction(['projects', 'meta', 'audio'], 'readonly');
    let rec = null;
    const m = tx.objectStore('meta').get('openProject:dev-player');
    m.onsuccess = () => { if (m.result) { const q = tx.objectStore('projects').get(m.result); q.onsuccess = () => { rec = q.result ?? null; }; } };
    const pk = tx.objectStore('projects').getAllKeys();
    const ak = tx.objectStore('audio').getAllKeys();
    tx.oncomplete = () => {
      db.close();
      const audio = new Set(ak.result.map(String));
      const b = rec && rec.body;
      if (!b) { res({ openId: m.result ?? null, projects: pk.result.length, record: null }); return; }
      const chops = (b.flip && b.flip.chops) || [];
      res({ openId: m.result, projects: pk.result.length, v: rec.v, title: rec.title,
        kitHits: (b.tracks || []).filter((t) => !String(t.sampleId).startsWith('flip_')).reduce((n, t) => n + t.pattern.filter(Boolean).length, 0),
        flipRowHits: (b.tracks || []).filter((t) => String(t.sampleId).startsWith('flip_')).reduce((n, t) => n + t.pattern.filter(Boolean).length, 0),
        sections: (b.sections || []).length, sectionSwings: (b.sections || []).map((s) => s.swing), chain: (b.chain || []).length,
        takes: (b.takes || []).map((t) => ({ bytes: t.audio && t.audio.bytes, stored: !!(t.audio && audio.has(t.audio.key)) })),
        flipSource: b.flip && b.flip.source ? b.flip.source.id : null,
        chops: chops.filter((c) => c.slice).length,
        editedChops: chops.filter((c) => c.pitch !== 0 || c.reverse || !c.gate).map((c, i) => ({ pitch: c.pitch, reverse: c.reverse, gate: c.gate })),
        flipRows: (b.flipRows || []).map((f) => ({ sampleId: f.sampleId, pad: f.pad, pitch: f.pitch, reverse: f.reverse, source: f.source && f.source.id })) });
    };
  };
}))()`;

function watch(p: Page, name: string): void {
  p.on('pageerror', (e) => { R.pageErrors.push(`${name}: ${String(e).slice(0, 300)}`); log('PAGEERROR', name, String(e).slice(0, 200)); });
  p.on('console', (m) => { const s = m.text(); if (/Quota|Uncaught|Unhandled/i.test(s)) log('CON', name, s.slice(0, 200)); });
}
async function newPage(ctx: BrowserContext, name: string): Promise<Page> {
  const p = await ctx.newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  watch(p, name);
  return p;
}

// ── MUSIC-SUITE P3: THE WORK-SURVIVAL MATRIX (its own context) ──────────────────────────────────────────────────────
/** The STUDIO view: what the grid and the song panel show, plus the open project. */
async function studioView(p: Page): Promise<Any> {
  const g = await grid(p); const s = await song(p); const pr = await proj(p);
  return { lit: g?.lit ?? null, kitLit: g?.kitLit ?? null, flipLit: g?.flipLit ?? null, rows: g?.ids ?? null,
    sections: s?.sections ?? null, chainEntries: s?.chain?.length ?? null, chainBars: s?.bars ?? null,
    takes: s?.takes ?? null, takesLoaded: s?.takesLoaded ?? null, projectId: pr?.id ?? null, title: pr?.title ?? null, status: pr?.status ?? null };
}
/** The FLIP view: go to the FLIP tab (FlipPad mounts and restores from the project), read it, come back to STUDIO. */
async function flipView(p: Page): Promise<Any> {
  await btn(p, 'FLIP').click();
  await p.waitForFunction(() => (window as Any).__FEL_FLIP__?.decoded === true || (window as Any).__FEL_FLIP__?.source === null, undefined, { timeout: 20000 }).catch(() => undefined);
  await p.waitForTimeout(150);
  const f = await flip(p);
  const padText = await p.evaluate(() => [2, 3].map((n) => document.querySelector(`[aria-label="pad ${n}"]`)?.textContent ?? null));
  await btn(p, 'STUDIO').click();
  await p.waitForFunction(`${GRID} !== null`, undefined, { timeout: 10000 }).catch(() => undefined);
  await p.waitForTimeout(150);
  return { source: f?.source ?? null, slices: f?.slices ?? null, edited: f?.edited ?? null, decoded: f?.decoded ?? null, pad2: padText[0], pad3: padText[1] };
}
const takesBack = (p: Page, n: number) => p.waitForFunction((k) => ((window as Any).__FEL_SONG__?.takesLoaded ?? 0) >= k, n, { timeout: 15000 }).catch(() => undefined);

async function survivalMatrix(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  let p = await newPage(ctx, 'matrix');
  await p.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await startRoom(p);
  const tiers: Any = { firstVisit: (await grid(p))?.kitRows };

  // BUILD — the way a player does: the 14-cell beat, played (the chain opens), section 1; a 15th hit, section 2 (hook):
  // two sections chained open THE STUDIO, where RECORD TAKE is offered.
  await buildPattern(p);
  await btn(p, 'PLAY').click(); await p.waitForTimeout(700); await btn(p, 'STOP').click();
  await p.locator('[data-qa="save-section"]').waitFor({ timeout: 10000 });
  tiers.afterPlay = (await grid(p))?.kitRows;
  await p.locator('[data-qa="save-section"]').click(); await p.waitForTimeout(200);
  await clickCellId(p, 'open', 14);
  await p.locator('[data-qa="song-panel"] select').first().selectOption('hook').catch(() => undefined);
  await p.locator('[data-qa="save-section"]').click(); await p.waitForTimeout(400);
  tiers.afterTwoSections = (await grid(p))?.kitRows;
  R.rowsByTier = { ...tiers, how: 'kit rows drawn: fresh device; after the 14-cell beat is PLAYED; after 2 sections saved (each save also chains it)' };
  log('rows by tier', JSON.stringify(tiers));

  // CHOPS — the FLIP tab: the 808 bass, pad 3 reversed, pad 2 pitched −5 and SENT TO TRACK (its row, flip_1)
  await btn(p, 'FLIP').click();
  await btn(p, '808 bass').click();
  await p.waitForFunction(() => ((window as Any).__FEL_FLIP__?.slices ?? 0) > 2 && (window as Any).__FEL_FLIP__?.decoded, undefined, { timeout: 20000 });
  await p.getByRole('button', { name: 'pad 3', exact: true }).click();
  await btn(p, 'REVERSE').click();
  await p.getByRole('button', { name: 'pad 2', exact: true }).click();
  await setRange(p, 'label:has-text("pitch") input[type=range]', -5);
  await p.locator('[data-qa="flip-send"]').click(); await p.waitForTimeout(300);
  await btn(p, 'STUDIO').click(); await p.waitForTimeout(250);
  await clickCellId(p, 'flip_1', 2); await clickCellId(p, 'flip_1', 10);

  // A TAKE — the fake mic: PLAY, RECORD TAKE (starts on the next bar), ~1.5 s, STOP TAKE, STOP
  await btn(p, 'PLAY').click();
  await btn(p, '● RECORD TAKE').click();
  await p.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === '■ STOP TAKE'), undefined, { timeout: 10000 });
  await p.waitForTimeout(1500);
  await btn(p, '■ STOP TAKE').click();
  await p.waitForFunction(() => ((window as Any).__FEL_SONG__?.takes ?? 0) >= 1, undefined, { timeout: 10000 }).catch(() => undefined);
  await btn(p, 'STOP').click();
  await takesBack(p, 1);
  const builtStatus = await saved(p);
  const built = { ...(await studioView(p)), flip: await flipView(p), stored: await p.evaluate(STORED), savedLine: builtStatus };
  R.matrixBuilt = built;
  log('built', JSON.stringify(built).slice(0, 600));
  check('matrix build: a beat + Flip-row hits, 2 sections chained, 1 take (decoded), 2 edited chops, autosaved',
    built.kitLit === 15 && built.flipLit === 2 && built.sections === 2 && built.chainEntries === 2 && built.takes === 1 && built.takesLoaded === 1
      && built.flip.source === 'fel_808_bass' && built.flip.edited === 2 && built.flip.decoded === true && /Saved on this device ·/.test(builtStatus),
    built, 'kit 15 + flip 2 lit, 2 sections / 2 chain, 1 take loaded, fel_808_bass with 2 edited chops, saved');
  await frame(p, 'matrix-built', true);

  const rows: Any[] = [];
  const same = (a: Any, fv: Any) => ({
    grid: a.lit === built.lit && a.kitLit === built.kitLit && a.flipLit === built.flipLit && (a.rows ?? []).includes('flip_1'),
    sections: a.sections === built.sections,
    chain: a.chainEntries === built.chainEntries && a.chainBars === built.chainBars,
    takes: a.takes === built.takes && a.takesLoaded === built.takes,
    chops: fv.source === built.flip.source && fv.slices === built.flip.slices && fv.edited === built.flip.edited && fv.decoded === true,
    project: a.projectId === built.projectId,
  });
  const record = async (step: string, how: string) => {
    await takesBack(p, built.takes);
    const a = await studioView(p);                // the STUDIO view right after the transition, before touching FLIP
    const fv = await flipView(p);                 // then the FLIP tab
    const stored = await p.evaluate(STORED);
    const s = same(a, fv);
    const pass = Object.values(s).every(Boolean);
    rows.push({ step, how, ...a, flip: fv, stored, kept: s, pass });
    log('matrix', step, pass ? 'KEPT' : 'LOST', JSON.stringify(s));
  };
  const toStudio = async () => { await saved(p, 3000); };

  // 1. FLIP tab and back
  await btn(p, 'FLIP').click(); await p.waitForTimeout(800);
  await btn(p, 'STUDIO').click(); await p.waitForTimeout(300);
  await record('FLIP tab and back', 'STUDIO → FLIP (0.8 s) → STUDIO');
  // 2. LIBRARY + LISTEN and back
  await btn(p, 'LIBRARY').click(); await p.waitForTimeout(400);
  await btn(p, 'LISTEN').click(); await p.waitForTimeout(400);
  await btn(p, 'STUDIO').click(); await p.waitForTimeout(300);
  await record('LIBRARY + LISTEN tabs and back', 'STUDIO → LIBRARY → LISTEN → STUDIO (the song panel is hidden, not unmounted)');
  // 3. PERFORM and back
  await btn(p, 'PERFORM').click(); await p.waitForTimeout(300);
  const performShown = await p.locator('[data-qa="perform-tap"]').count();
  await btn(p, 'BUILD').click(); await p.waitForTimeout(300);
  await record('PERFORM and back', `in-room PERFORM (TAP shown: ${performShown}) → BUILD`);
  // 4. END SET + REPLAY (the shell's remount)
  await toStudio();
  await btn(p, 'PERFORM').click(); await p.waitForTimeout(200);
  await btn(p, 'END SET').click(); await p.waitForTimeout(300);
  await p.locator('[data-dev="replay"]').click();
  await startRoom(p);
  await record('END SET + REPLAY (remount)', 'PERFORM → END SET → the dev end card REPLAY, which remounts StudioMode as GameShell does (bumps its key)');
  // 5. navigate away and back
  await toStudio();
  await p.goto(`${BASE}/robots.txt`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await startRoom(p);
  await record('navigate away and back', 'goto /robots.txt, then /dev/music?stage=studio → TAP TO START (a fresh mount, same tab)');
  // 6. page reload
  await toStudio();
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 240000 });
  await startRoom(p);
  await record('page reload', 'page.reload → TAP TO START');
  // 7. open straight into PERFORM, then BUILD
  await toStudio();
  await p.goto(`${BASE}/dev/music?stage=perform`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await startRoom(p);
  await takesBack(p, built.takes);
  const inPerform = { ...(await studioView(p)), tap: await p.locator('[data-qa="perform-tap"]').count() };
  await btn(p, 'BUILD').click(); await p.waitForTimeout(300);
  await record('PERFORM stage (?stage=perform) and back to BUILD', `goto /dev/music?stage=perform → TAP TO START (PERFORM up: TAP ${inPerform.tap}, lit ${inPerform.lit}) → BUILD`);
  rows[rows.length - 1].inPerform = inPerform;
  // 8. close the tab, open a new one
  await toStudio();
  await p.close();
  p = await newPage(ctx, 'matrix-tab2');
  await p.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await startRoom(p);
  await record('close the tab, open a new one', 'page.close, a new page in the same browser profile (the same device) → /dev/music?stage=studio → TAP TO START');

  R.workSurvival = {
    matrix: rows, passed: rows.filter((r) => r.pass).length, of: rows.length,
    how: 'each row: the STUDIO view right after the transition (data-qa cells lit — kit rows and Flip rows; __FEL_SONG__ sections, chain, bars, takes, takesLoaded; __FEL_PROJECT__ id), then the FLIP tab (__FEL_FLIP__ source, slices, edited chops, decoded), then the stored record (IndexedDB fel-studio). A row passes only if grid, sections, chain, takes (decoded) and chops all equal the build and the project is the same one.',
  };
  for (const r of rows) check(`matrix: ${r.step} — grid, sections, chain, takes and chops all come back`, r.pass, r.kept, 'all true');

  // MY PROJECTS — a second project, then OPEN the first again (a 9th read, beside the matrix)
  await p.locator('[data-qa="projects-toggle"]').click();
  await p.locator('[data-qa="project-new"]').click(); await p.waitForTimeout(600);
  const blank = (await grid(p))?.lit;
  await clickCellId(p, 'kick', 0); await clickCellId(p, 'snare', 8);
  await saved(p);
  await p.locator('[data-qa="project-row"][data-id]').first().waitFor({ timeout: 5000 }).catch(() => undefined);
  const listed = await p.locator('[data-qa="project-row"][data-id]').evaluateAll((els) => els.map((e) => ({ id: (e as HTMLElement).dataset.id, text: (e.textContent ?? '').slice(0, 120), current: (e as HTMLElement).dataset.current === 'true' })));
  await p.locator(`[data-qa="project-row"][data-id="${built.projectId}"] [data-qa="project-open"]`).click();
  await p.waitForTimeout(900);
  await takesBack(p, built.takes);
  const reopened = await studioView(p);
  const reopenedFlip = await flipView(p);
  // the list stays open across OPEN? re-open it for the frame if it closed
  if ((await p.locator('[data-qa="projects-list"]').count()) === 0) await p.locator('[data-qa="projects-toggle"]').click();
  await p.waitForTimeout(200);
  const listedAfter = await p.locator('[data-qa="project-row"][data-id]').evaluateAll((els) => els.map((e) => ({ id: (e as HTMLElement).dataset.id, text: (e.textContent ?? '').slice(0, 120), current: (e as HTMLElement).dataset.current === 'true' })));
  await frame(p, 'my-projects', true);
  R.myProjects = { blankLit: blank, listed, reopened, reopenedFlip, listedAfter, keptOnReopen: same(reopened, reopenedFlip) };
  check('MY PROJECTS: + NEW is blank, both projects listed, OPEN brings the first back whole',
    blank === 0 && listed.length === 2 && Object.values(R.myProjects.keptOnReopen).every(Boolean) && listedAfter.find((x: Any) => x.current)?.id === built.projectId,
    { blank, listed: listed.length, kept: R.myProjects.keptOnReopen }, 'blank 0, 2 listed, all kept, current = the built one');
  await ctx.close();
}

// ── DESKTOP (P1's run, with the P3 changes named in the header) ────────────────────────────────────────────────────
async function mainRun(browser: Browser): Promise<void> {
  // 0. the route honours ?stage=perform (StudioMode reads it at READY: musicStage.ts readMusicStage)
  {
    const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const sp = await newPage(sctx, 'stage');
    await sp.goto(`${BASE}/dev/music?stage=perform`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    // MUSIC-SUITE P3: read the pill once the splash says TAP TO START. The splash starts every pill on 'studio' and reads
    // the pick in an effect (boot-splash.tsx:165-166), so a read the moment the pill exists can catch the first render —
    // P1 read 'true', the P2 re-run 'false', with PERFORM entered both times; the P3 room restores its project before the
    // splash is ready, which moves that moment.
    await sp.getByRole('button', { name: 'TAP TO START' }).waitFor({ timeout: 240000 });
    const pressed = await sp.getByRole('button', { name: /^PERFORM —/ }).getAttribute('aria-pressed', { timeout: 10000 }).catch(() => null);
    await startRoom(sp);
    R.stageCheck = { url: '/dev/music?stage=perform', splashPerformPressed: pressed, tapButtonShown: await sp.getByRole('button', { name: 'TAP', exact: true }).count(),
      endSetShown: await sp.getByRole('button', { name: 'END SET', exact: true }).count(),
      how: 'fresh context; the splash STAGE pill aria-pressed, then after TAP TO START whether the PERFORM controls (TAP, END SET) are up' };
    log('stage check', JSON.stringify(R.stageCheck));
    await sctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // MUSIC-SUITE P3: a switch for a FULL DEVICE — while window.__P3_FULL__ is set, every IndexedDB put/add throws
  // QuotaExceededError (the error a full origin gives), so the publish-failure line can be seen on purpose after the 20.
  await ctx.addInitScript({ content: `(() => { for (const m of ['put', 'add']) { const f = IDBObjectStore.prototype[m]; IDBObjectStore.prototype[m] = function (...a) { if (window.__P3_FULL__) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return f.apply(this, a); }; } })();` });
  const p = await newPage(ctx, 'main');
  await p.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await startRoom(p);
  const first = await grid(p);
  R.firstVisit = { rows: first.rows, labels: first.labels, how: 'fresh browser context → TAP TO START → the drawn grid rows (P3: data-qa grid-row; P1: the grid div children / 17)' };
  log('first visit rows', first.rows);

  // 1. build
  await buildPattern(p);
  const built = await grid(p);
  R.cellSize = { desktop1280: { cellW: built.cellW, cellH: built.cellH, gridW: built.gridW, vw: built.vw, how: 'getBoundingClientRect of the first step cell (row 1, step 1) at a 1280×800 viewport; dev route adds no padding, StudioMode pads 16 px' } };
  log('built', built.lit, 'lit; rows', built.rows, 'cell', built.cellW);

  // MUSIC-SUITE P3: THE DANCE EXPORT AT THE GRID TIER — the first-visit grid, nothing played yet
  {
    const chips = await p.evaluate(() => [...document.querySelectorAll('[data-qa="tier-chip"]')].map((e) => `${(e as HTMLElement).dataset.tier}:${(e as HTMLElement).dataset.state}`));
    const n = await p.locator('[data-qa="dance-export"]').count();
    const label = n ? await p.locator('[data-qa="dance-export"]').textContent() : null;
    if (n) { await p.locator('[data-qa="dance-export"]').click(); await p.waitForTimeout(250); }
    const toast = await toastsNow(p);
    const exported = await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('fel-dance-exported') ?? 'null'); return v ? { id: v.track?.id, name: v.track?.name, bars: v.track?.bars, bpm: v.track?.bpm, hits: v.summary?.hits ?? null, steps: Array.isArray(v.steps) ? v.steps.length : null } : null; });
    const labelAfter = n ? await p.locator('[data-qa="dance-export"]').textContent() : null;
    const pr = await proj(p);
    await frame(p, 'grid-dance-export', true);
    R.danceExportAtGrid = { chips, buttons: n, label, labelAfter, toast, exported, projectId: pr?.id, projectTitle: pr?.title,
      how: 'fresh device, 14 cells lit, transport never started (THE GRID tier): data-qa dance-export count; click; read localStorage fel-dance-exported' };
    check('GRID tier: SEND TO THE DANCE FLOOR is shown and exports this grid under the project\'s own name',
      chips[0] === 'grid:current' && n === 1 && !!exported && (exported.steps ?? 0) > 0 && exported.name !== 'My Track' && /ON THE DANCE FLOOR/.test(labelAfter ?? ''),
      R.danceExportAtGrid, 'grid current, 1 button, a chart with steps, not "My Track", ✓ ON THE DANCE FLOOR');
  }

  // 6. live swing: two bars at 92 BPM / 15 %
  const play1 = await playBars(p, 2);
  const s0 = (play1.steps as Any[]).filter((s) => s.step === 0).map((s) => s.time);
  const base = 60 / 92 / 4;
  R.liveSwing = {
    bpm: 92, swing: 0.15,
    barSecMeasured: s0.length >= 2 ? +(s0[1] - s0[0]).toFixed(4) : null,
    barSecUnswung: +(16 * base).toFixed(4),
    barSecRenderFormula: +(16 * base).toFixed(4),
    effectiveBpm: s0.length >= 2 ? +((60 * 4) / (s0[1] - s0[0])).toFixed(2) : null,
    oddStepOffsetMs: (() => {
      const st = play1.steps as Any[]; const i = st.findIndex((s) => s.step === 0); if (i < 0 || st.length < i + 3) return null;
      const t0s = st[i].time; return { step1: +((st[i + 1].time - t0s - base) * 1000).toFixed(2), step2: +((st[i + 2].time - t0s - 2 * base) * 1000).toFixed(2) };
    })(),
    audibleOver2Bars: play1.audible,
    how: 'dev hook __FEL_STUDIO__.steps (AudioEngine.scheduleStep times on the audio clock) over 2 bars of PLAY; bar = time between consecutive step-0s. The offline render places bar b at b·16·base with odd steps +base·swing·0.5 (AudioEngine.ts:214-215), so its bar is exactly the unswung one. oddStepOffsetMs = step time minus the straight grid (+ = late)',
  };
  log('live bar', R.liveSwing.barSecMeasured, 'vs', R.liveSwing.barSecUnswung);
  await frame(p, 'studio-desktop');

  // save one section (chain tier)
  await btn(p, 'SAVE GRID AS SECTION').click();
  await p.waitForTimeout(200);

  // 2. HIDDEN BUT AUDIBLE — (a) the Flip: SEND TO TRACK pad 1, ARM REC, tap pads 1 and 2 while playing
  await btn(p, 'FLIP').click();
  await btn(p, '808 bass').click();
  await p.waitForFunction(() => ((window as Any).__FEL_FLIP__?.slices ?? 0) > 2 && (window as Any).__FEL_FLIP__?.decoded, undefined, { timeout: 20000 }).catch(() => undefined);
  await p.getByRole('button', { name: 'pad 1', exact: true }).dispatchEvent('pointerdown');
  await p.waitForTimeout(150);
  await p.locator('[data-qa="flip-send"]').click();
  await btn(p, 'ARM REC').click();
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(400);
  for (const k of ['1', '1', '1', '1', '2', '2']) { await p.keyboard.press(k); await p.waitForTimeout(330); }
  await btn(p, 'STOP').click();
  await btn(p, '● REC ARMED').click().catch(() => {});
  await btn(p, 'STUDIO').click(); await p.waitForTimeout(250);
  const gFlip = await grid(p);
  const playFlip = await playBars(p, 2);
  const engFlip = await engine(p);
  R.hiddenAfterFlip = { ...hiddenAudible(engFlip, gFlip, playFlip.audible), audibleOver2Bars: playFlip.audible, flipRowsHead: await p.locator('[data-qa="flip-rows-head"]').textContent().catch(() => null),
    how: 'FLIP: 808 bass, pad 1 → SEND TO TRACK, ARM REC, PLAY, keys 1×4 and 2×2 (330 ms apart), STOP; STUDIO: drawn row ids vs __FEL_STUDIO__.engine().tracks, then 2 bars of PLAY counting the hits scheduleStep started' };
  log('hidden after flip', JSON.stringify(R.hiddenAfterFlip.audibleNotDrawn), 'silent', JSON.stringify(R.hiddenAfterFlip.writtenButSilent), 'drawn', JSON.stringify(gFlip.ids));
  await frame(p, 'flip-rows-studio', true);
  check('after SEND TO TRACK + ARM REC: 0 audible rows off screen, 0 silent written rows, the Flip rows drawn and heard',
    R.hiddenAfterFlip.audibleNotDrawn.length === 0 && R.hiddenAfterFlip.writtenButSilent.length === 0 && R.hiddenAfterFlip.drawnButSilent.length === 0
      && gFlip.ids.includes('flip_0') && gFlip.ids.includes('flip_1') && (playFlip.audible.flip_0 ?? 0) > 0 && (playFlip.audible.flip_1 ?? 0) > 0,
    { audibleNotDrawn: R.hiddenAfterFlip.audibleNotDrawn, writtenButSilent: R.hiddenAfterFlip.writtenButSilent, drawnButSilent: R.hiddenAfterFlip.drawnButSilent, drawn: gFlip.ids, heard: playFlip.audible },
    '[] / [] / [] / flip_0 + flip_1 drawn and heard');

  // (b) CELL at the chain tier
  const spendsBefore = await p.evaluate(() => (window as Any).__FEL_STUDIO__.spends.length);
  await p.getByRole('button', { name: /CELL: LAY A FOUNDATION/ }).click();
  await p.waitForTimeout(400);
  const cellConfirm = await confirmThenYes(p, spendsBefore);
  // P3: a BUY after HEAR IT may leave the transport running; stop it only if it is (a missing STOP would wait 30 s)
  if (await btn(p, 'STOP').count()) await btn(p, 'STOP').click();
  const gCell = await grid(p);
  const playCell = await playBars(p, 2);
  const engCell = await engine(p);
  const spends = await p.evaluate(() => (window as Any).__FEL_STUDIO__.spends);
  R.hiddenAfterCellChainTier = { ...hiddenAudible(engCell, gCell, playCell.audible), litDrawnAfterCell: gCell.lit, audibleOver2Bars: playCell.audible,
    spendsAsked: spends.slice(spendsBefore), confirmShown: cellConfirm.confirmShown, spentBeforeYes: cellConfirm.spentBeforeYes, confirmText: cellConfirm.text,
    how: 'CELL: LAY A FOUNDATION at the chain tier (6 kit rows + the Flip rows drawn); the inline confirm (P2) is recorded, then its BUY pressed; then 2 bars of PLAY' };
  log('hidden after cell', JSON.stringify(R.hiddenAfterCellChainTier.audibleNotDrawn), 'hiddenWritten', JSON.stringify(R.hiddenAfterCellChainTier.hiddenWritten));
  check('after CELL (chain tier): 0 audible rows off screen, and CELL wrote nothing on rows the grid does not draw',
    R.hiddenAfterCellChainTier.audibleNotDrawn.length === 0 && R.hiddenAfterCellChainTier.hiddenWritten.length === 0 && R.hiddenAfterCellChainTier.drawnButSilent.length === 0,
    { audibleNotDrawn: R.hiddenAfterCellChainTier.audibleNotDrawn, hiddenWritten: R.hiddenAfterCellChainTier.hiddenWritten, drawnButSilent: R.hiddenAfterCellChainTier.drawnButSilent, heard: playCell.audible }, '[] / [] / []');

  // 5. PERFORM on the CELL pattern
  await btn(p, 'PERFORM').click(); await p.waitForTimeout(150);
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(600);
  const taps: Any[] = [];
  for (const off of [10, 40, 100, -30, 10, 40, 100, -30]) {
    taps.push(await p.evaluate(`(${TAP_AT})(${off})`));
    await p.waitForTimeout(250);
  }
  await frame(p, 'perform');
  const statusBefore = await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'TAP')?.nextElementSibling?.textContent ?? null);
  await btn(p, 'STOP').click();   // before END SET: the dev end card covers the room
  const beforeEnd = await grid(p);
  await btn(p, 'END SET').click();
  await p.waitForTimeout(400);
  const endPattern = await p.evaluate(() => (window as Any).__FEL_STUDIO__.ended);
  R.performOnPattern = { taps, statusBeforeEndSet: statusBefore, endSetResult: endPattern,
    how: 'PERFORM (in-room), PLAY; TAP clicked in-page when the engine clock reached a scheduled step-0 note + offsetMs (__FEL_STUDIO__.steps/now); status line read right after the click and the first MutationObserver change after the tap; END SET result = what StudioMode passed to onEnd' };
  log('perform taps', JSON.stringify(taps.map((t) => [t.offsetMs, t.dtMs, t.statusRightAfter])));

  // P1's matrix row "END SET → REPLAY" again in this context (P1: 17 lit → 0, Flip rows gone)
  await p.locator('[data-dev="replay"]').click();
  await startRoom(p);
  const afterReplay = await grid(p);
  const engReplay = await engine(p);
  R.replayInMainRun = { litBefore: beforeEnd.lit, litAfter: afterReplay.lit, idsBefore: beforeEnd.ids, idsAfter: afterReplay.ids,
    engineFlipRows: (engReplay?.tracks ?? []).filter((t: Any) => t.sampleId.startsWith('flip_')).map((t: Any) => `${t.sampleId}:${t.hits}:${t.loaded ? 'loaded' : 'no buffer'}`),
    how: 'P1\'s row, same place in the run: the CELL pattern + Flip rows, END SET, REPLAY; lit cells and the engine\'s Flip rows after the remount' };
  check('main run: END SET + REPLAY keeps the CELL pattern and the Flip rows (P1: → 0)', afterReplay.lit === beforeEnd.lit && R.replayInMainRun.engineFlipRows.length >= 2 && R.replayInMainRun.engineFlipRows.every((s: string) => s.endsWith('loaded')),
    R.replayInMainRun, `${beforeEnd.lit} lit, flip rows loaded`);

  // 5b. PERFORM on an EMPTY grid — P3 keeps the beat across REPLAY, so the empty grid is a NEW project
  await p.locator('[data-qa="projects-toggle"]').click();
  await p.locator('[data-qa="project-new"]').click(); await p.waitForTimeout(600);
  await p.locator('[data-qa="projects-toggle"]').click();
  await btn(p, 'PERFORM').click(); await p.waitForTimeout(150);
  await p.evaluate(() => (window as Any).__FEL_STUDIO__.reset());
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(600);
  const emptyTaps: Any[] = [];
  for (const off of [10, 40, 100]) { emptyTaps.push(await p.evaluate(`(${TAP_AT})(${off})`)); await p.waitForTimeout(250); }
  const emptyAudible = await p.evaluate(() => ({ ...(window as Any).__FEL_STUDIO__.audible }));
  await btn(p, 'STOP').click();
  const emptyLit = (await grid(p))?.lit ?? null;
  await btn(p, 'END SET').click();
  await p.waitForTimeout(400);
  const endEmpty = await p.evaluate(() => (window as Any).__FEL_STUDIO__.ended);
  R.performOnEmptyGrid = { lit: emptyLit, taps: emptyTaps, audibleHitsWhilePlaying: emptyAudible, endSetResult: endEmpty,
    how: 'MY PROJECTS → + NEW PROJECT (0 lit; P1 used REPLAY, which no longer clears the grid); PERFORM, PLAY, TAP at step-0 + offset; END SET' };
  log('empty perform', JSON.stringify(emptyTaps.map((t) => [t.offsetMs, t.statusRightAfter])), 'won', endEmpty?.won);
  await p.locator('[data-dev="replay"]').click();
  await startRoom(p);

  // 4. PUBLISH — 20 in a row (stops at the first that fails), then DELETE one from the LIBRARY
  if (((await grid(p))?.lit ?? 0) === 0) { await buildPattern(p); await saved(p, 3000); }
  const pubs: Any[] = [];
  for (let i = 1; i <= 20; i++) {
    const before = await p.evaluate(LIB_STATE) as Any;
    const errsBefore = R.pageErrors.length;
    await p.getByPlaceholder('track title…').fill(`probe take ${i}`);
    await btn(p, 'PUBLISH TO LIBRARY').click();
    const toasts: string[] = [];
    const w0 = Date.now();
    while (Date.now() - w0 < 20000) {
      const t = await toastsNow(p);   // MUSIC-SUITE P4: the toast + the lasting library line
      for (const s of t) if (s && !toasts.includes(s)) toasts.push(s);
      const busy = await p.getByRole('button', { name: 'RENDERING…' }).count();
      if (!busy && Date.now() - w0 > 400) break;
      await p.waitForTimeout(100);
    }
    await p.waitForTimeout(300);
    const after = await p.evaluate(LIB_STATE) as Any;
    const titleLeft = await p.getByPlaceholder('track title…').inputValue();
    const button = (await p.getByRole('button', { name: /PUBLISH TO LIBRARY|RENDERING/ }).first().textContent()) ?? '';
    const nB = before.index?.n ?? 0; const nA = after.index?.n ?? 0;
    const row = { attempt: i, libraryBefore: nB, libraryAfter: nA, audioKeysAfter: after.idb?.libraryKeys ?? null, audioBytesAfter: after.idb?.bytes ?? null,
      localStorageCharsAfter: after.usedChars, indexHasDataUrl: after.index?.hasDataUrl ?? null, toastsSeen: toasts, titleFieldAfter: titleLeft, buttonAfter: button, newPageErrors: R.pageErrors.slice(errsBefore) };
    pubs.push(row);
    log('publish', i, JSON.stringify(row).slice(0, 260));
    if (nA <= nB) { await frame(p, 'publish-fail', false, true); break; }
  }
  const okN = pubs.filter((r) => r.libraryAfter > r.libraryBefore).length;
  R.publishUntilFailure = { attempts: pubs, succeeded: okN, failedAt: pubs.find((r) => r.libraryAfter <= r.libraryBefore)?.attempt ?? null,
    how: 'title filled, PUBLISH TO LIBRARY clicked, waited for RENDERING… to clear; library = the P3 index fel_studio_library_v2 .tracks.length; audio = IndexedDB fel-studio/audio library/* keys; toasts = the toast + library line text while waiting; up to 20, stops at the first publish that did not grow the library' };
  check('20 publishes in a row succeed (P1: the 4th failed with no message)', okN === 20 && pubs.every((r) => r.newPageErrors.length === 0 && r.titleFieldAfter === ''), { succeeded: okN, failedAt: R.publishUntilFailure.failedAt, lastAudioKeys: pubs[pubs.length - 1]?.audioKeysAfter, lastLsChars: pubs[pubs.length - 1]?.localStorageCharsAfter }, '20, no page errors, title cleared each time');

  await btn(p, 'LIBRARY').click();
  await p.waitForTimeout(500);
  const delButtons = await p.getByRole('button', { name: /^Delete / }).count();
  const beforeDel = await p.evaluate(LIB_STATE) as Any;
  const victim = 'probe take 1';
  const victimId = beforeDel.index?.ids?.[beforeDel.index.titles.indexOf(victim)] ?? null;
  await toastGone(p);   // the last publish's toast sits over the bottom card (where "probe take 1" is) for 2.2 s
  await p.getByRole('button', { name: `Delete ${victim}`, exact: true }).click();
  await p.waitForTimeout(250);
  const confirmText = await p.locator('[role="alertdialog"]').first().textContent().catch(() => null);
  await p.locator('[role="alertdialog"]').first().evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => undefined);
  await p.waitForTimeout(150);
  await frame(p, 'library-delete-confirm');
  await p.getByRole('button', { name: 'YES, DELETE', exact: true }).click();
  const delToasts: string[] = [];
  const w1 = Date.now();
  while (Date.now() - w1 < 3000) {
    const t = await toastsNow(p);   // MUSIC-SUITE P4: the toast + the lasting library line
    for (const s of t) if (s && !delToasts.includes(s)) delToasts.push(s);
    if ((await p.getByRole('button', { name: 'YES, DELETE' }).count()) === 0 && Date.now() - w1 > 400) break;
    await p.waitForTimeout(100);
  }
  await p.waitForTimeout(300);
  const afterDel = await p.evaluate(LIB_STATE) as Any;
  await p.evaluate(() => window.scrollTo(0, 0));
  await frame(p, 'library-after-delete', false, true);   // keep the "Deleted …" line: it is the room's answer
  R.libraryDelete = { deleteButtonsShown: delButtons, victim, victimId, confirmText, toasts: delToasts,
    indexBefore: beforeDel.index?.n, indexAfter: afterDel.index?.n, audioKeysBefore: beforeDel.idb?.libraryKeys, audioKeysAfter: afterDel.idb?.libraryKeys,
    victimAudioGone: victimId ? !(afterDel.idb?.keys ?? []).includes(`library/${victimId}`) : null, victimTitleGone: !(afterDel.index?.titles ?? []).includes(victim),
    how: 'LIBRARY → the "probe take 1" card\'s DELETE (aria-label "Delete probe take 1") → the inline alertdialog → YES, DELETE; the index + IndexedDB keys before/after' };
  // MUSIC-SUITE P3: THE FAILURE IS SAID — a publish on a full device (P1: the 4th publish threw QuotaExceededError out of
  // the click handler: no toast, the title left in the field, only Next's dev error badge; frame p1/music-publish-fail.png)
  {
    await btn(p, 'STUDIO').click(); await p.waitForTimeout(300);
    await toastGone(p);
    const before = await p.evaluate(LIB_STATE) as Any;
    const errsBefore = R.pageErrors.length;
    await p.evaluate(() => { (window as Any).__P3_FULL__ = true; });
    await p.getByPlaceholder('track title…').fill('probe take full');
    await btn(p, 'PUBLISH TO LIBRARY').click();
    const toasts: string[] = [];
    const w0 = Date.now();
    while (Date.now() - w0 < 20000) {
      for (const t of await toastsNow(p)) if (!toasts.includes(t)) toasts.push(t);
      if (!(await p.getByRole('button', { name: 'RENDERING…' }).count()) && Date.now() - w0 > 400) break;
      await p.waitForTimeout(100);
    }
    await p.waitForTimeout(200);
    for (const t of await toastsNow(p)) if (!toasts.includes(t)) toasts.push(t);
    await frame(p, 'publish-full', false, true);
    await p.evaluate(() => { (window as Any).__P3_FULL__ = false; });
    const after = await p.evaluate(LIB_STATE) as Any;
    R.publishOnFullDevice = { toasts, libraryBefore: before.index?.n, libraryAfter: after.index?.n, audioKeysBefore: before.idb?.libraryKeys, audioKeysAfter: after.idb?.libraryKeys,
      titleFieldAfter: await p.getByPlaceholder('track title…').inputValue(), saveStatus: await p.locator('[data-qa="save-status"]').textContent().catch(() => null),
      newPageErrors: R.pageErrors.slice(errsBefore),
      how: 'after the 20 + the delete: every IndexedDB put/add throws QuotaExceededError (window.__P3_FULL__, an init script on the context), PUBLISH TO LIBRARY once; toasts while it runs; the index and audio keys before/after; then the switch is turned off' };
    log('publish on a full device', JSON.stringify(R.publishOnFullDevice).slice(0, 400));
    check('a publish on a full device is SAID (a line, not an uncaught error), nothing half-written, the title kept for a retry',
      toasts.some((t) => /space|quota|full|could not|couldn't|not saved|NOT/i.test(t)) && R.publishOnFullDevice.newPageErrors.length === 0
        && after.index?.n === before.index?.n && after.idb?.libraryKeys === before.idb?.libraryKeys && R.publishOnFullDevice.titleFieldAfter === 'probe take full',
      { toasts, library: `${before.index?.n} → ${after.index?.n}`, audio: `${before.idb?.libraryKeys} → ${after.idb?.libraryKeys}`, title: R.publishOnFullDevice.titleFieldAfter, errors: R.publishOnFullDevice.newPageErrors },
      'a line naming it, 19 → 19, no page error, title kept');
  }
  check('LIBRARY delete: asked first, the song and its audio gone, one fewer in the library',
    delButtons >= 20 && /probe take 1/.test(confirmText ?? '') && afterDel.index?.n === (beforeDel.index?.n ?? 0) - 1 && R.libraryDelete.victimAudioGone === true && R.libraryDelete.victimTitleGone,
    R.libraryDelete, 'a Delete per card, asked, index −1, audio key gone');
  await ctx.close();
}

// ── PHONE 375×812, a fresh context (first-visit tier) ─────────────────────────────────────────────────────────────
async function phoneRun(browser: Browser): Promise<void> {
  const pctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pp = await newPage(pctx, 'phone');
  await pp.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const pstart = pp.getByRole('button', { name: 'TAP TO START' });
  await pstart.waitFor({ timeout: 240000 });
  await pstart.tap();
  await pp.waitForFunction(`${GRID} !== null`, undefined, { timeout: 60000 });
  const g4 = await pp.evaluate(GRID) as Any;
  R.cellSize = R.cellSize ?? {};
  R.cellSize.phone375 = { rows: g4.rows, cellW: g4.cellW, cellH: g4.cellH, gridW: g4.gridW, vw: g4.vw, pageScrollW: await pp.evaluate(() => document.documentElement.scrollWidth),
    how: 'fresh 375×812 context (isMobile, DPR 2), first-visit tier; getBoundingClientRect of step cell 1 in CSS px' };
  log('phone cell', g4.cellW, 'x', g4.cellH, 'rows', g4.rows);
  for (const s of [0, 4, 8, 12]) await pp.locator(`[data-qa="cell"][data-row="kick"][data-step="${s}"]`).tap();
  await pp.waitForTimeout(200);
  await frame(pp, 'studio-phone');
  // CELL on the first-visit tier: how many rows sound that the player cannot see? (P3: 4 taps no longer open the chain —
  // it opens on a PLAYED pattern — so this CELL is at THE GRID, 4 rows; P1's was at the chain, 6 rows)
  const pBefore = await pp.evaluate(GRID) as Any;
  const pSpends0 = await pp.evaluate(() => (window as Any).__FEL_STUDIO__.spends.length);
  await pp.getByRole('button', { name: /CELL: LAY A FOUNDATION/ }).tap();
  await pp.waitForTimeout(400);
  const pConfirm = await confirmThenYes(pp, pSpends0);
  if (await pp.getByRole('button', { name: 'STOP', exact: true }).count()) await pp.getByRole('button', { name: 'STOP', exact: true }).first().tap();
  const pAfter = await pp.evaluate(GRID) as Any;
  await pp.evaluate(() => (window as Any).__FEL_STUDIO__.reset());
  await pp.getByRole('button', { name: 'PLAY', exact: true }).tap();
  await pp.waitForTimeout(Math.round(2 * 16 * 60 / 92 / 4 * 1000) + 250);
  const pAud = await pp.evaluate(() => ({ ...(window as Any).__FEL_STUDIO__.audible }));
  const pEng = await pp.evaluate(() => (window as Any).__FEL_STUDIO__.engine());
  const pDrawn = await pp.evaluate(GRID) as Any;   // the chain may open on this PLAY: judge against what is drawn NOW
  await pp.getByRole('button', { name: 'STOP', exact: true }).tap();
  R.hiddenAfterCellPhone = { rowsBeforeCell: pBefore.rows, rowsAfterCell: pAfter.rows, rowsWhilePlaying: pDrawn.rows, ...hiddenAudible(pEng, pDrawn, pAud), audibleOver2Bars: pAud, cellConfirm: pConfirm,
    how: 'phone context: 4 kick taps (P3: the tier stays THE GRID until a pattern is PLAYED), then CELL (confirm → BUY), 2 bars of PLAY; drawn rows (read while playing) vs engine tracks' };
  log('phone hidden after cell', JSON.stringify(R.hiddenAfterCellPhone.audibleNotDrawn));
  check('phone, CELL at the first-visit tier: 0 audible rows off screen', R.hiddenAfterCellPhone.audibleNotDrawn.length === 0 && R.hiddenAfterCellPhone.drawnButSilent.length === 0,
    { audibleNotDrawn: R.hiddenAfterCellPhone.audibleNotDrawn, hiddenWritten: R.hiddenAfterCellPhone.hiddenWritten, heard: pAud, drawn: pDrawn.ids }, '[]');
  await pctx.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ARGS });
  try {
    for (const [name, fn] of [['matrix', survivalMatrix], ['main', mainRun], ['phone', phoneRun]] as const) {
      if (ONLY && ONLY !== name) continue;
      try { await fn(browser); } catch (e) { R.checks.push({ name: `${name} crashed`, pass: false, got: String((e as Error)?.stack ?? e).slice(0, 1200), want: 'no crash' }); log('CRASH', name, e); }
    }
  } finally {
    await browser.close();
    check('no page errors', R.pageErrors.length === 0, R.pageErrors, []);
    R.passed = R.checks.filter((c: Any) => c.pass).length;
    R.failed = R.checks.filter((c: Any) => !c.pass).map((c: Any) => c.name);
    R.runtimeSec = Math.round((Date.now() - t0) / 1000);
    fs.writeFileSync(`${OUT}/music-baseline${ONLY ? `-${ONLY}` : ''}.json`, JSON.stringify(R, null, 2));
    log(`done: ${R.passed} passed, ${R.failed.length} failed → ${OUT}/music-baseline${ONLY ? `-${ONLY}` : ''}.json`);
  }
}
main();
