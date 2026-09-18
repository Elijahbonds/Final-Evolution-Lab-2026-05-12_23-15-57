// ANIM-SURGICAL (2026-09-14) — the four body HARDs, measured live on /dev/mode.
//   skate-arms  the cruise / push from the chase cam: each wrist's WORLD offset outboard of its shoulder across the travel,
//               both elbows, per rendered frame (the T the eye saw is lateral, not chest-forward)
//   skate-grind the eye's own hunt rule from the spawn — stick forward, POP whenever skate().railD < 3.5 and grounded —
//               and, separately, the eye's whole drive order (push 4 s → carve L/R → ollie → hunt) ; lock line + goal
//   derby-bat   both fists' distance to the bat's handle axis, the barrel's up component in the stance, per frame + shots
//   football    frames right after the tackle console line, and every dust puff's emitter height
//
// Usage: npx tsx scripts/probes/_anim-surgical.mts <port> <outdir> [skate-arms,skate-grind,skate-eye,derby,football]

import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.argv[2] ?? '3061';
const OUT = process.argv[3] ?? '/tmp/anim-surgical';
const WHAT = (process.argv[4] ?? 'skate-arms,skate-grind,skate-eye,derby,football').split(',');
fs.mkdirSync(OUT, { recursive: true });

const logs: string[] = [];
const pad = (p: Page, o: { x?: number; y?: number; a?: boolean }) => p.evaluate((o) => {
  const P = (window as any).__PAD; if (o.x !== undefined) P.axes[0] = o.x; if (o.y !== undefined) P.axes[1] = o.y;
  if (o.a !== undefined) P.buttons[0] = { pressed: o.a, touched: o.a, value: o.a ? 1 : 0 }; P.timestamp = Date.now();
}, o);
const tapA = async (p: Page, ms = 90) => { await pad(p, { a: true }); await p.waitForTimeout(ms); await pad(p, { a: false }); };

async function boot(p: Page, mode: string): Promise<void> {
  logs.length = 0;
  p.removeAllListeners('console');
  p.on('console', (m) => logs.push(`${(performance.now() / 1000).toFixed(2)} ${m.text().slice(0, 300)}`));
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.waitForSelector('canvas', { timeout: 240000 });
  for (let i = 0; i < 150; i++) {
    const ok = await p.evaluate(() => !!(window as any).__FEL_DEV__?.hero?.());
    const txt = await p.evaluate(() => document.body.innerText);
    if (ok && /playing/i.test(txt)) break;
    if (/ready|tap|start/i.test(txt)) { await p.keyboard.press('Space'); await tapA(p, 120); }
    await p.waitForTimeout(800);
  }
  await p.waitForTimeout(800);
}

