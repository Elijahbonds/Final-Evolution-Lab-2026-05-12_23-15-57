// SKATE-SCORE live check (2026-09-29) — the eye's SK-1 / SK-2 / SK-3 / SK-5 / SK-6 and GC-13 (eye 9096d7cf, FINDINGS.md), on
// the SHIPPING board host (/dev/body/skateboard?agent=1: BootSplash, the HUD, the boost gauge, the end card), before and after.
//
//   pad    a pad through the bus (__FEL_DEV__.input.emit — a pad's FelInput): a standstill pop; then off a rolling pop the
//          BS 180 (right + B, the stick held), the INDY (up + B), the X grab, the charged JAPAN AIR (RT + up + Y), a flip flicked
//          late on the right stick (a genuine bail), repeated to the buzzer. Read: every [SKATE-LAND] grade, "big air" calls,
//          the standstill hop's height and hang, the end card's TRICKS, __DEV_END's stats, the rAF fps.
//   body   a synthetic body (__FEL_POSE_FEED__ + __FEL_BODY__, the committed rideKit beats, as the eye and _ride-body-live):
//          stance, arms up, kick-pushes, a hop with the rear hand at the toe edge (INDY), a backside quarter in a hop (BS 180).
//          Read: [SKATE-BODY] / [SKATE-LAND], the boost gauge's line, the ring puck ('player_tag') on or off, QA's HUD hint.
//   kart   /dev/mode/velocitykart?agent=1 with the Body on (the kart has no /dev/body host): QA's HUD hint / boostHint and the
//          ring puck, after a synthetic wheel grip.
//
//   BASE=http://127.0.0.1:3161 OUT=<dir> LABEL=before|after WHAT=pad,body,kart npx tsx scripts/probes/_skate-score-probe.mts
//   (ORDER=indy,xgrab limits the pad's lines — qa-fixes A1-06's grab-only repro)
//   (STANDSTILL_ONLY=1 measures the standing pop and stops — SK-5)
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
import * as synNs from '../../lib/pose/synth.ts';
import * as kitNs from '../../lib/pose/streamKit.ts';
import * as rkNs from '../../lib/pose/rideKit.ts';
import type { PoseFrame } from '../../lib/pose/landmarks.ts';
import type { Joints } from '../../lib/pose/synth.ts';

const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { restPose, synthesize } = unwrap(synNs);
const { script, hold, armsSwing, spaceSession } = unwrap(kitNs);
const rk = unwrap(rkNs) as any;
type Beat = [number, (t: number) => Joints];

const BASE = (process.env.BASE ?? 'http://127.0.0.1:3161').replace(/\/$/, '');
const OUT = process.env.OUT ?? '/tmp/skate-score';
const LABEL = process.env.LABEL ?? 'after';
const WHAT = (process.env.WHAT ?? 'pad,body,kart').split(',');
fs.mkdirSync(OUT, { recursive: true });
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const PLAY_CAM = { distance: 3.6, heightM: 1.2 };
const LOG_RE = /\[SKATE-(LAND|BODY|SLOWMO|END|JUICE)\]|\[dev\] end|\[RACE\]|pageerror|error/i;

async function open(path: string): Promise<{ p: Page; logs: string[]; close: () => Promise<void> }> {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  const logs: string[] = [];
  const t0 = Date.now();
  p.on('console', (m) => { const s = m.text(); if (LOG_RE.test(s) && !/401|favicon|Failed to load resource/.test(s)) logs.push(`[${((Date.now() - t0) / 1000).toFixed(1)}] ${s.slice(0, 220)}`); });
  p.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 200)));
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  return { p, logs, close: () => browser.close() };
}
const emit = (p: Page, e: Record<string, unknown>) => p.evaluate((ev) => (window as any).__FEL_DEV__.input.emit(ev), e);
const press = async (p: Page, btn: string, ms = 90) => { await emit(p, { t: 'button', btn, pressed: true }); await p.waitForTimeout(ms); await emit(p, { t: 'button', btn, pressed: false }); };
const stick = (p: Page, side: 'L' | 'R', x: number, y: number) => emit(p, { t: 'stick', side, x, y });
const skate = (p: Page) => p.evaluate(() => (window as any).__FEL_DEV__?.skate?.() ?? null);

