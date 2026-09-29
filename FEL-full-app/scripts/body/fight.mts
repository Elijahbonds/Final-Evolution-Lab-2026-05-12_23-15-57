// fight — the fight read's full-grid report (movement play P7, PLAN-P7 §6): every class, every camera condition, the
// misfires, the southpaw mirror and the owner's dance takes → ~/Claude/outbox/finish-release/movementplay/p7/FIGHT.md.
// The vitest subset of the same numbers is lib/pose/fightGate.test.ts; the engine seams, lib/babylon/combat/*.gate.test.ts.
//
//   node node_modules/tsx/dist/cli.mjs scripts/body/fight.mts [--seeds 4,5,6] [--out FILE] [--no-dance] [--quick]
//
// THE GRID. fps 15 / 20 / 24 / 30 × noise 1× / 1.5× × wrist blur off / on × the TEST seeds (4–6: the thresholds were set
// on 1–3 and 7–12), every cell with the dropouts (2 % dropped, 1 % missed, a 150 ms hole every ~3 s). HELD OUT, AND WHAT
// IS NOT (the review, 2026-09-26): a seed re-draws the SCRIPTED takes' paths (fightTakes' `vary`), so the test seeds'
// scripted numbers are out of sample; the CAPTURE clips are the same clips on every seed and several thresholds cite
// them by name — in sample. The report keeps the two apart everywhere, and counts the negatives' misfires on the TRAIN
// seeds too (`--train-seeds`), so a gap the test seeds happen to miss is still written down. LATENCY does not
// change what the reader reads — it runs on the capture clock (fightGrade: each frame's `t`), so the events and their
// onsets are the same at 80, 140 and 200 ms (checked: the misfire lists of the three latencies were identical, cell for
// cell) — so each cell is read once at 140 ms and the arrival figure is given for 80 / 140 / 200 by adding the latency.
// The dance corpus is the owner's 43 DeepMotion takes (~/Downloads/fel-mocap-sources/deepmotion, 981 s): no strike is
// labelled in them, so every fight event a mode would take there is counted, per minute (the plan's stress corpus).
// Nothing here writes into the repo; the BVH never leaves the Mac (joint numbers are read and dropped).
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import * as gradeNs from '../../lib/pose/fightGrade.ts';
import * as takesNs from '../../lib/pose/fightTakes.ts';
import * as synthNs from '../../lib/pose/synth.ts';
import { readBvhStream } from '../mocap/sources.mts';
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const G = unwrap(gradeNs), T = unwrap(takesNs), S = unwrap(synthNs);
type FightTake = gradeNs.FightTake; type FightTally = gradeNs.FightTally;

const args = process.argv.slice(2);
const arg = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SEEDS = arg('--seeds', '4,5,6').split(',').map(Number);
const TRAIN = arg('--train-seeds', '1,2,3,7,8,9,10,11,12').split(',').map(Number).filter((x) => Number.isFinite(x) && x > 0);
const OUT = arg('--out', join(homedir(), 'Claude/outbox/finish-release/movementplay/p7/FIGHT.md'));
const QUICK = args.includes('--quick');
const FPS = QUICK ? [30, 15] : [15, 20, 24, 30];
const NOISES = QUICK ? [1] : [1, 1.5];
const LAT = [80, 140, 200];

