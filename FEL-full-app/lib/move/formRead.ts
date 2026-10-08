// formRead — the form read a body run leaves on its end card (movement play P10's FORM block; Mirror & coaching Plan
// Phase 7, 2026-10-07: "a P10 form-read FORM block on the 3PT, Dunk and fight end cards").
//
// P10's wire shape and the server's bound already exist (lib/move/formSummary: KIND_READS, READ_SPECS, the bound, the
// write); nothing on the client made the reads. This does, from the same body packets the game played on:
//   shot    (the 3PT)   one attempt per jump shot (or set shot): the jump's height and flight, release − the top of the
//                       jump, the dip, the follow-through (the releasing wrist held over the head line), the landing's
//                       drift; the approach reads (penultimate) when a run-up came first
//   jump    (the Dunk)  one attempt per take-off: the book's reads — height and hang (from the flight), the penultimate's
//                       drop and contact, the knee drive at toe-off, the arm swing's peak against the take-off — and the
//                       landing's absorb
//   strike  (the fights) one attempt per blow or kick: the hand's peak speed, the arm's extension, back to the guard; a
//                       kick's chamber (the knee over the hip)
//
// ABSENCE IS NOT ZERO (the plan's P10 gate). A read the camera could not make is null, and the block says "unread" —
// never a 0 cm jump or a 0 ms follow-through. A number outside what a body produces (formSummary.READ_SPECS) is unread
// too: the server would refuse it anyway, and the card must not show what the server would not keep.
//
// NOTHING IS SAVED HERE. The reads live in this page's memory for the run's end card and are gone with the next run or
// the page. Sending them to POST /api/sessions (the P10 history write, gated server-side to a verified, opted-in 18+
// account: canSaveScanNumbers) is formForPost's call, and it refuses for anyone this page cannot show is an adult
// (bodyPlayNeedsGrownUp: a minor, or an unknown age) — so a minor's reads never leave the device.
//
// Fed by one line in ModeHarness (the packets of a mode the body drives, in play, past the START latch). Pure apart
// from the module store; no DOM, no camera.
import type { BodyEvent, BodyRead, Hand } from '@/lib/pose/BodyReader';
import { FORM_SUMMARY_VERSION, KIND_READS, MAX_FORM_ATTEMPTS, READ_SPECS, type FormAttempt, type FormAttemptKind, type FormSummary, type ReadKey } from './formSummary';
import { bodyPlayNeedsGrownUp, readBodyPlayAge } from './bodyPlayGrownUp';
import type { StorageLike } from '@/lib/screen/store';

/** The games with a FORM block, by def.modeId, and what each one reads. The fights behind a false flag read only when
 *  their body play is on (the tap runs only where the body drives the mode). */
export const FORM_KIND_BY_MODE: Readonly<Record<string, FormAttemptKind>> = Object.freeze({
  threepoint: 'shot',
  dunk: 'jump',
  'karate-vs': 'strike', mixedcombat: 'strike', showdown: 'strike', duel: 'strike', karate: 'strike',
});

/** Reads kept for look-backs (ms of capture clock): the longest look is a guard's return after a blow. */
export const HISTORY_MS = 3200;
/** A jump attempt closes this long after its landing (the absorb, the follow-through). */
export const CLOSE_AFTER_LAND_MS = 600;
/** A set shot closes this long after its release (its follow-through). */
export const CLOSE_AFTER_SET_MS = 1200;
/** A take-off never landed is closed this long after it (the body lost in the air). */
export const CLOSE_UNLANDED_MS = 1600;
/** A dip this long before the take-off is the jump's load; a penultimate this long before, its approach. */
export const DIP_BEFORE_MS = 700;
export const PEN_BEFORE_MS = 1500;
/** A release this long before the take-off still belongs to the jump (hoopsBody.RELEASE_BEFORE_TAKEOFF_MS). */
export const RELEASE_BEFORE_MS = 250;
/** The landing's absorb: a dip told inside this of the landing. */
export const ABSORB_WINDOW_MS = 500;
/** The knee drive is read over the toe-off: from a frame before it to this after. */
export const KNEE_AFTER_MS = 250;
/** The arm swing's peak is looked for in this window around the take-off. */
export const ARM_BEFORE_MS = 400, ARM_AFTER_MS = 200;
/** A blow is closed (its guard return read or given up) this long after its peak. */
export const STRIKE_CLOSE_MS = 1500;