/** Per-frame body rows: world wrist offsets across the hero's travel, elbows, the bat's grip (derby). */
async function record(p: Page): Promise<void> {
  await p.evaluate(() => {
    const w = window as any, dev = w.__FEL_DEV__, scene = dev.scene, root = dev.hero();
    const under = new Set<any>(root.getDescendants(false));
    const sk = scene.skeletons.find((s: any) => s.bones.some((b: any) => under.has(b.getTransformNode())));
    const node = (n: string) => sk?.bones.find((b: any) => b.name === n || b.name.replace(/_c\d+$/, '') === n)?.getTransformNode();
    const B: any = {}; for (const n of ['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand']) B[n] = node(n);
    const P = (n: any) => { n.computeWorldMatrix(true); return n.getAbsolutePosition(); };
    w.__AS = { rows: [] };
    scene.onAfterRenderObservable.add(() => {
      const r: any = { t: +(performance.now() / 1000).toFixed(3) };
      const m = root.computeWorldMatrix(true).m; const fl = Math.hypot(m[8], m[10]) || 1; const fx = m[8] / fl, fz = m[10] / fl;
      const across = { x: fz, z: -fx };   // horizontal perpendicular to the root forward
      const lat = (h: any, s: any) => { const d = P(h).subtract(P(s)); return d.x * across.x + d.z * across.z; };
      const sL = P(B.LeftArm), sR = P(B.RightArm); const sideSign = ((sR.x - sL.x) * across.x + (sR.z - sL.z) * across.z) >= 0 ? 1 : -1;
      r.outL = +(-lat(B.LeftHand, B.LeftArm) * sideSign).toFixed(3); r.outR = +(lat(B.RightHand, B.RightArm) * sideSign).toFixed(3);
      r.span = +Math.abs((P(B.RightHand).x - P(B.LeftHand).x) * across.x + (P(B.RightHand).z - P(B.LeftHand).z) * across.z).toFixed(3);
      const ang = (a: any, b: any, c: any) => { const u = P(a).subtract(P(b)), v = P(c).subtract(P(b)); return Math.round(Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / (u.length() * v.length())))) * 180 / Math.PI); };
      r.eL = ang(B.LeftArm, B.LeftForeArm, B.LeftHand); r.eR = ang(B.RightArm, B.RightForeArm, B.RightHand);
      const bat = scene.getMeshByName('derby_bat');
      if (bat) {
        const c = bat.getAbsolutePosition(); const up = bat.getDirection(new bat.position.constructor(0, 1, 0));
        const len = Math.hypot(up.x, up.y, up.z) || 1; const u = { x: up.x / len, y: up.y / len, z: up.z / len };
        const fist = (h: any, f: any) => { const hp = P(h), fp = P(f); const d = hp.subtract(fp); const l = d.length() || 1; return hp.add(d.scale(0.07 / l)); };
        const off = (q: any) => { const d = q.subtract(c); const t = d.x * u.x + d.y * u.y + d.z * u.z; const px = d.x - u.x * t, py = d.y - u.y * t, pz = d.z - u.z * t; return [+Math.hypot(px, py, pz).toFixed(3), +t.toFixed(2)]; };
        r.batL = off(fist(B.LeftHand, B.LeftForeArm)); r.batR = off(fist(B.RightHand, B.RightForeArm)); r.batUp = +u.y.toFixed(2);
      }
      const groups = scene.animationGroups.filter((g: any) => g.isPlaying && g.targetedAnimations.some((t: any) => under.has(t.target)));
      r.clip = groups.map((g: any) => g.name).slice(-1)[0] ?? '';
      const top = groups.slice(-1)[0]; r.clipSec = top ? +(((top.animatables[0]?.masterFrame ?? 0) - top.from) / 30).toFixed(2) : null;
      const sk8 = dev.skate?.(); if (sk8) { r.pos = [+sk8.pos.x.toFixed(2), +sk8.pos.y.toFixed(2), +sk8.pos.z.toFixed(2)]; r.railD = +sk8.railD.toFixed(2); r.grinding = sk8.grinding; r.grounded = sk8.grounded; r.goals = sk8.goals; r.onPatrol = sk8.onPatrol; }
      r.dust = scene.particleSystems.filter((ps: any) => /^fx_dust_/.test(ps.name)).map((ps: any) => +ps.emitter.y.toFixed(2));
      w.__AS.rows.push(r); if (w.__AS.rows.length > 20000) w.__AS.rows.shift();
    });
  });
}
const rows = async (p: Page) => (await p.evaluate(() => (window as any).__AS?.rows ?? [])) as any[];
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const shot = (p: Page, name: string) => p.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 340, y: 150, width: 600, height: 600 } });

const results: Record<string, unknown> = {};

async function skateArms(p: Page) {
  await boot(p, 'skateboard'); await record(p);
  await pad(p, { y: -1 });
  for (const s of [2.5, 4, 5.5]) { await p.waitForTimeout(1500); await shot(p, `skate-arms-t${s}`); }
  await pad(p, { y: 0 }); await p.waitForTimeout(2500); await shot(p, 'skate-arms-roll');
  const R = (await rows(p)).filter((r) => /board_(ride_idle|push)/.test(r.clip));
  const by = (c: string) => { const x = R.filter((r) => r.clip === c); return { n: x.length, outL: med(x.map((r) => r.outL)), outR: med(x.map((r) => r.outR)), maxOut: Math.max(...x.map((r) => Math.max(r.outL, r.outR))), span: med(x.map((r) => r.span)), eL: med(x.map((r) => r.eL)), eR: med(x.map((r) => r.eR)), winged: x.filter((r) => r.outL > 0.2 && r.outR > 0.2).length }; };
  results['skate-arms'] = { board_ride_idle: by('board_ride_idle'), board_push: by('board_push') };
}

