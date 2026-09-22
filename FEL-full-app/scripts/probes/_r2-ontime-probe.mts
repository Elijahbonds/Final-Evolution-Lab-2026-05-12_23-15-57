// R2 ONTIME probe (CLOTHING-SOFT-RESIDUAL R2, 2026-09-21): an on-time SLAM that is on time because the GAME said so.
//
// The QA eye's "ontime" runs (finish-release-eye-7c11ca7) let go of RUN at a fixed 1640 ms and pressed SLAM 400 ms
// later. On a 60 fps headless flight that landed at clip 0.39–0.54 — on the RISE, 574–770 ms before the window opened at
// 1.11 — so the game refused it ("TOO EARLY — 574 ms BEFORE THE WINDOW"), the ball bounced, and the burst's frames were
// still filed as `soft-r2-ontime-through-rim` / `through-net` / `flush-or-hang`. Names from a stopwatch, not from the flight.
//
// This presses on the flight's own signal. DunkMode publishes `slamBeat` ('cue' → 'open' → 'beat' → '') on the HUD and the
// play HUD mirrors it as `data-fel-slam`; the dev harness shows the HUD as JSON in its <pre>. PRESS=beat waits for the NOW!
// beat (the window's centre, what the card scores against) and presses on it; PRESS=open presses on the window's opening
// frame; PRESS=cue on the read; PRESS=fixed:<ms> replays the eye's stopwatch. Every frame is named AFTER the flight
// resolved, by what happened: the game's own `[DUNK-SLAM] press … zone` line, MAKE (the ball met the iron) or MISS, and
// the beat each frame fell on read off the live rig (contact / through_rim / through_net / land on the dev route). The
// `soft-r2-ontime-*` names are written only for a MAKE whose press the game graded ON TIME; a miss writes a MISSED note
// and nothing else.
//   PORT=3011 npx tsx scripts/probes/_r2-ontime-probe.mts
//     ROUTE=dev|play (dev: /dev/mode/dunk, no login, full rig readout · play: /play/dunk?arena=1 after /login, HUD text only)
//     PRESS=beat|open|cue|fixed:<ms> · PASSES=1 · OUT_DIR= · TAG= · QS=body=male&tops=top_lab&… · PLAYTEST_EMAIL/PASSWORD
import { chromium, type Page } from 'playwright-core';
import { copyFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3011', ROUTE = (process.env.ROUTE ?? 'dev') as 'dev' | 'play', PRESS = process.env.PRESS ?? 'beat';
const PASSES = Number(process.env.PASSES ?? 1), OUT = process.env.OUT_DIR ?? 'docs/shots/r2-ontime', TAG = process.env.TAG ?? `r2-${PRESS.replace(':', '')}`;
const QS = process.env.QS ?? 'body=male&tops=top_lab&shorts=shorts_court&shoes=shoes_flight';
// AIM= the look stick the QA eye's harness used per pass (rim is its r2 aim; hips / feet / torso its clothing aims)
const AIMS: Record<string, [number, number]> = { rim: [0.05, -0.25], hips: [0.15, 0.35], feet: [0.05, 0.72], torso: [0.10, 0.05] };
const AIM = AIMS[process.env.AIM ?? 'rim'] ?? AIMS.rim;
const EMAIL = process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local', PASSWORD = process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only';
mkdirSync(OUT, { recursive: true });
const log = (s: string) => { console.log(s); writeFileSync(`${OUT}/${TAG}.log`, s + '\n', { flag: 'a' }); };

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
})()`;
// the beat as the page shows it: the play HUD's data attribute, or the dev harness's HUD JSON
const BEAT_JS = `(() => { const r = document.querySelector('[data-fel-slam]'); if (r) return r.getAttribute('data-fel-slam') || 'off';
  const pre = document.querySelector('pre'); if (!pre) return 'none'; const m = /"slamBeat":\\s*"([a-z]*)"/.exec(pre.textContent || ''); return m ? (m[1] || 'off') : 'off'; })()`;
// per-frame rows off the live rig (dev only): the flight clock, the contact, the ball against the rim
const ROWS_JS = `(() => {
  const dev = window.__FEL_DEV__; if (!dev || !dev.scene || !dev.dunkPosture) return false;
  const S = window.__r2 = { rows: [], marks: [] };
  const oi = console.info.bind(console);
  console.info = (...a) => { const s = String(a[0]); if (/^\\[(DUNK-SLAM|DUNK-WIN|HANDS|DUNK-CAM)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 300) }); oi(...a); };
  dev.scene.onAfterRenderObservable.add(() => {
    try {
      const h = dev.hero(); if (!h) return;
      const pp = dev.dunkPosture.get(); const ball = dev.scene.getMeshByName('ball'); if (!ball) return;
      ball.computeWorldMatrix(true); const b = ball.getAbsolutePosition();
      S.rows.push({ t: performance.now(), phase: pp.phase, clip: pp.clipTime ?? 0, contact: !!pp.jamContact, replay: !!pp.replaying, by: b.y, bx: b.x, bz: b.z, rimY: pp.rim.y, rimX: pp.rim.x, rimZ: pp.rim.z, held: !!ball.parent, heroY: h.position.y, beat: ${BEAT_JS} });
      if (S.rows.length > 20000) S.rows.splice(0, 5000);
    } catch {}
  });
  return true;
})()`;

type Row = { t: number; phase: string; clip: number; contact: boolean; replay: boolean; by: number; bx: number; bz: number; rimY: number; rimX: number; rimZ: number; held: boolean; heroY: number; beat: string };
type Mark = { t: number; msg: string };

async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; if (!p) return; ${js}; p.timestamp = performance.now(); })()`); }
async function tap(p: Page, i: number, ms = 90): Promise<void> { await padSet(p, `p.buttons[${i}].pressed = true; p.buttons[${i}].value = 1`); await p.waitForTimeout(ms); await padSet(p, `p.buttons[${i}].pressed = false; p.buttons[${i}].value = 0`); }
const text = async (p: Page) => (await p.evaluate('document.body.innerText')) as string;
const beat = async (p: Page) => (await p.evaluate(BEAT_JS)) as string;
const pnow = async (p: Page) => (await p.evaluate('performance.now()')) as number;

