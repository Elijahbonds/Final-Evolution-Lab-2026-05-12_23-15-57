// EDU-05 motion lessons, measured in a real browser (2026-11-10). No Next server: rig-entry.tsx (the REAL /teach/motion page
// module, the real MotionPlayer and stage, the real lesson files) is bundled by the a11y rig's builder (scripts/a11y/rig.mts:
// the app's Tailwind, theme and fonts; Babylon bundled in), and served with public/ by a static file server into headless
// Chromium (SwiftShader GL), so the stage loads the real bodies.
//
//   npx tsx scripts/probes/motion-lesson/rig.mts build <siteDir>                 (CPU: run it through cpu-run.sh)
//   npx tsx scripts/probes/motion-lesson/rig.mts run <siteDir> <outDir> [bodies] (browser: /home/user/wt/gate-run.sh, the shared lock)
//       bodies: comma list of male,female,scan (default male,scan: a kit body and the owner's scan — the roadmap's two)
//
// What `run` writes to <outDir> (JPG only) and prints:
//   report.json        every number below
//   page-390.jpg       the first screen on a phone (390 × 844), as an owner sees /teach/motion; page-1280.jpg; soon-390.jpg
//   sheet-<body>.jpg   contact sheet: each lesson at five moments, on that body
//   sheet-before-after.jpg   the max jump and the low jumps: BlazePose's raw points (top) against the fitted adapter (bottom)
// THE PHASE GATES, on the phone's first screen: visible words (≤ 40), sideways scroll (0), distinct font sizes (≤ 4), tap
//   targets under 44 px (none), the a11y audit's findings (lib/a11y/wcag.ts through scripts/a11y/inpage.ts) with its
//   keyboard pass, and that a picked chip LOOKS picked.
// GATE 0 (reported, not edited): the body spawned through CharacterLibrary (its loader runs gateContainerRig and throws on a
//   non-conformant rig); the bones' count, any mixamorig prefix left, and that it is OFF its bind pose while a lesson plays.
// PER LESSON, PER BODY, sampled at 60 Hz over the movement (the clip paused and stepped, a frame drawn per step):
//   foot slide while planted — the hoops motion probe's contact test, unchanged (scripts/probes/_hoops-motion-probe.mts:
//     low = within 5 cm of the body's own floor, its 5th-percentile foot height; the lower foot; not rising more than 2 mm a
//     frame): planted foot-frames, p90 and max slide a frame (cm), skates (> 5 cm a frame);
//   the flight (the lower foot's top over that floor, m), the hips' travel, and left staying left.
// THE CONTROLS, by real taps: Slow halves the clip's speed; Mirror swaps the sides (measured on the bones); a phrase chip
//   plays that phrase (its length + the return); Pause holds the frame.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { buildRig } from '../../a11y/rig.mts';

const ROOT = resolve(import.meta.dirname, '../../..');
const [job, siteArg, outArg, bodiesArg] = process.argv.slice(2);
if (!job || !siteArg) { console.error('usage: rig.mts build <siteDir> | run <siteDir> <outDir> [bodies]'); process.exit(2); }
const SITE = resolve(siteArg);

if (job === 'build') {
  // fonts by a path this rig's own server answers (/__fonts → app/fonts); Babylon bundled (the stage is what is measured)
  await buildRig(SITE, { entry: resolve(import.meta.dirname, 'rig-entry.tsx'), fontBase: '/__fonts', external: ['@mediapipe/tasks-vision'] });
  console.log(`built → ${SITE} (pages.js ${(statSync(join(SITE, 'pages.js')).size / 1e6).toFixed(1)} MB)`);
  process.exit(0);
}

const OUT = resolve(outArg ?? 'motion-lesson-rig');
const BODIES = (bodiesArg ?? 'male,scan').split(',').filter(Boolean);
const SAMPLES = ['low-jumps', 'max-jump', 'two-foot', 'one-foot'];
mkdirSync(OUT, { recursive: true });

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.woff2': 'font/woff2', '.env': 'application/octet-stream' };
function serve(): Promise<{ url: string; close(): void }> {
  const server = createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const tries = p.startsWith('/__fonts/') ? [join(ROOT, 'app/fonts', p.slice(9))]
      : p.startsWith('/__fixtures/') ? [join(ROOT, 'lib/pose/__fixtures__', p.slice(12))]
      : [join(SITE, p === '/' ? 'index.html' : p), join(ROOT, 'public', p)];
    const f = tries.find((x) => !x.includes('..') && existsSync(x) && statSync(x).isFile());
    if (!f) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream', 'cache-control': 'max-age=3600' });
    res.end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => { const a = server.address() as { port: number }; ok({ url: `http://127.0.0.1:${a.port}`, close: () => server.close() }); }));
}