async function skateGrind(p: Page, attempt: number) {
  await boot(p, 'skateboard'); await record(p);
  const atBoot = await p.evaluate(() => { const s = (window as any).__FEL_DEV__?.skate?.(); return s ? { rot: s.rot, pos: s.pos, speed: s.speed, grounded: s.grounded, airtime: s.airtime } : null; });
  const bootLogs = logs.filter((l) => /SKATE|FEL-READY|LAND|BAIL|ollie|pop/i.test(l)).slice(-12);
  const t0 = Date.now(); let pops = 0; let locked = false; let shotTaken = false;
  await pad(p, { y: -1 });
  while (Date.now() - t0 < 25000) {
    const s = await p.evaluate(() => (window as any).__FEL_DEV__?.skate?.() ?? null);
    if (!s) break;
    if (s.grinding) {
      locked = true;
      if (!shotTaken) { await shot(p, `skate-grind-${attempt}`); shotTaken = true; }
      await p.waitForTimeout(700); break;
    }
    if (s.railD < 3.5 && s.grounded) { await tapA(p, 80); pops++; }
    await p.waitForTimeout(100);
  }
  await pad(p, { y: 0 }); await p.waitForTimeout(600);
  const trail = (await rows(p)).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 25)) === 0).map((r) => `${r.pos} d${r.railD} g${r.grounded ? 1 : 0}`);
  const end = await p.evaluate(() => (window as any).__FEL_DEV__?.skate?.() ?? null);
  const hud = await p.evaluate(() => document.body.innerText);
  results[`skate-grind-${attempt}`] = {
    locked, pops, sec: +((Date.now() - t0) / 1000).toFixed(1),
    lockLines: logs.filter((l) => /SKATE-GRIND/.test(l)).slice(0, 6), goals: end?.goals,
    patrolGoalTicked: /✓\s*GRIND THE PATROL RAIL/i.test(hud) || logs.some((l) => /GAP: .*PATROL|moving_rail/i.test(l)),
    goalLine: (hud.match(/.{0,4}GRIND THE PATROL RAIL/) ?? [''])[0], trail: locked ? undefined : trail, atBoot, bootLogs: locked ? undefined : bootLogs,
  };
}

/** The eye's probe-anim-eye.mts driveSkate, step for step (stick axes, timings, the hunt rule). */
async function skateEye(p: Page) {
  await boot(p, 'skateboard'); await record(p);
  const st = async (x: number, y: number) => pad(p, { x, y });
  await st(0, -1); await p.waitForTimeout(4000);
  await st(-0.6, -0.8); await p.waitForTimeout(1500);
  await st(0.6, -0.8); await p.waitForTimeout(1500);
  await st(0, -1); await tapA(p, 100); await p.waitForTimeout(800);
  let grinding = false;
  for (let i = 0; i < 20; i++) {
    await st(i % 2 === 0 ? 0.2 : -0.2, -1);
    const s = await p.evaluate(() => (window as any).__FEL_DEV__?.skate?.() ?? null);
    if (s && s.railD < 3.5 && s.grounded) await tapA(p, 80);
    if (s?.grinding) { grinding = true; await shot(p, 'skate-eye-grind'); await p.waitForTimeout(1200); break; }
    await p.waitForTimeout(400);
  }
  const R = await rows(p);
  results['skate-eye'] = { grinding, everGrinding: R.some((r) => r.grinding), lockLines: logs.filter((l) => /SKATE-GRIND/.test(l)).slice(0, 4),
    path: R.filter((_, i) => i % 60 === 0).map((r) => r.pos) };
}

