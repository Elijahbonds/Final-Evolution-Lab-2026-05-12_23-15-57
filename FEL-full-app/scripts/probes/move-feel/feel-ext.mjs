// move-feel / feel-ext — the locomotion a player feels, on the REAL 1v1 / 3v3 (lane/move-feel, 2026-11-12; the owner: "Find out why the
// movement still feels off?"). A scenario for the hoops-gap rig's driver (../hoops-gap/drive.mjs, SCEN=ext EXT=<this file>): the dev
// bundle, the deterministic clock (1/60 s a drawn frame), seed 7, the real InputBus. Each TEST resets the possession with the mode's own
// seam (offense() / defend()), lets it settle, then plays a fixed stick timeline (frames, not wall time) and records every drawn frame:
//   the hero's root (x, z, yaw), both feet, the camera (position, forward, fov), the hero's hips on screen (NDC), the stick and turbo
//   it was sent, the anim tree's state and the locomotion clips playing on the hero (name, weight, speed ratio) — on change.
// Per test it also keeps page.js's own analysis (HG.analyse: the pops, the planted-foot slide, the camera) over exactly those frames, so
// the numbers sit beside the earlier lanes' (same instrument). ./analyze.mjs reads the JSON; ./sheet.py draws the JPG.
//   gate-run.sh 890 ../hoops-gap/run-set.sh <site> <out> "onevone ext EXT=$PWD/scripts/probes/move-feel/feel-ext.mjs TAG=rel QS=dummy=1 NODRAW=1"
//   env: TESTS=jog,sprint,... (default: all of the mode's)  STRIPS=1 (frame strips of the worst moments: leave NODRAW off)
//   QS=dummy=1 (1v1 only: the rival stands still off in a corner — the clean locomotion control; without it he guards)
import fs from 'node:fs';
import path from 'node:path';

const PAGE_REC = String.raw`(() => {
  if (window.__mf) return 'already';
  const dev = window.__FEL_DEV__; const scene = dev.scene; const HG = window.__hg; const MODE = dev.modeId;
  const MF = (window.__mf = { rec: false, rows: [], ev: [], stick: [0, 0], turbo: 0 });
  const topOf = (n) => { while (n && n.parent) n = n.parent; return n; };
  const clean = (n) => String(n).replace(/^mixamorig:?/, '').replace(/(_c\d+)+$/, '').replace(/_p\d+$/, '');
  const root = topOf(dev.hero());
  const sk = scene.skeletons.find((s) => s.bones.length && s.bones.some((b) => { const t = b.getTransformNode(); return t && t.isDescendantOf(root); }));
  const by = new Map(); if (sk) for (const b of sk.bones) { const t = b.getTransformNode(); if (t) by.set(clean(t.name), t); }
  const lf = by.get('LeftFoot'), rf = by.get('RightFoot'), hips = by.get('Hips');
  const mine = new WeakMap();
  const isMine = (g) => { let v = mine.get(g); if (v === undefined) { const t = g.targetedAnimations[0] && g.targetedAnimations[0].target; v = !!(t && (t === root || (t.isDescendantOf && t.isDescendantOf(root)))); mine.set(g, v); } return v; };
  const V3 = scene.activeCamera.position.constructor;
  let lastSig = '', lastState = '';
  MF.stickTo = (x, y) => { MF.stick = [x, y]; HG.emit({ t: 'stick', side: 'L', x, y }); };
  MF.turboTo = (on) => { MF.turbo = on ? 1 : 0; HG.turbo(!!on); };
  MF.mark = (m) => { MF.ev.push([HG.frame, m]); };
  scene.onAfterRenderObservable.add(() => {
    if (!MF.rec) return;
    try {
      const r = root.getAbsolutePosition(); const m = root.getWorldMatrix().m;
      const L = lf ? lf.getAbsolutePosition() : r, R = rf ? rf.getAbsolutePosition() : r;
      const cam = scene.activeCamera; const cp = cam.globalPosition || cam.position; const fw = cam.getDirection(new V3(0, 0, 1));
      const hp = (hips || root).getAbsolutePosition(); const nd = V3.TransformCoordinates(hp, scene.getTransformMatrix());
      MF.rows.push([HG.frame, r.x, r.z, Math.atan2(m[8], m[10]), L.x, L.y, L.z, R.x, R.y, R.z, cp.x, cp.y, cp.z, fw.x, fw.y, fw.z, cam.fov || 0, nd.x, nd.y, MF.stick[0], MF.stick[1], MF.turbo].map((v, i) => (i === 0 ? v : Math.round(v * 1e4) / 1e4)));
      const loco = [];
      for (const g of scene.animationGroups) { if (!g.isPlaying || !isMine(g)) continue; const w = g.weight < 0 ? 1 : g.weight; if (w > 0.05) loco.push(g.name.replace(/_c\d+$/, '') + ':' + w.toFixed(2) + ':' + (+g.speedRatio).toFixed(2)); }
      const sig = loco.sort().join(' '); if (sig !== lastSig) { lastSig = sig; MF.ev.push([HG.frame, 'clips ' + sig]); }
      if (MODE === 'onevone') { const s = scene.metadata.onevone; const a = s && s.animState ? s.animState() : null; const st = a ? (a.me || '-') + (a.meHeld ? '+' + a.meHeld : '') : ''; if (st !== lastState) { lastState = st; MF.ev.push([HG.frame, 'state ' + st]); } }
    } catch (e) { if (MF.ev.length < 4000) MF.ev.push([HG.frame, 'err ' + String(e && e.message || e).slice(0, 100)]); }
  });
  return 'mf ok ' + (lf ? 'feet' : 'NO FEET') + ' ' + MODE;
})()`;