type Reads = Record<string, number | null>;

/** A number inside what a body produces for this read, or null (unread). */
export function inSpec(key: ReadKey, v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const { min, max } = READ_SPECS[key];
  return v >= min && v <= max ? Math.round(v * 100) / 100 : null;
}

function blankReads(kind: FormAttemptKind): Reads {
  return Object.fromEntries(KIND_READS[kind].map((k) => [k, null]));
}

interface OpenJump {
  takeoff: { t: number; feet: 'one' | 'two' } | null;
  apexT: number | null;
  land: { t: number; flightMs: number; heightM: number } | null;
  release: { t: number; hand: Hand } | null;
  dipM: number | null;
  pen: { depthM: number; contactMs: number } | null;
  absorbM: number | null;
  openedAt: number;
}

interface OpenStrike { t: number; peakT: number; hand: Hand; foot: boolean; label: string; speed: number | null }

/** One run's form read, for one kind. */
export class FormReader {
  readonly attempts: FormAttempt[] = [];
  attemptCount = 0;
  private hist: BodyRead[] = [];
  private jump: OpenJump | null = null;
  private strikes: OpenStrike[] = [];
  private lastDip: { t: number; depthM: number } | null = null;
  private lastPen: { t: number; depthM: number; contactMs: number } | null = null;
  private guardUps: number[] = [];

  constructor(readonly mode: string, readonly kind: FormAttemptKind) {}

  /** One packet: its frame for the look-backs, its events for the attempts. */
  feed(read: BodyRead, events: readonly BodyEvent[]): void {
    if (read.present) {
      this.hist.push(read);
      while (this.hist.length && read.t - this.hist[0].t > HISTORY_MS) this.hist.shift();
    }
    for (const ev of events) this.see(ev);
    this.closeDue(read.t);
  }

  /** The run is over: every open attempt closes with what it has. */
  finish(): void {
    if (this.jump) this.closeJump();
    for (const s of this.strikes.splice(0)) this.closeStrike(s);
  }

  private see(ev: BodyEvent): void {
    if (ev.kind === 'dip') {
      this.lastDip = { t: ev.t, depthM: ev.depthM };
      if (this.jump?.land && ev.t >= this.jump.land.t && ev.t - this.jump.land.t <= ABSORB_WINDOW_MS) this.jump.absorbM = ev.depthM;
      return;
    }
    if (ev.kind === 'penultimate') { this.lastPen = { t: ev.t, depthM: ev.depthM, contactMs: ev.contactMs }; return; }
    if (this.kind === 'strike') { this.seeStrike(ev); return; }
    switch (ev.kind) {
      case 'takeoff': {
        if (this.jump?.takeoff) this.closeJump();
        const prior = this.jump;   // a set shot's release just before this take-off belongs to the jump
        const dip = this.lastDip && ev.t - this.lastDip.t <= DIP_BEFORE_MS && this.lastDip.t <= ev.t ? this.lastDip.depthM : null;
        const pen = this.lastPen && ev.t - this.lastPen.t <= PEN_BEFORE_MS && this.lastPen.t <= ev.t ? { depthM: this.lastPen.depthM, contactMs: this.lastPen.contactMs } : null;
        const keep = prior?.release && ev.t - prior.release.t <= RELEASE_BEFORE_MS ? prior.release : null;
        if (prior && !keep) this.closeJump();
        this.jump = { takeoff: { t: ev.t, feet: ev.feet }, apexT: null, land: null, release: keep, dipM: dip, pen, absorbM: null, openedAt: ev.t };
        return;
      }
      case 'apex': if (this.jump?.takeoff) this.jump.apexT = ev.t; return;
      case 'land': if (this.jump?.takeoff && !this.jump.land) this.jump.land = { t: ev.t, flightMs: ev.flightMs, heightM: ev.heightM }; return;
      case 'release': {
        if (this.kind !== 'shot') return;
        const j = this.jump;
        if (j?.takeoff && !j.release && ev.t >= j.takeoff.t - RELEASE_BEFORE_MS && (!j.land || ev.t <= j.land.t + 100)) { j.release = { t: ev.t, hand: ev.hand }; return; }
        if (!j) this.jump = { takeoff: null, apexT: null, land: null, release: { t: ev.t, hand: ev.hand }, dipM: null, pen: null, absorbM: null, openedAt: ev.t };
        return;
      }
      default:
    }
  }

