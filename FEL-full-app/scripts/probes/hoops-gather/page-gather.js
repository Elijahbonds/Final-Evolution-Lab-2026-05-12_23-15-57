// hoops-gather IN-PAGE half (lane/hoops-gather, 2026-11-12). Evaluated into the hoops-gap rig page AFTER ../hoops-gap/page.js
// (it uses that file's input helpers, window.__hg.press / release / stick / steer / turbo / flick and its frame counter). Plain JS.
//
// What it does: one TRIAL at a time — reset the possession (the mode's own seam), approach the rim the way the gather asks for
// (stand, jog, drive, sprint), wait for the dribble to be in a chosen PHASE of its bounce (the top, falling, the floor, rising),
// then make the press that starts the gather (or the escape flick), let go at the meter's green, and keep every drawn frame from
// 30 before the press to ~100 after. The numbers are computed in Node (./analyze.mjs) from the raw frames, so a trial can be
// re-read without re-running it.
//
// The recorder is its own (page.js keeps its arrays private): on scene.onAfterRenderObservable — the pose AS DRAWN — the hero's root,
// the world positions of both hands, both forearms, both feet and the hips; the local rotation of 18 bones (quaternions, so
// gameplay-clean/popCount.mjs can count pops exactly as the counter does); the ball's world position and who holds it (the hero's rig
// LeftHand / RightHand, another body, nobody), whether the ball is being EASED into a hand (ballRig's gather: metadata.felGather);
// the nearest defender's root; the meter; the tree state (1v1). A ring of the last 900 frames is always on, so the phase read has
// the bounce before the press.
(() => {
  if (window.__gx) return 'already';
  const HG = window.__hg; const dev = window.__FEL_DEV__; const scene = dev.scene; const MODE = dev.modeId;
  const S = () => (scene.metadata || {})[MODE];
  const RIM = { x: 0, z: -0.6 };
  const clean = (n) => String(n).replace(/^mixamorig:?/, '').replace(/(_c\d+)+$/, '').replace(/_p\d+$/, '');
  const topOf = (n) => { while (n && n.parent) n = n.parent; return n; };
  const heroRoot = topOf(dev.hero());
  const sk = scene.skeletons.find((s) => s.bones.length && s.bones.some((b) => { const t = b.getTransformNode(); return t && t.isDescendantOf(heroRoot); }));
  const by = new Map(); for (const b of sk.bones) { const t = b.getTransformNode(); if (t) by.set(clean(t.name), t); }
  const BONES = ['Hips', 'Spine2', 'Neck', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'Head'];
  const bn = BONES.map((n) => by.get(n) || null);
  const P = { lh: by.get('LeftHand'), rh: by.get('RightHand'), lfa: by.get('LeftForeArm'), rfa: by.get('RightForeArm'), lf: by.get('LeftFoot'), rf: by.get('RightFoot'), hips: by.get('Hips') };
  const ball = () => scene.getMeshByName('ball');
  const Q = scene.activeCamera.absoluteRotation ? scene.activeCamera.absoluteRotation.constructor : null;
  const lq = (t) => { if (!t) return null; const q = t.rotationQuaternion || (Q ? Q.FromEulerAngles(t.rotation.x, t.rotation.y, t.rotation.z) : null); return q ? [+q.x.toFixed(5), +q.y.toFixed(5), +q.z.toFixed(5), +q.w.toFixed(5)] : null; };
  const wp = (t) => { if (!t) return null; const p = t.getAbsolutePosition(); return [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)]; };
  const holder = () => {
    const bl = ball(); if (!bl || !bl.parent) return '-';
    if (bl.parent === P.lh) return 'L'; if (bl.parent === P.rh) return 'R';
    let n = bl.parent; for (let i = 0; i < 8 && n; i++, n = n.parent) if (n === heroRoot) return 'H';   // another hero node (a held prop)
    return 'O';
  };
  const foes = () => {
    const s = S(); const out = [];
    try {
      if (MODE === 'onevone') out.push(s.foeRoot.getAbsolutePosition());
      else for (const j of s.jobs()) if (String(j.id).startsWith('foe') && j.root) out.push(topOf(j.root).getAbsolutePosition());
    } catch (e) { /* no seam yet */ }
    return out;
  };
  const meterNow = () => { const h = window.__hudNow || {}; const t = +h.shotMeterT || 0; const g = String(h.shotMeterGreen || '').split(',').map(Number); return { t, c: g[0] || 0.62, w: g[1] || 0.09 }; };
  const stateNow = () => { try { if (MODE === 'onevone') { const a = S().animState(); const p = S().post(); return [a.me || '', a.meHeld || '', (p.shooting ? 's' : '') + (p.finish ? 'f' : '') + (p.gather ? 'g' : '') + (p.spinning ? 'p' : '')]; } const p = S().post(); return ['', p.held || '', (p.shooting ? 's' : '') + (p.finish ? 'f' : '') + (p.gather ? 'g' : '') + (p.spinning ? 'p' : '')]; } catch (e) { return ['', '', '']; } };
  const clipsNow = () => { const a = []; for (const g of scene.animationGroups) { if (!g.isPlaying) continue; const t = g.targetedAnimations[0] && g.targetedAnimations[0].target; if (!t || !(t === heroRoot || (t.isDescendantOf && t.isDescendantOf(heroRoot)))) continue; const w = g.weight < 0 ? 1 : g.weight; if (w > 0.05) a.push(g.name.replace(/_c\d+$/, '') + ':' + w.toFixed(1)); } return a.sort().join(' '); };
  const RING = 900; const ring = []; let rec = true;
  const record = () => {
    if (!rec) return;
    const r = heroRoot.getAbsolutePosition(); const m = heroRoot.getWorldMatrix().m;
    const bl = ball(); let bp = null, gathering = 0;
    if (bl) { const q = bl.getAbsolutePosition(); bp = [+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4)]; gathering = bl.metadata && bl.metadata.felGather ? 1 : 0; }
    const fs = foes().map((f) => [Math.hypot(f.x - r.x, f.z - r.z), +f.x.toFixed(3), +f.z.toFixed(3)]).sort((a, b) => a[0] - b[0]); const near = fs[0] ? [fs[0][1], fs[0][2]] : null, near2 = fs[1] ? [fs[1][1], fs[1][2]] : null;
    const st = stateNow(); const mt = meterNow();
    ring.push({ f: HG.frame + 1, t: +performance.now().toFixed(2), ph: 'playing', r: [+r.x.toFixed(4), +r.y.toFixed(4), +r.z.toFixed(4)], yaw: +Math.atan2(m[8], m[10]).toFixed(4), q: bn.map(lq),
      lh: wp(P.lh), rh: wp(P.rh), lfa: wp(P.lfa), rfa: wp(P.rfa), lf: wp(P.lf), rf: wp(P.rf), hips: wp(P.hips), b: bp, hold: holder(), gath: gathering, foe: near, foe2: near2,
      mt: +mt.t.toFixed(3), mc: +mt.c.toFixed(3), st: st[0], held: st[1], fl: st[2], clips: clipsNow(), poss: HG.possCode ? HG.possCode() : 0 });
    if (ring.length > RING) ring.shift();
  };
  // FIRST on the after-render observable, like page.js's recorder (hoops/contactPoses puts its arm bar, forearm and chest lean BACK on
  // this observable: recorded after it, the pose is not the one drawn — measured on the first control, up to 1.85 cm of palm against
  // page.js on the same frames). Inserted ahead of page.js's own observer, so the frame it belongs to is HG.frame + 1.
  scene.onAfterRenderObservable.add(() => { try { record(); } catch (e) { if (HG.errors.length < 30) HG.errors.push('gx rec ' + String(e && e.message || e).slice(0, 160)); } }, undefined, true);

  // ── the frame clock (page.js's `watch`, re-made: it is private there) ─────────────────────────────────────────────
  const watch = (fn, maxSec) => new Promise((res) => { const f0 = HG.frame; const o = scene.onAfterRenderObservable.add(() => { let v = null; try { v = fn(); } catch (e) { v = null; } if (v) { scene.onAfterRenderObservable.remove(o); res({ frames: HG.frame - f0, v }); } else if (HG.frame - f0 > maxSec * 60) { scene.onAfterRenderObservable.remove(o); res({ frames: null, v: null }); } }); });
  const waitSec = (sec) => watch(() => false, sec);
  const meP = () => heroRoot.getAbsolutePosition();
  const distRim = () => { const p = meP(); return Math.hypot(p.x - RIM.x, p.z - RIM.z); };
  const toRim = () => { const p = meP(); const x = RIM.x - p.x, z = RIM.z - p.z; const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
  const iHave = () => { const s = S(); try { if (MODE === 'onevone') return s.possession() === 'mine' && s.carry().mine; return s.carrier() === 'me'; } catch (e) { return false; } };

  // THE DRIBBLE'S PHASE, read off the drawn ball (the carry's own phase is not on the seam): over the last frames of the live dribble
  // (nobody holds the ball), its height and its direction. top = the first frame after the apex; floor = the first frame after the
  // bounce; down / up = the frame the ball crosses the middle of its stroke falling / rising.
  const phaseNow = () => {
    const n = ring.length; if (n < 4) return null;
    const a = ring[n - 3], b = ring[n - 2], c = ring[n - 1];
    if (!a.b || !b.b || !c.b || a.hold !== '-' || b.hold !== '-' || c.hold !== '-') return null;
    let lo = Infinity, hi = -Infinity; for (let k = Math.max(0, n - 50); k < n; k++) { const x = ring[k]; if (x.hold === '-' && x.b) { lo = Math.min(lo, x.b[1]); hi = Math.max(hi, x.b[1]); } }
    if (!(hi - lo > 0.25)) return null;
    const mid = (lo + hi) / 2;
    if (b.b[1] > a.b[1] && c.b[1] <= b.b[1]) return 'top';
    if (b.b[1] < a.b[1] && c.b[1] >= b.b[1]) return 'floor';
    if (c.b[1] < b.b[1] && b.b[1] >= mid && c.b[1] < mid) return 'down';
    if (c.b[1] > b.b[1] && b.b[1] <= mid && c.b[1] > mid) return 'up';
    return null;
  };
  const waitPhase = (want, maxSec, each) => watch(() => { if (each) each(); if (want === 'any') return 'any'; const p = phaseNow(); return p === want ? p : null; }, maxSec);

  // ── the trial ────────────────────────────────────────────────────────────────────────────────────────────────────
  // spec: { kind, phase ('top'|'down'|'floor'|'up'|'any'), mag (stick 0..1 toward the rim), turbo, untilDist (start looking for the
  //         phase inside this distance from the rim), lateral (+1 / -1: the stick swung across the rim line at the press — the euro's
  //         sell, the skip's away side), pump (a pump fake first), flick (the R-stick move first: 'down' step-back dribble, …),
  //         escape (no shot: the flick IS the trial), retreat (move away from the rim during the approach), back (the stick pulled
  //         off the rim at the press), approachSec (cap) }
  const GX = window.__gx = { ring, mode: MODE };
  GX.trial = async (spec) => {
    const o = { spec, mode: MODE, notes: [] };
    const fStart = HG.frame;
    HG.stick(0, 0); HG.turbo(false); HG.release('X');
    // approach
    const steerRim = (mag, lat = 0, back = 0) => { const [x, z] = toRim(); const px = -z, pz = x; const ax = x * (1 - back * 2) + px * lat, az = z * (1 - back * 2) + pz * lat; HG.steer(ax, az, mag); };
    if (spec.turbo) HG.turbo(true);
    if (spec.retreat) { const [x, z] = toRim(); HG.steer(-x, -z, spec.mag || 0.7); await waitSec(spec.approachSec || 0.5); }
    else if ((spec.mag || 0) > 0) {
      const ap = await watch(() => { steerRim(spec.mag); return distRim() <= (spec.untilDist || 0) ? 'in' : null; }, spec.approachSec || 2.5);
      if (ap.frames === null) o.notes.push('approach cap: dist ' + distRim().toFixed(2));
    } else await waitSec(spec.settleSec || 0.6);
    o.approachF = HG.frame - fStart; o.distAtPhaseWait = +distRim().toFixed(2);
    // THE TRAP (3v3): stop in the paint and wait for the double team to arrive (hoops/teamDefense: the ball inside 3 m for 0.45 s)
    if (spec.trap) { HG.stick(0, 0); HG.turbo(false); const tw = await watch(() => { const L = window.__LOG || []; for (let i = L.length - 1; i >= 0 && L[i].f >= fStart; i--) if (/double team/i.test(L[i].m)) return 1; return null; }, 2.0); o.trapped = !!tw.v; await waitSec(0.25); if (spec.turbo) HG.turbo(true); }
    const keepGoing = () => { if (spec.retreat) { const [x, z] = toRim(); HG.steer(-x, -z, spec.mag || 0.7); } else if ((spec.mag || 0) > 0) steerRim(spec.mag); };
    if (!iHave()) { o.notes.push('no ball before the press'); }
    // pre-moves: the pump fake, a flick (the step-back dribble opens its own shot window)
    let flickF = null;
    if (spec.flick && !spec.escape) { HG.flick(spec.flick); flickF = HG.frame; await waitSec(spec.flickWait ?? 0.15); }
    // the phase
    const ph = await waitPhase(spec.phase || 'any', spec.flick && !spec.escape ? 0.4 : 0.9, keepGoing);   // (inside the step-back dribble's 0.6 s shot window)
    o.phaseHit = ph.v || 'timeout';
    if (spec.lateral || spec.back) steerRim(Math.max(0.6, spec.mag || 0.9), spec.lateral || 0, spec.back || 0);
    // the press: the first drawn frame that can answer it is the next one
    if (spec.strip) HG.strip(spec.strip, 16, 2);   // (16 drawn frames, every 2nd, from the press: needs NODRAW unset)
    const pressF = HG.frame + 1; o.pressF = pressF; o.distAtPress = +distRim().toFixed(2);
    if (spec.escape) {
      // the R-stick map is relative to the ball hand (StickHandle.stickMoveFor reads handAfterMove): resolve 'downaway' / 'upaway' on this
      // frame, after any auto hand change has landed (no guard-hand crossing in the last 45 frames), never from a read taken earlier
      let fl = spec.flick;
      if (/away$/.test(fl)) {
        await watch(() => { const L = window.__LOG || []; for (let i = L.length - 1; i >= 0 && L[i].f >= HG.frame - 45; i--) if (/guard hand crosses/.test(L[i].m)) return null; return 1; }, 1.5);
        let hand = 'Right'; try { hand = S().carry().hand || 'Right'; } catch (e) { /* default */ }
        fl = (fl.startsWith('down') ? 'down' : 'up') + (hand === 'Left' ? 'right' : 'left'); o.hand = hand; o.pressF = HG.frame + 1;
      }
      o.flickAs = fl; if (fl === 'sweep') HG.sweep(); else if (fl !== 'none') HG.flick(fl);   // 'none': the trap's control (the handler holds)
    }
    else if (spec.pump) { HG.press('X'); await waitSec(0.1); HG.release('X'); o.pumpF = pressF; await waitSec(0.25); HG.press('X'); }   // the pump (the press IS the pick-up), then the step-through squeeze
    else { HG.press('X'); if (spec.double) { await waitSec(0.08); HG.release('X'); await waitSec(0.05); HG.press('X'); } }
    // hold to the green, then let go (a finish and a jumper both meter; a dunk just plays)
    if (!spec.escape) {
      const g = await watch(() => { keepGoingAfter(); const m = meterNow(); return m.t > 0 && m.t >= m.c ? 'green' : null; }, 1.6);
      HG.release('X'); o.releaseAt = HG.frame - pressF; o.green = !!g.v;
    }
    function keepGoingAfter() { if (spec.holdStick) keepGoing(); else if (!spec.lateral && !spec.back) HG.stick(0, 0); }
    // the trial ends 22 frames after the ball leaves the hand (the next trial's reset cancels the flight: a make would count toward the
    // 1v1's 11 and end the game), or tailF frames after the press
    let relSeen = null;
    await watch(() => { const n = ring.length; if (!spec.escape && relSeen === null && n > 1 && ring[n - 1].f > o.pressF && ring[n - 1].hold === '-' && (ring[n - 2].hold === 'L' || ring[n - 2].hold === 'R')) relSeen = ring[n - 1].f; return (relSeen !== null && HG.frame - relSeen >= 22) || HG.frame - o.pressF >= (spec.tailF || 100) ? 1 : null; }, 4);
    HG.stick(0, 0); HG.turbo(false); HG.release('X');
    const P0 = o.pressF; const f0 = P0 - 40, f1 = P0 + (spec.tailF || 100);
    o.frames = ring.filter((x) => x.f >= f0 && x.f <= f1);
    o.log = (window.__LOG || []).filter((l) => l.f >= fStart && l.f <= f1).map((l) => [l.f, l.m.slice(0, 200)]);
    o.flickF = flickF; o.fStart = fStart;
    return o;
  };
  // a CONTROL window: the standing dribble, nothing pressed (the ring's frames over `sec`)
  GX.idle = async (sec) => { HG.stick(0, 0); HG.turbo(false); const f0 = HG.frame + 1; await waitSec(sec); return { spec: { kind: 'idle' }, mode: MODE, pressF: f0 + 30, frames: ring.filter((x) => x.f >= f0), log: (window.__LOG || []).filter((l) => l.f >= f0).map((l) => [l.f, l.m.slice(0, 200)]) }; };
  GX.iHave = iHave; GX.distRim = distRim; GX.phaseNow = phaseNow; GX.bones = BONES;
  return 'gx ok ' + MODE + ' bones ' + bn.filter(Boolean).length + '/' + BONES.length;
})();
