// The replay report: every grader against the owner-led capture, before and after (MIRROR PHASE 3, 2026-10-07).
//
// For each check (checks.ts): how the PROPOSED value does on the labelled takes (hit rate on GOOD takes, catch rate on
// FAULT takes, false alarms), by phone and overall; then a SUGGESTED TUNED value, the line that best separates the
// labelled good takes from the labelled faults (the largest catch rate minus false-alarm rate, ties to the value
// nearest the PROPOSED one), with the same table at that value. Plus the reps each grader counted on good takes, the
// jump read at the captured rate against the same take thinned to 30 Hz (the T5 opt-in, measured), and each phone's
// frame-rate log with what the high-rate trial would decide on it.
//
// IT NEVER CHANGES A THRESHOLD. It returns numbers and markdown; the owner signs off a value by editing its file
// (named in the table), setting signedOff, and bumping THRESHOLDS_VERSION (docs/MIRROR-ASSESS-THRESHOLDS.md).
// Pure and deterministic: the same fixtures give the same report, byte for byte (no clock: the caller passes the date).
import type { PoseFrame } from '@/lib/pose/landmarks';
import { CAPTURE_DEVICES, CAPTURE_TAKES } from '@/lib/pose/captureProtocol';
import { MIN_DETECT_GAP_MS, highRateVerdict } from '@/lib/pose/modelChoice';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';
import { poseHz } from '@/lib/assess/scoring';
import { CHECKS, Session, cmp, repsCounted, roleOf, type Check } from './checks';
import { takeAspect, takeFrames, type CaptureFixture, type CapturedTake } from './format';

export interface Tally {
  /** Good takes the check read, and how many of them it flagged (false alarms). */
  goodRead: number;
  falseAlarms: number;
  /** Fault takes it read, and how many it flagged (catches). */
  faultRead: number;
  caught: number;
  /** Takes it could not read at all (no body, wrong view, too few reps). */
  unread: number;
}

export interface CheckRow { session: string; device: string; take: string; label: string; role: 'good' | 'fault'; value: number | null; flagged: boolean | null }

export type Suggestion =
  | { verdict: 'keep' | 'change'; value: number; overall: Tally; byDevice: Record<string, Tally> }
  | { verdict: 'none'; why: string };

export interface CheckReport {
  id: string;
  grader: string;
  threshold: Check['threshold'];
  mode: Check['mode'];
  rows: CheckRow[];
  proposed: { overall: Tally; byDevice: Record<string, Tally> };
  suggestion: Suggestion;
}

export interface JumpRateRow { session: string; take: string; label: string; native: JumpRead; at30: JumpRead }
export interface JumpRead { hz: number; validJumps: number; bestCm: number | null; fpsLow: boolean; symScored: number }
export interface RateLogRow { session: string; model: string; standardFps: number | null; standardMs: number | null; highFps: number | null; highMs: number | null; trial: string }
export interface RepRow { grader: string; byDevice: Record<string, { counted: number; asked: number }> }

export interface CaptureReport {
  sessions: { key: string; takes: number; missing: string[]; calibration: string | null }[];
  checks: CheckReport[];
  reps: RepRow[];
  jumpRate: JumpRateRow[];
  rateLog: RateLogRow[];
}

const zero = (): Tally => ({ goodRead: 0, falseAlarms: 0, faultRead: 0, caught: 0, unread: 0 });
const add = (t: Tally, role: 'good' | 'fault', flagged: boolean | null) => {
  if (flagged === null) { t.unread++; return; }
  if (role === 'good') { t.goodRead++; if (flagged) t.falseAlarms++; } else { t.faultRead++; if (flagged) t.caught++; }
};
export const hitRate = (t: Tally): number | null => (t.goodRead ? (t.goodRead - t.falseAlarms) / t.goodRead : null);
export const catchRate = (t: Tally): number | null => (t.faultRead ? t.caught / t.faultRead : null);
/** Separation: catch rate minus false-alarm rate (Youden's J), the quantity the suggestion maximises. */
const score = (t: Tally) => (t.faultRead ? t.caught / t.faultRead : 0) - (t.goodRead ? t.falseAlarms / t.goodRead : 0);

/** Three significant figures: a suggestion is a line to sign off, not a measurement to the micron. */
export const sig3 = (v: number): number => (v === 0 ? 0 : Number(v.toPrecision(3)));

/** Multiples of the PROPOSED value a re-run check tries (it reports no value to place a line between). */
export const RERUN_GRID = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