/** rAF deltas and the skate seam per frame (installed once the rider exists). */
async function tap(p: Page): Promise<void> {
  await p.evaluate(() => {
    const w = window as any;
    w.__S = { dts: [] as number[], rows: [] as any[] };
    let last = performance.now();
    const f = (t: number) => { w.__S.dts.push(t - last); last = t; const s = w.__FEL_DEV__?.skate?.(); if (s) w.__S.rows.push({ t, g: s.grounded, h: s.height, sp: s.speed, chain: s.chainNow, pot: s.pot, banked: s.banked }); requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
}
function fpsOf(dts: number[]): { median: number; p5: number; frames: number } {
  const fps = dts.slice(30).filter((d) => d > 0).map((d) => 1000 / d).sort((a, b) => a - b);
  return { median: +(fps[Math.floor(fps.length / 2)] ?? 0).toFixed(1), p5: +(fps[Math.floor(fps.length * 0.05)] ?? 0).toFixed(1), frames: fps.length };
}
async function waitGround(p: Page, ms = 3000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) { const s = await skate(p); if (s?.grounded && !s.bailing) return; await p.waitForTimeout(40); }
}
async function airOf(p: Page, fn: () => Promise<void>): Promise<{ maxH: number; airMs: number }> {
  const a = await p.evaluate(() => (window as any).__S.rows.length);
  await fn();
  await waitGround(p, 4000);
  const rows: any[] = await p.evaluate((i) => (window as any).__S.rows.slice(i), a);
  const air = rows.filter((r) => !r.g);
  return { maxH: +Math.max(0, ...air.map((r) => r.h)).toFixed(2), airMs: air.length ? Math.round(air[air.length - 1].t - air[0].t) : 0 };
}
async function rollTo(p: Page, speed: number, maxMs = 3500): Promise<number> {
  await stick(p, 'L', 0, -1);
  const until = Date.now() + maxMs;
  let s = await skate(p);
  while (Date.now() < until && (s?.speed ?? 0) < speed) { await p.waitForTimeout(60); s = await skate(p); }
  await stick(p, 'L', 0, 0);
  return +(s?.speed ?? 0).toFixed(2);
}

async function padRun(): Promise<Record<string, unknown>> {
  const { p, logs, close } = await open('/dev/body/skateboard?agent=1');
  await p.waitForFunction(() => { const w = window as any; return !!w.__FEL_DEV__?.input && document.getElementById('fel-ready')?.dataset.state === 'loaded'; }, null, { timeout: 300000, polling: 250 });
  await p.click('button:has-text("TAP TO START")');
  await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.skate?.(), null, { timeout: 60000, polling: 100 });
  await p.waitForTimeout(3500);   // the count and the drop onto the park
  await tap(p);
  await waitGround(p);
  const out: Record<string, unknown> = {};
  // SK-5: a standstill pop (the rider parked: the probe drags the board to a stop first)
  await stick(p, 'L', 0, 1); await p.waitForTimeout(1500); await stick(p, 'L', 0, 0); await p.waitForTimeout(600);
  // the patrol rail sweeps the spawn line: a pop under it is a grind, not a hop — wait for it to be clear (railD > 3 m)
  for (let i = 0; i < 200; i++) { const s = await skate(p); if (s && s.railD > 3) break; await p.waitForTimeout(50); }
  const still = await skate(p);
  out.standstill = { speed: +(still?.speed ?? 0).toFixed(2), railD: +(still?.railD ?? 0).toFixed(2), ...(await airOf(p, () => press(p, 'A'))) };
  await p.screenshot({ path: `${OUT}/${LABEL}-pad-standstill-after.png` });
  if (process.env.STANDSTILL_ONLY === '1') { const dts: number[] = await p.evaluate(() => (window as any).__S.dts); await close(); return { ...out, fps: fpsOf(dts), logs }; }
  const moves: { name: string; air: { maxH: number; airMs: number }; speed: number }[] = [];
  const shotAt = new Set<string>();
  const move = async (name: string, fn: () => Promise<void>, speed = 5.5) => {
    await waitGround(p);
    const sp = await rollTo(p, speed);
    const air = await airOf(p, fn);
    moves.push({ name, air, speed: sp });
    await p.waitForTimeout(700);   // the bank's settle
  };
  const shot = async (name: string) => { if (!shotAt.has(name)) { shotAt.add(name); await p.screenshot({ path: `${OUT}/${LABEL}-pad-${name}.png` }); } };
  // SK-2: right + B (the BS 180), the stick held right to the ground — the eye's 9 of 9 bails
  const bs180 = async () => { await press(p, 'A'); await p.waitForTimeout(80); await stick(p, 'L', 1, 0); await p.waitForTimeout(40); await press(p, 'B'); await p.waitForTimeout(350); await shot('bs180-air'); await waitGround(p, 3000); await stick(p, 'L', 0, 0); };
  // SK-1: up + B (the INDY), held to the ground
  const indy = async () => { await press(p, 'A'); await p.waitForTimeout(80); await stick(p, 'L', 0, -1); await p.waitForTimeout(40); await press(p, 'B'); await stick(p, 'L', 0, 0); await p.waitForTimeout(300); await shot('indy-air'); };
  // SK-1: the X grab, held 0.45 s and let go in the air
  const xgrab = async () => { await press(p, 'A'); await p.waitForTimeout(100); await emit(p, { t: 'button', btn: 'X', pressed: true }); await p.waitForTimeout(450); await shot('xgrab-air'); await emit(p, { t: 'button', btn: 'X', pressed: false }); };
  // SK-2: a charged pop (RT held) and up + Y — the JAPAN AIR, which a fixed 0.95 s budget never allowed
  const japan = async () => { await emit(p, { t: 'trigger', side: 'R', value: 1 }); await p.waitForTimeout(500); await press(p, 'A'); await emit(p, { t: 'trigger', side: 'R', value: 0 }); await p.waitForTimeout(80); await stick(p, 'L', 0, -1); await p.waitForTimeout(40); await press(p, 'Y'); await stick(p, 'L', 0, 0); await p.waitForTimeout(400); await shot('japan-air'); };
  // SK-3: a flip flicked on the right stick with the ground coming up — unfinished, a genuine bail
  const lateFlip = async () => {
    await press(p, 'A');
    for (let i = 0; i < 80; i++) { const s = await skate(p); if (s && !s.grounded && s.height < 0.3 && s.airtime > 0.35) break; await p.waitForTimeout(12); }
    for (const [x, y] of [[0, -1], [0.72, -0.72], [1, 0], [0, 0]]) { await stick(p, 'R', x, y); await p.waitForTimeout(18); }
  };
  // SK-2 follow-up: a CHARGED pop (RT held) and right + B, the stick held right to the ground — the caught spin must hold the yaw
  const bs180c = async () => { await emit(p, { t: 'trigger', side: 'R', value: 1 }); await p.waitForTimeout(500); await press(p, 'A'); await emit(p, { t: 'trigger', side: 'R', value: 0 }); await p.waitForTimeout(80); await stick(p, 'L', 1, 0); await p.waitForTimeout(40); await press(p, 'B'); await p.waitForTimeout(400); await shot('bs180c-air'); await waitGround(p, 3500); await stick(p, 'L', 0, 0); };
  const all: [string, () => Promise<void>][] = [['bs180', bs180], ['indy', indy], ['xgrab', xgrab], ['japan', japan], ['lateFlip', lateFlip], ['bs180c', bs180c]];
  // ORDER=indy,xgrab — qa-fixes A1-06's repro (a push / pop / grab driver whose card said 0 TRICKS): grabs only
  const pick = (process.env.ORDER ?? '').split(',').filter(Boolean);
  const order = pick.length ? all.filter(([n]) => pick.includes(n)) : all.filter(([n]) => n !== 'bs180c');   // bs180c only when asked (ORDER=bs180c)
  // the buzzer: 90 s from TAP TO START; the lines repeat until the clock is nearly out, then the rider rolls to the end
  const t0 = Date.now();
  for (let i = 0; Date.now() - t0 < 70000; i++) { const [n, fn] = order[i % order.length]; await move(n, fn); }
  await p.waitForFunction(() => !!(window as any).__DEV_END, null, { timeout: 60000, polling: 250 }).catch(() => null);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${LABEL}-pad-endcard.png` });
  const end = await p.evaluate(() => (window as any).__DEV_END ?? null);
  const card = await p.evaluate(() => document.body.innerText.match(/(RUN OVER|LEGENDARY RUN)[^\n]*/)?.[0] ?? null);
  const dts: number[] = await p.evaluate(() => (window as any).__S.dts);
  await close();
  const lands = logs.filter((l) => /\[SKATE-LAND\] touchdown/.test(l)).map((l) => l.replace(/^\[[\d.]+\] /, ''));
  const g = (re: RegExp) => lands.filter((l) => re.test(l));
  const cleanN = g(/touchdown clean/).reduce((s, l) => s + Number(l.match(/\((\d+) tricks\)/)?.[1] ?? 0), 0);
  return {
    ...out, moves, fps: fpsOf(dts), card: card ?? end?.headline ?? null, stats: end?.stats ?? null, saved: logs.filter((l) => /save held/.test(l)).length,
    landings: { clean: g(/clean/).length, sketchy: g(/sketchy/).length, bail: g(/bail/).length, cleanWithTricks: g(/clean \([1-9]/).length, bailWithTricks: g(/bail \([1-9]/).length, tricksInCleanLandings: cleanN },
    bigAir: logs.filter((l) => /big air/.test(l)).length, logs: logs.slice(0, 160),
  };
}

async function bodyRun(): Promise<Record<string, unknown>> {
  const { p, logs, close } = await open('/dev/body/skateboard?agent=1');
  await p.waitForFunction(() => { const w = window as any; return !!w.__FEL_POSE_FEED__ && !!w.__FEL_BODY__ && !!w.__FEL_SPACE__ && !!w.__FEL_DEV__?.input && document.getElementById('fel-ready')?.dataset.state === 'loaded'; }, null, { timeout: 300000, polling: 250 });
  await p.evaluate(() => (window as any).__FEL_POSE_FEED__.begin());
  await p.click('[data-fel-body-play]');
  const R0 = restPose(), THETA = 45, LEAD = 'L' as const;
  const base = rk.stanceBase(), ST = rk.inStance(base, THETA, LEAD);
  const turned = (j: Joints) => rk.inStance(j, THETA, LEAD);
  const grabHop: Beat = rk.grabHopBeat(base, 2.8, 'Right', 'toe', 0.12, turned);
  const bsHop: Beat = rk.turnHopBeat(base, 2.8, -90, turned);
  const push: Beat = (() => { const P = rk.kickPushBeat(base, LEAD); return [P[0], (t: number) => turned(P[1](t))] as Beat; })();
  const armsUp: Beat[] = [[0.3, (t) => rk.lerpJoints(ST, armsSwing(ST, 1), ease(t / 0.3))], hold(armsSwing(ST, 1), 1.3), [0.3, (t) => rk.lerpJoints(armsSwing(ST, 1), ST, ease(t / 0.3))]];
  const check = synthesize(spaceSession({ end: 5.5 }), { camera: PLAY_CAM, seed: 17 }).frames as PoseFrame[];
  const beats: Beat[] = [
    hold(R0, 1.0), [0.5, (t) => rk.lerpJoints(R0, ST, ease(t / 0.5))], hold(ST, 2.4), ...armsUp, hold(ST, 2.5),
    push, hold(ST, 1.0), push, hold(ST, 1.0), push, hold(ST, 1.4),
    grabHop, hold(ST, 2.4), bsHop, hold(ST, 2.4), push, hold(ST, 1.0), grabHop, hold(ST, 2.4), bsHop, hold(ST, 2.6),
  ];
  const play = synthesize(script(beats), { camera: PLAY_CAM, seed: 19 }).frames as PoseFrame[];
  await p.evaluate((f) => { (window as any).__NEXT = f; }, play);
  await p.evaluate(async (f) => { await (window as any).__FEL_POSE_FEED__.play(f); }, check);
  const ready = await p.waitForFunction(() => (window as any).__FEL_SPACE__.view?.()?.space?.stage === 'ready', null, { timeout: 8000, polling: 50 }).then(() => true, () => false);
  await p.evaluate(() => {
    const w = window as any; w.__G = { rows: [] as any[] };
    w.__FEL_DEV__.scene.onAfterRenderObservable.add(() => {
      const tag = w.__FEL_DEV__.scene.meshes.find((m: any) => m.name === 'player_tag');
      const s = w.__FEL_DEV__.skate?.();
      w.__G.rows.push({ tag: tag ? tag.isEnabled() && tag.isVisible : null, body: !!s?.body?.stickFromBody || (s?.body?.grabs ?? 0) + (s?.body?.pushes ?? 0) > 0 });
    });
  });
  let shot = false;
  const run = p.evaluate(async () => { const w = window as any; await w.__FEL_POSE_FEED__.play(w.__NEXT); await new Promise((r) => setTimeout(r, 900)); });
  for (let i = 0; i < 1200 && !shot; i++) {
    const s = await skate(p).catch(() => null);
    if (s && !s.grounded && s.grab && s.airtime > 0.35) { await p.screenshot({ path: `${OUT}/${LABEL}-body-grab.png` }); shot = true; }
    await p.waitForTimeout(25);
  }
  await run;
  await p.screenshot({ path: `${OUT}/${LABEL}-body-after.png` });
  const boostText = await p.evaluate(() => (document.querySelector('[data-testid="boost-gauge"]') as HTMLElement | null)?.innerText ?? null);
  const hud = await p.evaluate(() => { const r = (window as any).__FEL_QA__?.rawHud?.() ?? {}; return { hint: r.hint ?? null, boostHint: r.boostHint ?? null }; });
  const rows: any[] = await p.evaluate(() => (window as any).__G.rows);
  const bodyStats = await p.evaluate(() => (window as any).__FEL_DEV__.skate?.()?.body ?? null);
  await close();
  const lands = logs.filter((l) => /\[SKATE-(LAND|BODY)\]/.test(l));
  return { ready, bodyStats, boostGaugeText: boostText, hud, puckOnFrames: rows.filter((r) => r.tag === true).length, puckOffFrames: rows.filter((r) => r.tag === false).length, frames: rows.length, lands, logs: logs.slice(0, 80) };
}

async function kartRun(): Promise<Record<string, unknown>> {
  const { p, logs, close } = await open('/dev/mode/velocitykart?agent=1');
  await p.waitForFunction(() => { const w = window as any; return !!w.__FEL_POSE_FEED__ && !!w.__FEL_BODY__ && !!w.__FEL_DEV__?.input && !!w.__FEL_QA__ && document.getElementById('fel-ready')?.dataset.state === 'loaded'; }, null, { timeout: 300000, polling: 250 });
  await p.waitForTimeout(2500);
  const hudNow = () => p.evaluate(() => { const r = (window as any).__FEL_QA__?.rawHud?.() ?? {}; return { hint: r.hint ?? null, boostHint: r.boostHint ?? null }; });
  const puckNow = () => p.evaluate(() => { const t = (window as any).__FEL_DEV__.scene?.meshes?.find((m: any) => m.name === 'player_tag'); return t ? t.isEnabled() : null; });
  const padHud = await hudNow(), padPuck = await puckNow();
  await p.screenshot({ path: `${OUT}/${LABEL}-kart-pad.png` });
  // the Body on (P3's self-calibrating reader, as _ride-body-live), the facing stand, both hands up (the wake), then the wheel
  await p.evaluate(async () => { const w = window as any; w.__FEL_POSE_FEED__.begin(); await w.__FEL_BODY__.start({ autoCalibrate: true }); });
  const R0 = restPose(), UP = armsSwing(R0, 1), grip = rk.wheelArms(R0, 0);
  const frames = synthesize(script([
    hold(R0, 2.2), [0.3, (t: number) => rk.lerpJoints(R0, UP, ease(t / 0.3))], hold(UP, 1.3), [0.4, (t: number) => rk.lerpJoints(UP, grip, ease(t / 0.4))], hold(grip, 6),
  ]), { camera: PLAY_CAM, seed: 23 }).frames as PoseFrame[];
  await p.evaluate(async (f) => { await (window as any).__FEL_POSE_FEED__.play(f); }, frames);
  const bodyOn = await p.evaluate(() => !!(window as any).__FEL_DEV__.input?.body?.());
  const bodyHud = await hudNow(), bodyPuck = await puckNow();
  await p.screenshot({ path: `${OUT}/${LABEL}-kart-body.png` });
  await close();
  return { padHud, padPuck, bodyOn, bodyHud, bodyPuck, logs: logs.slice(0, 30) };
}

const report: Record<string, unknown> = { label: LABEL, base: BASE, at: new Date().toISOString() };
if (WHAT.includes('pad')) report.pad = await padRun().catch((e) => ({ error: String(e).slice(0, 400) }));
if (WHAT.includes('body')) report.body = await bodyRun().catch((e) => ({ error: String(e).slice(0, 400) }));
if (WHAT.includes('kart')) report.kart = await kartRun().catch((e) => ({ error: String(e).slice(0, 400) }));
fs.writeFileSync(`${OUT}/${LABEL}-summary.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, (k, v) => (k === 'logs' ? (v as string[]).length : v), 1));
