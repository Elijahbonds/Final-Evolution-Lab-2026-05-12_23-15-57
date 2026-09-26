// MUSIC-SUITE P3 (2026-09-25), tier-honesty-editing — measured in a browser on the dev-only /dev/music route (the real
// StudioMode, no GameShell, database offline). P1's findings (outbox musicsuite/BASELINE.md 2b) driven again:
//   1. THE GRID TIER — the chips; 4 kit rows drawn and the engine plays only drawn rows; a lit cell alone does not open
//      the chain, a played one does; SEND TO THE DANCE FLOOR at the grid (the grid looped); CELL previews (drawn + HEAR IT,
//      no spend) and BUY lays exactly the preview on the drawn rows only.
//   2. FLIP ROWS — SEND TO TRACK and ARM REC land on a row that is DRAWN (its own section), and every sampleId the engine
//      starts over 2 bars is a drawn row (P1: flip_0 8 hits in 2 bars, never drawn; flip_1 silent).
//   3. UNDO / REDO / CLEAR — 60 cell edits undone to the start and redone; CLEAR asks, clears, UNDO restores.
//   4. THE CHAIN TIER — takes and the song render are absent (STUDIO features) until the studio opens.
//   5. SONG MODE — plays the sections, never writes the working grid; the grid shows the section read-only; off = own grid.
//   6. SECTIONS — rename, update from grid, delete (asked; undone), reorder the chain.
//   7. PUBLISH + REMIX — the remix opens with the Flip row and its chop loaded and heard.
//   8. KITS PER PLAYER — one player's NEON never shows as another's on the same device (the server read offline).
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p3-tiers.mts   (BASE, OUT env override)
import { chromium, type Browser, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p3';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p3-tiers +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music', frames: {}, pageErrors: [] as string[], checks: [] as Any[] };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got)); };
const frame = async (p: Page, name: string) => { const path = `${OUT}/p3-tiers-${name}.png`; await p.screenshot({ path, fullPage: true }); R.frames[name] = path; };
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();
const qa = (p: Page, id: string) => p.locator(`[data-qa="${id}"]`);

const drawn = (p: Page): Promise<string[]> => p.evaluate(() => [...document.querySelectorAll('[data-qa="grid-row"]')].map((e) => (e as HTMLElement).dataset.row!));
const litBy = (p: Page): Promise<Record<string, number[]>> => p.evaluate(() => {
  const o: Record<string, number[]> = {};
  for (const c of document.querySelectorAll('[data-qa="cell"][data-on="1"]')) { const e = c as HTMLElement; (o[e.dataset.row!] ??= []).push(Number(e.dataset.step)); }
  return o;
});
const litCount = async (p: Page): Promise<number> => Object.values(await litBy(p)).reduce((n, v) => n + v.length, 0);
const engine = (p: Page): Promise<Any> => p.evaluate(() => (window as Any).__FEL_STUDIO__?.engine() ?? null);
const song = (p: Page): Promise<Any> => p.evaluate(() => (window as Any).__FEL_SONG__ ?? null);
const chips = (p: Page): Promise<Any[]> => p.evaluate(() => [...document.querySelectorAll('[data-qa="tier-chip"]')].map((e) => ({ tier: (e as HTMLElement).dataset.tier, state: (e as HTMLElement).dataset.state, text: e.textContent })));
const cell = (p: Page, row: string, step: number) => p.locator(`[data-qa="cell"][data-row="${row}"][data-step="${step}"]`).click();
/** Every sampleId the scheduler started over ~`ms`, while playing. */
async function heardOver(p: Page, ms: number): Promise<Record<string, number>> {
  await p.evaluate(() => (window as Any).__FEL_STUDIO__.reset());
  await p.waitForTimeout(ms);
  return p.evaluate(() => ({ ...(window as Any).__FEL_STUDIO__.audible }));
}
async function startRoom(p: Page): Promise<void> {
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await p.locator('[data-qa="kit-grid"]').waitFor({ timeout: 60000 });
  await p.waitForTimeout(400);
}
async function openRoom(p: Page, path = '/dev/music?stage=studio'): Promise<void> {
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await startRoom(p);
}
async function setRange(p: Page, selector: string, v: number): Promise<void> {
  await p.locator(selector).first().evaluate((el, val) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, String(val));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
  await p.waitForTimeout(80);
}