const dir = join(process.cwd(), 'lib/pose/__fixtures__/fight');
const REAL: FightTake[] = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => T.takeOfFixture(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
const kitOf = (seed: number) => [...T.scriptedTakes(seed, 'L'), ...T.scriptedTakes(seed, 'R')];
/** A negative's kind; a stretch, claps and the low guard's raise count blows and kicks only (a guard reached on the way,
 *  or the raise itself, is not a strike). */
const negKind = (name: string) => (/wavefront/.test(name) ? 'wave in front' : /wave/.test(name) ? 'wave' : /stretch/.test(name) ? 'stretch' : /clap/.test(name) ? 'claps'
  : /armswing/.test(name) ? 'arm swings' : /guardlow/.test(name) ? 'low guard raised' : /jog/.test(name) ? 'jog' : /idle/.test(name) ? 'fight stance' : 'rest');
const blowsOnly = (k: string) => k === 'stretch' || k === 'claps' || k === 'low guard raised';
function negMisfires(tk: FightTake, g: ReturnType<typeof G.matchFight>): number {
  const k = negKind(tk.name);
  return g.misfires.filter((x) => !blowsOnly(k) || x.e.kind === 'blow' || x.e.kind === 'legKick').length;
}

const GROUPS: [string, string[]][] = [
  ['strikes', ['jab', 'cross', 'hookL', 'hookR', 'uppercutL', 'uppercutR', 'front', 'round']],
  ['guard raise', ['raise']], ['evades', ['slipL', 'slipR', 'duck']], ['steps in / out', ['in', 'out']], ['steps across', ['left', 'right']],
];
const CLASSES = GROUPS.flatMap(([, c]) => c);
const pc = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}` : '–');
const ms = (x: number) => (Number.isFinite(x) ? `${Math.round(x)}` : '–');
function grp(t: FightTally, classes: string[]) {
  let tp = 0, fn = 0, fp = 0; const on: number[] = [], de: number[] = [];
  for (const k of classes) { const c = t.classes[k]; if (!c) continue; tp += c.tp; fn += c.fn; fp += c.fp; on.push(...c.onset.map(Math.abs)); de.push(...c.delay); }
  return { r: tp + fn ? tp / (tp + fn) : NaN, p: tp + fp ? tp / (tp + fp) : NaN, n: tp + fn, on, de };
}

interface CellOut { fps: number; noise: number; blur: boolean; pos: FightTally; real: FightTally; negMis: Record<string, number>; negSec: Record<string, number>; trainMis: Record<string, number>; mirror?: FightTally }
const cells: CellOut[] = [];
const t0 = Date.now();
for (const fps of FPS) for (const noise of NOISES) for (const blur of [false, true]) {
  const pos = G.newTally(), real = G.newTally(), negMis: Record<string, number> = {}, negSec: Record<string, number> = {}, trainMis: Record<string, number> = {};
  let mirror: FightTally | undefined;
  for (const seed of SEEDS) {
    const takes = [...REAL, ...kitOf(seed)];
    for (const tk of takes) {
      const st = G.fightStream(tk, { fps, latencyMs: 140, noise, blur, seed });
      const g = G.matchFight(st, G.readFight(st.frames), tk);
      if (tk.role === 'positive') G.addTally(tk.source === 'real' ? real : pos, g);
      if (tk.role === 'negative' || /guardlow/.test(tk.name)) {
        const k = negKind(tk.name);
        negMis[k] = (negMis[k] ?? 0) + negMisfires(tk, g);
        negSec[k] = (negSec[k] ?? 0) + (st.to - st.from) / 1000;
      }
    }
    if (fps === 30 && noise === 1 && !blur) {
      mirror ??= G.newTally();
      for (const tk of REAL.filter((x) => x.role === 'positive')) { const m = T.mirrorTake(tk); const st = G.fightStream(m, { fps, latencyMs: 140, noise, blur, seed }); G.addTally(mirror, G.matchFight(st, G.readFight(st.frames), m)); }
    }
  }
  // the negatives on the TRAIN seeds (their scripted gestures drawn afresh; the capture negatives re-noised)
  for (const seed of TRAIN) for (const tk of [...REAL.filter((x) => x.role === 'negative'), ...kitOf(seed).filter((x) => x.role === 'negative' || /guardlow/.test(x.name))]) {
    const st = G.fightStream(tk, { fps, latencyMs: 140, noise, blur, seed });
    const k = negKind(tk.name);
    trainMis[k] = (trainMis[k] ?? 0) + negMisfires(tk, G.matchFight(st, G.readFight(st.frames), tk));
  }
  cells.push({ fps, noise, blur, pos, real, negMis, negSec, trainMis, mirror });
  console.log(`[fight] ${fps} fps noise ${noise}${blur ? ' blur' : ''}: scripted strikes R ${pc(grp(pos, GROUPS[0][1]).r)} P ${pc(grp(pos, GROUPS[0][1]).p)} · captures R ${pc(grp(real, GROUPS[0][1]).r)} P ${pc(grp(real, GROUPS[0][1]).p)} · misfires ${JSON.stringify(negMis)} · train ${JSON.stringify(trainMis)} (${Math.round((Date.now() - t0) / 1000)} s)`);
}

// ── the dance corpus ──
interface Dance { name: string; sec: number; events: Record<string, number> }
const dances: Dance[] = [];
const DM = join(homedir(), 'Downloads/fel-mocap-sources/deepmotion');
if (!args.includes('--no-dance') && existsSync(DM)) {
  for (const f of readdirSync(DM).filter((x) => x.endsWith('.bvh')).sort()) {
    try {
      const stream = readBvhStream(join(DM, f), 'deepmotion');
      const { clip } = S.toRoom({ fps: stream.fps, frames: stream.frames }, { scale: 0.01, toeExtend: 0.05, yawDeg: 'auto', travel: 'keep' });
      const take: FightTake = { name: basename(f, '.bvh'), role: 'negative', source: 'real', clip, labels: [] };
      const st = G.fightStream(take, { fps: 30, latencyMs: 140, noise: 1, blur: false, seed: SEEDS[0] });
      const g = G.matchFight(st, G.readFight(st.frames), take);
      const ev: Record<string, number> = {};
      for (const x of g.misfires) { const k = x.e.kind === 'blow' ? `blow:${x.e.name}` : x.e.kind === 'legKick' ? `kick:${x.e.form}` : x.e.kind === 'evade' ? `evade:${x.e.form}` : x.e.kind === 'guard' ? 'guard' : x.e.kind; ev[k] = (ev[k] ?? 0) + 1; }
      dances.push({ name: take.name, sec: (st.to - st.from) / 1000, events: ev });
    } catch (e) { console.log(`[fight] dance ${f}: ${(e as Error).message}`); }
  }
  console.log(`[fight] dance corpus: ${dances.length} takes, ${Math.round(dances.reduce((a, d) => a + d.sec, 0))} s`);
}

// ── the report ──
const L: string[] = [];
const cellName = (c: CellOut) => `${c.fps} fps${c.noise !== 1 ? ` · noise ${c.noise}×` : ''}${c.blur ? ' · blur' : ''}`;
L.push('# FIGHT — the combat read on the synthetic grid (movement play P7)', '');
L.push(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} by \`scripts/body/fight.mts\`${QUICK ? ' (--quick)' : ''} · TEST seeds ${SEEDS.join(', ')} (thresholds set on 1–3 and 7–12) · ${REAL.length} capture takes (CMU + the owner's stand) + ${kitOf(SEEDS[0]).length} scripted takes per seed · the negatives also on TRAIN seeds ${TRAIN.join(', ') || '—'}.`, '');
L.push('**Every number here is synthetic.** The positives are CMU captures labelled by eye on their sheets (straights, wide hooks, front and round kicks, one guard raise, two ducks) and SCRIPTED moves (lib/pose/fightKit: the bent hook, the uppercut, straights from a chamber, the guard raise from the hands down and from a low guard one hand after the other, the slips, the ducks, the steps — no capture on disk holds them). There are no owner fight recordings yet (PLAN-P7 §11 says what to record).', '');
L.push('**Held out, and what is not (the review, 2026-09-26).** A seed re-draws every SCRIPTED path (a hook\'s end and load, an uppercut\'s dip and end, a straight\'s reach and angle, the guard\'s height, a raise\'s hand lag): the test seeds\' scripted takes are paths no threshold was tuned on — their numbers are the held-out ones. The 18 CAPTURE clips are the same clips on every seed (a seed re-draws only their noise and dropouts) and several thresholds cite them by name: their numbers are IN SAMPLE. The two are never pooled below.', '');
const headline = (pick: (c: CellOut) => FightTally, noise: number) => {
  L.push(`| cell | ${GROUPS.map(([g]) => g).join(' | ')} |`, `|---|${GROUPS.map(() => '---').join('|')}|`);
  for (const c of cells.filter((x) => x.noise === noise)) L.push(`| ${cellName(c)} | ${GROUPS.map(([, cl]) => { const g = grp(pick(c), cl); return `${pc(g.r)} / ${pc(g.p)} (${g.n})`; }).join(' | ')} |`);
};
L.push('## 1. Headline — the SCRIPTED takes, held out (noise 1×, recall / precision %)', '');
headline((c) => c.pos, 1);
if (NOISES.includes(1.5)) { L.push('', 'Noise 1.5×:', ''); headline((c) => c.pos, 1.5); }
L.push('', '## 1b. Headline — the CAPTURE takes, in sample (noise 1×, recall / precision %)', '');
headline((c) => c.real, 1);
if (NOISES.includes(1.5)) { L.push('', 'Noise 1.5×:', ''); headline((c) => c.real, 1.5); }
L.push('', 'Targets (PLAN-P7 G1, fixed before the test seeds ran): strikes 90 / 95 at 24–30 fps (noise 1.5×: recall 80; 15–20 fps: recall 70); the raise 90 / 95; evades and steps 85 / 95.', '');
L.push('## 2. Per class (noise 1×, blur off / on; scripted = held out, captures = in sample)', '');
for (const fps of FPS) {
  const off = cells.find((c) => c.fps === fps && c.noise === 1 && !c.blur)!, on = cells.find((c) => c.fps === fps && c.noise === 1 && c.blur)!;
  L.push(`### ${fps} fps`, '', '| class | scripted R / P (off) | onset med / p90 ms | reader delay p90 ms | scripted R / P (blur) | captures R / P (off) | captures R / P (blur) |', '|---|---|---|---|---|---|---|');
  for (const k of CLASSES) {
    const a = off.pos.classes[k], b = on.pos.classes[k], ra = off.real.classes[k], rb = on.real.classes[k];
    if (!a && !b && !ra && !rb) continue;
    const ga = a ? grp(off.pos, [k]) : null, gb = b ? grp(on.pos, [k]) : null, gra = ra ? grp(off.real, [k]) : null, grb = rb ? grp(on.real, [k]) : null;
    L.push(`| ${k} | ${ga ? `${pc(ga.r)} / ${pc(ga.p)} (${ga.n})` : '–'} | ${ga ? `${ms(G.pctl(ga.on, 0.5))} / ${ms(G.pctl(ga.on, 0.9))}` : '–'} | ${ga ? ms(G.pctl(ga.de, 0.9)) : '–'} | ${gb ? `${pc(gb.r)} / ${pc(gb.p)}` : '–'} | ${gra ? `${pc(gra.r)} / ${pc(gra.p)} (${gra.n})` : '–'} | ${grb ? `${pc(grb.r)} / ${pc(grb.p)}` : '–'} |`);
  }
  L.push('');
}
L.push('## 3. Onset and arrival (strikes, noise 1×, blur off)', '', '| fps | takes | onset med / p90 | reader delay med / p90 | arrival − onset p90 at 80 / 140 / 200 ms |', '|---|---|---|---|---|');
for (const fps of FPS) {
  const c = cells.find((x) => x.fps === fps && x.noise === 1 && !x.blur)!;
  for (const [lab, t] of [['scripted', c.pos], ['captures', c.real]] as const) {
    const g = grp(t, GROUPS[0][1]);
    L.push(`| ${fps} | ${lab} | ${ms(G.pctl(g.on, 0.5))} / ${ms(G.pctl(g.on, 0.9))} | ${ms(G.pctl(g.de, 0.5))} / ${ms(G.pctl(g.de, 0.9))} | ${LAT.map((l) => ms(G.pctl(g.de, 0.9) + l + 15)).join(' / ')} |`);
  }
}
L.push('', 'Targets (G2): onset median ≤ 20 ms and p90 ≤ 45 at 30 fps (≤ 25 / 55 at 24); reader delay p90 ≤ 130 ms at 30 fps. The arrival column adds the latency and its ±15 ms jitter to the reader delay (the camera → app lag is the cell\'s, not measured here; the live probe records the page\'s own).', '');
{
  const c = cells.find((x) => x.fps === 30 && x.noise === 1 && !x.blur)!;
  L.push('## 4. Confusion (30 fps, noise 1×, blur off: truth → read)', '', 'The captures\' straights are named by ONE lead per take — the eye\'s, else the take\'s own stance (square: the orthodox default) — not by the reader\'s time-varying stance rule, so a stale lead of the reader\'s shows here (the review, 2026-09-26).', '', '| takes | truth | read |', '|---|---|---|');
  for (const [lab, t] of [['scripted', c.pos], ['captures', c.real]] as const) for (const [k, v] of Object.entries(t.confusion).sort()) L.push(`| ${lab} | ${k} | ${Object.entries(v).sort((a, b) => b[1] - a[1]).map(([x, n]) => `${x} ×${n}`).join(' · ')} |`);
  L.push('');
}
L.push('## 5. Misfires on the negatives (events a mode would take; a stretch, claps and the low guard\'s raise: blows and kicks only)', '');
L.push('The review\'s out-of-sample negatives (2026-09-26) are in: claps, a wave in front of the face, arm swings, and the guard raised one hand after the other from a low guard (a positive for the raise; a negative for blows).', '');
const NEGK = ['rest', 'fight stance', 'jog', 'wave', 'stretch', 'wave in front', 'claps', 'arm swings', 'low guard raised'];
for (const [title, pick, seeds] of [['TEST seeds', (c: CellOut) => c.negMis, SEEDS], ['TRAIN seeds', (c: CellOut) => c.trainMis, TRAIN]] as const) {
  if (!seeds.length) continue;
  L.push(`### ${title} (${seeds.join(', ')})`, '', `| cell | ${NEGK.join(' | ')} |`, `|---|${NEGK.map(() => '---').join('|')}|`);
  for (const c of cells) L.push(`| ${cellName(c)} | ${NEGK.map((k) => `${pick(c)[k] ?? 0}${pick(c)[k] && title === 'TEST seeds' ? ` (${((c.negMis[k] / (c.negSec[k] || 1)) * 60).toFixed(1)}/min)` : ''}`).join(' | ')} |`);
  const zeroAll = NEGK.filter((k) => cells.every((c) => !(pick(c)[k] ?? 0)));
  const zeroClean = NEGK.filter((k) => cells.filter((c) => c.noise === 1 && !c.blur).every((c) => !(pick(c)[k] ?? 0)));
  const total = cells.reduce((a, c) => a + NEGK.reduce((b, k) => b + (pick(c)[k] ?? 0), 0), 0);
  L.push('', `Target (G3): 0 in every cell. Measured: ${total} over the ${cells.length} cells × ${seeds.length} seeds; 0 in every cell for ${zeroAll.join(', ') || 'none'}; 0 at noise 1× without blur (every fps) for ${zeroClean.join(', ') || 'none'}.`, '');
}
{
  const c = cells.find((x) => x.fps === 30 && x.noise === 1 && !x.blur)!;
  if (c.mirror) {
    const a = grp(c.real, GROUPS[0][1]), k = grp(c.pos, GROUPS[0][1]);
    L.push('## 6. Southpaw (G10: the capture positives, joint-mirrored; 30 fps, noise 1×)', '');
    const m = grp(c.mirror, GROUPS[0][1]);
    L.push(`Mirrored captures — strikes R ${pc(m.r)} / P ${pc(m.p)} (${m.n}), against the captures as they are: R ${pc(a.r)} / P ${pc(a.p)}. (The scripted takes carry both stances: R ${pc(k.r)} / P ${pc(k.p)}.)`, '');
  }
}
if (dances.length) {
  const tot = dances.reduce((a, d) => a + d.sec, 0), all: Record<string, number> = {};
  for (const d of dances) for (const [k, n] of Object.entries(d.events)) all[k] = (all[k] ?? 0) + n;
  const n = Object.values(all).reduce((a, b) => a + b, 0);
  L.push('## 7. The dance corpus (the owner\'s DeepMotion takes: fight events a mode would take, per minute)', '');
  L.push(`${dances.length} takes, ${Math.round(tot)} s (30 fps, 140 ms, noise 1×, seed ${SEEDS[0]}): **${n} events, ${((n / tot) * 60).toFixed(1)} per minute** — ${Object.entries(all).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '');
  const strikes = Object.entries(all).filter(([k]) => k.startsWith('blow') || k.startsWith('kick')).reduce((a, [, v]) => a + v, 0);
  L.push(`Of these, **${strikes} are strikes (${((strikes / tot) * 60).toFixed(1)}/min)**; the rest are steps (a dancer's feet do move: a step read in a dance is a step), guards and evades.`, '');
  L.push('No strike is labelled in these takes (they are dance and freestyle); the plan\'s by-eye verdict on each event is still to do — the per-take counts below say where to look.', '');
  L.push('| take | s | events | per min |', '|---|---|---|---|');
  for (const d of [...dances].sort((a, b) => Object.values(b.events).reduce((x, y) => x + y, 0) / b.sec - Object.values(a.events).reduce((x, y) => x + y, 0) / a.sec)) {
    const k = Object.values(d.events).reduce((x, y) => x + y, 0);
    L.push(`| ${d.name} | ${Math.round(d.sec)} | ${k ? Object.entries(d.events).map(([a, b]) => `${a} ${b}`).join(', ') : '–'} | ${((k / d.sec) * 60).toFixed(1)} |`);
  }
  L.push('');
}
L.push('## 8. Baselines (what a punch did, P1 → P3 → P7)', '');
L.push('| phase | a body punch | a kick | a duck / slip | the guard |', '|---|---|---|---|---|');
L.push('| P1 (§3 of the P1 baseline) | B | R1 | Focus | – |');
L.push('| P3 (the floor) | JAB (every punch the same A) | KICK (B) | – | – |');
L.push('| P7 (this) | the move the body threw: JAB · CROSS · HOOK · UPPERCUT (a third-link uppercut = RISING DRAGON) | KICK · ROUNDHOUSE (spin / jump behind the opt-in) | DODGE (i-frames; a vertical\'s \'stepped\' in Mixed) | BLOCK, a late raise PARRY (200 ms), a push GUARD IMPACT (160 ms) |');
L.push('');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, L.join('\n') + '\n');
console.log(`[fight] wrote ${OUT} (${Math.round((Date.now() - t0) / 1000)} s)`);