async function derby(p: Page) {
  await boot(p, 'derby'); await record(p);
  await p.waitForTimeout(1500); await shot(p, 'derby-stance');
  for (let k = 0; k < 3; k++) {
    await p.waitForTimeout(1600);
    await tapA(p, 90);
    let prev = 0;
    for (const d of [110, 260, 420, 700]) { await p.waitForTimeout(d - prev); prev = d; await shot(p, `derby-swing${k}-${d}`); }
  }
  const R = (await rows(p)).filter((r) => r.batL);
  const stance = R.filter((r) => r.clip === 'baseball_stance'), swing = R.filter((r) => r.clip === 'baseball_swing');
  const grip = (x: any[]) => ({ n: x.length, fistL: med(x.map((r) => r.batL[0])), fistR: med(x.map((r) => r.batR[0])), off: x.filter((r) => r.batL[0] > 0.08 || r.batR[0] > 0.08).length, barrelUp: med(x.map((r) => r.batUp)), down: x.filter((r) => r.batUp < -0.3).length });
  results['derby-bat'] = { stance: grip(stance), swing: grip(swing),
    downAt: R.filter((r) => r.batUp < -0.3).map((r) => `${r.clip}@${r.clipSec} up${r.batUp} L${r.batL[0]} R${r.batR[0]}`) };
}

async function football(p: Page) {
  await boot(p, 'football'); await record(p);
  await pad(p, { y: -1 });
  const t0 = Date.now(); let tackles = 0;
  while (Date.now() - t0 < 60000 && tackles < 2) {
    // steer INTO the nearest body in front (a smoke only gets tackled by running at the front)
    await p.evaluate(() => {
      const w = window as any, dev = w.__FEL_DEV__, hero = dev.hero(), scene = dev.scene; if (!hero) return;
      const hp = hero.getAbsolutePosition(); const heroSet = new Set(hero.getDescendants(false));
      let best: any = null, bd = Infinity;
      for (const s of scene.skeletons) {
        const m = scene.meshes.find((x: any) => x.skeleton === s && !heroSet.has(x)); if (!m) continue;
        const b = s.bones[0]?.getTransformNode(); const q = (b ?? m).getAbsolutePosition();
        const dz = q.z - hp.z; if (dz < -0.5 || dz > 25) continue;
        const d = Math.hypot(q.x - hp.x, dz); if (d < bd) { bd = d; best = q; }
      }
      const P = w.__PAD; P.axes[0] = best ? Math.max(-1, Math.min(1, (best.x - hp.x) * 0.6)) : 0; P.axes[1] = -1; P.timestamp = Date.now();
    });
    const n = logs.filter((l) => /\[FB-JUICE\] tackle weight/.test(l)).length;
    if (n > tackles) {
      tackles = n;
      for (const [d, tag] of [[30, 'a'], [220, 'b'], [450, 'c']] as const) { await p.waitForTimeout(d === 30 ? 30 : d === 220 ? 190 : 230); await shot(p, `football-tackle${n}-${tag}`); }
    }
    await p.waitForTimeout(40);
  }
  await pad(p, { y: 0 });
  const R = await rows(p);
  const ys = [...new Set(R.flatMap((r) => r.dust))];
  results.football = { tackles, dustEmitterY: ys, torsoPuffFrames: R.filter((r) => r.dust.some((y: number) => y > 0.3)).length };
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await p.addInitScript(() => {
    const P: any = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__PAD = P; (navigator as any).getGamepads = () => [P];
  });
  for (const w of WHAT) {
    try {
      if (w === 'skate-arms') await skateArms(p);
      if (w === 'skate-grind') for (let i = 1; i <= Number(process.env.GRIND_N ?? 3); i++) await skateGrind(p, i);
      if (w === 'skate-eye') await skateEye(p);
      if (w === 'derby') await derby(p);
      if (w === 'football') await football(p);
    } catch (e) { results[`${w}-error`] = String(e).slice(0, 300); }
    console.log(w, JSON.stringify(Object.fromEntries(Object.entries(results).filter(([k]) => k.startsWith(w.split('-')[0])))));
    fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 2));
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