async function room(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, permissions: ['microphone'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(e.message));
  await openRoom(p);

  // ── 1. THE GRID TIER ──
  const c0 = await chips(p);
  check('grid: the chips say GRID current, CHAIN next (with the gate\'s words), STUDIO later (and what it takes)',
    JSON.stringify(c0.map((c) => c.state)) === '["current","next","later"]' && /To open: Play a pattern/.test(c0[1].text) && /After THE CHAIN: save 2 sections/.test(c0[2].text) && /send it to the dance floor/.test(c0[0].text),
    c0, 'current/next/later + the words');
  const d0 = await drawn(p);
  check('grid: 4 kit rows drawn', JSON.stringify(d0) === '["kick","snare","hat","open"]', d0, ['kick', 'snare', 'hat', 'open']);
  for (const s of [0, 4, 8, 12]) await cell(p, 'kick', s);
  for (const s of [4, 12]) await cell(p, 'snare', s);
  await p.waitForTimeout(300);
  const notYet = (await chips(p)).map((c) => c.state);
  check('grid: lit cells with the transport stopped do NOT open the chain (the words say "Play")', notYet[0] === 'current', notYet, 'grid still current');
  // the dance floor at the grid: the grid, looped
  const danceBtn = await qa(p, 'dance-export').count();
  await qa(p, 'dance-export').click(); await p.waitForTimeout(200);
  const exported = await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('fel-dance-exported') ?? 'null'); return v ? { bars: v.track.bars, hits: v.summary?.hits ?? null, name: v.track.name } : null; });
  check('grid: SEND TO THE DANCE FLOOR is here at the grid tier (it was CHAIN-only) — the grid, looped 8 bars', danceBtn === 1 && exported?.bars === 8 && exported?.hits === 32, { danceBtn, exported }, '1 button, 8 bars, 4 hit steps x 8 (kick+snare share 4 and 12)');

  // CELL: preview, HEAR IT, no spend; BUY lays exactly the preview on the 4 drawn rows
  await p.evaluate(() => { (window as Any).__FEL_STUDIO__.spends.length = 0; });
  await btn(p, `✦ CELL: LAY A FOUNDATION (50 Shards)`).click();
  await qa(p, 'cell-preview').waitFor({ timeout: 5000 });
  const previewRows = await p.evaluate(() => {
    const grid = document.querySelector('[data-qa="cell-preview"] div[style*="grid"]')!;
    const kids = [...grid.children]; const out: Record<string, number[]> = {};
    for (let i = 0; i + 16 < kids.length; i += 17) out[kids[i].textContent!] = kids.slice(i + 1, i + 17).map((c, j) => ((c as HTMLElement).dataset.on === '1' ? j : -1)).filter((j) => j >= 0);
    return out;
  });
  check('CELL: the confirm draws the foundation for the 4 drawn rows only', JSON.stringify(Object.keys(previewRows)) === '["Kick","Snare","Hat","Open"]', Object.keys(previewRows), ['Kick', 'Snare', 'Hat', 'Open']);
  await qa(p, 'cell-hear').click(); await p.waitForTimeout(700);
  const hearing = { lock: await qa(p, 'grid-lock').textContent().catch(() => null), engine: (await engine(p))?.tracks.filter((t: Any) => t.hits > 0).map((t: Any) => `${t.sampleId}:${t.hits}`), spends: await p.evaluate(() => (window as Any).__FEL_STUDIO__.spends.length) };
  await frame(p, 'cell-preview');
  check('CELL: HEAR IT plays the preview (the grid shows it read-only) and charges nothing', /CELL PREVIEW/.test(hearing.lock ?? '') && hearing.spends === 0 && (hearing.engine?.length ?? 0) >= 3, hearing, 'lock line, engine on the preview, 0 spends');
  await qa(p, 'shop-yes').click(); await p.waitForTimeout(800);
  await btn(p, 'STOP').click().catch(() => undefined);
  const laid = await litBy(p);
  const spends = await p.evaluate(() => (window as Any).__FEL_STUDIO__.spends.length);
  const eng1 = await engine(p);
  const hiddenHitsInEngine = eng1.tracks.filter((t: Any) => ['clap', 'bass', 'lead', 'fx'].includes(t.sampleId)).reduce((n: number, t: Any) => n + t.hits, 0);
  const same = ['Kick', 'Snare', 'Hat', 'Open'].every((n, i) => JSON.stringify(previewRows[n]) === JSON.stringify(laid[['kick', 'snare', 'hat', 'open'][i]] ?? []));
  check('CELL: BUY (1 spend) lays EXACTLY the previewed pattern, and nothing on rows the grid does not draw', spends === 1 && same && hiddenHitsInEngine === 0, { spends, same, hiddenHitsInEngine, laid }, '1 spend, identical, 0 hidden hits');

  // PLAY opens the chain; only drawn rows sound
  await btn(p, 'PLAY').click();
  const heard1 = await heardOver(p, 3000);
  const d1 = await drawn(p);
  const c1 = (await chips(p)).map((c) => c.state);
  check('grid → chain: PLAYING the pattern opens THE CHAIN', c1[1] === 'current', c1, 'chain current');
  check('what you hear is what you see: every sampleId the engine started is a drawn row', Object.keys(heard1).every((id) => d1.includes(id)) && Object.keys(heard1).length > 0, { heard: heard1, drawn: d1 }, 'heard ⊆ drawn');
  await btn(p, 'STOP').click();

  // ── 2. FLIP ROWS ──
  await btn(p, 'FLIP').click();
  await btn(p, '808 bass').click();
  await p.waitForFunction(() => ((window as Any).__FEL_FLIP__?.slices ?? 0) > 1 && (window as Any).__FEL_FLIP__?.decoded, undefined, { timeout: 20000 });
  await p.getByRole('button', { name: 'pad 1', exact: true }).click();
  const sendLabel0 = await qa(p, 'flip-send').textContent();
  await qa(p, 'flip-send').click(); await p.waitForTimeout(300);
  const sendLabel1 = await qa(p, 'flip-send').textContent();
  // ARM REC a second pad while playing (P1: a recorded pad's row was written but silent)
  await btn(p, 'PLAY').click();
  await btn(p, 'ARM REC').click();
  await p.getByRole('button', { name: 'pad 2', exact: true }).click(); await p.waitForTimeout(250);
  await p.getByRole('button', { name: 'pad 2', exact: true }).click(); await p.waitForTimeout(250);
  await btn(p, '● REC ARMED').click();
  await btn(p, 'STOP').click();
  await btn(p, 'STUDIO').click(); await p.waitForTimeout(300);
  await cell(p, 'flip_0', 2); await cell(p, 'flip_0', 10);
  const d2 = await drawn(p);
  const head = await qa(p, 'flip-rows-head').textContent().catch(() => null);
  await btn(p, 'PLAY').click();
  const heard2 = await heardOver(p, 5600);   // 2 bars at 92 BPM
  await btn(p, 'STOP').click();
  const eng2 = await engine(p);
  const offScreen = Object.keys(heard2).filter((id) => !d2.includes(id));
  const silentRows = eng2.tracks.filter((t: Any) => t.sampleId.startsWith('flip_') && t.hits > 0 && !t.loaded).map((t: Any) => t.sampleId);
  R.flipRows = { drawn: d2, heard: heard2, engine: eng2.tracks, sendLabel0, sendLabel1, head };
  check('Flip rows are DRAWN in their own section under the kit rows (the sent pad and the recorded pad)', d2.includes('flip_0') && d2.includes('flip_1') && d2.indexOf('flip_0') > d2.indexOf('open') && !!head, { drawn: d2, head }, 'flip_0 + flip_1 after the kit rows');
  check('0 audible rows off screen, 0 silent written rows (P1: flip_0 8 hits never drawn; flip_1 written but silent)', offScreen.length === 0 && silentRows.length === 0 && (heard2.flip_0 ?? 0) >= 2 && (heard2.flip_1 ?? 0) >= 1, { offScreen, silentRows, heard: heard2 }, '[] / [] / flip_0 and flip_1 heard');
  check('FlipPad says a pad already has a row (SEND becomes REPLACE ROW)', sendLabel0 === 'SEND TO TRACK' && sendLabel1 === 'REPLACE ROW FLIP 1', { sendLabel0, sendLabel1 }, 'SEND TO TRACK → REPLACE ROW FLIP 1');
  await frame(p, 'flip-rows');

  // ── 3. UNDO / REDO / CLEAR ──
  const beforeEdits = await litBy(p);
  const edits: [string, number][] = [];
  for (let i = 0; i < 60; i++) edits.push([['kick', 'snare', 'hat', 'open', 'clap', 'bass'][i % 6], (i * 7) % 16]);
  for (const [r, s] of edits) await cell(p, r, s);
  const afterEdits = await litBy(p);
  for (let i = 0; i < 60; i++) await p.keyboard.press('Meta+z');
  await p.waitForTimeout(200);
  const undone = await litBy(p);
  for (let i = 0; i < 60; i++) await p.keyboard.press('Meta+Shift+z');
  await p.waitForTimeout(200);
  const redone = await litBy(p);
  check('UNDO: 60 cell edits undone (⌘Z) back to the start, and redone (⇧⌘Z) to the same grid', JSON.stringify(undone) === JSON.stringify(beforeEdits) && JSON.stringify(redone) === JSON.stringify(afterEdits) && JSON.stringify(afterEdits) !== JSON.stringify(beforeEdits),
    { before: await Promise.resolve(Object.keys(beforeEdits).length), undoneEqual: JSON.stringify(undone) === JSON.stringify(beforeEdits), redoneEqual: JSON.stringify(redone) === JSON.stringify(afterEdits) }, 'both equal');
  const litNow = await litCount(p);
  await qa(p, 'clear').click();
  const confirmText = await qa(p, 'clear-confirm').textContent();
  await frame(p, 'clear-confirm');
  await qa(p, 'clear-yes').click(); await p.waitForTimeout(200);
  const cleared = await litCount(p);
  const rowsAfterClear = await drawn(p);
  await qa(p, 'undo').click(); await p.waitForTimeout(200);
  const restored = await litCount(p);
  check('CLEAR asks first, clears every hit (rows kept), and UNDO brings them all back', /Clear all \d+ hits/.test(confirmText ?? '') && cleared === 0 && rowsAfterClear.includes('flip_0') && restored === litNow, { confirmText, litNow, cleared, restored }, `asked, 0, ${litNow}`);

  // ── 4 + 5 + 6. THE CHAIN TIER, SONG MODE, SECTIONS ──
  const chainGates = { take: await btn(p, '● RECORD TAKE').count(), render: await btn(p, 'RENDER SONG + STEMS').count(), note: await p.getByText('Recording takes opens at THE STUDIO').count() };
  check('chain: RECORD TAKE and RENDER SONG + STEMS are not offered (STUDIO features, MusicTiers takes / mixdown)', chainGates.take === 0 && chainGates.render === 0, chainGates, '0 / 0');
  // section A = the current grid; then a different grid → section B (the 2nd save opens the studio)
  await btn(p, 'SAVE GRID AS SECTION').click(); await p.waitForTimeout(150);
  await qa(p, 'clear').click(); await qa(p, 'clear-yes').click();
  for (const s of [0, 2, 4, 6, 8, 10, 12, 14]) await cell(p, 'hat', s);
  await cell(p, 'kick', 0);
  await p.locator('select').first().selectOption('hook');
  await btn(p, 'SAVE GRID AS SECTION').click(); await p.waitForTimeout(300);
  const studioGates = { take: await btn(p, '● RECORD TAKE').count(), render: await btn(p, 'RENDER SONG + STEMS').count(), chips: (await chips(p)).map((c) => c.state) };
  check('studio: two sections chained open THE STUDIO, and only now RECORD TAKE + RENDER appear', studioGates.take === 1 && studioGates.render === 1 && studioGates.chips[2] === 'current', studioGates, '1 / 1 / studio current');
  // the working grid C, distinct from both sections
  await qa(p, 'clear').click(); await qa(p, 'clear-yes').click();
  for (const s of [3, 7, 11]) await cell(p, 'clap', s);
  await cell(p, 'snare', 8);
  const gridC = await litBy(p);
  await btn(p, 'PLAY').click();
  await qa(p, 'song-mode').click();
  await p.waitForTimeout(6500);                                 // ~2.4 bars: at least one section swap on a bar line
  const inSong = { lock: await qa(p, 'grid-lock').textContent().catch(() => null), shown: await litBy(p), song: await song(p) };
  await cell(p, 'kick', 15);                                    // an edit attempt in song mode: refused, said
  const shownAfterPoke = await litBy(p);
  await frame(p, 'song-mode');
  await qa(p, 'song-mode').click(); await p.waitForTimeout(400);
  const backToGrid = await litBy(p);
  const engBack = await engine(p);
  await btn(p, 'STOP').click();
  const engHits = Object.fromEntries(engBack.tracks.filter((t: Any) => t.hits > 0).map((t: Any) => [t.sampleId, t.hits]));
  R.songMode = { gridC, inSong, backToGrid, engHits };
  check('song mode plays the sections (the grid shows the playing one, read-only) and an edit there is refused',
    /SONG MODE — playing/.test(inSong.lock ?? '') && JSON.stringify(inSong.shown) !== JSON.stringify(gridC) && JSON.stringify(shownAfterPoke) === JSON.stringify(inSong.shown), { lock: inSong.lock, section: inSong.song?.section }, 'read-only section');
  check('song mode OFF gives back YOUR grid, exactly (it used to leave the last section in it), and the engine plays it',
    JSON.stringify(backToGrid) === JSON.stringify(gridC) && engHits.clap === 3 && engHits.snare === 1 && !engHits.hat, { backToGrid, engHits }, gridC);
  // sections: rename, update from grid, delete (asked, undone), reorder the chain
  const secIds: string[] = await p.evaluate(() => [...document.querySelectorAll('[data-qa="song-section"]')].map((e) => (e as HTMLElement).dataset.section!));
  const sec = (id: string) => p.locator(`[data-qa="song-section"][data-section="${id}"]`);
  await sec(secIds[0]).getByRole('button', { name: 'RENAME' }).click();
  await qa(p, 'section-rename-input').fill('big verse');
  await qa(p, 'section-rename-input').press('Enter'); await p.waitForTimeout(150);
  const names1 = (await song(p))?.names;
  await sec(secIds[1]).getByRole('button', { name: 'UPDATE FROM GRID' }).click(); await p.waitForTimeout(150);
  const hookNow = await p.evaluate(() => (window as Any).__FEL_SONG__);
  await p.locator('[data-qa="chain-entry"]').nth(1).getByRole('button', { name: 'move earlier' }).click(); await p.waitForTimeout(150);
  const chainOrder = (await song(p))?.chain.map((e: Any) => e.sectionId);
  await sec(secIds[0]).getByRole('button', { name: 'DELETE' }).click();
  const delText = await qa(p, 'section-delete-confirm').textContent();
  await frame(p, 'section-delete-confirm');
  await qa(p, 'section-delete-yes').click(); await p.waitForTimeout(150);
  const afterDel = await song(p);
  await qa(p, 'undo').click(); await p.waitForTimeout(200);
  const afterUndo = await song(p);
  R.sections = { names1, chainOrder, delText, afterDel: { names: afterDel?.names, chain: afterDel?.chain }, afterUndo: { names: afterUndo?.names, chain: afterUndo?.chain }, hookNow: hookNow?.names };
  check('sections: rename ("verse" → "big verse")', JSON.stringify(names1) === '["big verse","hook"]', names1, ['big verse', 'hook']);
  check('sections: reorder the chain (hook moved first)', JSON.stringify(chainOrder) === JSON.stringify([secIds[1], secIds[0]]), chainOrder, [secIds[1], secIds[0]]);
  check('sections: DELETE asks (naming its chain places), deletes it and its chain place; UNDO brings both back',
    /Delete "big verse"\?/.test(delText ?? '') && /place in the chain/.test(delText ?? '') && JSON.stringify(afterDel?.names) === '["hook"]' && afterDel?.chain.length === 1 && JSON.stringify(afterUndo?.names) === '["big verse","hook"]' && afterUndo?.chain.length === 2,
    R.sections, 'asked; 1 left; both back');
  await frame(p, 'studio-tier');

  // ── 7. PUBLISH + REMIX carry the chops ──
  await cell(p, 'flip_0', 6); await cell(p, 'flip_0', 14);   // the Flip row plays in what is published
  await p.locator('input[placeholder="track title…"]').fill('p3 chops');
  await btn(p, 'PUBLISH TO LIBRARY').click();
  await p.waitForFunction(() => /published/.test(document.body.textContent ?? ''), undefined, { timeout: 30000 });
  const rec = await p.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('fel_studio_library_v2') ?? 'null');
    const list = Array.isArray(idx) ? idx : idx?.tracks ?? idx?.entries ?? [];
    const t = list.find((x: Any) => x.title === 'p3 chops');
    return t ? t.sequencer.tracks.map((r: Any) => ({ id: r.sampleId, chop: r.chop ? { pad: r.chop.pad, src: r.chop.source?.url ?? r.chop.source?.audio?.key, slice: r.chop.slice } : null })) : null;
  });
  check('publish: the record keeps the heard rows, each Flip row WITH its chop', !!rec && rec.some((r: Any) => r.id === 'flip_0' && r.chop?.src === '/audio/kits/808/bass.wav') && rec.every((r: Any) => !r.id.startsWith('flip_') || r.chop), rec, 'flip_0 with the 808 bass chop');
  await btn(p, 'LIBRARY').click();
  await p.locator('div', { hasText: 'p3 chops' }).getByRole('button', { name: 'REMIX' }).last().click();
  await p.waitForTimeout(1500);
  const remixDrawn = await drawn(p);
  const remixLit = await litBy(p);
  await btn(p, 'PLAY').click();
  const heardRemix = await heardOver(p, 5600);
  await btn(p, 'STOP').click();
  const engR = await engine(p);
  R.remix = { drawn: remixDrawn, lit: remixLit, heard: heardRemix, flipLoaded: engR.tracks.filter((t: Any) => t.sampleId.startsWith('flip_')).map((t: Any) => `${t.sampleId}:${t.loaded}`) };
  check('remix: a new project whose Flip rows are drawn, loaded and HEARD (a remix\'s Flip rows were silent)',
    remixDrawn.includes('flip_0') && (heardRemix.flip_0 ?? 0) >= 1 && engR.tracks.filter((t: Any) => t.sampleId.startsWith('flip_')).every((t: Any) => t.loaded), R.remix, 'flip_0 drawn + loaded + heard');
  await frame(p, 'remix-chops');
  await ctx.close();
}

