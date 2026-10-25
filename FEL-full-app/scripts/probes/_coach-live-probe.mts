// The live session on a two-browser rig (COACH-LIVE, 2026-10-25). Two headless Chromium contexts — the coach at a
// desktop width, the client at a phone width — with --use-fake-device-for-media-stream (Chromium's own fake camera and
// microphone). No Next server: scripts/probes/_coach-live-entry.tsx is bundled with esbuild and served from a small
// static server on 127.0.0.1, which also stands in for the three /api/coach/live routes:
//   join     the door's answer from a fixture per room (adult with video / a consented teen / a blocked network);
//   signal   the REAL relay (lib/coach/live/server.ts pushSignal / pollSignals over Controller Link's in-memory store),
//            the person taken from an `as` cookie; in the "nat" room every ICE candidate is dropped, which is what a
//            network with no direct path does to a peer link, so the session must go through the relay;
//   summary  the real parseSummary + summaryText, the text kept for the probe to read.
// The client's pose is the pose service's own dev feed, played a fixture squat set (tests/helpers/liveSets.ts).
//
//   CHROMIUM_EXE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/probes/_coach-live-probe.mts <outDir>
//
// Measured and printed: the connection (time to direct, the path), the video track (size, fps, kbps), pose frames
// (Hz at the coach, capture→coach latency p50/p95, the network part, payload and wire kbps), the rep count at the coach
// against the set's truth (and how long after the client counted it), the flags, a cue's round trip, the summary.
// Exit 0 = every check held.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const load = async <T,>(p: string): Promise<T> => { const m = await import(p) as Record<string, unknown>; return { ...(m.default as object), ...m } as T; };
const { squatSet } = await load<typeof import('../../tests/helpers/liveSets.ts')>('../../tests/helpers/liveSets.ts');
const { pushSignal, pollSignals, checkSignal } = await load<typeof import('../../lib/coach/live/server.ts')>('../../lib/coach/live/server.ts');
const { parseRoomId } = await load<typeof import('../../lib/coach/live/gate.ts')>('../../lib/coach/live/gate.ts');
const { parseSummary, summaryText } = await load<typeof import('../../lib/coach/live/session.ts')>('../../lib/coach/live/session.ts');
const { getSignalStore } = await load<typeof import('../../lib/controller-link/signalStore.ts')>('../../lib/controller-link/signalStore.ts');

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.coach-live-shots'));
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.LIVE_RIG_PORT ?? 3661);
const BASE = `http://localhost:${PORT}`;