interface Item { s: Session; take: CapturedTake; role: 'good' | 'fault'; value: number | null; flagged: boolean | null }

function tallies(items: readonly Item[], flaggedOf: (it: Item) => boolean | null) {
  const overall = zero();
  const byDevice: Record<string, Tally> = {};
  for (const it of items) {
    const f = flaggedOf(it);
    add(overall, it.role, f);
    add((byDevice[it.s.device] ??= zero()), it.role, f);
  }
  return { overall, byDevice };
}

/**
 * The candidate lines a check is tried at: for a check that reports values, the midpoints between neighbouring values
 * read (each one separates the takes differently) plus the PROPOSED value; for a re-run check, RERUN_GRID multiples of it.
 */
export function candidateLines(mode: Check['mode'], proposed: number, values: readonly (number | null)[]): number[] {
  if (mode === 'rerun') return [...new Set(RERUN_GRID.map((k) => sig3(proposed * k)))];
  const vs = [...new Set(values.filter((v): v is number => v !== null && Number.isFinite(v)))].sort((a, b) => a - b);
  const out = [proposed];
  for (let i = 1; i < vs.length; i++) out.push(sig3((vs[i - 1] + vs[i]) / 2));
  return [...new Set(out)];
}

/**
 * The best line among candidates: the largest catch rate minus false-alarm rate; a tie goes to the value nearest the
 * PROPOSED one, and the PROPOSED value itself wins any tie it is in (a "keep").
 */
export function bestLine(proposed: number, candidates: readonly number[], tallyAt: (c: number) => Tally): { value: number; tally: Tally } {
  let best = { value: proposed, tally: tallyAt(proposed), j: 0 };
  best.j = score(best.tally);
  for (const c of candidates) {
    if (c === proposed) continue;
    const t = tallyAt(c), j = score(t);
    if (j > best.j + 1e-9 || (Math.abs(j - best.j) <= 1e-9 && Math.abs(c - proposed) < Math.abs(best.value - proposed))) best = { value: c, tally: t, j };
  }
  return { value: best.value, tally: best.tally };
}

function suggest(check: Check, items: readonly Item[], proposedOverall: Tally): Suggestion {
  if (check.mode === 'none') return { verdict: 'none', why: 'not one line on one number (counted only)' };
  if (!proposedOverall.goodRead || !proposedOverall.faultRead) {
    return { verdict: 'none', why: proposedOverall.faultRead ? 'no good take read' : check.catches.length ? 'no fault take read' : 'no fault is captured for it (false alarms only)' };
  }
  const p = check.threshold.value;
  const at = (c: number) => (it: Item): boolean | null => {
    if (check.mode === 'rerun') return c === p ? it.flagged : check.rerun!(it.take, it.s, c);
    return it.value === null ? null : cmp(it.value, check.threshold.op, c);
  };
  // the PROPOSED row is the shipped grader's own verdict (for a value check the two agree: exactness is tested)
  const memo = new Map<number, ReturnType<typeof tallies>>();
  const tallyAt = (c: number) => {
    if (!memo.has(c)) memo.set(c, c === p && check.mode !== 'estimate' ? tallies(items, (it) => it.flagged) : tallies(items, at(c)));
    return memo.get(c)!;
  };
  const best = bestLine(p, candidateLines(check.mode, p, items.map((i) => i.value)), (c) => tallyAt(c).overall);
  const t = tallyAt(best.value);
  return { verdict: best.value === p ? 'keep' : 'change', value: best.value, overall: t.overall, byDevice: t.byDevice };
}

/** Frames as PoseService would deliver them at 30 Hz: a frame sooner than MIN_DETECT_GAP_MS after the last is dropped. */
export function thinTo30(frames: readonly PoseFrame[]): PoseFrame[] {
  const out: PoseFrame[] = [];
  let last = -Infinity;
  for (const f of frames) {
    const gap = f.t - last;
    if (gap >= 0 && gap < MIN_DETECT_GAP_MS) continue;
    out.push(f);
    last = f.t;
  }
  return out;
}

function jumpRead(frames: readonly PoseFrame[], s: Session, take: CapturedTake): JumpRead {
  const cal = s.calibration!;
  const r = gradeT5(frames, { calibration: { ...cal, aspect: takeAspect(take) }, aspect: takeAspect(take), cameraFps: null });
  const x = r.t5!;
  return {
    hz: poseHz(frames), validJumps: x.jumps.filter((j) => j.valid).length, bestCm: x.bestHeightCm === null ? null : Math.round(x.bestHeightCm * 10) / 10,
    fpsLow: x.fpsLow, symScored: x.jumps.filter((j) => j.valid && j.landingSymMs !== null).length,
  };
}

