// hoops-p03: the 3v3 half of rival-sim.mts — their possession, headless, on the REAL brains and modules:
//   · their handler: hoops/teamOffense3v3 (TeamOffense3v3) on an AiMover (FOE_RUN_MPS 3.8; the attack's wish is tracked as given), or the
//     release's lerped drive (`team: false`: driveFraction / driveSecFor / AccelFollower / driveLateral / the kick read — ThreeVThreeMode's
//     opponentPossession, line for line in its geometry);
//   · their men off the ball: TeammateBrain (core/BasketballCore) on foeSpaceAngle lanes (Aware3v3's swap), the screener on its 'screen' job;
//   · my team: me = the rig's scripted defender (page.js: the hero's DribbleController steered to 1.0 m in front of the driver; a poke every
//     0.6–1.6 s inside 1.6 m at 50 %, read by hoops/steals driveStrip; a block jump 220 ms after the gather), my mates = DefenderBrain(0)
//     on assignMateMarks (Aware3v3), AiMover(4.2);
//   · bodies keep a 0.9 m hard gap (BodySeparation's hoops.bodyHardGapM); a swing flies at PASS_SPEED.chest and a body of mine within
//     SWING_PICK_M of the ball picks it off; the catch-and-shoot is threevthreeRules.catchAndShoot; the finish is the mode's decideFinish
//     (nerve at even: aggression 1); the block hoops/blocks meetsRelease; the contest hoops/contest contestOn; the make chance
//     threevthreeRules.rivalReleasePct (untouched).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const core = await import(APP + '/lib/babylon/core/BasketballCore.ts');
const { DribbleController, DefenderBrain, TeammateBrain, isThree } = core;
const { AiMover, AccelFollower, driveFraction, driveSecFor } = await import(APP + '/lib/babylon/core/AiMovement.ts');
const { driveLateral, driveIntent } = await import(APP + '/lib/babylon/core/DriveLine.ts');
const rules = await import(APP + '/lib/babylon/modes/threevthreeRules.ts');
const { THREEV_TIER, cutOff, kickTarget, catchAndShoot, openness, rivalReleasePct, rivalPoints, KICK_READ_FROM_K, KICK_READ_TO_K, SWING_PICK_M } = rules;
const { assignMateMarks, foeSpaceAngle } = await import(APP + '/lib/babylon/core/PossessionSwap.ts');
const { TeamOffense3v3, crossesHand } = await import(APP + '/lib/babylon/hoops/teamOffense3v3.ts');
const { moveFrame, windowedVariety } = await import(APP + '/lib/babylon/hoops/rivalOffense.ts');
const { meetsRelease, releaseFrom } = await import(APP + '/lib/babylon/hoops/blocks.ts');
const { contestOn, closingSpeed } = await import(APP + '/lib/babylon/hoops/contest.ts');
const { driveStrip } = await import(APP + '/lib/babylon/hoops/steals.ts');
const { Vector3 } = await import('@babylonjs/core');

const mkRng = (seed: number) => { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let r = Math.imul(s ^ (s >>> 15), 1 | s); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
const DT = 1 / 60;
const RIM = new Vector3(0, 3.05, -0.6), RIM_FLOOR = new Vector3(0, 0, -0.6);
const TELL = 0.35, DRIVE_MPS = 5.4, DUNK_SHARE = 0.55, HARD_GAP = 0.9, PASS_MPS = 14;
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const p99 = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.99))] : NaN; };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const d2 = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

