// The form review on the rig (COACH-VIDEO-REVIEW, 2026-10-24): the client films a set and the coach reviews it, in
// headless Chromium at a phone width (390) and a desktop width (1280). No server: scripts/probes/_coach-form-review-entry.tsx
// is bundled with esbuild, the app's Tailwind CSS compiled with its own CLI. The record scene's camera is the pose
// service's own feed, pushed a jittered squat set from tests/helpers/formReviewSets.ts.
//
//   CHROMIUM_EXE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/probes/_coach-form-review-probe.mts <outDir>
//
// Measured and printed: the live rep count against the set's truth, the flags, the POST body (a JSON string, its keys,
// its size, no media), the replay canvases' painted pixels, sideways overflow at 390. Exit 0 = every check held.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
import type { ReviewMovement } from '../../lib/coach/formReview/movements.ts';
import type { PoseFrame } from '../../lib/pose/landmarks.ts';

// tsx loads these .ts modules as CommonJS under an .mts entry, so their names are read off the namespace
const load = async <T,>(p: string): Promise<T> => { const m = await import(p) as Record<string, unknown>; return { ...(m.default as object), ...m } as T; };
const { squatSet, lungeSet } = await load<typeof import('../../tests/helpers/formReviewSets.ts')>('../../tests/helpers/formReviewSets.ts');
const { readSet } = await load<typeof import('../../lib/coach/formReview/reader.ts')>('../../lib/coach/formReview/reader.ts');
const { flagsFor, scoreReps, summarize, trendLine } = await load<typeof import('../../lib/coach/formReview/score.ts')>('../../lib/coach/formReview/score.ts');
const { buildSubmission } = await load<typeof import('../../lib/coach/formReview/payload.ts')>('../../lib/coach/formReview/payload.ts');
const { replyPresets } = await load<typeof import('../../lib/coach/formReview/reply.ts')>('../../lib/coach/formReview/reply.ts');
const { hingeSet } = await load<typeof import('../../lib/mirror/fixtures/sideRepBuild.ts')>('../../lib/mirror/fixtures/sideRepBuild.ts');

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.form-review-shots'));
mkdirSync(OUT, { recursive: true });

// ── the bundle and the CSS ──
const js = join(OUT, 'form-review.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_coach-form-review-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
});
const css = join(OUT, 'form-review.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });

// ── the fixtures ──
const KNEE = { shiftL: -0.06 }, BOTH = { shiftL: -0.06, shiftR: -0.06 };
const recordFrames = squatSet([{}, {}, KNEE, {}, {}, BOTH], 2);
const RECORD_TRUTH = { reps: 6, flagged: [3, 6] };

function reviewFixture(id: string, movement: ReviewMovement, exerciseName: string, frames: PoseFrame[], clientId: string, clientName: string, hoursAgo: number, trend: number[], status: 'unreviewed' | 'reviewed') {
  const reps = scoreReps(movement, readSet(movement, frames));
  const flags = flagsFor(movement, reps);
  const sub = buildSubmission({ programId: 'p1', sessionExerciseId: 'e1', movement, aspect: 4 / 3, frames, reps, flags });
  const set = summarize(reps);
  const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const points = [...trend.map((s, i) => ({ at: at(hoursAgo + (trend.length - i) * 72), setScore: s })), { at: at(hoursAgo), setScore: set.setScore }];
  return {
    item: { id, clientId, clientName, programId: 'p1', exerciseName, movement, reps: set.reps, read: set.read, setScore: set.setScore, flags, status, createdAt: at(hoursAgo), reviewedAt: status === 'reviewed' ? at(hoursAgo - 2) : null, trend: { line: trendLine(points), points } },
    detail: { review: { id, exerciseName, movement, status, aspect: sub.aspect, reps, flags, set, tracks: sub.tracks }, presets: replyPresets(movement, flags) },
  };
}
const fx = [
  reviewFixture('r1', 'squat', 'Goblet squat', squatSet([{}, {}, KNEE, {}, {}, {}, KNEE, {}], 3), 'c1', 'Maya Okafor', 2, [70, 78], 'unreviewed'),
  reviewFixture('r2', 'lunge', 'Reverse lunge', lungeSet('right', [0, 0.05, 0, 0, 0.05, 0], 1), 'c2', 'Jordan Reyes', 5, [], 'unreviewed'),
  reviewFixture('r3', 'hinge', 'Romanian deadlift', hingeSet({ reps: 6, seed: 4, setup: 75 }), 'c3', 'Sam Lee', 30, [88], 'reviewed'),
];
const FR_CLIENTS = { scene: 'clients', ctx: null, queue: { available: true, items: fx.map((f) => f.item), unreviewed: 2 }, details: Object.fromEntries(fx.map((f) => [f.item.id, f.detail])) };
const FR_RECORD = { scene: 'record', ctx: { programId: 'p1', sessionExerciseId: 'e1', exerciseName: 'Goblet squat', movement: 'squat', ready: true, send: { ok: true } }, queue: { available: true, items: [], unreviewed: 0 }, details: {} };

// ── the browser ──
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const report: Record<string, unknown> = {};
const fails: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) fails.push(what); };