  private seeStrike(ev: BodyEvent): void {
    if (ev.kind === 'guard' && ev.up) { this.guardUps.push(ev.t); return; }
    if (ev.kind === 'blow') this.strikes.push({ t: ev.t, peakT: ev.peakT, hand: ev.hand, foot: false, label: ev.name.toUpperCase(), speed: ev.speed });
    else if (ev.kind === 'legKick') this.strikes.push({ t: ev.t, peakT: ev.peakT, hand: ev.foot, foot: true, label: `${ev.form.toUpperCase()} KICK`, speed: null });
  }

  private closeDue(t: number): void {
    const j = this.jump;
    if (j) {
      if (j.land && t - j.land.t >= CLOSE_AFTER_LAND_MS) this.closeJump();
      else if (!j.takeoff && j.release && t - j.release.t >= CLOSE_AFTER_SET_MS) this.closeJump();
      else if (j.takeoff && !j.land && t - j.takeoff.t >= CLOSE_UNLANDED_MS) this.closeJump();
    }
    while (this.strikes.length && t - this.strikes[0].peakT >= STRIKE_CLOSE_MS) this.closeStrike(this.strikes.shift()!);
  }

  private push(a: FormAttempt): void {
    this.attemptCount++;
    if (this.attempts.length < MAX_FORM_ATTEMPTS) this.attempts.push(a);
  }

  private readsBetween(a: number, b: number): BodyRead[] { return this.hist.filter((r) => r.t >= a && r.t <= b); }
  private readNear(t: number): BodyRead | null {
    let best: BodyRead | null = null;
    for (const r of this.hist) if (!best || Math.abs(r.t - t) < Math.abs(best.t - t)) best = r;
    return best && Math.abs(best.t - t) <= 100 ? best : null;
  }

  private closeJump(): void {
    const j = this.jump;
    this.jump = null;
    if (!j) return;
    const kind = this.kind === 'shot' ? 'shot' : 'jump';
    const r = blankReads(kind);
    // the jump, timed off the flight: the reader's landing gives both, one measurement (h = g·T²/8)
    if (j.land) { r.heightCm = inSpec('heightCm', j.land.heightM * 100); r.flightMs = inSpec('flightMs', j.land.flightMs); }
    if (r.heightCm === null || r.flightMs === null) { r.heightCm = null; r.flightMs = null; }
    if (j.pen) { r.penultimateDropCm = inSpec('penultimateDropCm', j.pen.depthM * 100); r.penultimateContactMs = inSpec('penultimateContactMs', j.pen.contactMs); }
    if (j.takeoff) {
      const T = j.takeoff.t;
      // the free knee at toe-off: the higher knee's height against its own hip (cm, − = below the hip line)
      const knees = this.readsBetween(T - 40, T + KNEE_AFTER_MS).flatMap((x) => (x.knee ? [Math.max(x.knee.L.relHipM, x.knee.R.relHipM)] : []));
      r.kneeDriveCm = knees.length ? inSpec('kneeDriveCm', Math.max(...knees) * 100) : null;
      // the arms' upward whip: when their fastest upward speed came, against the take-off (ms, − = before it)
      let best = -Infinity, at: number | null = null;
      for (const x of this.readsBetween(T - ARM_BEFORE_MS, T + ARM_AFTER_MS)) {
        const v = Math.max(x.wrist?.L.vRel?.y ?? -Infinity, x.wrist?.R.vRel?.y ?? -Infinity);
        if (v > best) { best = v; at = x.t; }
      }
      r.armSwingMs = at !== null && best > 0.5 ? inSpec('armSwingMs', at - T) : null;
    }
    if (kind === 'jump') {
      r.absorbCm = j.absorbM === null ? null : inSpec('absorbCm', j.absorbM * 100);
    } else {
      r.dipCm = j.dipM === null ? null : inSpec('dipCm', j.dipM * 100);
      r.releaseVsApexMs = j.release && j.apexT !== null ? inSpec('releaseVsApexMs', j.release.t - j.apexT) : null;
      if (j.release) {
        // the follow-through: the releasing wrist held over the head line after the release
        const hand = j.release.hand;
        const after = this.readsBetween(j.release.t, j.release.t + READ_SPECS.followThroughMs.max).filter((x) => x.wrist);
        const down = after.find((x) => x.wrist![hand].overhead === false);
        r.followThroughMs = down ? inSpec('followThroughMs', down.t - j.release.t) : null;
      }
      if (j.takeoff && j.land) {
        const a = this.readNear(j.takeoff.t), b = this.readNear(j.land.t);
        const sw = a?.rulers?.shoulderWidthM ?? b?.rulers?.shoulderWidthM ?? null;
        const s0 = a?.lean?.sideSw, s1 = b?.lean?.sideSw;
        r.landingDriftCm = sw !== null && s0 != null && s1 != null ? inSpec('landingDriftCm', (s1 - s0) * sw * 100) : null;
      }
    }
    const attempt = {
      kind,
      label: kind === 'shot' ? (j.takeoff ? 'JUMP SHOT' : 'SET SHOT') : null,
      player: null,
      made: null,
      takeoff: j.takeoff?.feet ?? null,
      reads: r,
    } as FormAttempt;
    this.push(attempt);
  }