type Opts = { n: number; team: boolean; seed: number; def: string };
export async function sim3v3(tier: string, o: Opts) {
  const rng = mkRng(o.seed * 104729 + tier.length * 31);
  const knobs = THREEV_TIER[tier as 'pro'];
  const poss: string[][] = []; const lens: number[] = []; const driverAcc: number[] = [];
  const shots: Record<string, number[]> = {}; const pts: number[] = [];
  let screenOr2Pass = 0, steals = 0, picks = 0, blocks = 0, capped = 0, passesTot = 0, screensTot = 0;
  for (let p = 0; p < o.n; p++) {
    // bodies: their three around the paint (they were defending), my three a step off them
    const foes = [0, 1, 2].map((i) => { const a = (-0.9 + i * 0.9) + (rng() - 0.5) * 0.5, r = 2 + rng() * 3.5; return new Vector3(Math.sin(a) * r, 0, RIM.z + Math.abs(Math.cos(a)) * r + 0.3); });
    const mine = foes.map((f) => { const t = RIM_FLOOR.subtract(f); t.y = 0; t.normalize(); return f.add(t.scale(1.0 + rng() * 0.6)).add(new Vector3((rng() - 0.5) * 0.6, 0, 0)); });
    let hi = Math.floor(rng() * 3);   // the man with the ball (a random one of three — the release's pick)
    // me guards the handler: put me on him
    { const t = RIM_FLOOR.subtract(foes[hi]); t.y = 0; t.normalize(); const tmp = mine[0]; const j = hi; mine[0] = mine[j]; mine[j] = tmp; mine[0] = foes[hi].add(t.scale(1.2)); }
    const meCtl = new DribbleController(); meCtl.setFacing(0);
    const foeMv = foes.map(() => new AiMover(3.8)); const mateMv = [new AiMover(4.2), new AiMover(4.2)];
    const mateBr = [new DefenderBrain(0, null, rng), new DefenderBrain(0, null, rng)];
    let offBr = foes.map((_, i) => new TeammateBrain(foeSpaceAngle(i)));
    const remark = () => { const m = assignMateMarks([mine[1], mine[2]], foes, hi); mateBr.forEach((b, i) => b.setMark(m[i])); offBr = foes.map((_, i) => new TeammateBrain(foeSpaceAngle(i))); };
    remark();
    const plan = new TeamOffense3v3(tier as 'pro', rng); plan.beginPossession();
    const acts: string[] = []; let passes = 0, screens = 0;
    let meStun = 0, jumpAge = Infinity, nextPoke = 0.5 + rng() * 0.9, gatherSeen = -1, jumped = false;
    let t = 0, end = '';
    // the touch
    type Touch = { kind: 'plan' | 'legacy' | 'cs'; t: number; from?: typeof foes[0]; end?: typeof foes[0]; len?: number; sec?: number; v0?: number; bend?: InstanceType<typeof AccelFollower>; dir?: typeof foes[0]; kickRolled?: boolean; tell?: string | null; intent?: string };
    let touch: Touch | null = null;
    let flight: { from: typeof foes[0]; to: typeof foes[0]; ti: number; t: number; T: number } | null = null;
    let screenIdx = -1;
    let prevH = foes[hi].clone(), prevV = new Vector3(0, 0, 0);
    const startTouch = (fresh: boolean) => {
      const intent = driveIntent({ defenderSet: meCtl.vel.length() < 0.6, aggression: 1, roll: rng });
      if (!fresh && catchAndShoot(openness(foes[hi], mine), d2(foes[hi], RIM_FLOOR), knobs, rng())) { touch = { kind: 'cs', t: 0 }; return; }
      if (o.team) { plan.beginTouch({ fresh, intent }); touch = { kind: 'plan', t: 0 }; screenIdx = -1; return; }
      const from = foes[hi].clone(); const end = new Vector3(RIM.x, 0, RIM.z + 0.9); const dir = end.subtract(from); dir.y = 0; const L = dir.length() || 1; dir.scaleInPlace(1 / L);
      let sec = Math.min(1.6, Math.max(0.8, L / DRIVE_MPS));
      const v0 = foeMv[hi].vel.x * dir.x + foeMv[hi].vel.z * dir.z, v0a = foeMv[hi].vel.x * dir.z - foeMv[hi].vel.z * dir.x;
      sec = driveSecFor(L, sec, v0);
      const bend = new AccelFollower(); bend.reset(0, v0a);
      touch = { kind: 'legacy', t: 0, from, end, len: L, sec, v0, bend, dir, kickRolled: false, tell: null, intent };
    };
    startTouch(true);
    const decideFinish = (): 'dunk' | 'layup' | 'jumper' => {
      const near = Math.min(...mine.map((m) => d2(m, foes[hi])));
      const lane = 1.6;
      const open = near > lane || (near > lane * 0.69 && rng() < 0.5);
      if (open && rng() < DUNK_SHARE) return 'dunk';
      return open || d2(foes[hi], RIM_FLOOR) < 2.4 ? 'layup' : 'jumper';
    };
    const release = (style: 'dunk' | 'layup' | 'jumper', pullUp: boolean) => {
      const sh = foes[hi]; const dd = d2(mine[0], sh);
      if (style === 'dunk') { (shots.dunk ??= []).push(NaN); acts.push('dunk'); end = 'dunk'; return; }
      const toRim = RIM_FLOOR.subtract(sh); toRim.y = 0; const L = toRim.length() || 1;
      const ball = releaseFrom({ x: sh.x + toRim.x / L * 0.3, y: style === 'jumper' ? 1.75 : 1.7, z: sh.z + toRim.z / L * 0.3 }, 0, style);
      if (meetsRelease({ x: mine[0].x, z: mine[0].z, jumpAge, handsUp: false }, ball, RIM, style).hit) { blocks++; acts.push(style === 'layup' ? 'layup' : 'pull_up'); end = 'block'; return; }
      const c = contestOn(mine.map((m, i) => ({ dist: d2(m, sh), facingCos: 1, handUp: false, jumpAge: i === 0 ? jumpAge : Infinity, closeMps: i === 0 ? closingSpeed(m, meCtl.vel, sh) : 0 })));
      const pct = rivalReleasePct({ style, pullUp, distToRim: d2(sh, RIM_FLOOR), defenseFactor: c.contest, ground: 0, mistake: 1 }, knobs);
      const key = style === 'layup' ? 'layup' : pullUp ? 'jumper_cs' : 'jumper';
      (shots[key] ??= []).push(pct); pts.push(pct * rivalPoints(style, isThree(sh, RIM)));
      acts.push(style === 'layup' ? 'layup' : 'pull_up');
      end = 'shot'; void dd;
    };
    for (; t < 30 && !end; t += DT) {
      const H = foes[hi];
      // ── me: the rig's bot defender on the driver ──
      const seenH = H;
      const rx = RIM.x - seenH.x, rz = RIM.z - seenH.z, rl = Math.hypot(rx, rz) || 1;
      const target = flight ? flight.to : seenH;
      const gx = target.x + rx / rl * 1.0, gz = target.z + rz / rl * 1.0; const ex = gx - mine[0].x, ez = gz - mine[0].z, el = Math.hypot(ex, ez);
      const mag = meStun > 0 || jumpAge < 0.75 ? 0 : el < 0.15 ? 0 : Math.min(1, 0.3 + el);
      meCtl.update(DT, el > 1e-4 ? ex / el * mag : 0, el > 1e-4 ? -ez / el * mag : 0, false);
      mine[0].addInPlace(meCtl.vel.scale(DT));
      meStun = Math.max(0, meStun - DT); if (jumpAge !== Infinity) jumpAge += DT;
      // ── my mates ──
      const ballAt = flight ? flight.from.add(flight.to.subtract(flight.from).scale(Math.min(1, flight.t / flight.T))) : H;
      for (let i = 0; i < 2; i++) { const it = mateBr[i].decide(DT, mine[i + 1], ballAt, RIM, mine, foes); const st = mateMv[i].stepIntent(DT, it); mine[i + 1].addInPlace(st.vel.scale(DT)); }
      // ── their men off the ball ──
      for (let i = 0; i < 3; i++) {
        if (i === hi && !flight) continue;
        const it = offBr[i].decide(DT, foes[i], ballAt, RIM, foes, mine);
        foeMv[i].observe(foes[i], DT);
        const st = foeMv[i].stepIntent(DT, it); foes[i].addInPlace(st.vel.scale(DT));
      }
      // ── the pass in the air ──
      if (flight) {
        flight.t += DT;
        const b = flight.from.add(flight.to.subtract(flight.from).scale(Math.min(1, flight.t / flight.T)));
        if (flight.t > 0.12 && mine.some((m) => d2(m, b) < SWING_PICK_M)) { picks++; end = 'pick'; break; }
        if (flight.t >= flight.T) { hi = flight.ti; flight = null; remark(); startTouch(false); prevH = foes[hi].clone(); }
      } else if (touch) {
        // ── the handler ──
        touch.t += DT;
        let gatherNow = false, k = 0.05, phase: 'drive' | 'gather' | 'check' = 'drive', moveExp = 0;
        if (touch.kind === 'cs') { phase = touch.t >= 0.15 ? 'gather' : 'check'; if (touch.t >= TELL + 0.15) { release('jumper', true); break; } }
        else if (touch.kind === 'plan') {
          const view = { handler: H, handlerVel: foeMv[hi].vel, mates: [0, 1, 2].filter((i) => i !== hi).map((i) => foes[i]), defenders: mine, rim: RIM_FLOOR,
            screen: screenIdx >= 0 ? { idx: screenIdx, phase: offBr[[0, 1, 2].filter((i) => i !== hi)[screenIdx]].screen.phase, at: foes[[0, 1, 2].filter((i) => i !== hi)[screenIdx]] } : null };
          foeMv[hi].observe(H, DT);
          const s = plan.step(DT, view);
          if (s.action) acts.push(s.action);
          if (s.callScreen >= 0) { screenIdx = s.callScreen; screens++; offBr[[0, 1, 2].filter((i) => i !== hi)[screenIdx]].setJob('screen'); }
          if (s.pass >= 0) {
            const ti = [0, 1, 2].filter((i) => i !== hi)[s.pass]; plan.notePass(); acts.push('swing_pass'); passes++;
            flight = { from: H.clone(), to: foes[ti].clone(), ti, t: 0, T: d2(H, foes[ti]) / PASS_MPS }; continue;
          }
          const st = foeMv[hi].track(DT, s.wish); H.addInPlace(st.vel.scale(DT));
          k = s.k; phase = s.phase === 'gather' || s.phase === 'done' ? 'gather' : 'drive';
          gatherNow = !!s.gather;
          if (s.release) { const plan2 = plan.gatherFor === 'pullup' ? 'jumper' : (touch.tell as 'dunk' | 'layup' | 'jumper'); release(plan2 ?? 'layup', false); break; }
          if (gatherNow) touch.tell = plan.gatherFor === 'pullup' ? 'jumper' : decideFinish();
          // the probe move's exposure: the carry path's (a crossing move's ball crosses in the 1v1 window)
          if (s.move && crossesHand(s.move)) touch.intent = 'x' + s.move;
          void moveExp; void moveFrame;
        } else {
          // the release's lerped drive
          const T = touch.sec!, kk = Math.min(1, touch.t / T); k = kk;
          if (!touch.tell && kk >= 1 - TELL / T) { touch.tell = decideFinish(); gatherNow = true; }
          if (touch.tell) phase = 'gather';
          if (!touch.kickRolled && !touch.tell && passes < knobs.maxPasses && kk >= KICK_READ_FROM_K && kk <= KICK_READ_TO_K && cutOff(H, touch.dir!, mine)) {
            touch.kickRolled = true;
            const others = [0, 1, 2].filter((i) => i !== hi);
            const pick = kickTarget(H, others.map((i) => foes[i]), mine);
            if (pick >= 0 && rng() < knobs.kickChance) { const ti = others[pick]; acts.push('swing_pass'); passes++; flight = { from: H.clone(), to: foes[ti].clone(), ti, t: 0, T: d2(H, foes[ti]) / PASS_MPS }; continue; }
          }
          const u = driveFraction(kk * T, T, touch.len!, undefined, touch.v0);
          const bx = touch.from!.x + (touch.end!.x - touch.from!.x) * u, bz = touch.from!.z + (touch.end!.z - touch.from!.z) * u;
          const bend = touch.bend!.step(driveLateral({ at: { x: bx, z: bz }, defender: mine[0], dir: touch.dir!, k: kk, intent: touch.intent as 'around' }), DT);
          H.x = bx + touch.dir!.z * bend; H.z = bz - touch.dir!.x * bend;
          if (kk >= 1) { release(touch.tell as 'dunk' | 'layup' | 'jumper', false); break; }
          if (!acts.includes('drive') && touch.t > 0.3) acts.push('drive');
        }
        // the poke (the bot) — hoops/steals driveStrip on his real motion
        const dd = d2(mine[0], H);
        if (gatherNow && gatherSeen < 0) gatherSeen = t;
        if (phase === 'gather' && gatherSeen < 0) gatherSeen = t;
        if (!jumped && gatherSeen >= 0 && t - gatherSeen >= 0.22 && dd < 2.4) { jumped = true; jumpAge = 0; }
        if (dd < 1.6 && t >= nextPoke && meStun === 0 && jumpAge === Infinity) {
          nextPoke = t + 0.6 + rng() * 1.0;
          if (rng() < 0.5) {
            const v = foeMv[hi].vel; const moving = touch.kind === 'plan' ? v : new Vector3((H.x - prevH.x) / DT, 0, (H.z - prevH.z) / DT);
            const r = driveStrip({ moveExposed01: 0, velX: moving.x, velZ: moving.z, toRimX: RIM.x - H.x, toRimZ: RIM.z - H.z, phase: touch.kind === 'cs' ? 'check' : phase, bumpAge: Infinity, dist: dd });
            if (r.connects) { steals++; end = 'steal'; break; } else meStun = 0.45;
          }
        }
        void k;
      }
      // ── the bodies' hard gap ──
      const all = [...mine, ...foes];
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j]; const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz);
        if (d < HARD_GAP && d > 1e-4) { const push = (HARD_GAP - d) / 2; a.x += dx / d * push; a.z += dz / d * push; b.x -= dx / d * push; b.z -= dz / d * push; }
      }
      // the handler's root acceleration (what the rig's motion read measures)
      if (!flight) {
        const v = new Vector3((foes[hi].x - prevH.x) / DT, 0, (foes[hi].z - prevH.z) / DT);
        if (t > 0.1) driverAcc.push(Math.hypot(v.x - prevV.x, v.z - prevV.z) / DT);
        prevV = v;
      }
      prevH = foes[hi].clone();
    }
    if (!end) capped++;
    lens.push(t); poss.push(acts); passesTot += passes; screensTot += screens;
    if (screens >= 1 || passes >= 2) screenOr2Pass++;
  }
  const v = windowedVariety(poss, 10);
  const mix: Record<string, number> = {}; for (const a of poss.flat()) mix[a] = (mix[a] ?? 0) + 1;
  return {
    mode: '3v3', tier, team: o.team, n: o.n,
    variety10: { distinctMean: +v.distinctMean.toFixed(2), distinctMin: v.distinctMin, bitsMean: +v.bitsMean.toFixed(2), bitsMin: +v.bitsMin.toFixed(2) },
    possSec: { med: +med(lens).toFixed(2), p25: +[...lens].sort((a, b) => a - b)[Math.floor(lens.length * 0.25)].toFixed(2), p75: +[...lens].sort((a, b) => a - b)[Math.floor(lens.length * 0.75)].toFixed(2) },
    screenOr2PassPct: +(100 * screenOr2Pass / o.n).toFixed(1), passesPerPoss: +(passesTot / o.n).toFixed(2), screensPerPoss: +(screensTot / o.n).toFixed(2),
    makePct: Object.fromEntries(Object.entries(shots).map(([k, a]) => [k, { n: a.length, pct: a.some((x) => Number.isFinite(x)) ? +(100 * mean(a.filter((x) => Number.isFinite(x)))).toFixed(1) : null }])),
    ptsPerShot: +mean(pts).toFixed(3),
    steals, picks, blocks, capped, mix, driverAccelP99: +p99(driverAcc).toFixed(1),
  };
}
export function print(r: Awaited<ReturnType<typeof sim3v3>>) {
  console.log(`3v3 ${r.tier.padEnd(6)} team ${r.team ? 1 : 0}: variety/10 ${r.variety10.distinctMean} (min ${r.variety10.distinctMin}) bits ${r.variety10.bitsMean} (min ${r.variety10.bitsMin}) | poss med ${r.possSec.med}s [${r.possSec.p25}–${r.possSec.p75}] | screen-or-2-passes ${r.screenOr2PassPct}% (passes ${r.passesPerPoss}, screens ${r.screensPerPoss}) | make ${JSON.stringify(r.makePct)} pts/shot ${r.ptsPerShot} | steals ${r.steals} picks ${r.picks} blocks ${r.blocks} capped ${r.capped} | driver accel p99 ${r.driverAccelP99}`);
  console.log(`           mix ${JSON.stringify(r.mix)}`);
}
