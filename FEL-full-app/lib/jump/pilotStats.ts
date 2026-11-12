// pilotStats — the force-plate pilot's statistics (JUMP-TESTS, 2026-10-25; docs/JUMP-PILOT-PROTOCOL.md §7). Pure maths
// on paired numbers, and the pairing of the app's pilot CSV (lib/jump/pilot.ts) with the lab's plate CSV. The command
// line around it is scripts/jump-pilot/analyze.ts. Unit-tested on data with known answers (lib/jump/pilotStats.test.ts).
//
//   Bland-Altman   d = app − plate: bias = mean d, SD of d, limits of agreement bias ± 1.96·SD (Bland & Altman 1986)
//   ICC(2,1)       two-way random effects, absolute agreement, single measure (Shrout & Fleiss 1979; McGraw & Wong
//                  1996 "A,1"): (MSR − MSE) / (MSR + (k−1)·MSE + k·(MSC − MSE)/n)
//   reliability    test–retest of one method across two sessions: typical error TE = SD(d)/√2, CV = TE / grand mean,
//                  MDC95 = 1.96·√2·TE (Hopkins 2000; Weir 2005), and the ICC(2,1) of the two sessions
//   the pass bar   (pre-registered, jump.md): |bias| ≤ 1 cm, both limits within ±3 cm, ICC ≥ 0.97 — for the HEIGHT. Velocity
//                  and power are reported with the same statistics and no bar (the protocol leaves theirs to the lab's
//                  pre-registration).
//
// Pure.
import { csvRecords } from '@/lib/csv/csv';

