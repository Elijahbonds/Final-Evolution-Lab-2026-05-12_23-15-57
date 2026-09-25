// QaTrace — CAUSE → EFFECT, measured (MECHANICS PASS, 2026-09-15).
//
// Owner: "Does what's happening make sense?" The symptom they picked is UNCLEAR CAUSE → EFFECT: you press something
// and cannot tell what happened or why — no named action, no feedback on a miss, a score that appears without a
// visible reason. The bar is ARCADE-READABLE (THPS2 / NBA Street / SSX): every press is answered by something you can
// see or hear, including a refusal ("NO AIR", "TOO EARLY").
//
// That is measurable without knowing anything about a mode, which is what lets one probe grade all 31:
//   · a PRESS is a button going down (or a trigger crossing half) that the harness delivered to the mode;
//   · a RESPONSE is anything a player perceives — a HUD change a player reads (a banner, a callout, the score, a
//     combo, a phase), a JuiceKit beat (scorePop, banner, flash, shake, hit-stop, slow-mo), an impact, a sound, or
//     the hero's DOMINANT clip changing;
//   · a SILENT PRESS is a press with no response inside the window;
//   · an UNEXPLAINED SCORE is the score changing with no banner / pop / sound around it.
//
// QA-only: nothing is recorded unless the agent bridge is on (`?agent=1`). Pure bookkeeping here; the harness feeds it.

export type QaKind = 'press' | 'hud' | 'juice' | 'sfx' | 'impact' | 'anim' | 'score';
export interface QaEvent { t: number; kind: QaKind; key: string }

/** HUD keys that change continuously (clocks, meters, speeds) — a change there is not an answer to a press. */
const CONTINUOUS = /^(hint|time|timeLeft|timer|clock|speed|height|spin|charge|power|momentum|boost|boosting|boostFull|hype|fps|distance|dist|meter|pitch|roll|yaw|throttle|altitude|alt|lap?Time|elapsed|progress|stamina|hp|energy|flow|lookX|lookY|pos|x|y|z)$/i;
/** Numeric HUD keys that are discrete outcomes (a change IS news). Everything else numeric is treated as continuous. */
const DISCRETE_NUM = /^(score|combo|chain|kos|makes|misses|points|pts|strokes|wave|lap|gates?|coins|rivalScore|pot|banked|goals?|runs|outs|strikes|balls|kills|rings|place|position|round|attempt|streak|multiplier|mult|tricks?)$/i;
const SCORE_KEYS = /^(score|points|pts|banked)$/i;

/** One raw body event as the harness had it: its kind, and how late it reached the page (arrival − capture, ms). */
export interface QaBodyEvent { t: number; kind: string; lagMs: number }

export class QaTrace {
  readonly events: QaEvent[] = [];
  /**
   * MOVEMENT PLAY P3 (2026-09-24): the body's RAW events (a take-off, a step, a dip, a punch …), with their lag, for the
   * probes. Kept OUT of `events` on purpose: summary() grades presses the mode received, and a move the floor turned into
   * a press is already one of those (and a mode's claimed verb is logged as `body:<kind>` there). A raw step in a mode
   * that binds nothing is not a press, and must never read as a silent one.
   */
  readonly bodyLog: QaBodyEvent[] = [];
  private last = new Map<string, string>();
  constructor(private now: () => number = () => performance.now(), private cap = 20000) {}

  private push(kind: QaKind, key: string): void {
    if (this.events.length >= this.cap) this.events.splice(0, 2000);
    this.events.push({ t: this.now(), kind, key });
  }

  press(btn: string): void { this.push('press', btn); }
  juice(what: string): void { this.push('juice', what); }
  sfx(name: string): void { this.push('sfx', name); }
  impact(): void { this.push('impact', 'impact'); }
  anim(clip: string): void { this.push('anim', clip); }
  /** A raw body event, told `lagMs` after its capture: to bodyLog only (see above). */
  body(kind: string, lagMs: number): void {
    if (this.bodyLog.length >= this.cap) this.bodyLog.splice(0, 2000);
    this.bodyLog.push({ t: this.now(), kind, lagMs });
  }

  /** A setHud update: records only the keys a player reads as news. */
  hud(update: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(update)) {
      if (CONTINUOUS.test(k)) continue;
      if (typeof v === 'number' && !DISCRETE_NUM.test(k)) continue;
      if (v !== null && typeof v === 'object') continue;
      const s = v == null ? '' : String(v);
      if (this.last.get(k) === s) continue;
      const had = this.last.has(k);
      this.last.set(k, s);
      if (!had && (s === '' || s === '0')) continue;          // the first publish of an empty field is not an event
      if (typeof v === 'string' && s === '') continue;         // a banner clearing is not an answer
      if (SCORE_KEYS.test(k)) this.push('score', k);
      else this.push('hud', k);
    }
  }

  reset(): void { this.events.length = 0; this.bodyLog.length = 0; this.last.clear(); }

  /** The last value of every news-bearing HUD key (score, banner, combo…) — what a probe reads an outcome from. */
  snapshot(): Record<string, string> { return Object.fromEntries(this.last); }

  /**
   * The grade. `windowMs` is how long a press may wait for its answer (an arcade game answers inside a few frames;
   * 450 ms admits a wind-up clip that starts late). `from` limits to events after that time.
   */
  summary(windowMs = 450, from = 0): QaSummary {
    const ev = this.events.filter((e) => e.t >= from);
    const responses = ev.filter((e) => e.kind !== 'press');
    const byBtn: Record<string, { presses: number; answered: number; answers: Record<string, number> }> = {};
    let ri = 0;
    for (const p of ev) {
      if (p.kind !== 'press') continue;
      const row = (byBtn[p.key] ??= { presses: 0, answered: 0, answers: {} });
      row.presses++;
      while (ri < responses.length && responses[ri].t < p.t) ri++;
      let hit: QaEvent | null = null;
      for (let j = ri; j < responses.length && responses[j].t <= p.t + windowMs; j++) {
        if (responses[j].kind !== 'score') { hit = responses[j]; break; }
        hit ??= responses[j];
      }
      if (hit) { row.answered++; const tag = `${hit.kind}:${hit.key}`; row.answers[tag] = (row.answers[tag] ?? 0) + 1; }
    }
    // a score change with nothing a player perceives within ±500 ms of it
    const cues = ev.filter((e) => e.kind === 'hud' || e.kind === 'juice' || e.kind === 'sfx' || e.kind === 'impact');
    let unexplained = 0, scores = 0;
    for (const s of ev) {
      if (s.kind !== 'score') continue;
      scores++;
      if (!cues.some((c) => Math.abs(c.t - s.t) <= 500)) unexplained++;
    }
    const presses = Object.values(byBtn).reduce((a, r) => a + r.presses, 0);
    const answered = Object.values(byBtn).reduce((a, r) => a + r.answered, 0);
    return {
      presses, answered, silentPct: presses ? Math.round((1 - answered / presses) * 100) : 0,
      byBtn, scores, unexplainedScores: unexplained,
      responses: responses.length,
    };
  }
}

export interface QaSummary {
  presses: number;
  answered: number;
  /** Percent of presses with no perceivable answer inside the window. */
  silentPct: number;
  byBtn: Record<string, { presses: number; answered: number; answers: Record<string, number> }>;
  scores: number;
  unexplainedScores: number;
  responses: number;
}
