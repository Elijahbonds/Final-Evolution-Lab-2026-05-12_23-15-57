// hoops-gather: the trial runner — the hoops-gap driver's `ext` scenario (../hoops-gap/drive.mjs, SCEN=ext, EXT=<this file>).
//
//   /home/user/wt/gate-run.sh 890 scripts/probes/hoops-gap/run-set.sh <site> <out> \
//     "onevone ext EXT=scripts/probes/hoops-gather/trials.mjs SET=gathers PHASES=top,floor NODRAW=1 TAG=g1"
//
// SET (comma list): control | gathers | finishes | escapes | strips (the frame strips of the worst moments, needs NODRAW unset)
// PHASES (comma list, default top,down,floor,up): the dribble phase each gather is pressed in. REPS (default 1).
// KINDS (comma list): only these trial kinds. MAX_TRIALS caps the run (the gate hold is the scarce thing).
// Writes <out>/gather-<mode>-<TAG>.json after every trial (a hold that runs out keeps what was done). Read it with ./analyze.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The trial table. Distances are planar metres from the rim's floor point; `mag` is the left stick toward the rim. */
export const KINDS = {
  // the gathers into a rise
  set:         { kind: 'set', mag: 0, settleSec: 0.7 },
  pullup:      { kind: 'pullup', mag: 0.75, untilDist: 4.9 },
  stepback:    { kind: 'stepback', mag: 0, flick: 'down', settleSec: 0.5 },
  hop:         { kind: 'hop', mag: 1, turbo: true, untilDist: 4.3, setup: 'poster' },
  // the footwork gathers into a finish
  euro:        { kind: 'euro', mag: 0.9, untilDist: 4.6, lateral: 1, setup: 'poster' },
  stepthrough: { kind: 'stepthrough', mag: 0.55, untilDist: 4.6, pump: true, setup: 'poster' },
  // the plain finishes and the dunk
  layup:       { kind: 'layup', mag: 0.9, untilDist: 2.6, setup: 'poster' },
  dunk:        { kind: 'dunk', mag: 1, turbo: true, untilDist: 3.0, setup: 'poster' },
  // the escapes (the flick IS the trial; no shot)
  esc_stepback:   { kind: 'esc_stepback', escape: true, flick: 'down', mag: 0, settleSec: 0.5, tailF: 70 },
  esc_snatchback: { kind: 'esc_snatchback', escape: true, flick: 'down', turbo: true, mag: 0, settleSec: 0.5, tailF: 70 },
  esc_btb:        { kind: 'esc_btb', escape: true, flick: 'downaway', mag: 0, settleSec: 0.5, tailF: 70 },
  esc_retreat:    { kind: 'esc_retreat', escape: true, flick: 'downaway', retreat: true, mag: 0.7, approachSec: 0.5, tailF: 70 },
  esc_momcross:   { kind: 'esc_momcross', escape: true, flick: 'upaway', turbo: true, mag: 0.6, untilDist: 4.8, tailF: 70 },
  esc_spin:       { kind: 'esc_spin', escape: true, flick: 'sweep', mag: 0.6, untilDist: 4.8, tailF: 70 },
  // the TRAP (3v3 only: hoops/teamDefense doubles a ball held in the paint): drive to 2.6 m, stop, wait for the double, then the escape
  trap_stepback:   { kind: 'trap_stepback', trap: true, escape: true, flick: 'down', mag: 0.8, untilDist: 2.6, tailF: 70 },
  trap_snatchback: { kind: 'trap_snatchback', trap: true, escape: true, flick: 'down', turbo: true, mag: 0.8, untilDist: 2.6, tailF: 70 },
  trap_spin:       { kind: 'trap_spin', trap: true, escape: true, flick: 'sweep', mag: 0.8, untilDist: 2.6, tailF: 70 },
  trap_btb:        { kind: 'trap_btb', trap: true, escape: true, flick: 'downaway', mag: 0.8, untilDist: 2.6, tailF: 70 },
  trap_hold:       { kind: 'trap_hold', trap: true, escape: true, flick: 'none', mag: 0.8, untilDist: 2.6, tailF: 70 },
};
const SETS = {
  gathers: ['set', 'pullup', 'stepback', 'hop', 'euro', 'stepthrough'],
  finishes: ['layup', 'dunk'],
  escapes: ['esc_stepback', 'esc_snatchback', 'esc_btb', 'esc_retreat', 'esc_momcross', 'esc_spin'],
  trap: ['trap_stepback', 'trap_snatchback', 'trap_spin', 'trap_btb', 'trap_hold'],
};

