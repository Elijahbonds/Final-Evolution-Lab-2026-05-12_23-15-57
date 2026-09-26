// MUSIC-SUITE P5 (2026-09-25), flip-content — the FEL Flip pack, the FEL-theme lesson and the upload door, measured in a
// browser on the dev-only /dev/music route (the real StudioMode, database offline):
//   1. GAPLESS: every pack file decoded by this Chromium at 44.1 and 48 kHz — is its length exactly `samples` (scaled)?
//      (flipPack.gaplessWindow trims a decoder that ignores the LAME header; this says whether this one does.)
//   2. FIRST VISIT: the lesson card shows and Sunday Tape goes on the pads on its 16 FEL cuts (pad 1 at sample 0).
//   3. THE LESSON PLAYS: ▶ PADS 1 → 16 hits pads 0..15 in order at the theme's cut times; ▶ HEAR THE FLIP plays the
//      lesson's pattern; neither writes into the grid.
//   4. THE SHELF: a kit loads one file per pad (FEL Kit 14, 808 Kit 8, Textures 3), a theme on its cuts (Skyline 15).
//   5. REMEMBERED PER PLAYER: GOT IT, reload — closed; another player on the same browser — open.
//   6. YOUR FILE: disabled until "I made this or I own the rights" is ticked; an upload makes the project device-private —
//      PUBLISH and the dance floor are off and the room says why in one line; loading a FEL source over it lifts that.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p5-flip-content.mts   (BASE, OUT env override)
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p5/flip-content';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p5flip +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music', frames: {}, pageErrors: [] as string[], checks: [] as Any[] };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got)); };
const frame = async (p: Page, name: string, fullPage = true) => { const path = `${OUT}/p5flip-${name}.png`; await p.screenshot({ path, fullPage }); R.frames[name] = path; };
const flip = (p: Page) => p.evaluate(() => (window as Any).__FEL_FLIP__ ?? null);
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();
const qa = (p: Page, id: string) => p.locator(`[data-qa="${id}"]`);

async function openRoom(p: Page, path: string): Promise<void> {
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await p.waitForTimeout(800);
}
const loaded = (p: Page, id: string | RegExp, ms = 20000) => p.waitForFunction(
  (want: { s: string; re: boolean }) => { const f = (window as Any).__FEL_FLIP__; return !!f?.decoded && (want.re ? new RegExp(want.s).test(f.source ?? '') : f.source === want.s); },
  typeof id === 'string' ? { s: id, re: false } : { s: id.source, re: true }, { timeout: ms },
).then(() => true, () => false);

/** Log every pad the Flip plays (FlipPad writes lastPlayed on each hit), with its time. */
const hookPlays = (p: Page) => p.evaluate(`(() => {
  const w = window;
  let v = w.__FEL_FLIP__;
  w.__P5_PLAYS__ = [];
  Object.defineProperty(w, '__FEL_FLIP__', {
    configurable: true, get: () => v,
    set: (n) => { if (n && typeof n.lastPlayed === 'number' && n.lastPlayed !== (v && v.lastPlayed)) w.__P5_PLAYS__.push({ pad: n.lastPlayed, t: performance.now() }); v = n; },
  });
})()`);
const plays = (p: Page): Promise<{ pad: number; t: number }[]> => p.evaluate(() => (window as Any).__P5_PLAYS__ ?? []);
const resetPlays = (p: Page) => p.evaluate(() => { (window as Any).__P5_PLAYS__ = []; });

