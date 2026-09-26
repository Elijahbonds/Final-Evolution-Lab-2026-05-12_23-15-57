// MUSIC-SUITE P3 (2026-09-25) — the Academy LIBRARY off localStorage, measured in a real browser on /dev/music.
//
// P1 (music-baseline.json publishUntilFailure) measured the old library in this same route: 3 publishes, the 4th threw
// QuotaExceededError with no message. This probe runs the P3 library end to end on the live dev server:
//   1. MIGRATION — three pre-P3 records (real 16-bit stereo WAVs, P1's 1,132,072-byte size, as inline data URLs in
//      fel_studio_tracks_v1 = ~4.5 M chars) + a walk-out pointing at the 2nd, seeded before the room loads. After READY:
//      is the old key gone, are all three in the index, are their bytes in IndexedDB ('fel-studio'/audio, library/<id>),
//      and does the walk-out keep its synchronous copy (fel_studio_walkout_src_v1 / _audio_v1 = song 2's exact URL)?
//   2. PLAY on a migrated song — HTMLMediaElement.play is wrapped to record what the room asked to play and whether it
//      started (the room now plays an object URL of the stored WAV).
//   3. PUBLISH 20 IN A ROW through the real button — every toast, the index size, the IndexedDB key count, localStorage
//      chars after.
//   4. DELETE the walk-out's song through the LIBRARY's DELETE → YES, DELETE — the confirm text, the toast, and that
//      the row, its audio, the walk-out and its copy are gone.
//   5. RELOAD — the library is still there.
//
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p3-library.mts   (BASE, OUT env override)
import { chromium, type Page, type Browser } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p3/library';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p3-lib +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music', frames: {}, pageErrors: [] as string[] };
const frame = async (p: Page, name: string) => { const path = `${OUT}/${name}.png`; await p.screenshot({ path }); R.frames[name] = path; log('frame', path); };

/** A real 16-bit stereo 44.1 kHz WAV of exactly `bytes` bytes (P1: 1,132,072 at 92 BPM), a quiet tone keyed by `seed`. */
function wavDataUrl(bytes: number, seed: number): string {
  const frames = Math.floor((bytes - 44) / 4);
  const b = Buffer.alloc(44 + frames * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + frames * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(44100, 24);
  b.writeUInt32LE(44100 * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * (220 * seed) * i) / 44100) * 3000);
    b.writeInt16LE(v, 44 + i * 4); b.writeInt16LE(v, 46 + i * 4);
  }
  return `data:audio/wav;base64,${b.toString('base64')}`;
}

const STATE = `(async () => {
  const ls = {}; let used = 0;
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const v = localStorage.getItem(k) || ''; used += k.length + v.length; if (k.startsWith('fel_studio') || k === 'fel-walkout') ls[k] = v.length; }
  let index = null; try { const o = JSON.parse(localStorage.getItem('fel_studio_library_v2') || 'null'); index = o && { v: o.v, n: o.tracks.length, titles: o.tracks.map((t) => t.title), audio: o.tracks.map((t) => t.audio), hasDataUrl: JSON.stringify(o).includes('data:') }; } catch (e) { index = 'unreadable'; }
  let walkSrc = null; try { walkSrc = JSON.parse(localStorage.getItem('fel_studio_walkout_src_v1') || 'null'); } catch {}
  let walk = null; try { walk = JSON.parse(localStorage.getItem('fel-walkout') || 'null'); } catch {}
  const idb = await new Promise((res) => {
    // never CREATE the database from here: an open without a version makes an empty v1 'fel-studio' with no tables,
    // and the room's own open (version 1) would then find no 'audio' table (the first run of this probe did exactly that)
    let creating = false;
    const r = indexedDB.open('fel-studio');
    r.onupgradeneeded = () => { creating = true; r.transaction.abort(); };
    r.onerror = () => res(creating ? { libraryKeys: 0, allKeys: 0, bytes: {}, note: 'no database yet' } : { error: String(r.error) });
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('audio')) { db.close(); res({ keys: [], note: 'no audio table' }); return; }
      const tx = db.transaction('audio', 'readonly'); const st = tx.objectStore('audio');
      const kr = st.getAllKeys(); const vr = st.getAll();
      tx.oncomplete = () => { const keys = kr.result.map(String); const lib = keys.filter((k) => k.startsWith('library/'));
        const bytes = {}; keys.forEach((k, i) => { if (k.startsWith('library/')) bytes[k] = vr.result[i]?.bytes; });
        db.close(); res({ libraryKeys: lib.length, allKeys: keys.length, bytes }); };
    };
  });
  return { usedChars: used, keys: ls, index, walkSrc, walk, idb };
})()`;
const state = (p: Page) => p.evaluate(STATE) as Promise<Any>;
const toasts = (p: Page) => p.evaluate(() => [...document.querySelectorAll('div')].filter((d) => d.style.position === 'sticky').map((d) => d.textContent ?? '').filter(Boolean));
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();