/** tsx names arrow functions with esbuild's __name helper, which the page does not have */
const NAME_SHIM = 'window.__name = window.__name || function (f) { return f; }';
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];

// ── the page side (plain strings: nothing of tsx's is injected) ──────────────────────────────────────────────────

/** The premium rule's numbers on the FIRST SCREEN (what is inside the viewport before any scroll). */
const FIRST_SCREEN = `(() => {
  const vh = innerHeight, vw = innerWidth;
  const shown = (e) => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return false;
    for (let p = e; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false; }
    const s = getComputedStyle(e); return !(s.position === 'absolute' && r.width <= 1 && r.height <= 1) && !e.closest('.sr-only'); };
  const mine = (e) => !!e.closest('main');
  const sizes = new Set(), sizesMine = new Set(); let words = 0, wordsMine = 0; const lines = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.textContent.trim(); const el = n.parentElement;
    if (!text || !el || !shown(el)) continue;
    const range = document.createRange(); range.selectNodeContents(n); const r = range.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= vh) continue;
    const count = text.split(/\\s+/).filter((x) => /[A-Za-z0-9]/.test(x)).length;
    if (!count) continue;
    const px = getComputedStyle(el).fontSize;
    words += count; sizes.add(px); lines.push(text + ' [' + px + ']');
    if (mine(el)) { wordsMine += count; sizesMine.add(px); }
  }
  const targets = [];
  for (const e of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], canvas')) {
    if (!shown(e) || e.disabled) continue;
    const r = e.getBoundingClientRect();
    targets.push({ what: (e.getAttribute('data-testid') || e.textContent.trim().slice(0, 24) || e.tagName).replace(/\\s+/g, ' '), w: Math.round(r.width), h: Math.round(r.height), mine: mine(e) });
  }
  return { viewport: vw + 'x' + vh, words, wordsMine, fontSizes: [...sizes].sort(), fontSizesMine: [...sizesMine].sort(), lines,
    sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    targets: targets.length, small: targets.filter((t) => t.what !== 'motion-stage' && (t.w < 44 || t.h < 44)) };
})()`;

/** Step the playing clip over its movement at hz, a frame drawn per step, and read the bones' world positions. */
const SAMPLER = `window.__sample = (hz) => {
  const st = window.__FEL_MOTION_STAGE__, cur = st && st.current(); if (!cur) return null;
  const g = st.scene.getAnimationGroupByName(cur.name); if (!g) return null;
  const node = {}; for (const b of st.hero.skeleton.bones) { const n = b.getTransformNode(); if (n) node[b.name] = n; }
  const want = ['Hips', 'Head', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm'];
  g.pause();
  const n = Math.round(cur.movement * hz), frames = [];
  for (let i = 0; i <= n; i++) {
    g.goToFrame(g.from + (i / hz) * 30); st.scene.render();
    const row = {}; for (const k of want) { const t = node[k]; if (!t) continue; t.computeWorldMatrix(true); const p = t.getAbsolutePosition(); row[k] = [p.x, p.y, p.z]; }
    frames.push(row);
  }
  g.goToFrame(g.from); g.play(true);
  return { name: cur.name, movement: cur.movement, total: (g.to - g.from) / 30, hz, frames };
};
window.__stage = () => { const st = window.__FEL_MOTION_STAGE__; if (!st) return null; const cur = st.current(); const g = cur && st.scene.getAnimationGroupByName(cur.name);
  return { clip: cur && cur.name, movement: cur && cur.movement, from: cur && cur.from, total: g ? (g.to - g.from) / 30 : null, speed: g ? g.speedRatio : null, playing: g ? g.isPlaying : null,
    frame: st.hero.animator.currentFrame, clips: st.clips().length, bones: st.hero.skeleton.bones.map((b) => b.name), meshes: st.hero.meshes.length,
    tier: st.scene.metadata && st.scene.metadata.felTier, body: (st.hero.meshes[0] && st.hero.meshes[0].name) || null }; };
window.__goto = (frac) => { const st = window.__FEL_MOTION_STAGE__, cur = st.current(); const g = st.scene.getAnimationGroupByName(cur.name); g.goToFrame(g.from + frac * cur.movement * 30); g.pause(); st.scene.render(); };
window.__resume = () => { const st = window.__FEL_MOTION_STAGE__, cur = st.current(); const g = st.scene.getAnimationGroupByName(cur.name); g.goToFrame(g.from); g.play(true); };`;