// A test: the side its possession is set to, then [stick x, stick y, turbo, frames, mark?] steps. Stick space: +x screen right, +y DOWN
// (toward the camera); (1, 0) runs across the court from the top of the key, (0, -1) runs at the rim.
const D = Math.SQRT1_2;
const TESTS = {
  // FIRST, before anything has sent a trigger: the stick alone, full tilt, as a phone (no TURBO touched yet) or a keyboard (no Shift yet)
  // sends it — PlayerSlot's fallback reads a stick past 0.85 as the turbo until a trigger has reported once (turbo null = send none)
  fresh: { side: 'off', steps: [[1, 0, null, 60, 'go'], [0, 0, null, 40, 'stop']] },
  // 1v1 / 3v3, the ball in my hands
  jog: { side: 'off', steps: [[1, 0, 0, 66, 'go'], [0, 0, 0, 50, 'stop']] },
  sprint: { side: 'off', steps: [[1, 0, 1, 60, 'go'], [0, 0, 0, 50, 'stop']] },
  cut: { side: 'off', steps: [[1, 0, 0, 48, 'go'], [0, -1, 0, 42, 'cut'], [0, 0, 0, 30, 'stop']] },
  cutSprint: { side: 'off', steps: [[1, 0, 1, 48, 'go'], [0, -1, 1, 36, 'cut'], [0, 0, 0, 30, 'stop']] },
  reverse: { side: 'off', steps: [[1, 0, 0, 48, 'go'], [-1, 0, 0, 60, 'reverse'], [0, 0, 0, 30, 'stop']] },
  weave: { side: 'off', steps: [[D, -D, 0, 30, 'go'], [-D, -D, 0, 30, 'w1'], [D, -D, 0, 30, 'w2'], [-D, -D, 0, 30, 'w3'], [0, 0, 0, 30, 'stop']] },
  walk: { side: 'off', steps: [[0.3, 0, 0, 60, 'walk'], [0.6, 0, 0, 40, 'jog'], [0.12, 0, 0, 45, 'creep'], [0, 0, 0, 20, 'stop']] },
  // on defence (1v1: the rival holds the ball at the check; 3v3: the possession the seam starts)
  slide: { side: 'def', steps: [[0, 0, 0, 20, 'set'], [1, 0, 0, 36, 'right'], [-1, 0, 0, 36, 'left'], [1, 0, 0, 36, 'right2'], [0, 0, 0, 30, 'stop']] },
};
const STRIP_AT = { jog: 'stop', sprint: 'stop', cut: 'cut', cutSprint: 'cut', reverse: 'reverse', walk: 'creep', slide: 'left', weave: 'w1' };

