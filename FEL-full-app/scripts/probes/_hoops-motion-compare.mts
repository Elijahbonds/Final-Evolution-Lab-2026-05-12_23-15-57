// _hoops-motion-compare — two _hoops-motion-probe tags side by side (the before / after of a phase), per catalogue action.
// Same shape as _dunk-motion-compare, plus the hoops columns (foot slide, the ball's path, the release against the apex,
// which hand, as drawn).
//   npx tsx scripts/probes/_hoops-motion-compare.mts p1-baseline/base p3        (tags under ~/Claude/outbox/finish-release/hoopsmotion, or absolute dirs)
//   ONLY=hero_ · FAMILY=handles — filter the rows
//   PHASE 2a: a tag holds every ATTEMPT of an action (REPS). A row is the MEAN over the action's attempts, with n; ATT=1 compares
//   attempt 1 only, ATT=all attempt by attempt (id#k). The ball column is the ball's worst one-frame move while held / dribbled /
//   caught (ball.pathMaxM); a phase 1 tag has only "the ball against the palm" (ball.gapP90), shown as g<value>.
//   DET=1 — THE DETERMINISM CHECK (run it after any probe change): the two tags are the same run twice (idle / HOG=60). Per take
//   (takes-<session>.json): virtual length and frame count; per recording (rec-*.json): the anchor's offset in its take, the
//   frame count, and the first frame on which any body's pose differs (> 1e-4 in a quaternion component or > 1 mm at a joint);
//   per attempt (metrics.json): SPARC. PASS = every length, count and anchor identical and SPARC within 0.04 (SPARC_TOL).
import fs from 'node:fs';
const [A, B] = process.argv.slice(2);
if (!A || !B) { console.log('usage: _hoops-motion-compare.mts <tagA> <tagB>'); process.exit(1); }
const dir = (t: string) => (t.startsWith('/') ? t : `${process.env.HOME}/Claude/outbox/finish-release/hoopsmotion/${t}`);
type M = { id: string; attempt?: number; family: string; subject: string; sparcMean: number; popsN: number; severe: number; whips: number; lockedElbow: number; lockedKnee: number; wristStill: number; thoracicStill: number;
  foot: { p90Cm: number; skates: number }; ball: { gapP90?: number | null; pathMaxM?: number | null; heldVis: Record<string, number> }; release: { relToApexMs: number | null; relToFeetApexMs?: number | null; vis: string } | null; clips: string[]; visual: { verdict: string } };
const load = (t: string): M[] => JSON.parse(fs.readFileSync(`${dir(t)}/metrics.json`, 'utf8'));

