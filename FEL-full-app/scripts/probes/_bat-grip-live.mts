// BAT-GRIP (2026-11-03): owner bug "the character holds the bat upside down in the baseball modes". Measured on the real
// rig on /dev/mode/<derby|baseball>: the world position of the GLB bat's THIN end (its handle) and THICK end (its barrel)
// against the two fists, and the GLB's handle→barrel direction against the placed carrier's +Y (the line placeTwoHandBat
// computed), in the stance and through a swing. The cylinder carrier is measured too: it is the control (its knob end is
// put at the fists by construction, so a cylinder that read wrong would mean the probe is wrong, not the bat).
//
// Usage: npx tsx scripts/probes/_bat-grip-live.mts <port> <outdir> <tag> [derby,baseball]
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.argv[2] ?? '3311';
const OUT = process.argv[3] ?? '/tmp/bat-grip';
const TAG = process.argv[4] ?? 'run';
const MODES = (process.argv[5] ?? 'derby,baseball').split(',');
fs.mkdirSync(OUT, { recursive: true });

const pad = (p: Page, o: { a?: boolean }) => p.evaluate((o) => {
  const P = (window as any).__PAD; if (!P) return;
  if (o.a !== undefined) P.buttons[0] = { pressed: o.a, touched: o.a, value: o.a ? 1 : 0 }; P.timestamp = Date.now();
}, o);
const tapA = async (p: Page, ms = 90) => { await pad(p, { a: true }); await p.keyboard.down('Space'); await p.waitForTimeout(ms); await pad(p, { a: false }); await p.keyboard.up('Space'); };

async function boot(p: Page, mode: string): Promise<void> {
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForSelector('canvas', { timeout: 300000 });
  // the dev page's own status line reads "DEV · <mode> · <phase>": wait for playing, pressing START when it is offered
  for (let i = 0; i < 300; i++) {
    const txt = await p.evaluate(() => document.body.innerText);
    if (/·\s*playing/i.test(txt) && (await p.evaluate(() => !!(window as any).__FEL_DEV__?.hero?.()))) break;
    if (/·\s*ready/i.test(txt)) {
      const btn = p.getByRole('button', { name: /^start$/i });
      if (await btn.count()) await btn.first().click({ timeout: 2000 }).catch(() => {});
      await tapA(p, 120);
    }
    await p.waitForTimeout(1000);
  }
  await p.waitForTimeout(3000);
}

