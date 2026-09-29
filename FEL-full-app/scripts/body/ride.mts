// ride — the P8 ride read on the full grid (movement play P8, 2026-09-26): every labelled stream (lib/pose/rideStreams:
// the scripted label set, and the committed CMU takes with their eye labels) shot under every camera condition, read,
// replayed through the P8 rows, and graded (lib/pose/rideGrade) per control — precision / recall, sign, magnitude by class,
// latency — plus the rest drift on every negative stream, and the twelve P1 takes (the owner's recordings and CMU)
// through the kart and the plane (G1-R). The vitest gate (lib/pose/rideGate.test.ts) runs a subset of this grid with
// thresholds; this prints the whole of it, as JSON (default) or the markdown RIDE.md is made of (--md).
//
//   PATH=/opt/homebrew/bin:$PATH node node_modules/tsx/dist/cli.mjs scripts/body/ride.mts [--md] [--seeds 11,41]
//     [--fps 15,30] [--lat 80,200] [--noise 1,1.5] [--flip 0,1] [--only <regex>] [--stances all|one] [--real | --scripted]
//
// Scripted and real (eye-labelled) streams are tallied apart: a real take's labels are the eye's windows and its clean
// joints' signs, coarser than a script's (a driver steers the whole take; its labelled runs are the ≥ 10° ones), so their
// precision is reported, never pooled with the script's. A T-stretch IS the plane's wing pose (PLAN-P8 §12): the plane's
// outputs on a stretch are counted apart ("the T flies"), as the gate excuses them.
// Pure numbers from pure code: nothing is written unless the output is redirected; no camera, no server, no database.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as rsNs from '../../lib/pose/rideStreams.ts';
import * as rgNs from '../../lib/pose/rideGrade.ts';
import * as rpNs from '../../lib/input/rideProfiles.ts';
import * as bpNs from '../../lib/input/bodyProfiles.ts';
import * as rbNs from '../../lib/babylon/core/rideBody.ts';
import * as srNs from '../../lib/pose/seamReplay.ts';
import * as grNs from '../../lib/pose/grade.ts';
import * as skNs from '../../lib/pose/streamKit.ts';

const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { rideCatalogue, STANCES, condName, realStream } = unwrap(rsNs);
const { rideRun, gradeContinuous, gradeEvents, popPresses, readEvents, restDrift, pcts, trace } = unwrap(rgNs);
const { RIDE_ROWS_ON } = unwrap(rpNs);
const { P3_RIDE_ROWS } = unwrap(bpNs);
const { BodyStride } = unwrap(rbNs);
const { bodyPackets, seamReplay } = unwrap(srNs);
const { standFrame, STAND_SEC } = unwrap(grNs);
const { holdStill } = unwrap(skNs);

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const list = (k: string, d: string) => arg(k, d).split(',').map(Number);
const MD = process.argv.includes('--md');
const only = process.argv.includes('--only') ? new RegExp(arg('only', '.')) : null;
const stances = arg('stances', 'all') === 'one' ? [STANCES[2]] : STANCES;
const conds: rsNs.RideCondition[] = [];
for (const seed of list('seeds', '11,41')) for (const fps of list('fps', '15,30')) for (const latencyMs of list('lat', '80,200'))
  for (const noise of list('noise', '1,1.5')) for (const flip of list('flip', '0,1')) conds.push({ fps, latencyMs, noise, flip: !!flip, seed, holes: true });

const ROW = Object.fromEntries(RIDE_ROWS_ON.map((p) => [p.key, p]));
// BEFORE: P3's skateboard row (the image-lateral lean, the cut line) on the same board streams, graded apart
const P3_SKATE = { ...P3_RIDE_ROWS.find((p) => p.key === 'skateboard')!, key: 'skateboard_p3' };
const rowsFor = (s: rsNs.RideStream) => (s.family === 'board' ? [ROW.skateboard, ROW.surf] : [ROW.velocitykart, ROW.aeroaces, ROW.freerun]);
const RIDE_DIR = join(process.cwd(), 'lib/pose/__fixtures__/ride');
const takes = (JSON.parse(readFileSync(join(RIDE_DIR, 'index.json'), 'utf8')) as { takes: { name: string }[] }).takes
  .map((t) => realStream(JSON.parse(readFileSync(join(RIDE_DIR, `${t.name}.json`), 'utf8'))));