async function startRoom(p: Page): Promise<void> {
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await p.waitForFunction(`[...document.querySelectorAll('div')].some((d) => (d.style.gridTemplateColumns || '').includes('repeat(16'))`, undefined, { timeout: 60000 });
  await p.waitForTimeout(300);
}
async function clickCell(p: Page, row: number, step: number): Promise<void> {
  await p.evaluate(([r, s]) => {
    const g = [...document.querySelectorAll('div')].find((d) => (d.style.gridTemplateColumns || '').includes('repeat(16')) as HTMLElement;
    (g.children[r * 17 + 1 + s] as HTMLElement).click();
  }, [row, step]);
}
/** Collect toasts until `done()` or the timeout. */
async function watchToasts(p: Page, ms: number, done: () => Promise<boolean>): Promise<string[]> {
  const seen: string[] = [];
  const w0 = Date.now();
  while (Date.now() - w0 < ms) {
    for (const s of await toasts(p)) if (!seen.includes(s)) seen.push(s);
    if (Date.now() - w0 > 400 && await done()) break;
    await p.waitForTimeout(100);
  }
  for (const s of await toasts(p)) if (!seen.includes(s)) seen.push(s);
  return seen;
}

async function run(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.addInitScript({ content: `
    window.__name = window.__name || function (f) { return f; };
    window.__plays = [];
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const rec = { src: String(this.src).slice(0, 40), at: Date.now(), started: null, error: null };
      window.__plays.push(rec);
      const pr = orig.call(this);
      pr.then(() => { rec.started = true; }, (e) => { rec.started = false; rec.error = String(e && e.name); });
      return pr;
    };` });
  p.on('pageerror', (e) => { R.pageErrors.push(String(e).slice(0, 300)); log('PAGEERROR', String(e).slice(0, 200)); });

  // ── 1. seed the pre-P3 library on this origin, then load the room ──
  await p.goto(`${BASE}/robots.txt`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
  const urls = [1, 2, 3].map((s) => wavDataUrl(1_132_072, s));
  await p.evaluate((u) => {
    localStorage.clear();
    const tracks = [3, 2, 1].map((i) => ({
      id: `trk_old_${i}`, title: `Old take ${i}`, authorId: 'me', authorName: 'You', kit: 'street', bpm: 92, swing: 0.15, polished: false,
      sequencer: { bpm: 92, steps: 16, swing: 0.15, tracks: [] }, mixdownDataUrl: u[i - 1], remixOf: null, streamingLinks: [],
      createdAt: 1_700_000_000_000 + i, plays: i, saves: 0,
    }));
    localStorage.setItem('fel_studio_tracks_v1', JSON.stringify(tracks));
    localStorage.setItem('fel-walkout', JSON.stringify({ v: 1, songId: 'trk_old_2', title: 'Old take 2', bpm: 92, bars: 2, chosenAt: new Date().toISOString(), plays: 4 }));
  }, urls);
  R.seeded = { ...(await state(p)), dataUrlChars: urls[0].length, how: 'three records exactly as the pre-P3 publish wrote them (inline data URLs of real WAVs), + fel-walkout → trk_old_2' };
  log('seeded', R.seeded.usedChars, 'chars');

  await p.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await startRoom(p);
  await p.waitForTimeout(2500);                       // StudioLibrary.ready(): migration + walk-out repair
  const mig = await state(p);
  R.migration = {
    ...mig,
    legacyGone: !('fel_studio_tracks_v1' in mig.keys),
    walkOutCopyIsSong2: (await p.evaluate(() => localStorage.getItem('fel_studio_walkout_audio_v1'))) === urls[1],
    walkOutCopyChars: mig.keys.fel_studio_walkout_audio_v1 ?? 0,
    toasts: await toasts(p),
    how: 'fresh context: seed on the origin, load /dev/music, TAP TO START, wait 2.5 s; localStorage key sizes + the index + IndexedDB fel-studio/audio keys',
  };
  log('migration', JSON.stringify({ legacyGone: R.migration.legacyGone, index: mig.index, idb: mig.idb.libraryKeys, walk: R.migration.walkOutCopyIsSong2, used: mig.usedChars }));

  await btn(p, 'LIBRARY').click();
  await p.waitForTimeout(400);
  // LibraryDelete's button is labelled for screen readers as "Delete <title>" (its visible text is DELETE)
  R.libraryAfterMigration = { deleteButtons: await p.getByRole('button', { name: /^Delete / }).count() };
  await frame(p, 'library-migrated');

  // ── 2. PLAY a migrated song (its audio now comes out of IndexedDB as an object URL) ──
  await p.getByRole('button', { name: '▶ PLAY', exact: true }).nth(2).click();
  await p.waitForTimeout(1500);
  R.play = { plays: await p.evaluate(() => (window as Any).__plays), toasts: await toasts(p), how: 'the 3rd card\'s ▶ PLAY (Old take 1, not the walk-out); HTMLMediaElement.play wrapped to record src + whether it started' };
  log('play', JSON.stringify(R.play).slice(0, 300));

  // ── 3. PUBLISH 20 in a row ──
  await btn(p, 'STUDIO').click();
  await p.waitForTimeout(300);
  // The grid is left EMPTY on purpose: a pattern opens THE CHAIN tier, which mounts SongPanel — mid-edit in the project
  // lane at the time of this run (it crashed on an undefined \`song\` prop). renderMixdown(2) is the same length
  // either way (P1: length depends on bpm only), so the publish measure is unchanged.
  if (process.env.PATTERN === '1') { for (const s of [0, 4, 8, 12]) await clickCell(p, 0, s); for (const s of [4, 12]) await clickCell(p, 1, s); }
  const pubs: Any[] = [];
  for (let i = 1; i <= 20; i++) {
    await p.getByPlaceholder('track title…').fill(`p3 take ${i}`);
    await btn(p, 'PUBLISH TO LIBRARY').click();
    const seen = await watchToasts(p, 20000, async () => (await p.getByRole('button', { name: 'RENDERING…' }).count()) === 0);
    const titleLeft = await p.getByPlaceholder('track title…').inputValue();
    pubs.push({ i, toasts: seen, titleCleared: titleLeft === '' });
    log('publish', i, seen.join(' | '));
    await p.waitForTimeout(150);
  }
  const afterPub = await state(p);
  R.publish20 = {
    attempts: pubs,
    succeeded: pubs.filter((x) => x.toasts.some((t: string) => /published to the Academy library/.test(t))).length,
    indexCount: afterPub.index?.n, idbLibraryKeys: afterPub.idb.libraryKeys, usedCharsAfter: afterPub.usedChars, indexHasDataUrl: afterPub.index?.hasDataUrl,
    how: 'title filled, PUBLISH TO LIBRARY clicked, toasts collected until RENDERING… clears; then the index + IndexedDB counts',
  };
  log('publish20', R.publish20.succeeded, 'ok; index', R.publish20.indexCount, 'idb', R.publish20.idbLibraryKeys, 'used', R.publish20.usedCharsAfter);

  // ── 4. DELETE the walk-out's song ──
  await btn(p, 'LIBRARY').click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Delete Old take 2', exact: true }).click();
  await p.waitForTimeout(200);
  const confirmText = await p.locator('[role="alertdialog"] span').first().textContent();
  await frame(p, 'delete-confirm');
  await p.getByRole('button', { name: 'YES, DELETE', exact: true }).click();
  const delToasts = await watchToasts(p, 3000, async () => (await p.getByRole('button', { name: 'YES, DELETE' }).count()) === 0);
  await p.waitForTimeout(300);
  const afterDel = await state(p);
  R.deleteWalkOut = {
    confirmText, toasts: delToasts,
    indexCount: afterDel.index?.n, idbLibraryKeys: afterDel.idb.libraryKeys, song2AudioGone: !Object.keys(afterDel.idb.bytes).includes('library/trk_old_2'),
    walkOutPointerGone: afterDel.walk === null, walkOutCopyGone: !('fel_studio_walkout_audio_v1' in afterDel.keys), usedCharsAfter: afterDel.usedChars,
    how: 'LIBRARY → the Old take 2 card\'s DELETE → the inline ask → YES, DELETE',
  };
  log('delete', JSON.stringify(R.deleteWalkOut).slice(0, 400));
  await frame(p, 'library-after-delete');

  // ── 5. reload ──
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 240000 });
  await startRoom(p);
  await p.waitForTimeout(1500);
  await btn(p, 'LIBRARY').click();
  await p.waitForTimeout(400);
  const afterReload = await state(p);
  R.reload = { indexCount: afterReload.index?.n, idbLibraryKeys: afterReload.idb.libraryKeys, deleteButtons: await p.getByRole('button', { name: /^Delete / }).count(), toasts: await toasts(p) };
  log('reload', JSON.stringify(R.reload));
  await frame(p, 'library-after-reload');
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ARGS });
  try { await run(browser); }
  catch (e) { R.fatal = String((e as Error)?.stack ?? e).slice(0, 1500); console.error(e); }
  finally {
    await browser.close();
    R.runtimeSec = Math.round((Date.now() - t0) / 1000);
    fs.writeFileSync(`${OUT}/library-p3.json`, JSON.stringify(R, null, 2));
    log('wrote', `${OUT}/library-p3.json`);
  }
}
main();
