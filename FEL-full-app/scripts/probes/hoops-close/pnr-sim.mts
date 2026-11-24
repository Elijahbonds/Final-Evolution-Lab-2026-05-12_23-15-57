// hoops-gap (lane/hoops-gap, 2026-11-23): THE PICK-AND-ROLL, HEADLESS — the AI's screen coverage against the 3v3 team offence.
// The rival-sim-3v3 rig (scripts/probes/hoops-gap/rival-sim-3v3.mts) with ALL THREE defenders AI: DefenderBrain on AiMovers (4.2 m/s),
// marked man to man, the 3v3 team defence (hoops/teamDefense: the switch on a screen, the double) re-marking them every frame — so the man
// on the ball is the brain whose screen coverage `hoops.pnrCoverageOn` changes. The offence is the real hoops/teamOffense3v3 (it calls
// screens: TeammateBrain's 'screen' job sets it, rolls or pops), the finish the shared shot model at the tier's hand (core/SharedShot,
// expected values, no draws), the contest the one model (hoops/contest contestOn), the block phase 2's geometry (the defender nearest the
// shooter jumps 0.22 s after the gather inside 2.4 m), a swing picked off by a defender within SWING_PICK_M of the ball.
// Not modelled: pokes (the brains' reach intents are ignored: no steals), fouls, boards.
//
// What it prints per tier: every possession, and THE PICK-AND-ROLL POSSESSIONS (a screen that was set): their count, points a PnR
// possession, the handler's contest at his release, how often the screener rolls and his best separation inside 5 m (the median over
// the rolls), how often the ROLL MAN GETS AN OPEN LOOK (rolling, inside 5 m of the rim, with no
// defender within KICK_OPEN_M 2.2 m of him for at least 0.2 s), how often he got the ball, switches and helps.
//   npx tsx scripts/probes/hoops-close/pnr-sim.mts [--n 300] [--tier pro|rookie|elite|all] [--seed 7] [--json out.json]
//   env: FEEL='{"hoops.pnrCoverageOn":1,"hoops.screenerRollOn":1}' (the coverage, the roll man; the four ways: HOOPS-GAP-PLAN §5.4)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { setFeelUser, setFeelSession, setFeelOverride } = await import(APP + '/lib/feel-panel/feel.ts');
setFeelUser(true); setFeelSession(null);
if (process.env.FEEL) for (const [k, v] of Object.entries(JSON.parse(process.env.FEEL))) setFeelOverride(k, Number(v));
const core = await import(APP + '/lib/babylon/core/BasketballCore.ts');
const { DefenderBrain, TeammateBrain, isThree } = core;
const { AiMover } = await import(APP + '/lib/babylon/core/AiMovement.ts');
const { driveIntent } = await import(APP + '/lib/babylon/core/DriveLine.ts');
const rules = await import(APP + '/lib/babylon/modes/threevthreeRules.ts');
const { THREEV_TIER, catchAndShoot, openness, rivalPoints, SWING_PICK_M, KICK_OPEN_M } = rules;
const { foeSpaceAngle } = await import(APP + '/lib/babylon/core/PossessionSwap.ts');
const { TeamOffense3v3 } = await import(APP + '/lib/babylon/hoops/teamOffense3v3.ts');
const { TeamDefense } = await import(APP + '/lib/babylon/hoops/teamDefense.ts');
const { meetsRelease, releaseFrom } = await import(APP + '/lib/babylon/hoops/blocks.ts');
const { contestOn } = await import(APP + '/lib/babylon/hoops/contest.ts');
const { expectedMake } = await import(APP + '/lib/babylon/core/SharedShot.ts');
const RB = await import(APP + '/lib/babylon/hoops/rulebook.ts');
const { Vector3 } = await import('@babylonjs/core');

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', '300')); const SEED = Number(arg('--seed', '7'));
const TIERS = arg('--tier', 'pro') === 'all' ? ['rookie', 'pro', 'elite'] : [arg('--tier', 'pro')];
const mkRng = (seed: number) => { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let r = Math.imul(s ^ (s >>> 15), 1 | s); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
const DT = 1 / 60;
const RIM = new Vector3(0, 3.05, -0.6), RIM_FLOOR = new Vector3(0, 0, -0.6);
const TELL = 0.35, HARD_GAP = 0.9, PASS_MPS = 14, DUNK_SHARE = 0.55;
const d2 = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

function sim(tier: string) {
  const rng = mkRng(SEED * 104729 + tier.length * 31);
  const knobs = THREEV_TIER[tier as 'pro'];
  const all: number[] = []; const pnr: number[] = []; const pnrContest: number[] = [];
  const phases: Record<string, number> = {}; const covF: Record<string, number> = {};
  const rollSep: number[] = []; let rolls = 0;
  let pnrN = 0, rollOpen = 0, rollGotBall = 0, rollPts = 0, switches = 0, helps = 0, blocks = 0, picks = 0, capped = 0;
  for (let p = 0; p < N; p++) {
    const foes = [0, 1, 2].map((i) => { const a = (-0.9 + i * 0.9) + (rng() - 0.5) * 0.5, r = 4.5 + rng() * 2.5; return new Vector3(Math.sin(a) * r, 0, RIM.z + Math.abs(Math.cos(a)) * r + 0.3); });
    const mine = foes.map((f) => { const t = RIM_FLOOR.subtract(f); t.y = 0; t.normalize(); return f.add(t.scale(1.1 + rng() * 0.4)); });
    let hi = Math.floor(rng() * 3);
    const foeMv = foes.map(() => new AiMover(3.8)); const myMv = mine.map(() => new AiMover(4.2));
    const myBr = mine.map((_, i) => new DefenderBrain(0.6, i, rng));
    let offBr = foes.map((_, i) => new TeammateBrain(foeSpaceAngle(i)));
    const teamD = new TeamDefense(); let marks: number[] = [0, 1, 2];
    const plan = new TeamOffense3v3(tier as 'pro', rules.TEAM_READS, rng); plan.beginPossession();
    let t = 0, end = ''; let pts = 0; let screenSet = false; let openF = 0, rollOpenHit = false, toRoller = false; let flight: { from: InstanceType<typeof Vector3>; to: InstanceType<typeof Vector3>; ti: number; t: number; T: number } | null = null;
    let touch: { kind: 'plan' | 'cs'; t: number; tell: string | null } | null = null; let screenIdx = -1; let jumper = -1, jumpAge = Infinity, gatherSeen = -1;
    let lastContest = NaN; let helpSaid = false; let rolled = false, rollBest = 0;
    const others = () => [0, 1, 2].filter((i) => i !== hi);
    const startTouch = (fresh: boolean) => {
      const intent = driveIntent({ defenderSet: true, aggression: 1, roll: rng });
      if (!fresh && catchAndShoot(openness(foes[hi], mine), d2(foes[hi], RIM_FLOOR), knobs, rng())) { touch = { kind: 'cs', t: 0, tell: 'jumper' }; return; }
      plan.beginTouch({ fresh, intent }); touch = { kind: 'plan', t: 0, tell: null }; screenIdx = -1;
    };
    startTouch(true);
    const decideFinish = (): 'dunk' | 'layup' | 'jumper' => {
      const near = Math.min(...mine.map((m) => d2(m, foes[hi])));
      const open = near > 1.6 || (near > 1.1 && rng() < 0.5);
      if (open && rng() < DUNK_SHARE) return 'dunk';
      return open || d2(foes[hi], RIM_FLOOR) < 2.4 ? 'layup' : 'jumper';
    };
    const release = (style: 'dunk' | 'layup' | 'jumper') => {
      const sh = foes[hi];
      if (style === 'dunk') { pts = 2 * 0.95; end = 'dunk'; return; }
      const toRim = RIM_FLOOR.subtract(sh); toRim.y = 0; const L = toRim.length() || 1;
      const ball = releaseFrom({ x: sh.x + toRim.x / L * 0.3, y: style === 'jumper' ? 1.75 : 1.7, z: sh.z + toRim.z / L * 0.3 }, 0, style);
      if (jumper >= 0 && meetsRelease({ x: mine[jumper].x, z: mine[jumper].z, jumpAge, handsUp: false }, ball, RIM, style).hit) { blocks++; end = 'block'; return; }
      const c = contestOn(mine.map((m, i) => ({ dist: d2(m, sh), facingCos: 1, handUp: false, jumpAge: i === jumper ? jumpAge : Infinity, closeMps: 0 })));
      lastContest = c.contest;
      pts = expectedMake(style, c.contest, d2(sh, RIM_FLOOR), RB.aiTimingSigmaSec(tier as never), RB.skillShotOn()) * rivalPoints(style, isThree(sh, RIM));
      end = 'shot';
    };
    for (; t < 30 && !end; t += DT) {
      const H = foes[hi];
      const ballAt = flight ? flight.from.add(flight.to.subtract(flight.from).scale(Math.min(1, flight.t / flight.T))) : H;
      // ── my team: the team defence re-marks, the brains play ──
      const td = teamD.step(DT, { marks, defenders: mine, attackers: foes, handler: flight ? null : hi, rim: RIM_FLOOR });
      if (td.event?.kind === 'switch') switches++;
      marks = [...td.marks];
      for (let i = 0; i < 3; i++) {
        myBr[i].setMark(td.play[i]);
        const it = myBr[i].decide(DT, mine[i], ballAt, RIM_FLOOR, mine, foes);
        if ((myBr[i] as { pnrTag?: boolean }).pnrTag && !helpSaid) { helpSaid = true; helps++; }   // a tag of the roll man (the coverage's)
        const cov = (myBr[i] as { pnrCoverage?: string | null }).pnrCoverage; if (cov) covF[cov] = (covF[cov] ?? 0) + 1;
        if (i === jumper && jumpAge < 0.75) continue;
        const st = myMv[i].stepIntent(DT, it); mine[i].addInPlace(st.vel.scale(DT));
      }
      if (jumpAge !== Infinity) jumpAge += DT;
      // ── their men off the ball ──
      for (let i = 0; i < 3; i++) {
        if (i === hi && !flight) continue;
        const it = offBr[i].decide(DT, foes[i], ballAt, RIM, foes, mine);
        foeMv[i].observe(foes[i], DT);
        const st = foeMv[i].stepIntent(DT, it); foes[i].addInPlace(st.vel.scale(DT));
      }
      // the roll man: rolling, inside 5 m, nobody within KICK_OPEN_M of him
      if (screenIdx >= 0 && !flight) {
        const si = others()[screenIdx]; const sc = offBr[si].screen;
        if (sc.phase === 'set') screenSet = true;
        phases[sc.phase] = (phases[sc.phase] ?? 0) + 1;
        if (sc.phase === 'roll') { rolled = true; if (d2(foes[si], RIM_FLOOR) < 5) rollBest = Math.max(rollBest, openness(foes[si], mine)); }
        if (sc.phase === 'roll' && d2(foes[si], RIM_FLOOR) < 5 && openness(foes[si], mine) >= KICK_OPEN_M) { if (++openF >= 12) rollOpenHit = true; } else openF = 0;
      }
      if (flight) {
        flight.t += DT;
        const b = flight.from.add(flight.to.subtract(flight.from).scale(Math.min(1, flight.t / flight.T)));
        if (flight.t > 0.12 && mine.some((m) => d2(m, b) < SWING_PICK_M)) { picks++; end = 'pick'; break; }
        if (flight.t >= flight.T) { hi = flight.ti; flight = null; offBr = foes.map((_, i) => new TeammateBrain(foeSpaceAngle(i))); startTouch(false); }
      } else if (touch) {
        touch.t += DT;
        if (touch.kind === 'cs') { if (touch.t >= TELL + 0.15) { release('jumper'); break; } if (touch.t >= 0.15 && gatherSeen < 0) gatherSeen = t; }
        else {
          const os = others();
          const view = { handler: H, handlerVel: foeMv[hi].vel, mates: os.map((i) => foes[i]), defenders: mine, rim: RIM_FLOOR,
            screen: screenIdx >= 0 ? { idx: screenIdx, phase: offBr[os[screenIdx]].screen.phase, at: foes[os[screenIdx]] } : null };
          foeMv[hi].observe(H, DT);
          const s = plan.step(DT, view);
          if (s.callScreen >= 0) { screenIdx = s.callScreen; offBr[os[screenIdx]].setJob('screen'); }
          if (s.pass >= 0) {
            const ti = os[s.pass]; plan.notePass();
            if (screenIdx >= 0 && s.pass === screenIdx && offBr[ti].screen.phase === 'roll') toRoller = true;
            flight = { from: H.clone(), to: foes[ti].clone(), ti, t: 0, T: d2(H, foes[ti]) / PASS_MPS }; continue;
          }
          const st = foeMv[hi].track(DT, s.wish); H.addInPlace(st.vel.scale(DT));
          if (s.gather) { touch.tell = plan.gatherFor === 'pullup' ? 'jumper' : decideFinish(); gatherSeen = t; }
          if (s.release) { release((touch.tell ?? 'layup') as 'dunk' | 'layup' | 'jumper'); break; }
        }
        // the block: the defender nearest the shooter jumps 0.22 s after the gather, inside 2.4 m
        if (gatherSeen >= 0 && jumper < 0 && t - gatherSeen >= 0.22) {
          let k = -1, bd = 2.4; mine.forEach((m, i) => { const dd = d2(m, H); if (dd < bd) { bd = dd; k = i; } });
          if (k >= 0) { jumper = k; jumpAge = 0; }
        }
      }
      // bodies keep the hard gap
      const bodies = [...mine, ...foes];
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j]; const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz);
        if (d < HARD_GAP && d > 1e-4) { const push = (HARD_GAP - d) / 2; a.x += dx / d * push; a.z += dz / d * push; b.x -= dx / d * push; b.z -= dz / d * push; }
      }
    }
    if (!end) capped++;
    all.push(pts);
    if (screenSet) { pnrN++; pnr.push(pts); if (Number.isFinite(lastContest)) pnrContest.push(lastContest); if (rollOpenHit) rollOpen++; if (rolled) { rolls++; rollSep.push(rollBest); } if (toRoller) { rollGotBall++; rollPts += pts; } }
  }
  return {
    tier, n: N, ptsPerPoss: +mean(all).toFixed(3), pnrN, ptsPerPnr: +mean(pnr).toFixed(3), pnrContestMed: +med(pnrContest).toFixed(2),
    rollPct: +(100 * rolls / Math.max(1, pnrN)).toFixed(1), rollSepMed: rollSep.length ? +med(rollSep).toFixed(2) : null,
    rollOpenPct: +(100 * rollOpen / Math.max(1, pnrN)).toFixed(1), rollGotBallPct: +(100 * rollGotBall / Math.max(1, pnrN)).toFixed(1),
    rollPtsPerTouch: rollGotBall ? +(rollPts / rollGotBall).toFixed(3) : null, switchesPerPnr: +(switches / Math.max(1, pnrN)).toFixed(2), tagsPerPnr: +(helps / Math.max(1, pnrN)).toFixed(2), blocks, picks, capped, phaseFrames: phases, coverageFrames: covF,
  };
}
const OUT: Record<string, unknown> = {};
for (const tier of TIERS) { const r = sim(tier); OUT[tier] = r; console.log(JSON.stringify(r)); }
const j = arg('--json', ''); if (j) fs.writeFileSync(j, JSON.stringify({ feel: process.env.FEEL ?? null, seed: SEED, ...OUT }, null, 1));