export default async function run({ ev, runFrames, saveStrip, say, checkpoint, result, MODE }) {
  say('mf: ' + await ev(PAGE_REC));
  const names = (process.env.TESTS ?? Object.keys(TESTS).join(',')).split(',').filter((n) => TESTS[n]);
  const strips = process.env.STRIPS === '1';
  result.mf = { tests: [] };
  for (const name of names) {
    const T = TESTS[name];
    const noTrig = T.steps.every((st) => st[2] === null);
    await ev((nt) => { window.__mf.stickTo(0, 0); if (!nt) window.__mf.turboTo(0); }, noTrig);
    await ev((a) => { const s = window.__FEL_DEV__.scene.metadata[a[0]]; if (a[1] === 'def') s.defend(); else s.offense(); }, [MODE, T.side]);
    await runFrames(T.side === 'def' ? 40 : 50);
    await ev(() => { const MF = window.__mf; MF.rows = []; MF.ev = []; MF.rec = true; window.__hg.start(); });
    const f0 = await ev(() => window.__hg.frame);
    const diag = async () => ev((m) => { const s = window.__FEL_DEV__.scene.metadata[m]; const g = (f) => { try { return f(); } catch (e) { return 'err'; } }; return { phase: window.__phase, poss: g(() => (s.possession ? s.possession() : s.carrier())), ended: g(() => s.ended && s.ended()), carry: g(() => JSON.stringify(s.carry())), att: g(() => s.attackPhase && s.attackPhase()), hud: JSON.stringify(window.__hudNow).slice(0, 300) }; }, MODE);
    const diag0 = await diag();
    for (const [x, y, tb, n, mark] of T.steps) {
      await ev((a) => { const MF = window.__mf; MF.mark(a[3]); MF.stickTo(a[0], a[1]); if (a[2] !== null) MF.turboTo(a[2]); }, [x, y, tb, mark]);
      if (strips && STRIP_AT[name] === mark) await ev((nm) => { window.__hg.strip(nm, 12, 2); }, `mf-${name}`);
      await runFrames(n);
    }
    await ev((nt) => { window.__mf.stickTo(0, 0); if (!nt) window.__mf.turboTo(0); }, noTrig);
    const rec = await ev(() => { const MF = window.__mf; MF.rec = false; window.__hg.stop(); return { rows: MF.rows, ev: MF.ev }; });
    const an = await ev(() => window.__hg.analyse({ popList: true }));
    const me = an.perBody.me || {};
    const log = await ev((a) => (window.__LOG || []).filter((l) => l.f >= a).map((l) => [l.f, l.m]), f0);
    const diag1 = await diag();
    result.mf.tests.push({ name, side: T.side, f0, diag0, diag1, steps: T.steps, rows: rec.rows, ev: rec.ev, log: log.slice(0, 400),
      pops: me.pops, severe: me.severe, popList: me.popList || [], slideP90Cm: me.slideP90Cm, skates: me.skates, plantedFrames: me.plantedFrames, slideAll: me.slideAll || [], skateAt: me.skateAt || [], camera: an.camera });
    say(`mf ${name}: ${rec.rows.length} frames, pops ${me.pops} (severe ${me.severe}), slide p90 ${me.slideP90Cm} cm, cam turn p99 ${an.camera && an.camera.turnP99DegS}`);
    if (strips && STRIP_AT[name]) { const n = await saveStrip(`mf-${name}`); say(`strip mf-${name}: ${n}`); }
    await checkpoint('mf ' + name);
  }
  // the strips' frame numbers are not kept by page.js: the strip starts on the frame its mark was sent, every 2nd frame (STRIP_AT)
  result.mf.stripAt = STRIP_AT;
  void fs; void path;
}