  private closeStrike(s: OpenStrike): void {
    const r = blankReads('strike');
    const during = this.readsBetween(s.t, s.peakT + 150);
    if (!s.foot) {
      r.handSpeedMps = inSpec('handSpeedMps', s.speed);
      const elbows = during.flatMap((x) => (x.elbowDeg ? [x.elbowDeg[s.hand]] : []));
      r.extensionDeg = elbows.length ? inSpec('extensionDeg', Math.max(...elbows)) : null;
      // back to the guard: the first guard read up after the peak (the fight read's state, or its guard event)
      const guardEv = this.guardUps.find((g) => g > s.peakT);
      const guardRead = this.hist.find((x) => x.t > s.peakT && x.fight?.guard === true);
      const back = [guardEv, guardRead?.t].filter((x): x is number => typeof x === 'number');
      r.guardReturnMs = back.length ? inSpec('guardReturnMs', Math.min(...back) - s.peakT) : null;
    } else {
      // a kick's chamber: the kicking knee's peak height against its own hip (cm)
      const k = during.flatMap((x) => (x.knee ? [x.knee[s.hand].relHipM] : []));
      r.chamberCm = k.length ? inSpec('chamberCm', Math.max(...k) * 100) : null;
    }
    this.push({ kind: 'strike', label: s.label, player: null, made: null, takeoff: null, reads: r } as FormAttempt);
  }

  summary(): FormSummary {
    return { v: FORM_SUMMARY_VERSION, mode: this.mode, attemptCount: this.attemptCount, attempts: this.attempts.slice() };
  }
}

// ── the block's lines ────────────────────────────────────────────────────────────────────────────────────────────

export const UNREAD = 'unread';
export interface FormLine { label: string; value: string; read: boolean }

const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const vals = (s: FormSummary, k: string): number[] => s.attempts.flatMap((a) => { const v = (a.reads as Reads)[k]; return typeof v === 'number' ? [v] : []; });

function line(label: string, xs: number[], fmt: (v: number) => string, pick: (xs: number[]) => number = median): FormLine {
  return xs.length ? { label, value: fmt(pick(xs)), read: true } : { label, value: UNREAD, read: false };
}
const ms = (v: number): string => `${Math.round(Math.abs(v))} ms`;
const timing = (v: number, after: string, before: string): string => (Math.abs(v) < 15 ? `on ${after.replace(/^after /, '')}` : v < 0 ? `${ms(v)} ${before}` : `${ms(v)} ${after}`);