// ── the bundle and the CSS ──
const js = join(OUT, 'live.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_coach-live-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
});
const css = join(OUT, 'live.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });

// ── the stub server ──
const DOORS: Record<string, { clientVideo: boolean; clientBand: 'adult' | 'teen'; dropIce?: boolean }> = {
  'p_rig-adult-1': { clientVideo: true, clientBand: 'adult' },
  'p_rig-teen-01': { clientVideo: false, clientBand: 'teen' },
  'p_rig-nat-001': { clientVideo: true, clientBand: 'adult', dropIce: true },
};
const posted: { room: string; text: string }[] = [];
const signals = { pose: 0, poseBytes: 0, ctl: 0, ice: 0, dropped: 0 };
const store = getSignalStore();
const cookie = (req: IncomingMessage) => /(?:^|;\s*)as=(coach|client)/.exec(req.headers.cookie ?? '')?.[1] as 'coach' | 'client' | undefined;
const body = (req: IncomingMessage) => new Promise<unknown>((r) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => { try { r(JSON.parse(s)); } catch { r(null); } }); });
const json = (res: ServerResponse, status: number, v: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
const page = (room: string) => `<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body><div id="root"></div><script>window.__LIVE__=${JSON.stringify({ room })}</script><script src="/live.js"></script></body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', BASE);
  const as = cookie(req);
  if (url.pathname === '/live.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(readFileSync(js)); return; }
  if (url.pathname === '/live') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page(url.searchParams.get('room') ?? '')); return; }
  if (url.pathname === '/api/coach/live') {
    const room = url.searchParams.get('room') ?? '';
    const d = DOORS[room];
    if (!as || !d) return json(res, 404, { error: 'not_found' });
    return json(res, 200, { role: as, clientVideo: d.clientVideo, clientBand: d.clientBand, iceServers: [], recorded: false });
  }
  if (url.pathname === '/api/coach/live/signal') {
    if (req.method === 'GET') {
      const ref = parseRoomId(url.searchParams.get('room'));
      if (!as || !ref) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { messages: await pollSignals(store, ref, as, Number(url.searchParams.get('after') ?? 0)) });
    }
    const b = (await body(req)) as { room?: string; data?: { kind?: string; b?: string[] } } | null;
    const ref = parseRoomId(b?.room);
    if (!as || !ref || !b) return json(res, 404, { error: 'not_found' });
    if (!checkSignal(b.data).ok) return json(res, 400, { error: 'bad_signal' });
    const kind = b.data?.kind;
    if (kind === 'ice' && DOORS[b.room!]?.dropIce) { signals.dropped++; return json(res, 200, { seq: null }); }
    if (kind === 'pose') { signals.pose += b.data?.b?.length ?? 0; signals.poseBytes += JSON.stringify(b.data).length; }
    if (kind === 'ctl') signals.ctl++;
    if (kind === 'ice') signals.ice++;
    return json(res, 200, { seq: await pushSignal(store, ref, as, b.data) });
  }
  if (url.pathname === '/api/coach/live/summary') {
    const b = (await body(req)) as { room?: string; summary?: unknown; minutes?: number } | null;
    const sum = parseSummary(b?.summary);
    if (as !== 'coach' || !sum) return json(res, 400, { error: 'bad_summary' });
    const text = summaryText(sum, b?.minutes ?? null);
    posted.push({ room: String(b?.room), text });
    return json(res, 200, { posted: true, text, programId: 'rig' });
  }
  json(res, 404, { error: 'not_found' });
});
await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', () => r()));

// ── the browsers ──
const browser = await chromium.launch({
  executablePath: chromiumExe(), headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const fails: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) { fails.push(what); console.log(`  FAIL ${what}`); } };
const report: Record<string, unknown> = {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open(as: 'coach' | 'client', room: string, width: number): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: width < 600 ? 2 : 1, permissions: ['camera', 'microphone'] });
  await ctx.addCookies([{ name: 'as', value: as, url: BASE }]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await page.goto(`${BASE}/live?room=${room}`);
  return { ctx, page, errors };
}
const stats = async (p: Page) => JSON.parse((await p.getAttribute('[data-live-role="coach"]', 'data-live-stats')) ?? 'null');
const marks = async (p: Page) => p.evaluate('window.__marks') as Promise<{ k: string; v: string; at: number }[]>;
const mode = (p: Page, m: string, timeout: number) => p.waitForSelector(`[data-live-mode="${m}"]`, { timeout });

/** One set, live: coach picks the exercise and starts; the client's feed plays the set; a cue mid-set; the coach stops. */
async function runSet(coach: Page, client: Page, frames: unknown[], tag: string, shots: boolean) {
  await coach.click('[data-exercise="squat"]');
  await coach.click('[data-set-toggle]');
  await client.waitForFunction(() => document.body.textContent?.includes('Set 1'), null, { timeout: 15_000 });
  const playing = client.evaluate(`window.__feedPlay(${JSON.stringify(frames)})`);
  const samples: unknown[] = [];
  let cueAt = 0, cueShown: number | null = null;
  const sampler = (async () => {
    for (let i = 0; i < 40; i++) {
      await wait(1000);
      samples.push(await stats(coach));
      if (i === 6 && !cueAt) {
        cueAt = Date.now();
        await coach.click('[data-cue-btn="squat:kneeValgus"]');
        await client.waitForSelector('[data-live-cue]', { timeout: 15_000 });
        cueShown = Date.now();
        if (shots) await client.screenshot({ path: join(OUT, `${tag}-client-cue.png`) });
      }
      if (i === 9 && shots) {
        await coach.screenshot({ path: join(OUT, `${tag}-coach-live.png`), fullPage: true });
      }
      if (await client.evaluate('window.__playDone === true')) break;
    }
  })();
  await playing;
  await client.evaluate('window.__playDone = true');
  await sampler;
  await wait(600);
  await coach.click('[data-set-toggle]');
  await coach.waitForSelector('[data-set-row="1"][data-set-reps]', { timeout: 10_000 });
  await wait(800);
  return { samples, cueAt, cueShown };
}

function repLag(coachMarks: { k: string; v: string; at: number }[], clientMarks: { k: string; v: string; at: number }[]) {
  const lags: number[] = [];
  for (const c of clientMarks.filter((m) => m.k === 'clientReps' && Number(m.v) > 0)) {
    const at = coachMarks.find((m) => m.k === 'coachReps' && m.v === c.v && m.at >= c.at - 5);
    if (at) lags.push(Math.round(at.at - c.at));
  }
  return lags;
}
const p = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] : null; };
const steady = (samples: any[]) => samples.filter((s) => s && s.poseHz > 0).slice(2);

// ── 1. an adult with video, direct ──
const SET = squatSet(['clean', 'clean', 'kneeInLeft', 'clean', 'clean']);
const TRUTH = { reps: 5, flagged: [3] };
{
  console.log('scenario 1: adult, video + pose, direct');
  const room = 'p_rig-adult-1';
  const coach = await open('coach', room, 1280);
  await coach.page.click('[data-live-start]');
  const client = await open('client', room, 390);
  await client.page.screenshot({ path: join(OUT, 'adult-client-1-lobby.png') });
  await client.page.evaluate('window.__feedBegin()');
  const t0 = Date.now();
  await client.page.click('[data-live-join]');
  await mode(coach.page, 'direct', 30_000);
  await mode(client.page, 'direct', 30_000);
  const connectMs = Date.now() - t0;
  await coach.page.waitForFunction(() => { const v = document.querySelector('[data-live-video]') as HTMLVideoElement | null; return !!v && v.videoWidth > 0; }, null, { timeout: 20_000 });
  const video = await coach.page.evaluate(`(() => { const v = document.querySelector('[data-live-video]'); const s = v.srcObject; return { w: v.videoWidth, h: v.videoHeight, tracks: s ? s.getTracks().map((t) => t.kind + ':' + t.readyState) : [], stage: document.querySelector('[data-live-stage]').getAttribute('data-live-stage') }; })()`) as { w: number; h: number; tracks: string[]; stage: string };
  const run = await runSet(coach.page, client.page, SET, 'adult', true);
  const rows = await coach.page.$$eval('[data-set-row]', (els) => els.map((e) => ({ reps: Number(e.getAttribute('data-set-reps')), flagged: Number(e.getAttribute('data-set-flagged')) })));
  const flags = await coach.page.$$eval('[data-live-flags] li', (els) => els.map((e) => e.textContent ?? ''));
  const s = steady(run.samples as any[]);
  const last = (run.samples as any[]).filter(Boolean).at(-1);
  const lags = repLag(await marks(coach.page), await marks(client.page));
  const cueSeen = Number(await coach.page.getAttribute('[data-cue-sent="1"]', 'data-cue-seen'));
  await coach.page.click('[data-live-end]');
  await coach.page.waitForSelector('[data-summary]', { timeout: 10_000 });
  await client.page.waitForSelector('[data-live-ended]', { timeout: 10_000 });
  const summary = (await coach.page.textContent('[data-summary] pre')) ?? '';
  await coach.page.screenshot({ path: join(OUT, 'adult-coach-summary.png'), fullPage: true });
  await client.page.screenshot({ path: join(OUT, 'adult-client-ended.png') });
  const r = {
    connectMs, path: last?.path ?? null, video,
    videoFps: p(s.map((x) => x.videoFps ?? 0), 0.5), videoKbps: p(s.map((x) => x.videoKbps ?? 0), 0.5), audioKbps: p(s.map((x) => x.audioKbps ?? 0), 0.5),
    poseHz: { p50: p(s.map((x) => x.poseHz), 0.5), min: Math.min(...s.map((x) => x.poseHz)) },
    poseLatencyMs: { p50: last?.latencyP50, p95: last?.latencyP95, networkP50: last?.netP50, rtt: last?.rttMs },
    poseKbps: { payload: p(s.map((x) => x.poseKbps), 0.5), dataChannel: p(s.map((x) => x.poseWireKbps ?? 0), 0.5) },
    framesIn: last?.framesIn, rows, flags, repLagMs: { all: lags, p50: p(lags, 0.5), max: lags.length ? Math.max(...lags) : null },
    cue: { shownAfterMs: run.cueShown && run.cueAt ? run.cueShown - run.cueAt : null, roundTripMs: cueSeen },
    summary, posted: posted.at(-1), errors: [...coach.errors, ...client.errors],
  };
  report.adult = r;
  console.log(JSON.stringify(r, null, 1));
  check(video.w > 0 && video.tracks.includes('video:live') && video.tracks.includes('audio:live'), 'adult: the coach receives the client\'s video and audio tracks');
  check(video.stage === 'video', 'adult: the stage shows the video');
  check(r.path === 'host' || r.path === 'srflx' || r.path === 'prflx', `adult: a direct path (${r.path})`);
  check((r.poseHz.p50 ?? 0) >= 15 && (r.poseHz.p50 ?? 0) <= 21, `adult: pose frames at 15–20 Hz (${r.poseHz.p50})`);
  check(typeof r.poseLatencyMs.p50 === 'number' && r.poseLatencyMs.p50! < 250, `adult: pose latency p50 < 250 ms (${r.poseLatencyMs.p50})`);
  check(rows.length === 1 && rows[0].reps === TRUTH.reps && rows[0].flagged === TRUTH.flagged.length, `adult: the coach counts ${TRUTH.reps} reps, ${TRUTH.flagged.length} flagged (${JSON.stringify(rows)})`);
  check(flags.some((f) => /Knee drifting inward.*\(left\).*rep 3/.test(f)), 'adult: the flag names the left knee on rep 3');
  check(lags.length === TRUTH.reps, `adult: every rep reached the coach (${lags.length})`);
  check(cueSeen > 0 && (r.cue.shownAfterMs ?? 1e9) < 2000, `adult: a cue round trip (${cueSeen} ms, shown after ${r.cue.shownAfterMs} ms)`);
  check(/5 reps, 1 flagged/.test(summary) && posted.length === 1, 'adult: the summary posts once with the sets, reps and flags');
  check(r.errors.length === 0, `adult: no page errors (${r.errors.join(' | ')})`);
  await coach.ctx.close(); await client.ctx.close();
}

// ── 2. a consented teen: pose + voice, no video ──
{
  console.log('scenario 2: teen, pose + voice only');
  const room = 'p_rig-teen-01';
  const coach = await open('coach', room, 1280);
  await coach.page.click('[data-live-start]');
  const client = await open('client', room, 390);
  const lobbyPoseOnly = await client.page.$('[data-live-pose-only]');
  const videoBox = await client.page.$('[data-live-want-video]');
  await client.page.screenshot({ path: join(OUT, 'teen-client-1-lobby.png') });
  await client.page.evaluate('window.__feedBegin()');
  await client.page.click('[data-live-join]');
  await mode(coach.page, 'direct', 30_000);
  const run = await runSet(coach.page, client.page, squatSet(['clean', 'kneeInLeft', 'clean'], 0, { width: 480, height: 640 }), 'teen', true);
  const gum = await client.page.evaluate('window.__GUM__') as MediaStreamConstraints[];
  const coachSide = await coach.page.evaluate(`(() => { const v = document.querySelector('[data-live-video]'); const s = v.srcObject; return { videoTracks: s ? s.getVideoTracks().length : 0, audioTracks: s ? s.getAudioTracks().length : 0, stage: document.querySelector('[data-live-stage]').getAttribute('data-live-stage') }; })()`) as { videoTracks: number; audioTracks: number; stage: string };
  const rows = await coach.page.$$eval('[data-set-row]', (els) => els.map((e) => ({ reps: Number(e.getAttribute('data-set-reps')), flagged: Number(e.getAttribute('data-set-flagged')) })));
  const s = steady(run.samples as any[]);
  const r = { lobbyPoseOnly: !!lobbyPoseOnly, videoCheckbox: !!videoBox, gum, coachSide, rows, poseHz: p(s.map((x) => x.poseHz), 0.5), videoKbps: p(s.map((x) => x.videoKbps ?? 0), 0.95), errors: [...coach.errors, ...client.errors] };
  report.teen = r;
  console.log(JSON.stringify(r, null, 1));
  check(r.lobbyPoseOnly && !r.videoCheckbox, 'teen: the lobby says pose only, with no video choice');
  check(!gum.some((c) => c.video), 'teen: the client page never asks for a camera video track');
  check(coachSide.videoTracks === 0 && coachSide.audioTracks === 1 && coachSide.stage === 'pose', `teen: the coach gets voice and pose, no video (${JSON.stringify(coachSide)})`);
  check(!r.videoKbps, `teen: no video bytes (${r.videoKbps})`);
  check(rows[0]?.reps === 3 && rows[0]?.flagged === 1, `teen: 3 reps, 1 flagged, from a phone held upright (${JSON.stringify(rows)})`);
  check(r.errors.length === 0, `teen: no page errors (${r.errors.join(' | ')})`);
  await coach.ctx.close(); await client.ctx.close();
}

// ── 3. no direct path: the relay ──
{
  console.log('scenario 3: no direct path (every ICE candidate dropped) — the relay');
  const room = 'p_rig-nat-001';
  const coach = await open('coach', room, 1280);
  await coach.page.click('[data-live-start]');
  const client = await open('client', room, 390);
  await client.page.evaluate('window.__feedBegin()');
  const t0 = Date.now();
  await client.page.click('[data-live-join]');
  await mode(coach.page, 'relay', 40_000);
  await mode(client.page, 'relay', 40_000);
  const relayAfterMs = Date.now() - t0;
  const run = await runSet(coach.page, client.page, squatSet(['clean', 'kneeInLeft', 'clean']), 'nat', false);
  await coach.page.screenshot({ path: join(OUT, 'nat-coach-relay.png'), fullPage: true });
  await client.page.screenshot({ path: join(OUT, 'nat-client-relay.png') });
  const rows = await coach.page.$$eval('[data-set-row]', (els) => els.map((e) => ({ reps: Number(e.getAttribute('data-set-reps')), flagged: Number(e.getAttribute('data-set-flagged')) })));
  const note = await coach.page.$('[data-live-relay-note]');
  const s = steady(run.samples as any[]);
  const last = (run.samples as any[]).filter(Boolean).at(-1);
  const cueSeen = Number(await coach.page.getAttribute('[data-cue-sent="1"]', 'data-cue-seen'));
  const r = {
    relayAfterMs, rows, note: !!note, poseHz: p(s.map((x) => x.poseHz), 0.5), latencyP50: last?.latencyP50, relayFrames: last?.relayFrames,
    cue: { shownAfterMs: run.cueShown && run.cueAt ? run.cueShown - run.cueAt : null, roundTripMs: cueSeen },
    serverSaw: { ...signals }, errors: [...coach.errors, ...client.errors],
  };
  report.nat = r;
  console.log(JSON.stringify(r, null, 1));
  check(r.note, 'nat: the page says there is no direct connection');
  check((r.relayFrames ?? 0) > 0 && (r.poseHz ?? 0) >= 6, `nat: pose frames through the relay (${r.relayFrames}, ${r.poseHz} Hz)`);
  check(rows[0]?.reps === 3 && rows[0]?.flagged === 1, `nat: the count and the flag through the relay (${JSON.stringify(rows)})`);
  check(cueSeen > 0, `nat: a cue round trip through the relay (${cueSeen} ms)`);
  check(r.errors.length === 0, `nat: no page errors (${r.errors.join(' | ')})`);
  await coach.ctx.close(); await client.ctx.close();
}

await browser.close();
server.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ report, fails }, null, 2));
console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall checks held');
process.exit(fails.length ? 1 : 0);
