// SHARED-ANIM-BUS (2026-09-14) — the body probe. Per mode on /dev/mode: the clips that actually play on the HERO's rig,
// both elbows, both hands in the chest frame (fwd / up / side, metres off the shoulder), the registered-clip log line,
// every REFUSED / MISSING line, and the hero's materials. The questions it answers:
//   H1   does skate register or play any clip outside the board suite (dunk_*, football_* …)?
//   ARMS are the hands locked BEHIND the chest (derby) or held out in a T (skate / football)?
//   MELT which materials does the football runner render mid-play, and do they change as the arms move?
//
// Usage: npx tsx scripts/probes/_anim-bus-body.mts <port> <outdir> [mode,mode,...]

import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.argv[2] ?? '3061';
const OUT = process.argv[3] ?? '/tmp/anim-bus-body';
const MODES = (process.argv[4] ?? 'skateboard,derby,football').split(',');
fs.mkdirSync(OUT, { recursive: true });

/** The pad script per mode: [atSec, axisY, buttonA]. */
const SCRIPT: Record<string, [number, number, boolean][]> = {
  skateboard: [[0, -1, false], [10, 0, false]],
  // the family smoke (REFUSED lines + readout): stick forward with A tapped
  generic: Array.from({ length: 24 }, (_, i) => [i * 0.4, -1, i % 3 === 0] as [number, number, boolean]),
  football: [[0, -1, false], [12, 0, false]],
  // derby: swing on every pitch — A held briefly every 0.7 s (the swing only counts while a pitch is incoming)
  derby: Array.from({ length: 40 }, (_, i) => [i * 0.35, 0, i % 2 === 0] as [number, number, boolean]),
};