/** What the end card's FORM block says, in the book's words. Every line is a number or "unread" — never a made-up 0. */
export function formLines(s: FormSummary, kind: FormAttemptKind): FormLine[] {
  if (kind === 'shot') {
    return [
      line('Release vs the top of the jump', vals(s, 'releaseVsApexMs'), (v) => timing(v, 'after the top', 'before the top')),
      line('Jump', vals(s, 'heightCm'), (v) => `${Math.round(v)} cm`),
      line('Dip', vals(s, 'dipCm'), (v) => `${Math.round(v)} cm`),
      line('Follow-through held', vals(s, 'followThroughMs'), (v) => `${(v / 1000).toFixed(1)} s`),
      line('Landing drift', vals(s, 'landingDriftCm').map(Math.abs), (v) => `${Math.round(v)} cm`),
    ];
  }
  if (kind === 'jump') {
    const max = (xs: number[]) => Math.max(...xs);
    return [
      line('Best jump', vals(s, 'heightCm'), (v) => `${Math.round(v)} cm`, max),
      line('Hang time', vals(s, 'flightMs'), (v) => `${(v / 1000).toFixed(2)} s`, max),
      line('Penultimate drop', vals(s, 'penultimateDropCm'), (v) => `${Math.round(v)} cm`),
      line('Knee drive (vs the hip)', vals(s, 'kneeDriveCm'), (v) => `${v >= 0 ? '+' : ''}${Math.round(v)} cm`),
      line('Arm swing peak', vals(s, 'armSwingMs'), (v) => timing(v, 'after take-off', 'before take-off')),
      line('Landing absorb', vals(s, 'absorbCm'), (v) => `${Math.round(v)} cm`),
    ];
  }
  return [
    line('Hand speed', vals(s, 'handSpeedMps'), (v) => `${v.toFixed(1)} m/s`),
    line('Arm extension', vals(s, 'extensionDeg'), (v) => `${Math.round(v)}°`),
    line('Back to the guard', vals(s, 'guardReturnMs'), (v) => `${(v / 1000).toFixed(2)} s`),
    line('Kick chamber (knee vs hip)', vals(s, 'chamberCm'), (v) => `${v >= 0 ? '+' : ''}${Math.round(v)} cm`),
  ];
}

const NOUN: Record<FormAttemptKind, [string, string]> = { shot: ['shot', 'shots'], jump: ['jump', 'jumps'], strike: ['strike', 'strikes'], board: ['landing', 'landings'] };
export function attemptsLine(s: FormSummary, kind: FormAttemptKind): string {
  const n = s.attemptCount, [one, many] = NOUN[kind];
  return `${n} ${n === 1 ? one : many} read`;
}

// ── the run's store ──────────────────────────────────────────────────────────────────────────────────────────────

export interface FormView {
  runId: number;
  mode: string;
  kind: FormAttemptKind;
  summary: FormSummary;
  lines: FormLine[];
  head: string;
}

let reader: FormReader | null = null;
let runKey = -1;
const listeners = new Set<() => void>();

export const formReadStore = {
  /**
   * One packet of a mode the body drives, in play (ModeHarness). A new run (sessionStore's runId) starts a new read; a
   * mode with no FORM block is not read at all.
   */
  tap(modeId: string, runId: number, read: BodyRead, events: readonly BodyEvent[]): void {
    const kind = FORM_KIND_BY_MODE[modeId];
    if (!kind) return;
    if (!reader || runKey !== runId || reader.mode !== modeId) { reader = new FormReader(modeId, kind); runKey = runId; }
    const before = reader.attemptCount;
    reader.feed(read, events);
    if (reader.attemptCount !== before) listeners.forEach((fn) => fn());
  },
  /** The run's read for its end card: every open attempt closed; null when it is another run's, or nothing was read. */
  finishRun(runId: number | null | undefined): FormView | null {
    if (!reader || runId === null || runId === undefined || runId !== runKey) return null;
    reader.finish();
    const summary = reader.summary();
    if (!summary.attemptCount) return null;
    return { runId: runKey, mode: reader.mode, kind: reader.kind, summary, lines: formLines(summary, reader.kind), head: attemptsLine(summary, reader.kind) };
  },
  subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; },
  /** Tests and a page leaving: forget the run. */
  reset(): void { reader = null; runKey = -1; },
};

/**
 * The `form` POST /api/sessions may carry for this run, or null. NULL FOR A MINOR OR AN UNKNOWN AGE: body play's own rule
 * (bodyPlayNeedsGrownUp) — this page must be able to show an adult before a single read leaves it. The server then keeps
 * it only for a verified, opted-in 18+ account (canSaveScanNumbers). A read with no number in it is not sent.
 */
export function formForPost(view: FormView | null, store: StorageLike | null, now: Date = new Date()): FormSummary | null {
  if (!view) return null;
  if (bodyPlayNeedsGrownUp(readBodyPlayAge(store), now)) return null;
  const any = view.summary.attempts.some((a) => Object.values(a.reads).some((v) => v !== null));
  return any ? view.summary : null;
}