const which = process.argv.includes('--real') ? 'real' : process.argv.includes('--scripted') ? 'scripted' : 'all';
const streams = [...(which !== 'real' ? rideCatalogue(stances) : []), ...(which !== 'scripted' ? takes : [])].filter((s) => !only || only.test(s.name));

type Tally = { truth: number; hits: number; found: number; extra: number; lat: number[]; lat3080: number[]; named: number; namedOk: number; signOk: number; signN: number; med: Record<string, number[]>; extraBy: Record<string, number> };
const tallies: Record<string, Tally> = {};
const T = (k: string): Tally => (tallies[k] ??= { truth: 0, hits: 0, found: 0, extra: 0, lat: [], lat3080: [], named: 0, namedOk: 0, signOk: 0, signN: 0, med: {}, extraBy: {} });
const rest: { cond: string; stream: string; real: boolean; board: boolean; carveMax: number; carveP99: number; outputs: string[]; tFlies: number }[] = [];
const p3Rest: { stream: string; sticks: number }[] = [];
const realTurns: Record<string, number[]> = {};   // quarters found per real turn take, per cell
const real: Record<string, { grip: number[]; wings: number[]; runMax: number[]; rt: number[] }> = {};

for (const cond of conds) {
  for (const s of streams) {
    const isReal = s.labeller === 'eye';
    const tag = (c: string) => `${c}${isReal ? ' (real)' : ''}`;
    const run0 = rideRun(s, cond, s.family === 'board' ? [...rowsFor(s), P3_SKATE] : rowsFor(s));
    // (the P3 row's replay is graded apart: never in the P8 rest or tallies)
    const p3 = run0.replays.skateboard_p3;
    const run = { ...run0, replays: Object.fromEntries(Object.entries(run0.replays).filter(([k]) => k !== 'skateboard_p3')) };
    if (p3 && !isReal) {
      if (s.segs.some((x) => x.control === 'carve')) {
        const g = gradeContinuous({ ...run0, replays: { skateboard: p3 } }, 'skateboard', 'carve', 0.1);
        const t = T('carve (P3 row: the image-lateral lean)');
        t.truth += g.segs; t.hits += g.hits; t.found += g.spans; t.extra += g.spans - g.spansOk;
        for (const q of g.per) { if (q.signShare !== null) { t.signOk += q.signShare; t.signN++; } (t.med[String(q.level ?? '-')] ??= []).push(q.medAbs); }
      }
      if (s.kind === 'negative') p3Rest.push({ stream: s.name, sticks: p3.bus.filter((b) => b.t >= s.gradeFrom && b.e.t === 'stick' && b.e.x !== 0).length });
    }
    const ev = readEvents(run.packets);
    const is3080 = cond.fps === 30 && cond.latencyMs === 80;
    // continuous controls
    for (const [control, row] of [['carve', 'skateboard'], ['trim', 'surf'], ['wheel', 'velocitykart'], ['bank', 'aeroaces'], ['pitch', 'aeroaces']] as const) {
      if (!s.segs.some((x) => x.control === control) || !run.replays[row]) continue;
      const g = gradeContinuous(run, row, control, 0.1);
      const t = T(tag(control));
      t.truth += g.segs; t.hits += g.hits; t.found += g.spans; t.extra += g.spans - g.spansOk;
      if (g.spans > g.spansOk) t.extraBy[s.name] = (t.extraBy[s.name] ?? 0) + g.spans - g.spansOk;
      for (const p of g.per) {
        if (p.latencyMs !== null) { t.lat.push(p.latencyMs); if (is3080 && (control !== 'carve' || (p.level ?? 0) >= 8)) t.lat3080.push(p.latencyMs); }
        if (p.signShare !== null) { t.signOk += p.signShare; t.signN++; }
        (t.med[String(p.level ?? '-')] ??= []).push(p.medAbs);
      }
    }
    // events
    const grade = (control: rsNs.RideControl, inst: { t: number; at?: number; ok?: (seg: rsNs.RideSeg) => boolean }[]) => {
      const g = gradeEvents(run, control, inst);
      const t = T(tag(control));
      t.truth += g.truth; t.hits += g.matched; t.found += g.found; t.extra += g.extra; t.lat.push(...g.latencies); t.named += g.named; t.namedOk += g.namedOk;
      if (is3080) t.lat3080.push(...g.latencies);
      if (g.extra) t.extraBy[s.name] = (t.extraBy[s.name] ?? 0) + g.extra;
    };
    if (s.family === 'board') {
      grade('pop', popPresses(run, 'skateboard'));
      grade('grab', ev.grabs.map((x) => ({ t: x.on, at: x.at, ok: (seg: rsNs.RideSeg) => seg.hand === x.hand && seg.edge === x.edge })));
      grade('quarter', ev.quarters.map((x) => ({ t: x.t, at: x.at, ok: (seg: rsNs.RideSeg) => seg.dir === x.dir })));
      grade('push', ev.pushes);
    } else {
      grade('hopTurn', popPresses(run, 'velocitykart', 'X'));
      grade('dip', ev.dips);
      const hk = run.replays.freerun.bus.filter((b) => b.e.t === 'trigger' && b.e.value > 0).map((b) => ({ t: b.t, at: b.at }));
      grade('highKnees', hk.filter((x, i) => i === 0 || x.t - hk[i - 1].t > 400));
      if (isReal && s.segs.some((x) => x.control === 'quarter')) grade('quarter', ev.quarters.map((x) => ({ t: x.t, at: x.at })));
      // strides: the reader's steps with a lift behind them, graded as a mode grades them
      const stride = new BodyStride();
      const st: { t: number }[] = [];
      for (const p of run.packets) for (const e of p.events) if (e.kind === 'step' && stride.grade(e as never, { read: p.read, channels: p.channels, arrivedAt: p.arrivedAt, lagMs: 0 })) st.push({ t: e.t });
      const t = T(tag('stride')); const segs = s.segs.filter((x) => x.control === 'stride');
      const inRun = st.filter((x) => segs.some((g) => x.t >= g.from && x.t <= g.to + 400));
      t.truth += segs.length; t.hits += segs.filter((g) => inRun.some((x) => x.t >= g.from && x.t <= g.to + 400)).length;
      const counted = st.filter((x) => x.t >= s.gradeFrom);
      t.found += counted.length; t.extra += counted.length - inRun.length;
      if (counted.length > inRun.length) t.extraBy[s.name] = (t.extraBy[s.name] ?? 0) + counted.length - inRun.length;
    }
    if (isReal) {
      const tr = run.packets.filter((p) => p.read.t >= s.gradeFrom && p.read.tracking);
      const r = (real[s.name] ??= { grip: [], wings: [], runMax: [], rt: [] });
      if (s.segs.some((x) => x.control === 'quarter') || /turn/.test(s.name)) (realTurns[s.name] ??= []).push(ev.quarters.filter((x) => x.t >= s.gradeFrom).length);
      if (s.segs.some((x) => x.control === 'grip')) r.grip.push(tr.filter((p) => p.channels.ride?.wheel.grip).length / tr.length);
      if (s.segs.some((x) => x.control === 'spread')) r.wings.push(tr.filter((p) => p.channels.ride?.wings.on).length / tr.length);
      if (s.segs.some((x) => x.control === 'stride')) {
        const fr = trace(run.replays.freerun).filter((x) => x.t >= s.gradeFrom);
        r.runMax.push(Math.max(0, ...fr.map((x) => -x.y))); r.rt.push(Math.max(0, ...fr.map((x) => x.rt)));
      }
    }
    if (s.kind === 'negative') {
      // a T-stretch IS the wing pose: the plane's outputs on a stretch are counted apart, as the gate excuses them
      const stretch = /stretch/.test(s.name);
      const d = restDrift(stretch ? { ...run, replays: { ...run.replays, aeroaces: { ...run.replays.aeroaces, bus: [] } } } : run);
      const tFlies = stretch ? restDrift({ ...run, replays: { aeroaces: run.replays.aeroaces } }).outputs.filter((o) => o.startsWith('aeroaces:')).length : 0;
      rest.push({ cond: condName(cond), stream: s.name, real: isReal, board: s.family === 'board', ...d, tFlies });
    }
  }
}