const median = (v: number[]) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Replay every check against every session. `fixtures` in any order; the report is sorted. */
export function buildReport(fixtures: readonly CaptureFixture[]): CaptureReport {
  const sessions = fixtures.map((f) => new Session(f)).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const have = (s: Session) => new Set(s.takes.map((t) => t.id));

  const checks: CheckReport[] = CHECKS.map((check) => {
    const items: Item[] = [];
    for (const s of sessions) {
      for (const take of s.takes) {
        const role = roleOf(check, take);
        if (!role) continue;
        const r = check.read(take, s);
        items.push({ s, take, role, value: r.value, flagged: r.flagged });
      }
    }
    const proposed = tallies(items, (it) => it.flagged);
    return {
      id: check.id, grader: check.grader, threshold: check.threshold, mode: check.mode,
      rows: items.map((it) => ({ session: it.s.key, device: it.s.device, take: it.take.id, label: it.take.label, role: it.role, value: it.value, flagged: it.flagged })),
      proposed, suggestion: suggest(check, items, proposed.overall),
    };
  });

  const repMap = new Map<string, Record<string, { counted: number; asked: number }>>();
  for (const s of sessions) for (const take of s.takes) for (const rc of repsCounted(take, s)) {
    const row = repMap.get(rc.grader) ?? {};
    const d = (row[s.device] ??= { counted: 0, asked: 0 });
    d.counted += Math.min(rc.counted, rc.asked); d.asked += rc.asked;
    repMap.set(rc.grader, row);
  }
  const reps: RepRow[] = [...repMap.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([grader, byDevice]) => ({ grader, byDevice }));

  const jumpRate: JumpRateRow[] = [];
  for (const s of sessions) {
    if (!s.calibration) continue;
    for (const take of s.takes.filter((t) => t.movement === 'jump')) {
      const fs = takeFrames(take);
      jumpRate.push({ session: s.key, take: take.id, label: take.label, native: jumpRead(fs, s, take), at30: jumpRead(thinTo30(fs), s, take) });
    }
  }

  const rateLog: RateLogRow[] = sessions.map((s) => {
    const std = s.takes.filter((t) => !t.highRate && t.detectFps > 0), hi = s.takes.filter((t) => t.highRate && t.detectFps > 0);
    const hiFps = median(hi.map((t) => t.detectFps)), hiMs = median(hi.map((t) => t.inferMs));
    return {
      session: s.key, model: s.fixture.model,
      standardFps: median(std.map((t) => t.detectFps)), standardMs: median(std.map((t) => t.inferMs)),
      highFps: hiFps, highMs: hiMs,
      trial: hiFps === null || hiMs === null ? 'no 60 fps take' : (() => { const v = highRateVerdict(hiMs, hiFps); return `${v.verdict}: ${v.why}`; })(),
    };
  });

  return {
    sessions: sessions.map((s) => ({
      key: s.key, takes: s.takes.length,
      missing: CAPTURE_TAKES.filter((t) => !t.optional && !have(s).has(t.id)).map((t) => t.id),
      calibration: s.calibrationWhy,
    })),
    checks, reps, jumpRate, rateLog,
  };
}

// ── markdown ─────────────────────────────────────────────────────────────────────────────────────────────────────

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const frac = (a: number, b: number) => (b ? `${a}/${b}` : '—');
const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(Math.round(v * 1000) / 1000));
const tallyCells = (t: Tally) => [`${pct(hitRate(t))} (${frac(t.goodRead - t.falseAlarms, t.goodRead)})`, String(t.falseAlarms), `${pct(catchRate(t))} (${frac(t.caught, t.faultRead)})`];
const HOW: Record<Check['mode'], string> = { exact: 'exact', rerun: 're-run', estimate: '≈ worst value', none: '—' };