// ── the node side: the numbers from a sampled clip ───────────────────────────────────────────────────────────────

type V3 = [number, number, number];
interface Sampled { name: string; movement: number; total: number; hz: number; frames: Record<string, V3>[] }
const pctl = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0; };
const r1 = (x: number) => Math.round(x * 10) / 10, r3 = (x: number) => Math.round(x * 1000) / 1000;

function measure(s: Sampled) {
  const F = s.frames;
  const footY = F.flatMap((f) => [f.LeftFoot[1], f.RightFoot[1]]);
  const floorY = pctl(footY, 0.05);
  // the hoops motion probe's contact test, unchanged: low AND the lower foot AND not rising (per 60 Hz frame)
  const slides: number[] = [];
  for (let i = 1; i < F.length; i++) {
    for (const [a, b] of [['LeftFoot', 'RightFoot'], ['RightFoot', 'LeftFoot']] as const) {
      const w = F[i][a], was = F[i - 1][a], other = F[i][b];
      const low = w[1] < floorY + 0.05, stance = w[1] <= other[1], rising = w[1] - was[1] > 0.002;
      if (low && stance && !rising) slides.push(Math.hypot(w[0] - was[0], w[2] - was[2]));
    }
  }
  const lower = F.map((f) => Math.min(f.LeftFoot[1], f.RightFoot[1]) - floorY);
  const hipsY = F.map((f) => f.Hips[1]);
  // left stays left: the left foot is on the body's own left (the hip joints' line), on the first frame
  const right: V3 = [F[0].RightUpLeg[0] - F[0].LeftUpLeg[0], 0, F[0].RightUpLeg[2] - F[0].LeftUpLeg[2]];
  const side = (F[0].LeftFoot[0] - F[0].RightFoot[0]) * right[0] + (F[0].LeftFoot[2] - F[0].RightFoot[2]) * right[2];
  return {
    frames: F.length, movementS: r3(s.movement), clipS: r3(s.total),
    foot: { planted: slides.length, p90Cm: r1(pctl(slides, 0.9) * 100), maxCm: r1(Math.max(0, ...slides) * 100), skates: slides.filter((x) => x > 0.05).length },
    floorY: r3(floorY), flightM: r3(Math.max(...lower)), lowestFootUnderFloorCm: r1(Math.min(...footY.map((y) => y - floorY)) * 100),
    hipsLowM: r3(Math.min(...hipsY)), hipsHighM: r3(Math.max(...hipsY)), headTopM: r3(Math.max(...F.map((f) => f.Head[1]))),
    handsTopM: r3(Math.max(...F.map((f) => Math.max(f.LeftHand[1], f.RightHand[1])))), leftIsLeft: side < 0,
  };
}

/** The lateral place of each hand against the hips, on the body's own right axis, per frame. */
function lateral(s: Sampled): { L: number[]; R: number[] } {
  const out = { L: [] as number[], R: [] as number[] };
  for (const f of s.frames) {
    const rx = f.RightUpLeg[0] - f.LeftUpLeg[0], rz = f.RightUpLeg[2] - f.LeftUpLeg[2], n = Math.hypot(rx, rz) || 1;
    const mx = (f.RightUpLeg[0] + f.LeftUpLeg[0]) / 2, mz = (f.RightUpLeg[2] + f.LeftUpLeg[2]) / 2;
    out.L.push(((f.LeftHand[0] - mx) * rx + (f.LeftHand[2] - mz) * rz) / n);
    out.R.push(((f.RightHand[0] - mx) * rx + (f.RightHand[2] - mz) * rz) / n);
  }
  return out;
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const { url, close } = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true, args: GL_ARGS });
const report: Record<string, unknown> = { when: new Date().toISOString(), bodies: BODIES };
const save = () => writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const errorsOf = (page: Page): string[] => { const errors: string[] = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 300))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); }); return errors; };
const ready = async (page: Page, timeout = 300_000) => { await page.waitForFunction(() => document.querySelector('[data-motion-player]')?.getAttribute('data-motion-state') === 'ready', undefined, { timeout }); };
const shot = (page: Page, name: string, opts: { fullPage?: boolean } = {}) => page.screenshot({ path: join(OUT, name), type: 'jpeg', quality: 86, ...opts });