async function boot(): Promise<{ p: Page; close: () => Promise<void>; rig: boolean }> {
  const b = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1280,860', '--disable-dev-shm-usage'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  p.on('console', (m) => { const t = m.text(); if (/^\[(DUNK-SLAM|DUNK-WIN|HANDS|FEL-READY|FEL-KIT)/.test(t)) log('CON ' + t.slice(0, 220)); });
  let rig = false;
  if (ROUTE === 'dev') {
    await p.goto(`http://127.0.0.1:${PORT}/dev/mode/dunk?${QS}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForSelector('canvas', { timeout: 180000 });
    await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 240000 });
    await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
    rig = (await p.evaluate(ROWS_JS)) as boolean;
    await tap(p, 0);
    await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
    await p.waitForTimeout(2500);
  } else {
    await p.goto(`http://127.0.0.1:${PORT}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(400);
    if (/\/login/.test(p.url())) {
      await p.fill('input[type="email"]', EMAIL); await p.fill('input[type="password"]', PASSWORD); await p.click('button[type="submit"]');
      await p.waitForTimeout(1800);
    }
    await p.goto(`http://127.0.0.1:${PORT}/play/dunk?arena=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForSelector('canvas', { timeout: 180000 });
    await p.waitForTimeout(3000);
    await p.evaluate(`(() => { const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: window.__PAD }); window.dispatchEvent(ev); })()`);
    for (let i = 0; i < 14; i++) {
      const t = await text(p);
      if (!/TAP TO START/i.test(t)) break;
      const btn = p.getByRole('button', { name: /TAP TO START/i });
      if (await btn.count()) await btn.click({ force: true }).catch(() => {}); else await p.mouse.click(640, 480).catch(() => {});
      await p.keyboard.press('Enter').catch(() => {});
      await p.waitForTimeout(400);
    }
  }
  return { p, close: () => b.close(), rig };
}

async function waitApproach(p: Page, ms = 45000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const t = await text(p);
    if (/HOLD to run|Pick your PROP|FINAL ROUND|HOLD — running/i.test(t) && !/CONFER|SHARE PROOF|GO AGAIN|CONTEST OVER|RIVAL ROUND/i.test(t)) return true;
    if (/SHARE PROOF|GO AGAIN|CONTEST OVER/i.test(t)) { const r = p.getByRole('button', { name: /REPLAY|GO AGAIN|PLAY AGAIN/i }); if (await r.count()) await r.click({ force: true }).catch(() => {}); else await p.keyboard.press('Enter').catch(() => {}); await p.waitForTimeout(1000); }
    await p.waitForTimeout(250);
  }
  return false;
}
async function setPropNone(p: Page): Promise<void> { for (let i = 0; i < 16; i++) { if (/\bNO PROP\b/i.test(await text(p))) return; await tap(p, 2, 100); await p.waitForTimeout(320); } }
/** Wait for the beat to reach `want` (or any of them), polling every animation frame. */
async function waitBeat(p: Page, want: RegExp, timeout: number): Promise<boolean> {
  try { await p.waitForFunction(([js, re]) => new RegExp(re).test(String(eval(js))), [BEAT_JS, want.source] as [string, string], { polling: 'raf', timeout }); return true; } catch { return false; }
}

interface Shot { i: number; pt: number; file: string }
function startBurst(p: Page, prefix: string, intervalMs = 110): { stop: () => Promise<Shot[]> } {
  const shots: Shot[] = []; let i = 0, busy = false, on = true;
  const tick = async () => {
    if (!on || busy) return; busy = true;
    try { const pt = await pnow(p); const file = `${OUT}/${prefix}-tmp-${String(i).padStart(2, '0')}.png`; await p.screenshot({ path: file }); shots.push({ i, pt, file }); i++; } catch { /* the page went away */ }
    busy = false;
  };
  const id = setInterval(() => { void tick(); }, intervalMs);
  return { stop: async () => { on = false; clearInterval(id); while (busy) await new Promise((r) => setTimeout(r, 20)); return shots; } };
}

/** What a frame shows, from the rig row nearest its capture time. */
function beatName(rows: Row[], pt: number, contactT: number | null): string {
  let r: Row | null = null; for (const x of rows) if (!r || Math.abs(x.t - pt) < Math.abs(r.t - pt)) r = x;
  if (!r) return 'frame';
  if (r.replay) return 'replay';
  if (r.phase === 'cinematic') return r.beat === 'beat' || r.beat === 'open' ? 'window' : r.beat === 'cue' ? 'cue' : 'rise';
  if (r.phase === 'resolve') {
    if (contactT != null && Math.abs(r.t - contactT) <= 70) return 'contact';
    if (contactT != null && r.t > contactT && !r.held) {
      const inRing = Math.hypot(r.bx - r.rimX, r.bz - r.rimZ) < 0.25;
      if (r.by < r.rimY - 0.45) return 'through_net';
      if (r.by < r.rimY - 0.12 && inRing) return 'through_rim';
      if (r.by < r.rimY + 0.05 && inRing) return 'at_rim';
    }
    if (r.heroY < 0.08) return 'land';
    return contactT != null && r.t > contactT ? 'hang' : 'air';
  }
  return r.phase;
}

async function attempt(p: Page, rig: boolean, n: number): Promise<Record<string, unknown>> {
  const prefix = `${TAG}-p${n}`;
  if (!(await waitApproach(p))) { log(`${prefix}: no approach reached`); return { pass: n, outcome: 'NO-APPROACH' }; }
  await p.waitForTimeout(500);
  await setPropNone(p);
  await padSet(p, `p.axes[2] = ${AIM[0]}; p.axes[3] = ${AIM[1]}`);   // the eye's look-stick aim (AIM=)
  await p.waitForTimeout(280);
  const m0 = rig ? ((await p.evaluate('window.__r2.marks.length')) as number) : 0;
  if (rig) await p.evaluate('window.__r2.rows = []');
  await p.screenshot({ path: `${OUT}/${prefix}-armed.png` });
  await padSet(p, 'p.axes[1] = -1'); await p.waitForTimeout(150);
  await padSet(p, 'p.buttons[7].pressed = true; p.buttons[7].value = 1');
  // PRESS=eye[:<runMs>[:<slamMs>]] replays the QA eye's stopwatch exactly: RUN held `runMs` (1640) from the stick, let go, SLAM
  // `slamMs` (400) later, never looking at the flight. Everything else holds RUN until the read comes up and presses on a beat.
  const eye = /^eye(?::(\d+))?(?::(\d+))?$/.exec(PRESS);
  let cueSeen = false;
  if (eye) await p.waitForTimeout(Number(eye[1] ?? 1640));
  else cueSeen = await waitBeat(p, /^(cue|open|beat)$/, 9000);
  const burst = startBurst(p, prefix);
  const runRelease = await pnow(p);
  await padSet(p, 'p.buttons[7].pressed = false; p.buttons[7].value = 0; p.axes[1] = 0');
  let pressedAtPage = -1, pressedOn = '';
  if (eye || cueSeen) {
    let ok = true;
    if (eye) await p.waitForTimeout(Number(eye[2] ?? 400));
    else if (PRESS === 'beat') ok = await waitBeat(p, /^beat$/, 3000);
    else if (PRESS === 'open') ok = await waitBeat(p, /^(open|beat)$/, 3000);
    else if (PRESS.startsWith('fixed:')) await p.waitForTimeout(Number(PRESS.slice(6)) || 0);   // a stopwatch from the CUE, not from RUN
    pressedOn = await beat(p);
    pressedAtPage = await pnow(p);
    if (!ok) log(`${prefix}: the wanted beat never showed — pressing anyway (beat now '${pressedOn}')`);
    await tap(p, 0, eye ? 130 : 90);
  } else log(`${prefix}: no SLAM read came up in 9 s — no press`);
  // the resolve, the landing, the verdict
  await p.waitForTimeout(3600);
  const shots = await burst.stop();
  await padSet(p, 'p.axes[2] = 0; p.axes[3] = 0');
  const hud = (await text(p)).replace(/\s+/g, ' ');
  const marks: Mark[] = rig ? ((await p.evaluate('window.__r2.marks')) as Mark[]).slice(m0) : [];
  const rows: Row[] = rig ? ((await p.evaluate('window.__r2.rows')) as Row[]) : [];
  const pressLine = marks.find((m) => /^\[DUNK-SLAM\] press @/.test(m.msg))?.msg ?? '';
  const refused = marks.find((m) => /TOO EARLY/.test(m.msg))?.msg ?? (/TOO EARLY — \d+ ms BEFORE THE WINDOW/.exec(hud)?.[0] ?? '');
  const zone = /· (ontime|early|late|cue) (-?\d+) ms/.exec(pressLine);
  const contactRow = rows.find((r) => r.contact && !r.replay) ?? null;
  const make = rig ? !!contactRow : !/MISSED/.test(hud) && /ON TIME|EARLY|LATE|EXECUTION/.test(hud);
  const outcome = make ? 'MAKE' : 'MISS';
  const timing = zone ? zone[1] : refused ? 'refused-early' : /ON TIME/.test(hud) ? 'ontime' : /\d+ ms EARLY/.test(hud) ? 'early' : /\d+ ms LATE/.test(hud) ? 'late' : 'none';
  const contactT = contactRow?.t ?? null;
  const pressRow = rows.length && pressedAtPage >= 0 ? rows.reduce((a, r) => (Math.abs(r.t - pressedAtPage) < Math.abs(a.t - pressedAtPage) ? r : a), rows[0]) : null;
  // name every frame by what it was, then promote only what the flight earned
  const named: string[] = [];
  const beats: Record<string, string> = {};
  for (const s of shots) {
    const bn = rig ? beatName(rows, s.pt, contactT) : 'frame';
    const file = `${OUT}/${prefix}-${outcome}-${timing}-f${String(s.i).padStart(2, '0')}-${bn}.png`;
    renameSync(s.file, file); named.push(file);
    if (!(bn in beats)) beats[bn] = file;
  }
  const promoted: string[] = [];
  if (outcome === 'MAKE' && timing === 'ontime') {
    for (const [bn, out] of [['contact', 'soft-r2-ontime-iron'], ['through_rim', 'soft-r2-ontime-through-rim'], ['through_net', 'soft-r2-ontime-through-net'], ['hang', 'soft-r2-ontime-flush-or-hang'], ['land', 'soft-r2-ontime-land']] as const) {
      if (beats[bn]) { copyFileSync(beats[bn], `${OUT}/${out}.png`); promoted.push(`${out} <- ${beats[bn].split('/').pop()}`); }
    }
  } else {
    writeFileSync(`${OUT}/soft-r2-ontime-${outcome === 'MAKE' ? timing.toUpperCase() : 'MISSED'}.txt`, `${prefix}: ${outcome} · press ${timing}${pressLine ? ' · ' + pressLine : ''}${refused ? ' · ' + refused : ''}\nNo soft-r2-ontime-* frames were promoted: a through-rim name is earned by a MAKE the game graded ON TIME.\n`);
  }
  const verdict = {
    pass: n, route: ROUTE, press: PRESS, outcome, timing, cueSeen, pressedOn, pressedAtPage, pressClip: pressRow?.clip ?? null, pressPhase: pressRow?.phase ?? null,
    runReleasedAtPage: runRelease, pressLine, refused, contactAtClip: contactRow?.clip ?? null, marks: marks.map((m) => m.msg), hud: hud.slice(0, 600), frames: named.map((f) => f.split('/').pop()), promoted,
    rows: rig ? rows.filter((r) => r.phase === 'cinematic' || r.phase === 'resolve').map((r) => ({ t: +r.t.toFixed(0), phase: r.phase, clip: +r.clip.toFixed(3), beat: r.beat, contact: r.contact, by: +r.by.toFixed(2), held: r.held })) : [],
  };
  writeFileSync(`${OUT}/verdict-${prefix}.json`, JSON.stringify(verdict, null, 1));
  log(`${prefix}: ${outcome} · press ${timing}${pressRow ? ` @clip ${pressRow.clip.toFixed(2)} (${pressRow.phase}, beat '${pressedOn}')` : ''}${pressLine ? ` · ${pressLine}` : ''}${refused ? ` · ${refused}` : ''} · frames ${named.length} · promoted ${promoted.length ? promoted.join(', ') : 'none'}`);
  return verdict;
}

(async () => {
  log(`R2 ONTIME probe · ${TAG} · route ${ROUTE} · port ${PORT} · press ${PRESS} · ${new Date().toISOString()}`);
  const s = await boot();
  const verdicts: Record<string, unknown>[] = [];
  for (let n = 0; n < PASSES; n++) { try { verdicts.push(await attempt(s.p, s.rig, n)); } catch (e) { log(`p${n} threw: ${String(e).slice(0, 300)}`); } }
  await s.close();
  const lines = [`# R2 ONTIME — ${TAG}`, '', `route ${ROUTE} · port ${PORT} · press ${PRESS} · rig readout ${s.rig}`, '', ...verdicts.map((v) => `- p${v.pass}: **${v.outcome}** · press ${v.timing}${v.pressClip != null ? ` @clip ${Number(v.pressClip).toFixed(2)}` : ''} · ${(v.pressLine as string) || (v.refused as string) || 'no press line'} · promoted: ${(v.promoted as string[]).length ? (v.promoted as string[]).join(', ') : 'none'}`)];
  writeFileSync(`${OUT}/README-${TAG}.md`, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
})();