const mean = (v: readonly number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sdOf = (v: readonly number[]) => { const m = mean(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

export interface BlandAltman { n: number; bias: number; sd: number; loaLow: number; loaHigh: number; meanRef: number }

/** d = test − ref, paired by position. Needs two pairs or more. */
export function blandAltman(test: readonly number[], ref: readonly number[]): BlandAltman {
  if (test.length !== ref.length) throw new Error('blandAltman: the two lists must pair up');
  if (test.length < 2) throw new Error('blandAltman: at least two pairs');
  const d = test.map((x, i) => x - ref[i]);
  const bias = mean(d), sd = sdOf(d);
  return { n: d.length, bias, sd, loaLow: bias - 1.96 * sd, loaHigh: bias + 1.96 * sd, meanRef: mean(ref) };
}

/** ICC(2,1) of an n × k table (rows: subjects or trials; columns: methods or sessions). */
export function icc21(rows: readonly (readonly number[])[]): number {
  const n = rows.length, k = rows[0]?.length ?? 0;
  if (n < 2 || k < 2 || rows.some((r) => r.length !== k)) throw new Error('icc21: an n × k table, n ≥ 2, k ≥ 2');
  const all = rows.flat(), g = mean(all);
  const rowM = rows.map((r) => mean(r)), colM = Array.from({ length: k }, (_, j) => mean(rows.map((r) => r[j])));
  const sst = all.reduce((a, x) => a + (x - g) ** 2, 0);
  const ssr = k * rowM.reduce((a, m) => a + (m - g) ** 2, 0), ssc = n * colM.reduce((a, m) => a + (m - g) ** 2, 0);
  const msr = ssr / (n - 1), msc = ssc / (k - 1), mse = (sst - ssr - ssc) / ((n - 1) * (k - 1));
  return (msr - mse) / (msr + (k - 1) * mse + (k * (msc - mse)) / n);
}

export interface Reliability { n: number; te: number; cvPct: number; mdc95: number; icc: number; meanChange: number }

/** One method, two sessions, paired by subject. */
export function reliability(s1: readonly number[], s2: readonly number[]): Reliability {
  if (s1.length !== s2.length || s1.length < 2) throw new Error('reliability: two paired lists, two subjects or more');
  const d = s2.map((x, i) => x - s1[i]);
  const te = sdOf(d) / Math.SQRT2;
  return { n: d.length, te, cvPct: (te / mean([...s1, ...s2])) * 100, mdc95: 1.96 * Math.SQRT2 * te, icc: icc21(s1.map((x, i) => [x, s2[i]])), meanChange: mean(d) };
}

/** The pre-registered bar for the height (cm). */
export const PASS_BAR = { biasCm: 1, loaCm: 3, icc: 0.97 } as const;

export interface Verdict { pass: boolean; bias: boolean; loa: boolean; icc: boolean }
export function passBar(ba: BlandAltman, icc: number): Verdict {
  const bias = Math.abs(ba.bias) <= PASS_BAR.biasCm, loa = ba.loaLow >= -PASS_BAR.loaCm && ba.loaHigh <= PASS_BAR.loaCm, ok = icc >= PASS_BAR.icc;
  return { pass: bias && loa && ok, bias, loa, icc: ok };
}

// ── pairing the files ────────────────────────────────────────────────────────────────────────────────────────────

/** The measures compared: the app's column, the plate's column, and whether the height's pass bar applies. */
export const MEASURES = [
  { id: 'height', label: 'Jump height (cm)', test: 'height_tov_cm', ref: 'height_cm', bar: true },
  { id: 'v0', label: 'Take-off velocity (m/s)', test: 'v0_mps', ref: 'v0_mps', bar: false },
  { id: 'peakPower', label: 'Peak power (W)', test: 'peak_power_w', ref: 'peak_power_w', bar: false },
  { id: 'meanPower', label: 'Mean propulsive power (W)', test: 'mean_power_w', ref: 'mean_power_w', bar: false },
] as const;
export type MeasureId = (typeof MEASURES)[number]['id'];

export const KEYS = ['participant', 'session', 'test', 'trial'] as const;

export interface GroupReport {
  group: string;
  measure: MeasureId;
  label: string;
  ba: BlandAltman;
  icc: number;
  /** The height's verdict; null for a measure with no pre-registered bar. */
  verdict: Verdict | null;
}

export interface RetestReport { group: string; who: 'app' | 'plate'; measure: MeasureId; label: string; r: Reliability }

export interface PilotReport {
  pairs: number;
  /** App trials refused by the app (not paired; counted), and rows with no partner in the other file. */
  refused: number;
  unpaired: { test: number; ref: number };
  validity: GroupReport[];
  retest: RetestReport[];
}

const num = (s: string | undefined) => { if (s === undefined || s.trim() === '') return null; const x = Number(s.replace(/^'/, '')); return Number.isFinite(x) ? x : null; };
const yes = (s: string | undefined) => s === undefined || s === '' || /^(yes|true|1)$/i.test(s);

/**
 * Pair the app's CSV with the plate's on participant, session, test and trial; keep the app's valid trials; group by
 * `groupBy` (columns of the app's file, e.g. test, source, fps). Retest: the best trial per participant per session,
 * session "1" against session "2", for the app and for the plate.
 */
export function analyzePilot(testCsv: string, refCsv: string, o: { groupBy?: readonly string[] } = {}): PilotReport {
  const groupBy = o.groupBy ?? ['test', 'source'];
  const key = (r: Record<string, string>) => KEYS.map((k) => (r[k] ?? '').trim().toLowerCase()).join('|');
  const tRows = csvRecords(testCsv), rRows = csvRecords(refCsv);
  const refBy = new Map(rRows.map((r) => [key(r), r]));
  const testKeys = new Set(tRows.map(key));
  let refused = 0;
  const pairs: { t: Record<string, string>; r: Record<string, string> }[] = [];
  for (const t of tRows) {
    if (!yes(t.valid)) { refused++; continue; }
    const r = refBy.get(key(t));
    if (r) pairs.push({ t, r });
  }
  const groups = new Map<string, typeof pairs>();
  for (const p of pairs) {
    const g = groupBy.map((c) => p.t[c] ?? '').filter(Boolean).join(' · ') || 'all';
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const validity: GroupReport[] = [];
  for (const [group, ps] of groups) {
    for (const m of MEASURES) {
      const xy = ps.map((p) => [num(p.t[m.test]), num(p.r[m.ref])] as const).filter((v): v is readonly [number, number] => v[0] !== null && v[1] !== null);
      if (xy.length < 2) continue;
      const ba = blandAltman(xy.map((v) => v[0]), xy.map((v) => v[1]));
      const icc = icc21(xy.map((v) => [v[0], v[1]]));
      validity.push({ group, measure: m.id, label: m.label, ba, icc, verdict: m.bar ? passBar(ba, icc) : null });
    }
  }
  // retest: best per participant × session, session 1 vs 2
  const retest: RetestReport[] = [];
  for (const [group, ps] of groups) {
    for (const m of MEASURES) {
      for (const who of ['app', 'plate'] as const) {
        const best = new Map<string, number>();
        for (const p of ps) {
          const v = num(who === 'app' ? p.t[m.test] : p.r[m.ref]);
          if (v === null) continue;
          const k = `${p.t.participant}|${p.t.session}`;
          best.set(k, Math.max(best.get(k) ?? -Infinity, v));
        }
        const people = [...new Set(ps.map((p) => p.t.participant))].filter((pid) => best.has(`${pid}|1`) && best.has(`${pid}|2`));
        if (people.length < 2) continue;
        retest.push({ group, who, measure: m.id, label: m.label, r: reliability(people.map((pid) => best.get(`${pid}|1`)!), people.map((pid) => best.get(`${pid}|2`)!)) });
      }
    }
  }
  return {
    pairs: pairs.length, refused,
    unpaired: { test: tRows.filter((t) => yes(t.valid) && !refBy.has(key(t))).length, ref: rRows.filter((r) => !testKeys.has(key(r))).length },
    validity, retest,
  };
}

const f = (x: number, d = 2) => (x >= 0 ? ' ' : '') + x.toFixed(d);

/** The report as a Markdown page (what the script prints). */
export function reportMarkdown(r: PilotReport): string {
  const out: string[] = ['# Jump pilot: app vs force plate', '',
    `Pairs: ${r.pairs}. App trials refused by the app (not paired): ${r.refused}. Unpaired rows: app ${r.unpaired.test}, plate ${r.unpaired.ref}.`, '',
    `Pass bar (height): |bias| ≤ ${PASS_BAR.biasCm} cm, limits of agreement within ±${PASS_BAR.loaCm} cm, ICC(2,1) ≥ ${PASS_BAR.icc}.`, '',
    '## Agreement (Bland-Altman, app − plate)', '',
    '| group | measure | n | bias | SD | LoA low | LoA high | ICC(2,1) | verdict |', '|---|---|---|---|---|---|---|---|---|'];
  for (const g of r.validity) {
    const v = g.verdict ? (g.verdict.pass ? 'PASS' : `FAIL (${[!g.verdict.bias && 'bias', !g.verdict.loa && 'LoA', !g.verdict.icc && 'ICC'].filter(Boolean).join(', ')})`) : 'no bar';
    out.push(`| ${g.group} | ${g.label} | ${g.ba.n} | ${f(g.ba.bias)} | ${g.ba.sd.toFixed(2)} | ${f(g.ba.loaLow)} | ${f(g.ba.loaHigh)} | ${g.icc.toFixed(3)} | ${v} |`);
  }
  if (r.retest.length) {
    out.push('', '## Test–retest (best trial per session, session 1 vs 2)', '', '| group | method | measure | n | TE | CV % | MDC95 | ICC(2,1) | mean change |', '|---|---|---|---|---|---|---|---|---|');
    for (const t of r.retest) out.push(`| ${t.group} | ${t.who} | ${t.label} | ${t.r.n} | ${t.r.te.toFixed(2)} | ${t.r.cvPct.toFixed(1)} | ${t.r.mdc95.toFixed(2)} | ${t.r.icc.toFixed(3)} | ${f(t.r.meanChange)} |`);
  }
  return out.join('\n') + '\n';
}