/** One reading: fists, the carrier's ends, the GLB's thin/thick ends (found from its own vertices), all in world space. */
async function read(p: Page): Promise<any> {
  return p.evaluate(() => {
    const w = window as any, dev = w.__FEL_DEV__, scene = dev.scene, root = dev.hero();
    const carrier = scene.meshes.find((m: any) => m.name === 'derby_bat' || m.name === 'baseball_bat');
    if (!carrier || !root) return { err: 'no bat or hero' };
    const wrap = scene.transformNodes.find((n: any) => n.name === `${carrier.name}_glb`);
    const under = new Set<any>(root.getDescendants(false));
    const sk = scene.skeletons.find((s: any) => s.bones.some((b: any) => under.has(b.getTransformNode())));
    const node = (n: string) => sk?.bones.find((b: any) => b.name === n || b.name.replace(/_c\d+$/, '') === n)?.getTransformNode();
    const V = (window as any).BABYLON?.Vector3 ?? carrier.position.constructor;
    const fist = (h: any, f: any) => { h.computeWorldMatrix(true); f.computeWorldMatrix(true); const hp = h.getAbsolutePosition().clone(); const a = hp.subtract(f.getAbsolutePosition()); return hp.add(a.normalize().scale(0.07)); };
    const fL = fist(node('LeftHand'), node('LeftForeArm')), fR = fist(node('RightHand'), node('RightForeArm'));
    const grip = fL.add(fR).scale(0.5);
    carrier.computeWorldMatrix(true);
    const up = new V(0, 1, 0); const q = carrier.rotationQuaternion; const yAxis = V.TransformNormal(up, carrier.getWorldMatrix()).normalize();
    const cKnob = carrier.position.subtract(yAxis.scale(0.43)), cTip = carrier.position.add(yAxis.scale(0.43));
    const r3 = (v: any) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
    const out: any = { grip: r3(grip), fistSep: +fL.subtract(fR).length().toFixed(3), carrierUp: r3(yAxis), carrierKnobToGrip: +cKnob.subtract(grip).length().toFixed(3), carrierTipToGrip: +cTip.subtract(grip).length().toFixed(3) };
    void q;
    if (!wrap || !wrap.isEnabled()) { out.glb = 'not shown'; return out; }
    const vs: any[] = [];
    for (const m of wrap.getChildMeshes()) {
      const pos = m.getVerticesData('position'); if (!pos) continue;
      m.computeWorldMatrix(true); const W = m.getWorldMatrix();
      for (let i = 0; i < pos.length; i += 3 * 7) vs.push(V.TransformCoordinates(new V(pos[i], pos[i + 1], pos[i + 2]), W));
    }
    if (!vs.length) { out.glb = 'no vertices'; return out; }
    const c0 = vs.reduce((s: any, v: any) => s.addInPlace(v), new V(0, 0, 0)).scale(1 / vs.length);
    let p1 = vs[0]; for (const v of vs) if (v.subtract(c0).length() > p1.subtract(c0).length()) p1 = v;
    let p2 = vs[0]; for (const v of vs) if (v.subtract(p1).length() > p2.subtract(p1).length()) p2 = v;
    // the principal axis (power iteration on the covariance), oriented p1 → p2: the rim-to-rim diagonal is ~5° off it
    const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const v of vs) { const d = [v.x - c0.x, v.y - c0.y, v.z - c0.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i * 3 + j] += d[i] * d[j]; }
    let e = [p2.x - p1.x, p2.y - p1.y, p2.z - p1.z];
    for (let it = 0; it < 50; it++) { const n = [0, 1, 2].map((i) => cov[i * 3] * e[0] + cov[i * 3 + 1] * e[1] + cov[i * 3 + 2] * e[2]); const l = Math.hypot(n[0], n[1], n[2]) || 1; e = n.map((x) => x / l); }
    const ax = new V(e[0], e[1], e[2]); const L = p2.subtract(p1).length();

    const rad = (lo: number, hi: number) => { let s = 0, n = 0; for (const v of vs) { const t = V.Dot(v.subtract(p1), ax) / L; if (t < lo || t > hi) continue; const d = v.subtract(p1); s += d.subtract(ax.scale(V.Dot(d, ax))).length(); n++; } return n ? s / n : 0; };
    const r1 = rad(0.05, 0.3), r2 = rad(0.7, 0.95);
    let tLo = Infinity, tHi = -Infinity;
    for (const v of vs) { const t = V.Dot(v.subtract(c0), ax); if (t < tLo) tLo = t; if (t > tHi) tHi = t; }
    const a1 = c0.add(ax.scale(tLo)), a2 = c0.add(ax.scale(tHi));   // the ends on the axis, not the rim of the knob
    const thin = r1 < r2 ? a1 : a2, thick = r1 < r2 ? a2 : a1;
    const gdir = thick.subtract(thin).normalize();
    out.glb = {
      len: +L.toFixed(3), rThin: +Math.min(r1, r2).toFixed(4), rThick: +Math.max(r1, r2).toFixed(4),
      thinToGrip: +thin.subtract(grip).length().toFixed(3), thickToGrip: +thick.subtract(grip).length().toFixed(3),
      angleToCarrierDeg: +(Math.acos(Math.max(-1, Math.min(1, V.Dot(gdir, yAxis)))) * 180 / Math.PI).toFixed(1),
      barrelUp: +gdir.y.toFixed(2),
    };
    return out;
  });
}
async function shot(p: Page, name: string): Promise<void> { await p.screenshot({ path: `${OUT}/${TAG}_${name}.jpg`, type: 'jpeg', quality: 70, timeout: 180000 }).catch((e) => console.log('shot failed', name, String(e).slice(0, 80))); }
async function look(p: Page, cyl: boolean): Promise<void> {
  await p.evaluate((cyl) => {
    const scene = (window as any).__FEL_DEV__.scene;
    const carrier = scene.meshes.find((m: any) => m.name === 'derby_bat' || m.name === 'baseball_bat'); if (!carrier) return;
    const wrap = scene.transformNodes.find((n: any) => n.name === `${carrier.name}_glb`);
    carrier.isVisible = cyl; wrap?.setEnabled(!cyl);
  }, cyl);
}