// G1-R: the twelve P1 takes (lib/pose/__fixtures__, the P3 gate's stand before each) through the kart and the plane
const FIX = join(process.cwd(), 'lib/pose/__fixtures__');
const p1 = (JSON.parse(readFileSync(join(FIX, 'index.json'), 'utf8')) as { name: string }[]).map((f) => f.name);
const load = (n: string) => JSON.parse(readFileSync(join(FIX, `${n}.json`), 'utf8'));
const ownerStand = load('stand_still').frames[70];
const g1r = p1.map((name) => {
  const fx = load(name);
  const lead = holdStill(standFrame(fx, fx.source.kind === 'deepmotion' ? ownerStand : undefined).frame, { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: fx.frames[0].t });
  const packets = bodyPackets([...lead, ...fx.frames], { lead: lead.length });
  const out = (key: string) => seamReplay(packets, { profile: ROW[key], phase: 'playing', name }).bus.filter((b) => {
    const e = b.e;
    return (e.t === 'stick' && (e.x !== 0 || e.y !== 0)) || (e.t === 'trigger' && e.value > 0) || (e.t === 'button' && e.pressed);
  }).length;
  return { name, source: fx.source.kind as string, kart: out('velocitykart'), plane: out('aeroaces'), grips: packets.filter((p) => p.channels.ride?.wheel.grip).length, wings: packets.filter((p) => p.channels.ride?.wings.on).length };
});

