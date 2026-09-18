// ANIM-RESIDUAL (2026-09-14) — the skate residual probe. Drives the QA eye's own grind-hunt script (stick held forward,
// x wobbling ±0.3 every 400 ms, A tapped whenever a rail is within 3.5 m on the ground) on /dev/mode/skateboard and
// records, per rendered frame, what the two HARDs are made of:
//   DETACH  both feet in the DECK's own frame (across / up / along, metres): a foot more than 0.14 m under or over the
//           deck top, or outside its 0.26 × 0.84 m box, is not on the board
//   MELT    hips height over the deck and the knee spread (a straddle reads as a body sunk round the board)
//   MANUAL  every [SKATE-MANUAL] line with the stick history that raised it, and whether the rider was grounded
// Usage: npx tsx scripts/probes/_anim-residual-skate.mts <port> <outdir> [huntSec] [driver: hunt|brake|pops]  (pops = the hunt plus a forward ollie every 2 s)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.argv[2] ?? '3061';
const OUT = process.argv[3] ?? '/tmp/anim-residual-skate';
const HUNT_SEC = Number(process.argv[4] ?? 40);
const DRIVER = process.argv[5] ?? 'hunt';
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await p.addInitScript(() => {
    const pad: any = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__PAD = pad; (navigator as any).getGamepads = () => [pad];
  });
  const logs: { t: number; s: string }[] = [];
  const t00 = Date.now();
  p.on('console', (m) => { const s = m.text(); if (/SKATE-(MANUAL|LAND|GRIND|NAN)|REFUSED|PAGEERROR/.test(s)) logs.push({ t: (Date.now() - t00) / 1000, s: s.slice(0, 300) }); });
  p.on('pageerror', (e) => logs.push({ t: (Date.now() - t00) / 1000, s: 'PAGEERROR ' + String(e).slice(0, 200) }));
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/skateboard`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForSelector('canvas', { timeout: 300000 });
  const pad = (lx: number, ly: number, a?: boolean) => p.evaluate(([x, y, aa]) => { const g = (window as any).__PAD; g.axes[0] = x; g.axes[1] = y; if (aa !== null) g.buttons[0] = { pressed: !!aa, touched: !!aa, value: aa ? 1 : 0 }; g.timestamp = Date.now(); }, [lx, ly, a ?? null] as [number, number, boolean | null]);
  for (let i = 0; i < 200; i++) {
    const ok = await p.evaluate(() => !!(window as any).__FEL_DEV__?.skate && /playing/i.test(document.body.innerText)).catch(() => false);
    if (ok) break;
    await p.keyboard.press('Space').catch(() => {});
    await pad(0, 0, true); await p.waitForTimeout(100); await pad(0, 0, false);
    await p.waitForTimeout(700);
  }
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    const w = window as any, dev = w.__FEL_DEV__, scene = dev.scene, root = dev.hero();
    const under = new Set<any>(root.getDescendants(false));
    const sks = scene.skeletons.filter((s: any) => s.bones.some((b: any) => under.has(b.getTransformNode())));
    const node = (n: string) => { for (const sk of sks) { const b = sk.bones.find((bb: any) => bb.name.replace(/_c\d+$/, '') === n); if (b?.getTransformNode()) return b.getTransformNode(); } return null; };
    const B: Record<string, any> = {};
    for (const n of ['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']) B[n] = node(n);
    const board = scene.meshes.find((m: any) => m.name === 'board' && m.parent === root);
    const groups = scene.animationGroups.filter((g: any) => g.targetedAnimations.some((t: any) => under.has(t.target) || under.has(t.target?.getTransformNode?.())));
    w.__SR = { rows: [], missing: Object.entries(B).filter(([, v]) => !v).map(([k]) => k), board: !!board, t0: performance.now() };
    const { Matrix, Vector3 } = (window as any).BABYLON ?? {};
    scene.onAfterRenderObservable.add(() => {
      const s = dev.skate();
      const r: any = { t: +((performance.now() - w.__SR.t0) / 1000).toFixed(3), g: s.grounded, man: s.manual, air: +s.airtime.toFixed(2), h: +s.height.toFixed(2), pitch: +s.boardPitch.toFixed(2), grind: s.grinding, grab: s.grab ?? null, deckY: s.deck ? +s.deck.y.toFixed(2) : null };
      if (w.__SR.rows.length % 4 === 0) { const m = document.body.innerText.match(/"banner":\s*"([^"]*)"/); r.banner = m ? m[1] : null; }
      if (board && B.LeftFoot && B.RightFoot) {
        const bm = board.computeWorldMatrix(true);
        const inv = bm.clone().invert();
        const loc = (n: any) => { const q = n.getAbsolutePosition(); const m = inv.m; return [q.x * m[0] + q.y * m[4] + q.z * m[8] + m[12], q.x * m[1] + q.y * m[5] + q.z * m[9] + m[13], q.x * m[2] + q.y * m[6] + q.z * m[10] + m[14]]; };
        // the ANKLE is the foot bone's origin; the sole sits ~7 cm under it. Deck top is local +0.03.
        const fL = loc(B.LeftFoot), fR = loc(B.RightFoot), hip = loc(B.Hips), kL = B.LeftLeg.getAbsolutePosition(), kR = B.RightLeg.getAbsolutePosition();
        r.fL = fL.map((v: number) => +v.toFixed(2)); r.fR = fR.map((v: number) => +v.toFixed(2));
        r.hip = +hip[1].toFixed(2);
        r.knees = +Math.hypot(kL.x - kR.x, kL.y - kR.y, kL.z - kR.z).toFixed(2);
        r.feet = +Math.hypot(fL[0] - fR[0], fL[1] - fR[1], fL[2] - fR[2]).toFixed(2);
      }
      r.clips = groups.filter((g: any) => g.isPlaying && (g.weight < 0 ? 1 : g.weight) > 0.05).map((g: any) => `${g.name}@${(g.weight < 0 ? 1 : g.weight).toFixed(2)}`);
      w.__SR.rows.push(r);
    });
    void Matrix; void Vector3;
  });
  const meta = await p.evaluate(() => ({ missing: (window as any).__SR.missing, board: (window as any).__SR.board }));
  console.log('meta', JSON.stringify(meta));
  const stickLog: { t: number; x: number; y: number; a?: boolean }[] = [];
  const st = async (x: number, y: number, a?: boolean) => { stickLog.push({ t: (Date.now() - t00) / 1000, x, y, a }); await pad(x, y, a); };
  await st(0, -1); await p.waitForTimeout(3000);
  await st(0, -1, true); await p.waitForTimeout(100); await st(0, -1, false);
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${OUT}/ollie.png` });
  const t0 = Date.now(); let shotN = 0, manShots = 0, airShots = 0;
  while (Date.now() - t0 < HUNT_SEC * 1000) {
    const i = Math.floor((Date.now() - t0) / 400);
    if (DRIVER === 'brake') { const ph = i % 10; await st(i % 2 ? 0.3 : -0.3, ph < 7 ? -1 : 1); }   // push 2.8 s, brake 1.2 s: a player's line
    else await st(i % 2 === 0 ? 0.3 : -0.3, -1);
    const s = await p.evaluate(() => { const k = (window as any).__FEL_DEV__?.skate?.(); return k ? { railD: k.railD, grounded: k.grounded, manual: k.manual, height: k.height, grinding: k.grinding } : null; }).catch(() => null);
    const popNow = DRIVER === "pops" && i % 5 === 0 && s?.grounded;
    if (s && (s.railD < 3.5 || popNow) && s.grounded) { await st(0.3, -1, true); await p.waitForTimeout(80); await st(0.3, -1, false); }
    if (s?.manual && manShots < 3) { await p.screenshot({ path: `${OUT}/manual-${manShots++}.png` }); }
    if (s && !s.grounded && s.height > 0.25 && airShots < 4) { await p.screenshot({ path: `${OUT}/air-${airShots++}.png` }); }
    if (i === 30 && shotN === 0) { shotN++; await p.screenshot({ path: `${OUT}/drive.png` }); }
    await p.waitForTimeout(280);
  }
  const rows: any[] = await p.evaluate(() => (window as any).__SR.rows);
  fs.writeFileSync(`${OUT}/rows.json`, JSON.stringify(rows));
  fs.writeFileSync(`${OUT}/logs.json`, JSON.stringify({ logs, stickLog }, null, 1));
  // ── grade ──
  const DECK = 0.03, SOLE = 0.07;
  const off = (f: number[]) => Math.abs(f[1] - SOLE - DECK) > 0.14 || Math.abs(f[0]) > 0.30 || Math.abs(f[2]) > 0.55;
  const withFeet = rows.filter((r) => r.fL);
  const air = withFeet.filter((r) => !r.g && r.h > 0.1 && !r.grind);
  const ground = withFeet.filter((r) => r.g && !r.grind);
  const det = (set: any[]) => ({ n: set.length, detached: set.filter((r) => off(r.fL) || off(r.fR)).length,
    ankleUnderDeck: set.filter((r) => r.fL[1] < DECK || r.fR[1] < DECK).length,
    hipMin: set.length ? Math.min(...set.map((r) => r.hip)) : null, kneesMax: set.length ? Math.max(...set.map((r) => r.knees)) : null,
    feetMax: set.length ? Math.max(...set.map((r) => r.feet)) : null,
    worst: set.slice().sort((a, b) => Math.min(a.fL[1], a.fR[1]) - Math.min(b.fL[1], b.fR[1]))[0] ?? null });
  const manualLogs = logs.filter((l) => /SKATE-MANUAL/.test(l.s));
  const summary = { meta, frames: rows.length, air: det(air), ground: det(ground), manualLogs, manualFrames: rows.filter((r) => r.man).length, manualAirFrames: rows.filter((r) => r.man && !r.g).length, lands: logs.filter((l) => /SKATE-LAND/.test(l.s)).length, grinds: logs.filter((l) => /GRIND\] locked/.test(l.s)).length, airBanners: [...new Set(rows.filter((r) => !r.g && r.banner).map((r) => r.banner))], falseAirBanners: rows.filter((r) => !r.g && r.banner && /MANUAL|SLIDE/.test(r.banner)).length, airGrabFrames: rows.filter((r) => !r.g && r.grab).length, allBanners: [...new Set(rows.filter((r) => r.banner).map((r) => r.banner))], errors: logs.filter((l) => /PAGEERROR|NAN/.test(l.s)) };
  fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