/** The report as markdown, for the terminal or a file. `date` is printed as given. */
export function renderReport(r: CaptureReport, date: string): string {
  const L: string[] = [];
  L.push('# Mirror capture: replay report', '');
  L.push(`Generated ${date} from ${r.sessions.length} session${r.sessions.length === 1 ? '' : 's'} (lib/mirror/fixtures/capture/report.ts).`, '');
  L.push('**Nothing in this report changes a threshold.** A suggested TUNED value is for the owner to sign off: change it in the file the table names, set `signedOff: true` where the register has it, and bump `THRESHOLDS_VERSION` (docs/MIRROR-ASSESS-THRESHOLDS.md).', '');
  L.push('Hit = good takes the check left clean. False alarms = good takes it flagged. Catch = fault takes (done on purpose, labelled) it flagged. "exact" re-grades exactly at the new value; "re-run" ran the grader again with it; "≈ worst value" compares the take\'s worst reading (the grader adds persistence of its own), so check it live.', '');
  L.push('## Sessions', '', '| Session | Takes | Missing (not optional) | Quick Screen calibration |', '|---|---|---|---|');
  for (const s of r.sessions) L.push(`| ${s.key} | ${s.takes} | ${s.missing.length ? s.missing.join(', ') : 'none'} | ${s.calibration ?? 'ok'} |`);
  L.push('');

  L.push('## Before / after, per check', '');
  L.push('| Check | Threshold | PROPOSED | Hit (good) | False alarms | Catch (faults) | Suggested TUNED | Hit → | False alarms → | Catch → | How |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of r.checks) {
    const [h, fa, ca] = tallyCells(c.proposed.overall);
    const sug = c.suggestion;
    const after = sug.verdict === 'none' ? ['—', '—', '—'] : tallyCells(sug.overall);
    const sv = sug.verdict === 'none' ? `none: ${sug.why}` : sug.verdict === 'keep' ? `keep ${num(sug.value)}` : `**${num(sug.value)}**`;
    L.push(`| \`${c.id}\` | \`${c.threshold.name}\` (${c.threshold.op} · ${c.threshold.unit}) | ${num(c.threshold.value)} | ${h} | ${fa} | ${ca} | ${sv} | ${after[0]} | ${after[1]} | ${after[2]} | ${HOW[c.mode]} |`);
  }
  L.push('');

  L.push('## By phone, at the PROPOSED value', '');
  L.push(`| Check | ${CAPTURE_DEVICES.map((d) => `${d}: hit · false alarms · catch`).join(' | ')} |`);
  L.push(`|---|${CAPTURE_DEVICES.map(() => '---').join('|')}|`);
  for (const c of r.checks) {
    L.push(`| \`${c.id}\` | ${CAPTURE_DEVICES.map((d) => { const t = c.proposed.byDevice[d]; return t ? tallyCells(t).join(' · ') : '—'; }).join(' | ')} |`);
  }
  L.push('');

  L.push('## Reps counted on good takes (hit rate on good reps)', '');
  L.push(`| Grader | ${CAPTURE_DEVICES.join(' | ')} |`, `|---|${CAPTURE_DEVICES.map(() => '---').join('|')}|`);
  for (const row of r.reps) L.push(`| ${row.grader} | ${CAPTURE_DEVICES.map((d) => { const x = row.byDevice[d]; return x ? `${pct(x.asked ? x.counted / x.asked : null)} (${x.counted}/${x.asked})` : '—'; }).join(' | ')} |`);
  L.push('');

  L.push('## The jump: the captured rate against the same take at 30 Hz (the T5 opt-in)', '');
  L.push('| Session | Take | Rate | Valid jumps | Best (cm) | Under 50 Hz | Landing timing scored | At 30 Hz: rate · valid · best · under 50 · timing scored |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const j of r.jumpRate) {
    const a = j.native, b = j.at30;
    L.push(`| ${j.session} | ${j.take} | ${num(a.hz)} Hz | ${a.validJumps} | ${num(a.bestCm)} | ${a.fpsLow ? 'yes' : 'no'} | ${a.symScored} | ${num(b.hz)} Hz · ${b.validJumps} · ${num(b.bestCm)} · ${b.fpsLow ? 'yes' : 'no'} · ${b.symScored} |`);
  }
  L.push('');

  L.push('## Frame-rate log (what each phone did) and the high-rate trial', '');
  L.push('| Session | Model | 30 fps takes: detect fps · ms | 60 fps takes: detect fps · ms | High-rate trial would |', '|---|---|---|---|---|');
  for (const x of r.rateLog) L.push(`| ${x.session} | ${x.model} | ${num(x.standardFps)} · ${num(x.standardMs)} | ${num(x.highFps)} · ${num(x.highMs)} | ${x.trial} |`);
  L.push('');
  return L.join('\n');
}