async function kitsPerPlayer(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(e.message));
  // the old shared cache value (any earlier player's) is on the device
  await p.goto(`${BASE}/dev/music?stage=studio&player=ana`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.evaluate(() => localStorage.setItem('fel_studio_kits_v1', '["street","neon","dust"]'));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await startRoom(p);
  await btn(p, 'NEON · 200◈').click();
  await qa(p, 'shop-yes').click();
  await p.waitForTimeout(800);
  const ana = await p.evaluate(() => ({ keyed: localStorage.getItem('fel_studio_kits_v1:ana'), shared: localStorage.getItem('fel_studio_kits_v1') }));
  // Ben on the same device, with the server read failing (the cache is all the room has)
  await p.goto(`${BASE}/dev/music?stage=studio&player=ben&shop=offline`, { waitUntil: 'domcontentloaded' });
  await startRoom(p);
  const benKits = await p.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent ?? '').filter((t) => /^(STREET|NEON|DUST)/.test(t)));
  await frame(p, 'kits-ben');
  // Ana again, offline: her own cache still shows her NEON
  await p.goto(`${BASE}/dev/music?stage=studio&player=ana&shop=offline`, { waitUntil: 'domcontentloaded' });
  await startRoom(p);
  const anaKits = await p.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent ?? '').filter((t) => /^(STREET|NEON|DUST)/.test(t)));
  R.kits = { ana, benKits, anaKits };
  check('kits per player: Ana\'s NEON is cached under her id, the old shared key is gone',
    /neon/.test(ana.keyed ?? '') && ana.shared === null, ana, 'keyed has neon, shared null');
  check('kits per player: Ben on the same device (server offline) sees NEON and DUST for sale, not Ana\'s', benKits.includes('NEON · 200◈') && benKits.includes('DUST · 400◈'), benKits, 'NEON · 200◈, DUST · 400◈');
  check('kits per player: Ana (server offline) still sees her NEON from her own cache', anaKits.includes('NEON') && anaKits.includes('DUST · 400◈'), anaKits, 'NEON owned, DUST for sale');
  await ctx.close();
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ARGS });
  try {
    for (const [name, fn] of [['room', room], ['kits', kitsPerPlayer]] as const) {
      try { await fn(browser); } catch (e) { R.checks.push({ name: `${name} crashed`, pass: false, got: String(e), want: 'no crash' }); log('CRASH', name, e); }
    }
  } finally { await browser.close(); }
  check('no page errors', R.pageErrors.length === 0, R.pageErrors, []);
  R.passed = R.checks.filter((c: Any) => c.pass).length;
  R.failed = R.checks.filter((c: Any) => !c.pass).length;
  fs.writeFileSync(`${OUT}/tiers-proof.json`, JSON.stringify(R, null, 2));
  log(`done: ${R.passed} passed, ${R.failed} failed → ${OUT}/tiers-proof.json`);
}
void main();