const pct = (a: number, b: number) => (b ? +(a / b).toFixed(3) : null);
const top = (o: Record<string, number>, n = 4) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ×${v}`);
const summary = Object.fromEntries(Object.entries(tallies).sort(([a], [b]) => a.localeCompare(b)).map(([k, t]) => [k, {
  recall: pct(t.hits, t.truth), precision: t.found ? pct(t.found - t.extra, t.found) : null, truth: t.truth, found: t.found, extra: t.extra,
  latencyMs: pcts(t.lat), latency3080: pcts(t.lat3080), naming: t.named ? pct(t.namedOk, t.named) : null, sign: t.signN ? +(t.signOk / t.signN).toFixed(3) : null,
  medianByClass: Object.fromEntries(Object.entries(t.med).map(([l, v]) => { const s = [...v].sort((a, b) => a - b); return [l, +s[s.length >> 1].toFixed(2)]; })),
  extraFrom: top(t.extraBy),
}]));
const byStream = (rows: typeof rest) => { const o: Record<string, number> = {}; for (const r of rows) if (r.outputs.length) o[r.stream] = (o[r.stream] ?? 0) + 1; return o; };
const restSummary = {
  runs: rest.length,
  withOutputs: rest.filter((r) => r.outputs.length).length,
  scriptedWithOutputs: rest.filter((r) => !r.real && r.outputs.length).length,
  realWithOutputs: rest.filter((r) => r.real && r.outputs.length).length,
  offenders: top(byStream(rest), 8),
  tFlies: rest.filter((r) => r.tFlies > 0).length,
  // (the carve only steers a board: the facing negatives' carve, off a square fallback nothing binds, is not drift)
  carveMaxOn: +Math.max(0, ...rest.filter((r) => r.board).map((r) => r.carveMax)).toFixed(2),
  carveP99On: +Math.max(0, ...rest.filter((r) => r.board).map((r) => r.carveP99)).toFixed(2),
  carveWorst: rest.filter((r) => r.board && r.carveP99 > 0.7).sort((a, b) => b.carveP99 - a.carveP99).slice(0, 5).map((r) => `${r.cond} · ${r.stream}: p99 ${r.carveP99.toFixed(2)} max ${r.carveMax.toFixed(2)}`),
  firstOutputs: rest.filter((r) => r.outputs.length).slice(0, 12).map((r) => `${r.cond} · ${r.stream}: ${r.outputs.slice(0, 4).join(' ')}`),
};
const p3By: Record<string, number> = {};
for (const r of p3Rest) if (r.sticks) p3By[r.stream.replace(/ (reg|goofy)\d+$/, '')] = (p3By[r.stream.replace(/ (reg|goofy)\d+$/, '')] ?? 0) + 1;
const p3Summary = { runs: p3Rest.length, steered: p3Rest.filter((r) => r.sticks).length, byClass: top(p3By, 8) };
const realSummary = {
  turns: Object.fromEntries(Object.entries(realTurns).map(([k, v]) => [k, `${v.filter((x) => x === 1).length}/${v.length} cells one quarter, ${v.filter((x) => x === 0).length} none, ${v.filter((x) => x > 1).length} more`])),
  takes: Object.fromEntries(Object.entries(real).filter(([, v]) => v.grip.length || v.wings.length || v.runMax.length).map(([k, v]) => {
    const r = (a: number[]) => (a.length ? `${Math.min(...a).toFixed(2)}–${Math.max(...a).toFixed(2)}` : '–');
    return [k, [v.grip.length ? `grip share ${r(v.grip)}` : '', v.wings.length ? `wings share ${r(v.wings)}` : '', v.runMax.length ? `Free Run max RUN ${r(v.runMax)} (${r(v.runMax.map((x) => x * 6.4))} m/s), SPRINT ${Math.max(...v.rt)}` : ''].filter(Boolean).join(' · ')];
  })),
};

if (!MD) {
  console.log(JSON.stringify({ conditions: conds.length, streams: streams.length, summary, rest: restSummary, p3: p3Summary, real: realSummary, g1r }, null, 1));
} else {
  const lines = [
    `Grid: ${conds.length} conditions (seeds ${[...new Set(conds.map((c) => c.seed))].join(', ')}; ${[...new Set(conds.map((c) => c.fps))].join(' / ')} fps; ${[...new Set(conds.map((c) => c.latencyMs))].join(' / ')} ms; noise ${[...new Set(conds.map((c) => c.noise))].join(' / ')}×; flip ${[...new Set(conds.map((c) => c.flip ? 'on' : 'off'))].join(' / ')}; 150 ms holes) × ${streams.length} streams.`,
    '',
    `| control | recall | precision | truth | found | extra | latency p50 / p90 (ms) | at 30 fps · 80 ms | naming | sign | median \\|value\\| by class | extras from |`,
    `|---|---|---|---|---|---|---|---|---|---|---|---|`,
    ...Object.entries(summary).map(([k, v]) => `| ${k} | ${v.recall ?? '–'} | ${v.precision ?? '–'} | ${v.truth} | ${v.found} | ${v.extra} | ${v.latencyMs ? `${v.latencyMs.p50} / ${v.latencyMs.p90}` : '–'} | ${v.latency3080 ? `${v.latency3080.p50} / ${v.latency3080.p90}` : '–'} | ${v.naming ?? '–'} | ${v.sign ?? '–'} | ${Object.entries(v.medianByClass).map(([l, m]) => `${l}: ${m}`).join(', ') || '–'} | ${v.extraFrom.join('; ') || '–'} |`),
    '',
    `Rest: ${restSummary.runs} negative stream × condition runs; ${restSummary.withOutputs} with any output (scripted ${restSummary.scriptedWithOutputs}, real ${restSummary.realWithOutputs})${restSummary.offenders.length ? `: ${restSummary.offenders.join('; ')}` : ''}. The T-stretch flew the plane in ${restSummary.tFlies} runs (excused, PLAN-P8 §12). Carve before the dead band: max ${restSummary.carveMaxOn} × ON, p99 ${restSummary.carveP99On} × ON.`,
    ...restSummary.carveWorst.map((x) => `- carve drift: ${x}`),
    ...restSummary.firstOutputs.map((x) => `- ${x}`),
    '',
    `BEFORE (P3's skate row, the image-lateral lean, on the same board rest streams): it steered in ${p3Summary.steered} of ${p3Summary.runs} runs${p3Summary.byClass.length ? ` — ${p3Summary.byClass.join('; ')}` : ''}.`,
    '',
    'Real turns (quarters found per cell):',
    ...Object.entries(realSummary.turns).map(([k, v]) => `- ${k}: ${v}`),
    'Real takes:',
    ...Object.entries(realSummary.takes).map(([k, v]) => `- ${k}: ${v}`),
    '',
    `G1-R (the P1 takes through the kart and the plane, the stand included): ${g1r.filter((x) => x.kart || x.plane).length ? g1r.filter((x) => x.kart || x.plane).map((x) => `${x.name} kart ${x.kart} plane ${x.plane}`).join('; ') : `0 outputs on all ${g1r.length}`} (grip frames ${g1r.reduce((a, x) => a + x.grips, 0)}, wing frames ${g1r.reduce((a, x) => a + x.wings, 0)}).`,
  ];
  console.log(lines.join('\n'));
}