// 1. the page, as an owner sees it on a phone: the phase gates, the audit, the first screen (PAGE=0 skips the page scenes)
const PAGE = process.env.PAGE !== '0';
if (PAGE) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.addInitScript(NAME_SHIM); await page.addInitScript(SAMPLER);
  const errors = errorsOf(page);
  const t0 = Date.now();
  await page.goto(`${url}/?body=male#page`);
  await page.waitForFunction('document.body.dataset.a11yReady || document.body.dataset.a11yError', null, { timeout: 60_000 });
  const err = await page.evaluate('document.body.dataset.a11yError || null');
  if (err) errors.push(String(err).slice(0, 600));
  const firstPaint = await page.evaluate(FIRST_SCREEN) as Record<string, unknown>;   // before the 3D is in: the loading line
  await shot(page, 'page-390-loading.jpg');
  let readyMs: number | null = null;
  try { await ready(page); readyMs = Date.now() - t0; } catch (e) { errors.push(String(e).slice(0, 200)); }
  await page.waitForTimeout(800);
  const gates = await page.evaluate(FIRST_SCREEN) as { words: number; wordsMine: number; fontSizes: string[]; sideways: number; small: unknown[] };
  const scan = await page.evaluate('window.__a11y.staticScan()') as { violations: { rule: string; severity: string; target: string; detail?: string }[]; interactive: number };
  const stage = await page.evaluate('window.__stage()');
  // a picked chip has to LOOK picked (not only say so to a screen reader): its colours against an unpicked chip's
  const pressedLook = await page.evaluate(`(() => { const look = (e) => { const s = getComputedStyle(e); return s.borderTopColor + ' | ' + s.color; };
    const on = [...document.querySelectorAll('main button[aria-pressed="true"]')].map(look), off = [...document.querySelectorAll('main button[aria-pressed="false"]')].map(look);
    return { pressed: [...new Set(on)], unpressed: [...new Set(off)], different: on.length > 0 && on.every((x) => !off.includes(x)) }; })()`);
  await shot(page, 'page-390.jpg');
  // the keyboard pass, as scripts/a11y/audit.mts runs it: Tab through the page, then the audit judges the stops
  await page.evaluate('window.__a11y.prepareFocus()');
  const stops: { target: string; body: boolean }[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate('window.__a11y.focusStop()') as { target: string; body: boolean };
    if (s.body && i > 0) break;
    stops.push(s);
  }
  const focus = await page.evaluate(`window.__a11y.judgeFocus(${JSON.stringify(stops)})`) as { rule: string; severity: string; target: string; detail?: string }[];
  // every chip on the page is a tap away: tap each lesson, and read that the stage took it
  const taps: Record<string, unknown> = {};
  for (const s of SAMPLES) {
    await page.tap(`[data-motion-sample="${s}"]`);
    await page.waitForTimeout(1500);
    taps[s] = await page.evaluate('(() => { const s = window.__stage(); return { clip: s.clip, movement: s.movement, state: document.querySelector("[data-motion-player]").getAttribute("data-motion-state"), lesson: document.querySelector("[data-motion-player]").getAttribute("data-motion-player") }; })()');
  }
  report.page = { readyMs, firstPaint, gates, a11y: { interactive: scan.interactive, violations: scan.violations, tabStops: stops.map((x) => x.target), focus }, pressedLook, stage, taps, errors };
  save();
  console.log(`PAGE 390: ready ${readyMs} ms · words ${gates.words} (in main ${gates.wordsMine}) · font sizes ${gates.fontSizes.join(' ')} · sideways ${gates.sideways} · targets under 44: ${JSON.stringify(gates.small)} · a11y ${scan.violations.length} ${JSON.stringify(scan.violations.map((v) => `${v.severity}:${v.rule}:${v.target}${v.detail ? ':' + v.detail : ''}`))} · keyboard: ${stops.length} stops, ${focus.length} findings ${JSON.stringify(focus.map((v) => `${v.severity}:${v.rule}:${v.target}`))} · a picked chip looks picked: ${JSON.stringify(pressedLook)} · errors ${errors.length} ${errors.join(' | ')}`);
  await page.close();
}
if (PAGE) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors = errorsOf(page);
  await page.goto(`${url}/#soon`);
  await page.waitForFunction('document.body.dataset.a11yReady || document.body.dataset.a11yError', null, { timeout: 60_000 });
  const gates = await page.evaluate(FIRST_SCREEN) as { words: number; lines: string[]; sideways: number };
  const dark = await page.evaluate('({ soon: !!document.querySelector("[data-motion-soon]"), player: !!document.querySelector("[data-motion-player],[data-motion-preview],canvas") })');
  await shot(page, 'soon-390.jpg');
  report.soon = { gates, dark, errors };
  save();
  console.log(`SOON 390 (an ordinary account): ${JSON.stringify(dark)} · words ${gates.words} · sideways ${gates.sideways} · errors ${errors.length}`);
  await page.close();
}
if (PAGE) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errors = errorsOf(page);
  await page.goto(`${url}/?body=male#page`);
  try { await ready(page); } catch (e) { errors.push(String(e).slice(0, 200)); }
  await page.waitForTimeout(600);
  const gates = await page.evaluate(FIRST_SCREEN) as { words: number; sideways: number; fontSizes: string[] };
  await shot(page, 'page-1280.jpg');
  report.desktop = { gates, errors };
  save();
  console.log(`PAGE 1280: words ${gates.words} · font sizes ${gates.fontSizes.join(' ')} · sideways ${gates.sideways} · errors ${errors.length}`);
  await page.close();
}