const results: Record<string, any> = {};
const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript('window.__name = (f) => f;');   // tsx (esbuild keepNames) wraps named arrows in __name
await ctx.addInitScript(() => {
  const pad: any = { id: 'probe pad', index: 0, connected: true, mapping: 'standard', timestamp: Date.now(), axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  (window as any).__PAD = pad;
  Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null] });
  try { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('blocked')); } catch {}
});
/** The model's turn: OLD = the shipped fit (the FILE's handle→barrel onto +Y), NEW = this lane's (the loaded, X-mirrored
 *  ends). Same scale and lift either way (the bat is centred and symmetric under the mirror), so the toggle reproduces the
 *  shipped look exactly — both are measured on the same frame of the same rig. */
const ROT = { old: Math.PI / 2 - Math.atan2(0.34, 0.80), new: Math.PI / 2 - Math.atan2(0.34, -0.80) };
async function setFit(p: Page, which: 'old' | 'new'): Promise<void> {
  await p.evaluate((rz) => {
    const scene = (window as any).__FEL_DEV__.scene;
    const m = scene.transformNodes.find((n: any) => /_bat_meshy$/.test(n.name)); if (m) m.rotation.z = rz;
    scene.render();
  }, ROT[which]);
}
const freeze = (p: Page, on: boolean) => p.evaluate((on) => {
  const eng = (window as any).__FEL_DEV__.scene.getEngine();
  if (on) { (window as any).__loops = [...(eng._activeRenderLoops ?? [])]; eng.stopRenderLoop(); }
  else for (const f of (window as any).__loops ?? []) eng.runRenderLoop(f);
}, on);

for (const mode of MODES) {
  const p = await ctx.newPage();
  const R: any = {};
  try {
    await boot(p, mode);
    R.phaseText = (await p.evaluate(() => document.body.innerText)).slice(0, 40);
    await freeze(p, true);
    for (const fit of ['old', 'new'] as const) { await setFit(p, fit); R[`stance_${fit}`] = await read(p); await shot(p, `${mode}-stance-${fit}`); }
    await look(p, true); await p.evaluate(() => (window as any).__FEL_DEV__.scene.render()); R.stance_cylinder = await read(p); await shot(p, `${mode}-stance-cylinder`); await look(p, false);
    await freeze(p, false);
    // the swing: press A every 300 ms (a swing starts only inside the pitch window), watch the carrier leave the stance
    // line, then freeze that frame and read and shoot it with each fit
    const up0 = R.stance_new.carrierUp as number[];
    const t0 = Date.now(); let caught = false;
    while (Date.now() - t0 < 60000 && !caught) {
      await tapA(p, 60);
      for (let i = 0; i < 4 && !caught; i++) {
        const r = await read(p);
        const u = r.carrierUp as number[] | undefined;
        if (u && u[0] * up0[0] + u[1] * up0[1] + u[2] * up0[2] < Math.cos(35 * Math.PI / 180)) {
          await freeze(p, true); caught = true;
          for (const fit of ['old', 'new'] as const) { await setFit(p, fit); R[`swing_${fit}`] = await read(p); await shot(p, `${mode}-midswing-${fit}`); }
        }
        await p.waitForTimeout(60);
      }
    }
    R.swingCaught = caught;
  } catch (e) { R.err = String(e).slice(0, 300); }
  results[mode] = R;
  fs.writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
  await p.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