/** A 1 s, 44.1 kHz mono WAV of four clicks — FEL-made here, the "player's own file" for the upload check. */
function testWav(): Buffer {
  const sr = 44100, n = sr, data = Buffer.alloc(n * 2);
  for (const at of [0.05, 0.3, 0.55, 0.8]) for (let i = 0; i < 1500; i++) data.writeInt16LE(Math.round(20000 * Math.exp(-i / 300) * Math.sin(i * 0.25)), (Math.floor(at * sr) + i) * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(e.message));

  // 1. gapless decode of every pack file, at both rates
  await p.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const gap = await p.evaluate(async () => {
    const pack = await (await fetch('/audio/flip/pack.json')).json();
    const out: Any = { files: pack.items.length, byRate: {} };
    for (const rate of [44100, 48000]) {
      const ctxA = new OfflineAudioContext(1, 1, rate);
      let exact = 0, within1 = 0; const off: Any[] = [];
      for (const it of pack.items) {
        const b = await ctxA.decodeAudioData(await (await fetch(`/audio/flip/${it.file}`)).arrayBuffer());
        const want = Math.round(it.samples * rate / 44100);
        const d = b.length - want;
        if (d === 0) exact++; else if (Math.abs(d) <= 1) within1++; else off.push({ id: it.id, got: b.length, want, d });
      }
      out.byRate[rate] = { exact, within1, off };
    }
    return out;
  });
  R.gapless = gap;
  check('gapless: every pack file decodes to its exact length at 44.1 and 48 kHz (±1 sample)',
    [44100, 48000].every((r) => gap.byRate[r].off.length === 0), { r44: { exact: gap.byRate[44100].exact, within1: gap.byRate[44100].within1, off: gap.byRate[44100].off.length }, r48: { exact: gap.byRate[48000].exact, within1: gap.byRate[48000].within1, off: gap.byRate[48000].off.length } }, 'off 0');

  // 2. first visit: the lesson, and Sunday Tape on the pads
  await openRoom(p, '/dev/music?stage=studio&player=p5_ana');
  await btn(p, 'FLIP').click();
  await qa(p, 'flip-lesson').waitFor({ timeout: 20000 }).catch(() => undefined);
  check('first visit: the lesson card is on the FLIP tab', await qa(p, 'flip-lesson').count() === 1, await qa(p, 'flip-lesson').count(), 1);
  const onPads = await loaded(p, 'theme_a_sunday_tape', 30000);
  const f0 = await flip(p);
  check('first visit: Sunday Tape is on the pads, on its 16 FEL cuts, pad 1 at sample 0', onPads && f0?.slices === 16 && f0?.mode === 'cuts' && f0?.cuts?.[0] === 0,
    { source: f0?.source, slices: f0?.slices, mode: f0?.mode, firstCut: f0?.cuts?.[0], rate: f0?.rate }, { source: 'theme_a_sunday_tape', slices: 16, mode: 'cuts', firstCut: 0 });
  const lessonText = await qa(p, 'flip-lesson').innerText().catch(() => '');
  check('the card: pads 1 → 16, the re-flip written out, FEL\'s tip', /Pads 1 → 16 in order play it back/.test(lessonText) && /Flip it: 1, 12 and 8/.test(lessonText),
    lessonText.replace(/\s+/g, ' ').slice(0, 400), 'the three steps');
  await frame(p, 'lesson-desktop', false);

  // 3. the lesson plays: PADS 1 → 16, then HEAR THE FLIP; no grid writes
  const projBefore = await p.evaluate(() => JSON.stringify((window as Any).__FEL_PROJECT__?.flipRows ?? null));
  await hookPlays(p);
  await qa(p, 'lesson-order').click();
  await p.waitForTimeout(11500);
  const order = await plays(p);
  const pack = JSON.parse(fs.readFileSync(new URL('../../public/audio/flip/pack.json', import.meta.url), 'utf8'));
  const cutsA: number[] = pack.items.find((i: Any) => i.id === 'theme_a_sunday_tape').suggestedPads;
  const drift = order.length ? Math.max(...order.map((o, i) => Math.abs((o.t - order[0].t) / 1000 - cutsA[i] ?? 0))) : null;
  check('▶ PADS 1 → 16: every pad in order, each at its own cut (timer drift under 60 ms)', JSON.stringify(order.map((o) => o.pad)) === JSON.stringify([...Array(16).keys()]) && drift !== null && drift < 0.06,
    { pads: order.map((o) => o.pad), maxDriftMs: drift === null ? null : Math.round(drift * 1000) }, { pads: '0..15', maxDriftMs: '< 60' });
  await resetPlays(p);
  await qa(p, 'lesson-flip').click();
  await p.waitForTimeout(6000);
  const fl = (await plays(p)).map((o) => o.pad);
  check('▶ HEAR THE FLIP: the lesson\'s pattern twice (pads 1, 12, 8, 4, 5)', JSON.stringify(fl) === JSON.stringify([0, 11, 7, 3, 4, 0, 11, 7, 3, 4]), fl, [0, 11, 7, 3, 4, 0, 11, 7, 3, 4]);
  const projAfter = await p.evaluate(() => JSON.stringify((window as Any).__FEL_PROJECT__?.flipRows ?? null));
  check('the demos write nothing into the grid', projBefore === projAfter, { same: projBefore === projAfter }, true);

  // 4. the shelf: kits load one file per pad, themes on their cuts
  const shelf = async (group: string, label: string, id: string, want: number) => {
    await qa(p, `flip-shelf-${group}`).click();
    await btn(p, label).click();
    const ok = await loaded(p, id, 30000);
    const f = await flip(p);
    check(`shelf: ${label} → ${want} pads on ${f?.mode}`, ok && f?.slices === want && f?.mode === 'cuts', { source: f?.source, slices: f?.slices, mode: f?.mode }, { source: id, slices: want, mode: 'cuts' });
  };
  await shelf('kits', 'FEL Kit', 'bank_kit_fel', 14);
  await frame(p, 'kit-fel', false);
  await shelf('kits', '808 Kit', 'bank_808', 8);
  await shelf('textures', 'Textures', 'bank_textures', 3);
  await shelf('vox', 'Vox Chops (warm)', 'bank_vox_warm', 13);
  await shelf('themes', 'Skyline Anthem', 'theme_b_skyline', 15);

  // 5. GOT IT is remembered for this player, not the next
  await qa(p, 'lesson-close').click();
  await openRoom(p, '/dev/music?stage=studio&player=p5_ana');
  await btn(p, 'FLIP').click();
  await p.waitForTimeout(1500);
  check('GOT IT, reload: closed for this player; THEME LESSON reopens it', await qa(p, 'flip-lesson').count() === 0 && await qa(p, 'lesson-open').count() === 1,
    { lesson: await qa(p, 'flip-lesson').count(), chip: await qa(p, 'lesson-open').count() }, { lesson: 0, chip: 1 });
  await openRoom(p, '/dev/music?stage=studio&player=p5_ben');
  await btn(p, 'FLIP').click();
  await qa(p, 'flip-lesson').waitFor({ timeout: 15000 }).catch(() => undefined);
  check('another player on the same browser: the lesson shows', await qa(p, 'flip-lesson').count() === 1, await qa(p, 'flip-lesson').count(), 1);
  await loaded(p, 'theme_a_sunday_tape', 30000);

  // 6. YOUR FILE behind the tick; the upload keeps the song on the device
  const disabledBefore = await qa(p, 'upload-file').isDisabled();
  check('YOUR FILE is disabled until the tick', disabledBefore, disabledBefore, true);
  await qa(p, 'own-rights').check();
  const wav = `${OUT}/p5-test-clicks.wav`;
  fs.writeFileSync(wav, testWav());
  await qa(p, 'upload-file').setInputFiles(wav);
  const up = await loaded(p, /^own_/, 20000);
  const fu = await flip(p);
  const srcLine = await qa(p, 'flip-source').innerText().catch(() => '');
  check('ticked: the upload loads, marked as your upload; the tick clears', up && /your upload/.test(srcLine) && !(await qa(p, 'own-rights').isChecked()),
    { source: fu?.source, line: srcLine, tickAfter: await qa(p, 'own-rights').isChecked() }, 'own_… · your upload, unticked');
  // MUSIC-SUITE P5 FIX PASS (2026-09-25): decision #15 read as "never shared off the device", counted on what the SONG
  // plays (uploadPrivacy.ts). An upload that only sits in a bank is not in the song: no line, PUBLISH open.
  await btn(p, 'STUDIO').click();
  await p.waitForTimeout(800);
  const idleLine = await qa(p, 'upload-private').count();
  const idlePub = await btn(p, 'PUBLISH TO LIBRARY').isDisabled().catch(() => null);
  check('an upload only on the pads is not in the song: no line, PUBLISH open', idleLine === 0 && idlePub === false, { line: idleLine, publishDisabled: idlePub }, { line: 0, publishDisabled: false });
  // …sent to a grid row it is: the line says it stays on this device, and the on-device doors stay open
  await btn(p, 'FLIP').click();
  await p.getByRole('button', { name: 'pad 1', exact: true }).first().dispatchEvent('pointerdown');
  await qa(p, 'flip-send').click();
  await btn(p, 'STUDIO').click();
  await p.waitForTimeout(800);
  const privLine = await qa(p, 'upload-private').innerText().catch(() => null);
  const pubDisabled = await btn(p, 'PUBLISH TO LIBRARY').isDisabled().catch(() => null);
  const danceDisabled = await qa(p, 'dance-export').isDisabled().catch(() => 'no export row');
  check('sent to a row: one line says the song stays on this device; PUBLISH and the dance floor stay open (on the device)',
    !!privLine && /^Device-only: this song uses your upload "p5-test-clicks\.wav" — your library, the dance floor and your walk-out work on this device/.test(privLine) && pubDisabled === false && danceDisabled !== true,
    { line: privLine, publishDisabled: pubDisabled, danceDisabled }, 'line + open');
  await frame(p, 'upload-private', true);

  // the phone: the lesson on one screen
  const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const q = await phone.newPage();
  q.on('pageerror', (e) => R.pageErrors.push(`phone: ${e.message}`));
  await openRoom(q, '/dev/music?stage=studio&player=p5_phone');
  await q.getByRole('button', { name: 'FLIP', exact: true }).first().click();
  await qa(q, 'flip-lesson').waitFor({ timeout: 20000 }).catch(() => undefined);
  await loaded(q, 'theme_a_sunday_tape', 30000);
  const box = await qa(q, 'flip-lesson').boundingBox();
  const sideways = await q.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone 375: the lesson card fits the width, no sideways scroll', !!box && box.width <= 375 && sideways <= 0, { card: box && { w: Math.round(box.width), h: Math.round(box.height) }, sideways }, { w: '≤ 375', sideways: 0 });
  await qa(q, 'flip-lesson').scrollIntoViewIfNeeded();
  await frame(q, 'lesson-phone', false);
  await phone.close();

  R.passed = R.checks.filter((c: Any) => c.pass).length;
  R.total = R.checks.length;
  fs.writeFileSync(`${OUT}/p5-flip-content.json`, JSON.stringify(R, null, 1));
  log(`${R.passed}/${R.total} checks, ${R.pageErrors.length} page errors →`, `${OUT}/p5-flip-content.json`);
  await browser.close();
  process.exit(R.passed === R.total && R.pageErrors.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/p5-flip-content.json`, JSON.stringify({ ...R, crash: String(e?.stack ?? e) }, null, 1)); process.exit(1); });