// 2. the stage, per body: GATE 0, each lesson measured and shot at five moments; the controls on the first body
const PHASES = [0, 0.25, 0.5, 0.75, 1];
const cells: Record<string, string[]> = {};
for (const body of BODIES) {
  try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.addInitScript(NAME_SHIM); await page.addInitScript(SAMPLER);
  const errors = errorsOf(page);
  const t0 = Date.now();
  await page.goto(`${url}/?body=${body}#player:low-jumps`);
  const out: Record<string, unknown> = {};
  report[`body:${body}`] = out;
  try { await ready(page); } catch (e) { errors.push(String(e).slice(0, 200)); out.errors = errors; save(); console.log(`BODY ${body}: the stage never became ready · ${errors.join(' | ')}`); await page.close(); continue; }
  out.readyMs = Date.now() - t0;
  const st = await page.evaluate('window.__stage()') as { bones: string[]; meshes: number; tier: string; body: string };
  const deg = await page.evaluate('document.querySelector("[data-testid=motion-stage]").getAttribute("data-state")');
  out.gate0 = { spawned: true, bones: st.bones.length, prefixed: st.bones.filter((b) => /^mixamorig/i.test(b)), names: st.bones, meshes: st.meshes, tier: st.tier, stageState: deg };
  console.log(`BODY ${body}: ready ${out.readyMs} ms · GATE 0: spawned through CharacterLibrary, ${st.bones.length} bones, ${st.bones.filter((b) => /^mixamorig/i.test(b)).length} prefixed, tier ${st.tier}, stage ${deg}`);
  // the stage's box, shot as a rectangle of the page: an element shot waits for the element to be "stable", and a canvas
  // that redraws every frame under SwiftShader on a loaded machine never is (the first run timed out there)
  const clip = await page.evaluate('(() => { const r = document.querySelector("[data-testid=motion-stage]").getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }; })()') as { x: number; y: number; width: number; height: number };
  const variants: [string, string][] = SAMPLES.map((s) => [s, 'file']);
  if (body === BODIES[0]) variants.push(['max-jump', 'raw'], ['low-jumps', 'raw'], ['max-jump', 'live']);
  for (const [sample, variant] of variants) {
    const id = `${sample}.${variant}`;
    const before = await page.evaluate('window.__stage().clip');
    const made = await page.evaluate(([s, v]) => (window as unknown as { __rig: { setLesson(s: string, v: string): Promise<unknown> } }).__rig.setLesson(s, v), [sample, variant] as const);
    if (!(sample === 'low-jumps' && variant === 'file')) await page.waitForFunction((b) => (window as unknown as { __stage(): { clip: string } }).__stage().clip !== b, before, { timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(900);   // the cross-fade is over and the bind-pose check has run
    const sampled = await page.evaluate('window.__sample(60)') as Sampled | null;
    if (!sampled) { out[id] = { error: 'no clip playing' }; continue; }
    const m = measure(sampled);
    const state = await page.evaluate('document.querySelector("[data-motion-player]").getAttribute("data-motion-state")');
    out[id] = { lesson: made, ...m, state };
    console.log(`  ${body} ${id.padEnd(16)} ${m.movementS}s (+return ${r3(m.clipS - m.movementS)}) · planted ${m.foot.planted} foot-frames: slide p90 ${m.foot.p90Cm} cm, max ${m.foot.maxCm} cm, skates ${m.foot.skates} · flight ${m.flightM} m · hips ${m.hipsLowM}…${m.hipsHighM} m · under floor ${m.lowestFootUnderFloorCm} cm · left is left ${m.leftIsLeft} · ${state}`);
    cells[`${body}|${id}`] = [];
    for (const f of PHASES) {
      await page.evaluate(`window.__goto(${f})`);
      await page.waitForTimeout(220);
      const p = join(OUT, `cell-${body}-${id}-${Math.round(f * 100)}.jpg`);
      try { await page.screenshot({ path: p, type: 'jpeg', quality: 84, clip, timeout: 20_000 }); cells[`${body}|${id}`].push(p); }
      catch (e) { errors.push(`shot ${id} ${f}: ${String(e).slice(0, 80)}`); }
    }
    await page.evaluate('window.__resume()');
    save();
  }
  if (body === BODIES[0]) {
    // the controls, by real taps, on the low jumps
    await page.evaluate(() => (window as unknown as { __rig: { setLesson(s: string, v: string): Promise<unknown> } }).__rig.setLesson('low-jumps', 'file'));
    await page.waitForTimeout(1200);
    const c: Record<string, unknown> = {};
    const stage = () => page.evaluate('window.__stage()') as Promise<{ clip: string; movement: number; total: number; speed: number; playing: boolean; frame: number; clips: number }>;
    const base = await stage();
    const plain = await page.evaluate('window.__sample(60)') as Sampled;
    await page.tap('[data-motion-slow]'); await page.waitForTimeout(700);
    const slow = await stage();
    c.slow = { speedBefore: base.speed, speedAfter: slow.speed, sameClip: slow.clip === base.clip, pressed: await page.getAttribute('[data-motion-slow]', 'aria-pressed') };
    await page.tap('[data-motion-slow]'); await page.waitForTimeout(500);
    await page.tap('[data-motion-mirror]'); await page.waitForTimeout(1200);
    const mir = await stage();
    const mirrored = await page.evaluate('window.__sample(60)') as Sampled;
    const a = lateral(plain), b = lateral(mirrored), n = Math.min(a.L.length, b.L.length);
    let swapErr = 0, sameErr = 0;
    for (let i = 0; i < n; i++) { swapErr += Math.abs(b.L[i] + a.R[i]) + Math.abs(b.R[i] + a.L[i]); sameErr += Math.abs(b.L[i] - a.L[i]) + Math.abs(b.R[i] - a.R[i]); }
    c.mirror = { newClip: mir.clip !== base.clip, meanAbsVsSwappedCm: r1((swapErr / (2 * n)) * 100), meanAbsVsUnmirroredCm: r1((sameErr / (2 * n)) * 100), pressed: await page.getAttribute('[data-motion-mirror]', 'aria-pressed') };
    await page.tap('[data-motion-mirror]'); await page.waitForTimeout(700);
    await page.tap('[data-motion-phrase="1"]'); await page.waitForTimeout(1200);
    const ph = await stage();
    c.phrase = { label: await page.textContent('[data-motion-phrase="1"]'), movementS: r3(ph.movement), clipS: r3(ph.total), from: (ph as unknown as { from: number }).from, wholeWasS: r3(base.movement), newClip: ph.clip !== base.clip };
    await page.tap('[data-motion-phrase="all"]'); await page.waitForTimeout(900);
    const back = await stage();
    c.all = { backToWholeClip: back.clip === base.clip, clipsBuilt: back.clips };
    await page.tap('[data-motion-pause]'); await page.waitForTimeout(400);
    const p1 = await stage(); await page.waitForTimeout(500); const p2 = await stage();
    await page.tap('[data-motion-pause]'); await page.waitForTimeout(500);
    const p3 = await stage(); await page.waitForTimeout(300); const p4 = await stage();
    c.pause = { heldFrame: Math.abs(p2.frame - p1.frame) < 0.01, movesAgain: Math.abs(p4.frame - p3.frame) > 0.5, label: await page.textContent('[data-motion-pause]') };
    const cue = await page.evaluate(`(async () => { const seen = new Set(); const t0 = performance.now(); while (performance.now() - t0 < 4500) { const e = document.querySelector('[data-motion-cue]'); seen.add(e.getAttribute('data-motion-cue') + ':' + e.textContent); await new Promise((r) => setTimeout(r, 80)); } return [...seen]; })()`);
    c.cueLine = cue;
    out.controls = c;
    console.log(`  CONTROLS ${body}: ${JSON.stringify(c)}`);
  }
  out.errors = errors;
  save();
  if (errors.length) console.log(`  ${body} errors: ${errors.join(' | ')}`);
  await page.close();
  } catch (e) { console.log(`BODY ${body}: stopped — ${String(e).slice(0, 300)}`); report[`body:${body}:stopped`] = String(e).slice(0, 300); save(); }
}

// 3. the contact sheets (JPG)
const sheetPage = await browser.newPage({ viewport: { width: 5 * 260 + 190, height: 800 }, deviceScaleFactor: 1 });
const row = (label: string, files: string[]) => `<div style="display:flex;align-items:center;border-bottom:1px solid #222"><div style="width:190px;padding:0 10px;box-sizing:border-box;color:#fff;font:14px/1.3 sans-serif">${label}</div>${files.map((f) => `<img src="file://${f}" style="width:260px;height:195px;object-fit:cover">`).join('')}</div>`;
const head = (title: string) => `<div style="display:flex;color:#9cf;font:13px sans-serif;padding:6px 0"><div style="width:190px;padding:0 10px;box-sizing:border-box;color:#fff;font-weight:bold">${title}</div>${['start', '25%', '50%', '75%', 'end'].map((x) => `<div style="width:260px;text-align:center">${x}</div>`).join('')}</div>`;
const sheet = async (name: string, title: string, rows: [string, string][]) => {
  const have = rows.filter(([, k]) => cells[k]?.length === PHASES.length);   // whole rows only
  if (!have.length) return;
  writeFileSync(join(OUT, 'sheet.html'), `<body style="margin:0;background:#111">${head(title)}${have.map(([label, k]) => row(label, cells[k])).join('')}</body>`);
  await sheetPage.goto(`file://${join(OUT, 'sheet.html')}`); await sheetPage.waitForTimeout(400);
  await sheetPage.screenshot({ path: join(OUT, name), type: 'jpeg', quality: 86, fullPage: true });
  console.log(`sheet → ${join(OUT, name)}`);
};
for (const body of BODIES) await sheet(`sheet-${body}.jpg`, `Body: ${body}`, SAMPLES.map((s) => [s, `${body}|${s}.file`]));
await sheet('sheet-before-after.jpg', `Before → after (${BODIES[0]})`, [
  ['max jump — BEFORE: raw camera points (no flight, sunk)', `${BODIES[0]}|max-jump.raw`], ['max jump — AFTER: the fitted adapter', `${BODIES[0]}|max-jump.file`],
  ['low jumps — BEFORE', `${BODIES[0]}|low-jumps.raw`], ['low jumps — AFTER', `${BODIES[0]}|low-jumps.file`],
]);
await browser.close(); close();
save();
console.log(`report → ${join(OUT, 'report.json')}`);