async function run(p: Page, mode: string): Promise<Record<string, unknown>> {
  const logs: string[] = [];
  const onMsg = (t: string) => { if (/FEL-ANIM|ERROR|Error|REFUSED|MISSING/i.test(t)) logs.push(t.slice(0, 900)); };
  p.removeAllListeners('console');
  p.on('console', (m) => onMsg(m.text()));
  p.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.waitForSelector('canvas', { timeout: 240000 });
  for (let i = 0; i < 150; i++) {
    const ok = await p.evaluate(() => !!(window as any).__FEL_DEV__?.hero?.());
    const txt = await p.evaluate(() => document.body.innerText);
    if (ok && /playing/i.test(txt)) break;
    if (/ready|tap|start/i.test(txt)) { await p.keyboard.press('Space'); await p.evaluate(() => { const pad = (window as any).__PAD; pad.buttons[0] = { pressed: true, touched: true, value: 1 }; pad.timestamp = Date.now(); }); await p.waitForTimeout(120); await p.evaluate(() => { const pad = (window as any).__PAD; pad.buttons[0] = { pressed: false, touched: false, value: 0 }; pad.timestamp = Date.now(); }); }
    await p.waitForTimeout(800);
  }
  await p.waitForTimeout(1000);
  await p.evaluate(() => {
    const w = window as any, dev = w.__FEL_DEV__;
    if (!dev?.scene) { w.__AB = { err: 'no scene' }; return; }
    const scene = dev.scene;
    const root = dev.hero();
    const under = new Set<any>(root.getDescendants(false));
    const sk = scene.skeletons.find((s: any) => s.bones.some((b: any) => under.has(b.getTransformNode())));
    const node = (n: string) => sk?.bones.find((b: any) => b.name === n || b.name.replace(/_c\d+$/, '') === n)?.getTransformNode();
    const B: Record<string, any> = {};
    for (const n of ['Hips', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand']) B[n] = node(n);
    const meshes = root.getChildMeshes(false);
    const groupsOf = new Set<any>();
    for (const g of scene.animationGroups) if (g.targetedAnimations.some((t: any) => under.has(t.target) || (t.target?.getTransformNode && under.has(t.target.getTransformNode())))) groupsOf.add(g);
    w.__AB = { rows: [], mats: [...new Set(meshes.map((m: any) => m.isVisible && m.isEnabled() ? `${m.name}:${m.material?.name}:${m.material?.getClassName?.()}:a${m.material?.alpha ?? 1}:vis${m.visibility}` : null).filter(Boolean))] };
    const P = (n: any) => n.getAbsolutePosition();
    scene.onAfterRenderObservable.add(() => {
      const r: any = { t: +(performance.now() / 1000).toFixed(2) };
      if (B.Hips && B.Neck && B.LeftArm && B.RightArm) {
        const hips = P(B.Hips), neck = P(B.Neck), ls = P(B.LeftArm), rs = P(B.RightArm);
        const up = neck.subtract(hips).normalize();
        const side = rs.subtract(ls).normalize();
        // root forward from the world matrix (row 2) — the mirrored __root__ flips the chest cross, the matrix does not
        const m = root.computeWorldMatrix(true).m; let fwd = { x: m[8], y: m[9], z: m[10] } as any;
        const fl = Math.hypot(fwd.x, fwd.y, fwd.z) || 1; fwd = { x: fwd.x / fl, y: fwd.y / fl, z: fwd.z / fl };
        // the CHEST frame (LocoBus.handsInChest, inlined: a page cannot import it): normal = across × up, signed by the root forward
        let cf = { x: side.y * up.z - side.z * up.y, y: side.z * up.x - side.x * up.z, z: side.x * up.y - side.y * up.x };
        const cl = Math.hypot(cf.x, cf.y, cf.z) || 1; cf = { x: cf.x / cl, y: cf.y / cl, z: cf.z / cl };
        if (cf.x * fwd.x + cf.y * fwd.y + cf.z * fwd.z < 0) cf = { x: -cf.x, y: -cf.y, z: -cf.z };
        // [fwd, up, out]: out is away from the midline (left hand → left)
        const rel = (h: any, s: any, outSign: number) => { const d = P(h).subtract(s); return [+(d.x * cf.x + d.y * cf.y + d.z * cf.z).toFixed(2), +(d.x * up.x + d.y * up.y + d.z * up.z).toFixed(2), +((d.x * side.x + d.y * side.y + d.z * side.z) * outSign).toFixed(2)]; };
        r.hL = rel(B.LeftHand, ls, -1); r.hR = rel(B.RightHand, rs, 1);
        const ang = (a: any, b: any, c: any) => { const u = P(a).subtract(P(b)), v = P(c).subtract(P(b)); return Math.round(Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / (u.length() * v.length())))) * 180 / Math.PI); };
        r.eL = ang(B.LeftArm, B.LeftForeArm, B.LeftHand); r.eR = ang(B.RightArm, B.RightForeArm, B.RightHand);
        // the chest-forward sign check: the head sits in front of the neck on every authored pose
        r.chestFwd = +((P(B.Head ?? B.Neck).x - neck.x) * fwd.x + (P(B.Head ?? B.Neck).z - neck.z) * fwd.z).toFixed(3);
      }
      const wt = (g: any) => (g.weight === undefined || g.weight < 0 ? 1 : g.weight);
      r.clips = [...groupsOf].filter((g: any) => g.isPlaying && wt(g) > 0.05).map((g: any) => `${g.name}@${wt(g).toFixed(2)}`);
      r.hud = w.__SK_HUD ?? '';
      w.__AB.rows.push(r);
      if (w.__AB.rows.length > 30000) w.__AB.rows.shift();
    });
  });
  const steps = process.env.PADSCRIPT === 'idle' ? [[0, 0, false] as [number, number, boolean], [12, 0, false] as [number, number, boolean]] : (SCRIPT[mode] ?? SCRIPT.generic);
  const t0 = Date.now();
  // SHOTS=<sec,sec,...> takes a clipped frame around the canvas centre at those seconds (the melt is read by eye)
  const shots = (process.env.SHOTS ?? '').split(',').filter(Boolean).map(Number);
  const timeline: [number, () => Promise<void>][] = [
    ...steps.map(([at, y, a]) => [at, async () => { await p.evaluate(([yy, aa]) => { const pad = (window as any).__PAD; pad.axes[1] = yy; pad.buttons[0] = { pressed: aa, touched: aa, value: aa ? 1 : 0 }; pad.timestamp = Date.now(); }, [y, a] as [number, boolean]); }] as [number, () => Promise<void>]),
    ...shots.map((s) => [s, async () => { await p.screenshot({ path: `${OUT}/${mode}-t${s}.png`, clip: { x: 340, y: 100, width: 600, height: 600 } }); }] as [number, () => Promise<void>]),
  ].sort((a, b) => a[0] - b[0]);
  for (const [at, fn] of timeline) {
    const wait = at * 1000 - (Date.now() - t0); if (wait > 0) await p.waitForTimeout(wait);
    await fn();
    continue;
  }
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${mode}.png` });
  const ab: any = await p.evaluate(() => (window as any).__AB);
  const rows: any[] = ab?.rows ?? [];
  fs.writeFileSync(`${OUT}/${mode}-rows.json`, JSON.stringify(rows));
  const clips: Record<string, number> = {};
  for (const r of rows) for (const c of r.clips ?? []) { const n = c.split('@')[0]; clips[n] = (clips[n] ?? 0) + 1; }
  const arm = rows.filter((r) => r.hL);
  // LocoBus.ARM_LIMITS, per the window the mode's clip belongs to (loco / stance / ride / carry / celebrate)
  const LIM: Record<string, [number, number, number, number]> = { loco: [0.34, -0.05, 0.3, -0.12], stance: [0.12, 0.25, 0.35, -0.05], ride: [0.3, -0.15, 0.28, -0.2], carry: [0.34, -0.05, 0.3, -0.12], celebrate: [0.2, 0.5, 0.32, -0.12] };
  const windowOf = (c: string): string | null => /baseball_stance|golf_address|keeper_set|tennis_ready/.test(c) ? 'stance' : /board_ride_idle|board_push/.test(c) ? 'ride'
    : /football_carry_run/.test(c) ? 'carry' : /td_spike|celebrate|uppercut/.test(c) ? 'celebrate' : /^(idle_stand|walk|run|strafe_)/.test(c) ? 'loco' : null;
  const judged: Record<string, { n: number; behind: number; high: number; tee: number }> = {};
  for (const r of arm) {
    const top = (r.clips ?? []).slice(-1)[0]?.split('@')[0] ?? ''; const w = windowOf(top); if (!w) continue;
    const [mb, mu, to, tu] = LIM[w]; const j = (judged[`${w}:${top}`] ??= { n: 0, behind: 0, high: 0, tee: 0 }); j.n++;
    if (-r.hL[0] > mb || -r.hR[0] > mb) j.behind++;
    if (r.hL[1] > mu || r.hR[1] > mu) j.high++;
    if (r.hL[2] > to && r.hL[1] > tu && r.hR[2] > to && r.hR[1] > tu) j.tee++;
  }
  const tee = arm.filter((r) => r.eL > 160 && r.eR > 160 && r.hL[1] > -0.2 && r.hR[1] > -0.2).length;
  const behind = arm.filter((r) => r.hL[0] < -0.12 && r.hR[0] < -0.12).length;
  const registered = logs.find((l) => /authored clips registered/.test(l)) ?? '';
  const readout = await p.evaluate(() => { const d = (window as any).__FEL_DEV__; return d?.anim ? d.anim() : null; });
  return {
    mode, frames: rows.length, armFrames: arm.length, tee, behindBoth: behind, judged,
    chestFwdSign: arm.length ? +(arm.reduce((s, r) => s + r.chestFwd, 0) / arm.length).toFixed(3) : null,
    clips: Object.entries(clips).sort((a, b) => b[1] - a[1]),
    registered: registered.slice(0, 400), readout,
    refused: logs.filter((l) => /REFUSED|MISSING/.test(l)).slice(0, 8),
    errors: logs.filter((l) => /PAGEERROR|Error/.test(l) && !/MISSING|REFUSED/.test(l)).slice(0, 5),
    mats: ab?.mats ?? [],
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await p.addInitScript(() => {
    const pad: any = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__PAD = pad; (navigator as any).getGamepads = () => [pad];
  });
  const out: unknown[] = [];
  for (const m of MODES) { const r = await run(p, m); out.push(r); console.log(JSON.stringify(r)); }
  fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