async function open(width: number, fr: unknown): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setContent(`<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body><div id="root"></div></body></html>`);
  await page.evaluate(`window.__FR__ = ${JSON.stringify(fr)}`);
  await page.addScriptTag({ content: readFileSync(js, 'utf8') });
  return { page, errors };
}
const OVERFLOW = (W: number) => `(() => { let n = 0; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width && r.height && r.right > ${W} + 0.5) { let clipped = false; for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { clipped = p.getBoundingClientRect().right <= ${W} + 0.5; break; } } if (!clipped) n++; } } return { scrollWidth: document.documentElement.scrollWidth, overflowing: n }; })()`;
/** An element's box in DOCUMENT coordinates (a fullPage clip wants those; boundingBox is the viewport's). */
async function shoot(page: Page, selector: string, path: string): Promise<void> {
  const r = await page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`) as { x: number; y: number; w: number; h: number };
  await page.screenshot({ path, fullPage: true, clip: { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.w + 16, height: r.h + 16 } });
}
const PAINTED = `(() => [...document.querySelectorAll('[data-replay-canvas]')].map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }))()`;

// 1. the client films a set (phone)
for (const width of [390, 1280]) {
  const tag = width === 390 ? 'phone' : 'desktop';
  const { page, errors } = await open(width, FR_RECORD);
  await page.waitForSelector('[data-record-start]');
  if (width === 390) await page.screenshot({ path: join(OUT, `record-${tag}-1-ready.png`), fullPage: true });
  await page.evaluate('window.__feedBegin()');
  await page.click('[data-record-start]');
  await page.waitForSelector('[data-record-stop]');
  let counted = 0;
  const half = Math.floor(recordFrames.length * 0.62);
  for (let i = 0; i < recordFrames.length; i += 30) {
    await page.evaluate(`(${JSON.stringify(recordFrames.slice(i, i + 30))}).forEach((f) => window.__feedPush(f))`);
    await page.waitForTimeout(60);
    if (width === 390 && i <= half && i + 30 > half) { await page.waitForTimeout(150); await page.screenshot({ path: join(OUT, `record-${tag}-2-recording.png`) }); }
  }
  counted = Number(await page.textContent('[data-rep-count]'));
  await page.click('[data-record-stop]');
  await page.waitForSelector('[data-set-result]');
  const headline = await page.textContent('[data-set-headline]');
  const flags = await page.$$eval('[data-flag]', (els) => els.map((e) => (e.textContent ?? '').trim()));
  const flaggedReps = await page.$$eval('[data-flag]', (els) => els.map((e) => Number(e.getAttribute('data-flag'))));
  const painted = await page.evaluate(PAINTED) as number[];
  await page.screenshot({ path: join(OUT, `record-${tag}-3-flags.png`), fullPage: true });
  await page.click('[data-send]');
  await page.waitForSelector('[data-sent]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, `record-${tag}-4-sent.png`), fullPage: true });
  const sent = await page.evaluate('window.__SENT__') as { url: string; method: string; contentType: string | null; bodyType: string; body: string }[];
  const post = sent.find((s) => s.method === 'POST')!;
  const parsed = JSON.parse(post.body);
  const overflow = width === 390 ? await page.evaluate(OVERFLOW(390)) as { scrollWidth: number; overflowing: number } : null;
  report[`record_${tag}`] = {
    truthReps: RECORD_TRUTH.reps, liveCount: counted, headline, flags, flaggedReps, replayPixels: painted,
    post: { contentType: post.contentType, bodyType: post.bodyType, bytes: post.body.length, keys: Object.keys(parsed), tracks: parsed.tracks.map((t: { rep: number; frames: unknown[] }) => `${t.rep}:${t.frames.length}f`), media: /data:|base64|blob:|video|image|audio/i.test(post.body) },
    overflow, errors,
  };
  check(counted === RECORD_TRUTH.reps, `${tag}: live count ${counted} ≠ ${RECORD_TRUTH.reps}`);
  check(JSON.stringify([...flaggedReps].sort()) === JSON.stringify(RECORD_TRUTH.flagged), `${tag}: flagged ${flaggedReps}`);
  check(painted.length === 2 && painted.every((n) => n > 500), `${tag}: replay canvases ${painted}`);
  check(post.contentType === 'application/json' && post.bodyType === 'string' && !(report[`record_${tag}`] as { post: { media: boolean } }).post.media, `${tag}: POST body`);
  check(!overflow || (overflow.scrollWidth <= 390 && overflow.overflowing === 0), `${tag}: overflow ${JSON.stringify(overflow)}`);
  check(errors.length === 0, `${tag}: page errors ${errors.join(' | ')}`);
  await page.close();
}

// 2. the coach reviews (phone, then desktop)
for (const width of [390, 1280]) {
  const tag = width === 390 ? 'phone' : 'desktop';
  const { page, errors } = await open(width, FR_CLIENTS);
  await page.getByRole('button', { name: 'Clients' }).click({ timeout: 15000 });
  await page.waitForSelector('[data-form-review-queue] [data-review-item]');
  await page.waitForSelector('[data-attention-form-reviews]');
  const count = await page.textContent('[data-attention-form-reviews]');
  const firstFlag = await page.textContent('[data-review-item] [data-review-flag]');
  await page.screenshot({ path: join(OUT, `coach-${tag}-1-board-and-queue.png`), fullPage: true });
  await shoot(page, '[data-form-review-queue]', join(OUT, `coach-${tag}-2-queue.png`));
  await page.locator('[data-review-item="r1"] button[aria-expanded]').click();
  await page.waitForSelector('[data-review-open="r1"] [data-replay-canvas]');
  await page.waitForTimeout(200);
  const painted = await page.evaluate(PAINTED) as number[];
  await page.click('[data-review-open="r1"] [data-replay-play]');
  await page.waitForTimeout(600);
  const paintedLater = await page.evaluate(PAINTED) as number[];
  await page.selectOption('[data-reply-cue]', { index: 1 });
  await page.fill('[data-reply-note]', 'Good depth. Watch the left knee on the way down.');
  await shoot(page, '[data-review-item="r1"]', join(OUT, `coach-${tag}-3-open-replay-reply.png`));
  await page.click('[data-review-open="r1"] [data-reply-send]');
  await page.waitForTimeout(300);
  const sent = await page.evaluate('window.__SENT__') as { url: string; body: string }[];
  const reply = sent.find((s) => s.url.endsWith('/reply'));
  const overflow = width === 390 ? await page.evaluate(OVERFLOW(390)) as { scrollWidth: number; overflowing: number } : null;
  report[`coach_${tag}`] = { attentionLine: count, firstFlag, replayPixels: painted, replayPixelsPlaying: paintedLater, reply: reply ? JSON.parse(reply.body) : null, overflow, errors };
  check(/2 filmed sets to review/.test(count ?? ''), `${tag}: attention line ${count}`);
  check(/knee caves in on rep/.test(firstFlag ?? ''), `${tag}: first flag ${firstFlag}`);
  check(painted.length === 2 && painted.every((n) => n > 500), `${tag}: coach replay ${painted}`);
  check(!!reply && /^fault:kneeValgus:cue$/.test(JSON.parse(reply.body).cueId), `${tag}: reply ${reply?.body}`);
  check(!overflow || (overflow.scrollWidth <= 390 && overflow.overflowing === 0), `${tag}: overflow ${JSON.stringify(overflow)}`);
  check(errors.length === 0, `${tag}: page errors ${errors.join(' | ')}`);
  await page.close();
}
await browser.close();
writeFileSync(join(OUT, 'probe-report.json'), JSON.stringify({ ...report, fails }, null, 1));
console.log(JSON.stringify({ ...report, fails }, null, 1));
process.exit(fails.length ? 1 : 0);