if (process.env.DET === '1') {
  const TOL = Number(process.env.SPARC_TOL ?? 0.04);
  let bad = 0; const fail = (s: string) => { bad++; console.log(`FAIL ${s}`); };
  // takes: virtual length and frame count
  for (const f of fs.readdirSync(dir(A)).filter((x) => /^takes-.*\.json$/.test(x)).sort()) {
    if (!fs.existsSync(`${dir(B)}/${f}`)) { fail(`${f} missing in ${B}`); continue; }
    const ta = JSON.parse(fs.readFileSync(`${dir(A)}/${f}`, 'utf8')) as Record<string, { res: Record<string, unknown> }>, tb = JSON.parse(fs.readFileSync(`${dir(B)}/${f}`, 'utf8')) as typeof ta;
    let same = 0;
    for (const [k, x] of Object.entries(ta)) {
      const y = tb[k]; if (!y) { fail(`${f} ${k}: not in ${B}`); continue; }
      if (x.res.virtualMs !== y.res.virtualMs || x.res.frames !== y.res.frames) fail(`${f} ${k}: ${x.res.virtualMs} ms / ${x.res.frames} frames → ${y.res.virtualMs} ms / ${y.res.frames} frames`); else same++;
    }
    for (const k of Object.keys(tb)) if (!ta[k]) fail(`${f} ${k}: only in ${B}`);
    console.log(`takes ${f}: ${same} of ${Object.keys(ta).length} identical in virtual length and frames`);
  }
  // recordings: anchor, frames, first divergence
  type R = { meta: { t0: number }; anchorT: number; frames: { t: number; B: Record<string, { q: number[]; j: (number[] | null)[] }> }[] };
  let recSame = 0, recN = 0;
  for (const f of fs.readdirSync(dir(A)).filter((x) => /^rec-.*\.json$/.test(x)).sort()) {
    recN++;
    if (!fs.existsSync(`${dir(B)}/${f}`)) { fail(`${f} missing in ${B}`); continue; }
    const a = JSON.parse(fs.readFileSync(`${dir(A)}/${f}`, 'utf8')) as R, b = JSON.parse(fs.readFileSync(`${dir(B)}/${f}`, 'utf8')) as R;
    const aa = Math.round(a.anchorT - a.meta.t0), ab = Math.round(b.anchorT - b.meta.t0);
    const mapB = new Map(b.frames.map((x) => [Math.round(x.t - b.meta.t0), x]));
    let first = '', n = 0, maxQ = 0, maxJ = 0;
    for (const x of a.frames) {
      const k = Math.round(x.t - a.meta.t0); const y = mapB.get(k); if (!y) continue; n++;
      for (const id of Object.keys(x.B)) {
        const qa = x.B[id].q, qb = y.B[id]?.q; if (!qb) continue;
        let dq = 0; for (let i = 0; i < qa.length; i++) dq = Math.max(dq, Math.abs(qa[i] - qb[i]));
        let dj = 0; x.B[id].j.forEach((p, i) => { const q = y.B[id].j[i]; if (p && q) dj = Math.max(dj, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])); });
        if ((dq > 1e-4 || dj > 1e-3) && !first) first = `${k} ms body ${id} (dq ${dq.toFixed(4)}, joint ${dj.toFixed(3)} m)`;
        maxQ = Math.max(maxQ, dq); maxJ = Math.max(maxJ, dj);
      }
    }
    const ok = aa === ab && a.frames.length === b.frames.length && n === a.frames.length;
    if (!ok) fail(`${f}: anchor ${aa} → ${ab} ms · frames ${a.frames.length} → ${b.frames.length} (${n} aligned)`); else recSame++;
    console.log(`${ok ? 'same' : 'DIFF'} ${f.padEnd(44)} anchor ${aa} ms · ${a.frames.length} frames · max dq ${maxQ.toFixed(4)} · max joint ${maxJ.toFixed(3)} m · first divergence ${first || 'none (identical)'}`);
  }
  // SPARC per attempt
  const ma = load(A), mb = new Map(load(B).map((m) => [`${m.id}#${m.attempt ?? 1}`, m]));
  let worst = 0, worstAt = '';
  for (const m of ma) { const y = mb.get(`${m.id}#${m.attempt ?? 1}`); if (!y) { fail(`${m.id} a${m.attempt ?? 1}: no metrics in ${B}`); continue; } const d = Math.abs(m.sparcMean - y.sparcMean); if (d > worst) { worst = d; worstAt = `${m.id} a${m.attempt ?? 1}`; } if (!(d <= TOL)) fail(`${m.id} a${m.attempt ?? 1}: SPARC ${m.sparcMean} → ${y.sparcMean}`); }
  console.log(`\nrecordings identical in anchor and frames: ${recSame} of ${recN} · SPARC largest difference ${worst.toFixed(3)} (${worstAt || '-'}) over ${ma.length} attempts, tolerance ${TOL}`);
  console.log(bad ? `DETERMINISM FAIL (${bad})` : 'DETERMINISM PASS');
  process.exit(bad ? 1 : 0);
}

