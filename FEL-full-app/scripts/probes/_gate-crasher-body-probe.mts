// GATE-CRASHER-POLISH-2 body probe (2026-09-28) — GC-12 (the body's grab must PLAY) and GC-13 (a body sees no pad glyph and
// no pad hint), on the SHIPPING board host (/dev/body/snowboard_slalom?agent=1), played by a synthetic body through the same
// seam movement play P8's live probe uses (__FEL_POSE_FEED__ + __FEL_BODY__, the committed rideKit beats): the space check,
// the turn into a regular stance, both hands up (the wake), then three hops with the rear hand at the toe edge (the INDY), a
// toe lean. Per rendered frame: grounded / air time, the trick machine's grab, the clip at weight, and how far the nearer hand
// is from the board (a grab you can SEE has a hand on the deck). Also the HUD's boost line and the ring's meshes.
//
//   PORT=3100 OUT=<dir> npx tsx scripts/probes/_gate-crasher-body-probe.mts
import { chromium } from 'playwright-core';
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
const { stanceBase, inStance, edgeTilt, grabHopBeat, lerpJoints } = unwrap(rkNs);
type Beat = [number, (t: number) => Joints];

const PORT = process.env.PORT ?? '3100';
const OUT = process.env.OUT ?? '/tmp/gc2-body';
fs.mkdirSync(OUT, { recursive: true });
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const R0 = restPose();
const THETA = 45, LEAD = 'L' as const;
const base = stanceBase(), ST = inStance(base, THETA, LEAD);
const turned = (j: Joints) => inStance(j, THETA, LEAD);
const grabHop = grabHopBeat(base, 2.8, 'Right', 'toe', 0.12, turned);
const armsUp: Beat[] = [[0.3, (t) => lerpJoints(ST, armsSwing(ST, 1), ease(t / 0.3))], hold(armsSwing(ST, 1), 1.3), [0.3, (t) => lerpJoints(armsSwing(ST, 1), ST, ease(t / 0.3))]];
const PLAY_CAM = { distance: 3.6, heightM: 1.2 };

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  const logs: string[] = [];
  p.on('console', (m) => { const s = m.text(); if (/SNOW-BODY|SNOW-TRICK|BOARD-LAND|SNOW-OUTFIT|error/i.test(s) && !/401/.test(s)) logs.push(s.slice(0, 200)); });
  p.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:${PORT}/dev/body/snowboard_slalom?agent=1`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => {
    const w = window as any;
    return !!w.__FEL_POSE_FEED__ && !!w.__FEL_BODY__ && !!w.__FEL_SPACE__ && !!w.__FEL_DEV__?.input && document.getElementById('fel-ready')?.dataset.state === 'loaded';
  }, null, { timeout: 300000, polling: 250 });
  await p.evaluate(() => (window as any).__FEL_POSE_FEED__.begin());
  await p.click('[data-fel-body-play]');
  const check = synthesize(spaceSession({ end: 5.5 }), { camera: PLAY_CAM, seed: 17 }).frames as PoseFrame[];
  const beats: Beat[] = [
    hold(R0, 1.0), [0.5, (t) => lerpJoints(R0, ST, ease(t / 0.5))], hold(ST, 2.4), ...armsUp, hold(ST, 2.5),
    grabHop, hold(ST, 2.2), grabHop, hold(ST, 2.2), grabHop, hold(ST, 1.6),
    [0.3, (t) => edgeTilt(ST, 12 * ease(t / 0.3))], hold(edgeTilt(ST, 12), 1.3), [0.3, (t) => edgeTilt(ST, 12 * (1 - ease(t / 0.3)))], hold(ST, 1.0),
  ];
  const play = synthesize(script(beats), { camera: PLAY_CAM, seed: 19 }).frames as PoseFrame[];
  await p.evaluate((fs) => { (window as any).__NEXT = fs; }, play);
  await p.evaluate(async (fs) => { await (window as any).__FEL_POSE_FEED__.play(fs); }, check);
  const ready = await p.waitForFunction(() => (window as any).__FEL_SPACE__.view?.()?.space?.stage === 'ready', null, { timeout: 6000, polling: 50 }).then(() => true, () => false);
  // the per-frame tap (installed now: the rider exists once the game has loaded)
  await p.evaluate(() => {
    const w = window as any, dev = w.__FEL_DEV__, scene = dev.scene;
    w.__B = { rows: [] as unknown[], shot: false };
    scene.onAfterRenderObservable.add(() => {
      const root = dev.hero?.(); const s = dev.snow?.(); const st = scene.metadata?.snow?.state?.();
      if (!root || !s || !st) return;
      let r0 = root; while (r0.parent) r0 = r0.parent;
      const bones = scene.skeletons.flatMap((k: any) => k.bones).filter((b: any) => /(Left|Right)Hand$/.test(b.name.replace(/_c\d+$/, '')) && b.getTransformNode()?.isDescendantOf?.(r0));
      const board = r0.getChildMeshes(false).find((m: any) => m.name === 'board');
      let hand = null as number | null;
      if (board && bones.length) { const bp = board.getAbsolutePosition(); hand = Math.min(...bones.map((b: any) => { const q = b.getTransformNode().getAbsolutePosition(); return Math.hypot(q.x - bp.x, q.y - bp.y, q.z - bp.z); })); }
      const groups = scene.animationGroups.filter((g: any) => g.isPlaying && (g.weight < 0 ? 1 : g.weight) > 0.5).map((g: any) => g.name);
      const ringOn = scene.meshes.some((m: any) => (m.name === 'player_ring' || m.name === 'player_tag') && m.isEnabled() && m.isVisible);
      w.__B.rows.push({ t: performance.now(), g: s.grounded, airT: s.airT, grab: st.grabHeld, clips: groups, hand: hand != null ? +hand.toFixed(3) : null, grabs: st.body.grabs, last: st.body.last, bodyHud: s.bodyHud, ringOn });
    });
  });
  // the stance, the wake, the hops — with a screenshot inside the first grab once it has been held 0.35 s of game air
  const run = p.evaluate(async () => { const w = window as any; const from = performance.now(); await w.__FEL_POSE_FEED__.play(w.__NEXT); await new Promise((r) => setTimeout(r, 600)); return { from, to: performance.now() }; });
  let shot = false;
  for (let i = 0; i < 600 && !shot; i++) {
    const s = await p.evaluate(() => { const w = window as any; const x = w.__FEL_DEV__.snow?.(); const st = w.__FEL_DEV__.scene?.metadata?.snow?.state?.(); return x && st ? { air: x.airT, grab: st.grabHeld, g: x.grounded } : null; }).catch(() => null);
    if (s && s.grab && !s.g && s.air > 0.45) { await p.screenshot({ path: `${OUT}/body-grab.png` }); shot = true; }
    await p.waitForTimeout(30);
  }
  const span = await run;
  await p.screenshot({ path: `${OUT}/body-after.png` });
  const boostText = await p.evaluate(() => (document.querySelector('[data-testid="boost-gauge"]') as HTMLElement | null)?.innerText ?? null);
  const rows = await p.evaluate(() => (window as any).__B.rows as any[]);
  await browser.close();

  // ── grading: each body grab, from its call to the landing ──
  const grabs: any[] = [];
  let open: any = null;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (b.grabs > a.grabs) open = { from: b.t, rows: [] as any[] };
    if (open) open.rows.push(b);
    if (open && b.g && !a.g) { grabs.push(open); open = null; }
  }
  const per = grabs.map((gr) => {
    const air = gr.rows.filter((r: any) => !r.g);
    const held = air.filter((r: any) => r.grab).length;
    const clip = air.filter((r: any) => r.clips.includes('board_grab')).length;
    const hands = air.map((r: any) => r.hand).filter((h: any) => h != null).sort((x: number, y: number) => x - y);
    return { airFrames: air.length, grabHeldFrames: held, grabClipFrames: clip, heldShare: air.length ? +(held / air.length).toFixed(2) : 0, clipShare: air.length ? +(clip / air.length).toFixed(2) : 0, handToBoardMin: hands[0] ?? null, handToBoardP50: hands[Math.floor(hands.length / 2)] ?? null, trick: gr.rows[0]?.last };
  });
  const playing = rows.filter((r) => r.t >= span.from);
  const G = {
    ready, grabsCalled: rows.length ? rows[rows.length - 1].grabs : 0, perGrab: per,
    ringFramesOn: playing.filter((r) => r.ringOn).length, frames: playing.length, bodyHudFrames: playing.filter((r) => r.bodyHud).length,
    boostGaugeText: boostText, logs: logs.slice(0, 40),
  };
  fs.writeFileSync(`${OUT}/summary-body.json`, JSON.stringify(G, null, 1));
  console.log(JSON.stringify(G, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