export default async function run({ ev, runFrames, waitGame, saveStrip, say, result, MODE, OUT }) {
  const TAG = process.env.TAG ?? 'run';
  const outFile = path.join(OUT, `gather-${MODE}-${TAG}.json`);
  const sets = (process.env.SET ?? 'control,gathers').split(',');
  const phases = (process.env.PHASES ?? 'top,down,floor,up').split(',');
  const reps = Number(process.env.REPS ?? 1);
  const only = process.env.KINDS ? new Set(process.env.KINDS.split(',')) : null;
  const maxTrials = Number(process.env.MAX_TRIALS ?? Infinity);
  const out = { mode: MODE, tag: TAG, sets, phases, trials: [], control: null, startedAt: new Date().toISOString() };
  // NODRAW=1 draws nothing, so the render watchdog (core/RenderWatchdog) reads a black frame, runs its rescue, and ~6 s later fails the
  // mode, which RE-MOUNTS it mid-run (measured on the first smoke run: '[FEL-READY] onevone → loading' at frame 509, every body
  // re-spawned, the ball frozen). Its 64×64 luma read is answered grey here — only that read, and only in a run that draws nothing.
  if (process.env.NODRAW === '1') await ev(() => { const C = window.CanvasRenderingContext2D; const g = C.prototype.getImageData; C.prototype.getImageData = function (x, y, w, h, ...r) { const d = g.call(this, x, y, w, h, ...r); if (w === 64 && h === 64) d.data.fill(128); return d; }; });
  say('gx: ' + await ev(fs.readFileSync(path.join(HERE, 'page-gather.js'), 'utf8')));
  out.bones = await ev(() => window.__gx.bones);
  const save = () => { out.hgErrors = null; fs.writeFileSync(outFile, JSON.stringify(out)); };
  const T = (spec) => ev((s) => window.__awaitFrames(window.__gx.trial(s)), spec);
  // the possession, set by the mode's own seam, and the check settled: the ball mine and dribbled, no replay running
  // a trip to the line (an and-one, a shooting foul off a drive) is a dead ball the seam does not cancel: shoot it out first (press,
  // let go at the line meter's green) — drive.mjs's possession loop does the same
  const tag = MODE === 'onevone' ? '1V1' : '3V3';
  const ftOut = async () => {
    for (let n = 0; n < 8; n++) {
      const open = await ev((t) => { const L = (window.__LOG || []).filter((l) => new RegExp('\\[' + t + '-FT\\]').test(l.m)); if (!L.length) return false; return !/done:|ended the game/.test(L[L.length - 1].m); }, tag);
      if (!open) return n;
      await waitGame(900); await ev(() => window.__hg.press('X')); await waitGame(120);   // let go at once: a made free throw is a point toward the 1v1's 11
      await ev(() => window.__hg.release('X')); await waitGame(1800);
    }
    return -1;
  };
  const fresh = async () => {
    const ft0 = await ftOut(); if (ft0) say(`fresh: shot ${ft0} free throw(s) out`);
    // assumption (flagged in the doc): the AI's strip / block / hand-up ROLLS are forced off with the mode's own dev seam (luck 0.99 =
    // no chance lands), so a drive is not stripped on the bump before its gather. What is measured is the body and the ball, not the
    // outcome; the defender is still on the floor, still moves, still bumps
    await ev(([m, lk]) => { const s = window.__FEL_DEV__.scene.metadata[m]; if (s.luck && lk !== 'off') s.luck(0.99); if (s.forceTie) s.forceTie(0, 85); s.offense(); }, [MODE, process.env.LUCK ?? '']);   // 3v3: the 90 s game clock and the score put back every trial (its own seam), or the game ends a third of the way in
    for (let i = 0; i < 40; i++) {
      await waitGame(250);
      const ok = await ev(() => { const L = window.__LOG || []; const f = window.__frameNo || 0; const replay = L.some((l) => /\[HOOPS-REPLAY\]/.test(l.m) && f - l.f < 360); return !replay && window.__gx.iHave() && window.__gx.phaseNow !== undefined; });
      if (ok && (await ftOut())) { await ev((m) => { window.__FEL_DEV__.scene.metadata[m].offense(); }, MODE); continue; }
      if (ok) { for (let k = 0; k < 24; k++) { if (await ev(() => { const r = window.__gx.ring; return r.length && r[r.length - 1].hold === '-'; })) break; await waitGame(250); } await waitGame(500); return true; }   // the live dribble: the check holds the ball ~2.7 s first
      if (i === 20) await ev((m) => { window.__FEL_DEV__.scene.metadata[m].offense(); }, MODE);
    }
    return false;
  };
  // THE CONTROL: the standing dribble with nothing pressed, recorded by BOTH this probe and the hoops-gap recorder (page.js) over the
  // same frames, so analyze.mjs can check its palm gaps and pops against the rig's own (the known-good instrument)
  if (sets.includes('control')) {
    await fresh();
    for (let i = 0; i < 24; i++) { if (await ev(() => window.__gx.ring.length && window.__gx.ring[window.__gx.ring.length - 1].hold === '-')) break; await waitGame(250); }   // the live dribble (the check holds the ball first)
    await ev(() => window.__hg.start());
    const idle = await ev(() => window.__awaitFrames(window.__gx.idle(3.0)));
    await ev(() => window.__hg.stop());
    const an = await ev(() => window.__hg.analyse({ popList: true }));
    out.control = { idle, hgBall: an.ball, hgMe: an.perBody.me ? { pops: an.perBody.me.pops, popList: an.perBody.me.popList, slideP90Cm: an.perBody.me.slideP90Cm, skates: an.perBody.me.skates } : null, hgF0: an.f0, hgFrames: an.frames };
    save(); say(`control: ${idle.frames.length} frames; rig apex palm med ${an.ball.apexPalmMedCm} cm over ${an.ball.apexPalmN} tops`);
  }
  // THE STRIPS: the worst moments, drawn (NODRAW unset). STRIP_KINDS=kind:phase,… ; each strip = 14 frames every 2 from the press − 8
  if (sets.includes('strips')) {
    for (const kp of (process.env.STRIP_KINDS ?? 'pullup:floor,euro:floor,stepback:floor').split(',')) {
      const [k, ph] = kp.split(':'); const base = KINDS[k]; if (!base) continue;
      if (!(await fresh())) { say('strip: no possession'); continue; }
      const name = `${k}-${ph}`;
      const tr = await T({ ...base, phase: ph, strip: name });
      tr.strip = name; out.trials.push(tr);
      await waitGame(200); const n = await saveStrip(name); say(`strip ${name}: ${n} frames`); save();
    }
  }
  const list = [];
  for (const s of sets) for (const k of SETS[s] ?? []) if (!only || only.has(k)) for (const ph of KINDS[k].escape ? ['any'] : phases) for (let r = 0; r < reps; r++) list.push({ ...KINDS[k], phase: ph, rep: r });
  if (process.env.SHUFFLE !== '0') { let s = 7; for (let i = list.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7fffffff; const j = s % (i + 1); [list[i], list[j]] = [list[j], list[i]]; } }   // (a fixed shuffle: one kind's trials are not all at the end of a cut run)
  say(`trials: ${list.length} (${sets.join('+')} × ${phases.join('/')})`);
  for (const [i, spec] of list.entries()) {
    if (i >= maxTrials) { out.cutAt = i; break; }
    if (await ev((m) => { const s = window.__FEL_DEV__.scene.metadata[m]; return !!(s.ended && s.ended()); }, MODE)) { say('the game ended: stopping at trial ' + i); out.cutAt = i; out.endedAtTrial = i; break; }
    if (!(await fresh())) { say('no possession for trial ' + i); out.trials.push({ spec, failed: 'no possession' }); continue; }
    // the 1v1 DRIVE trials start from the mode's own poster seam (me 5.2 m out on the line at speed, him 1.3 m off the rim between me and
    // it): from the check the AI walls the drive at arm's length and the hero runs in place at ~5.9 m (measured: 22 of 32 drive trials
    // pressed a jumper there). His feet and his reads are his own from the next frame on.
    if (spec.setup === 'poster' && MODE === 'onevone') await ev(() => window.__FEL_DEV__.scene.metadata.onevone.poster());
    const t0 = Date.now();
    try { const tr = await T(spec); out.trials.push(tr); say(`trial ${i} ${spec.kind}/${spec.phase}: hit ${tr.phaseHit} press@${tr.distAtPress} m, ${tr.frames.length} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s wall; ${(tr.log.find((l) => /\[(1V1|3V3)-(MOVE|SHOT|STICK|HANDLE)\]|DUNK/.test(l[1])) || [0, '-'])[1].slice(0, 80)}`); }
    catch (e) { out.trials.push({ spec, failed: String(e).slice(0, 200) }); say('trial failed ' + e); }
    save();
  }
  out.endedAt = new Date().toISOString(); save();
  result.gatherFile = outFile;
}