const only = process.env.ONLY ?? '', fam = process.env.FAMILY ?? '', ATT = process.env.ATT ?? '';
const keep = (m: M) => (!only || m.id.includes(only)) && (!fam || m.family === fam) && (ATT !== '1' || (m.attempt ?? 1) === 1);
/** One row per action: the mean over its attempts (ATT=all: one row per attempt). */
interface Row { m: M; n: number; sparc: number; pops: number; severe: number; whips: number; elbow: number; knee: number; wrist: number; thor: number; slide: number; ball: number | null; ballOld: boolean; rel: number | null }
const rows = (t: string): Map<string, Row> => {
  const by = new Map<string, M[]>();
  for (const m of load(t).filter(keep)) { const k = ATT === 'all' ? `${m.id}#${m.attempt ?? 1}` : m.id; by.set(k, [...(by.get(k) ?? []), m]); }
  const mean = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => typeof x === 'number' && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const out = new Map<string, Row>();
  for (const [k, ms] of by) {
    const ballNew = mean(ms.map((m) => m.ball.pathMaxM));
    out.set(k, { m: ms[0], n: ms.length, sparc: mean(ms.map((m) => m.sparcMean)) ?? NaN, pops: mean(ms.map((m) => m.popsN)) ?? 0, severe: mean(ms.map((m) => m.severe)) ?? 0, whips: mean(ms.map((m) => m.whips)) ?? 0,
      elbow: mean(ms.map((m) => m.lockedElbow)) ?? 0, knee: mean(ms.map((m) => m.lockedKnee)) ?? 0, wrist: mean(ms.map((m) => m.wristStill)) ?? 0, thor: mean(ms.map((m) => m.thoracicStill)) ?? 0,
      slide: mean(ms.map((m) => m.foot.p90Cm)) ?? 0, ball: ballNew ?? mean(ms.map((m) => m.ball.gapP90)), ballOld: ballNew == null && ms.some((m) => m.ball.gapP90 != null),
      rel: mean(ms.map((m) => m.release?.relToFeetApexMs ?? m.release?.relToApexMs)) });
  }
  return out;
};
const a = rows(A), b = rows(B);
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const f = (x: number | null | undefined) => (x == null || !isFinite(x) ? '-' : String(Math.round(x * 100) / 100));
const ab = (x: number | null | undefined, y: number | null | undefined) => `${f(x)} → ${f(y)}`;
const bl = (r: Row) => (r.ball == null ? '-' : `${r.ballOld ? 'g' : ''}${f(r.ball)}`);
const hand = (m: M) => (m.release?.vis ? m.release.vis : (m.ball.heldVis.R ?? 0) > (m.ball.heldVis.L ?? 0) ? 'R' : (m.ball.heldVis.L ?? 0) > 0 ? 'L' : '-');
console.log(`${pad('action', 30)}${pad('n', 7)}${pad('SPARC', 16)}${pad('pops(sev)', 22)}${pad('whips', 14)}${pad('elbow', 14)}${pad('knee', 12)}${pad('wrist still', 14)}${pad('thor still', 14)}${pad('slide p90 cm', 15)}${pad('ball m', 16)}${pad('rel-apex ms', 16)}hand (drawn)`);
const sum = { sa: 0, sb: 0, pa: 0, pb: 0, va: 0, vb: 0, wa: 0, wb: 0, ea: 0, eb: 0, fa: 0, fb: 0, n: 0 };
for (const [k, x] of a) {
  const y = b.get(k); if (!y) { console.log(`${pad(k, 30)}(only in ${A})`); continue; }
  console.log(`${pad(k, 30)}${pad(`${x.n}→${y.n}`, 7)}${pad(ab(x.sparc, y.sparc), 16)}${pad(`${f(x.pops)}(${f(x.severe)}) → ${f(y.pops)}(${f(y.severe)})`, 22)}${pad(ab(x.whips, y.whips), 14)}${pad(ab(x.elbow, y.elbow), 14)}${pad(ab(x.knee, y.knee), 12)}${pad(ab(x.wrist, y.wrist), 14)}${pad(ab(x.thor, y.thor), 14)}${pad(ab(x.slide, y.slide), 15)}${pad(`${bl(x)} → ${bl(y)}`, 16)}${pad(ab(x.rel, y.rel), 16)}${hand(x.m)} → ${hand(y.m)}`);
  if (x.n === 1 && y.n === 1 && x.m.clips.join() !== y.m.clips.join()) console.log(`${pad('', 30)}clips  ${x.m.clips.join(' → ').slice(0, 90)}\n${pad('', 30)}   →   ${y.m.clips.join(' → ').slice(0, 90)}`);
  if (x.n === 1 && y.n === 1 && x.m.visual.verdict !== y.m.visual.verdict) console.log(`${pad('', 30)}visual ${x.m.visual.verdict} → ${y.m.visual.verdict}`);
  sum.sa += x.sparc; sum.sb += y.sparc; sum.pa += x.pops; sum.pb += y.pops; sum.va += x.severe; sum.vb += y.severe; sum.wa += x.whips; sum.wb += y.whips; sum.ea += x.elbow; sum.eb += y.elbow; sum.fa += x.slide; sum.fb += y.slide; sum.n++;
}
for (const k of b.keys()) if (!a.has(k)) console.log(`${pad(k, 30)}(only in ${B})`);
const n = sum.n || 1;
console.log(`\nmean over ${sum.n} actions (each the mean of its attempts): SPARC ${f(sum.sa / n)} → ${f(sum.sb / n)} · pops ${f(sum.pa / n)} → ${f(sum.pb / n)} · severe ${f(sum.va / n)} → ${f(sum.vb / n)} · whips ${f(sum.wa / n)} → ${f(sum.wb / n)} · locked-elbow frames ${f(sum.ea / n)} → ${f(sum.eb / n)} · slide p90 ${f(sum.fa / n)} → ${f(sum.fb / n)} cm`);
