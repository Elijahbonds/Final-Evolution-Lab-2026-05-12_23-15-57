// JudgePanel — FEL's shared Judge/Scoring system (Mode 1 Phase 7).
//
// Extracted from DunkMode/DunkDuelMode, which previously copy-pasted the
// same persona trio. One module now owns:
//   1. THE JUDGES — Silk (style), Doc (execution), Prime (difficulty):
//      weighted lenses + voice lines.
//   2. THE REVEAL — ScoreReveal sequences the verdict like a televised
//      contest, beating NBA Live 07/08's instant number flash:
//        beat 1  judges confer (drum bed starts, crowd hushes)
//        beat 2  Silk's card      (style judge first — sets the tone)
//        beat 3  Doc's card       (execution — confirms or undercuts)
//        beat 4  LONG beat        (Prime makes you wait — the tension peak)
//        beat 5  Prime's card + total + eruption/hush by score band
//      The mode drives the plan frame-by-frame; all timings here are pure
//      data so the drama is testable headlessly.
//   3. CrowdEnergy — the building's voice as a 0..1 level driven by hype,
//      momentum tier, and chain length; big scores spike it, blown dunks
//      hush it. Modes map the level to ambient volume + crowd VFX.

// ── Judges ─────────────────────────────────────────────────────────────────
export interface JudgeScore { name: string; score: number; line: string }

export const JUDGES = [
  { id: 'silk', name: 'Silk', w: { difficulty: 0.2, execution: 0.3, style: 0.5 } },
  { id: 'doc', name: 'Doc', w: { difficulty: 0.3, execution: 0.5, style: 0.2 } },
  { id: 'prime', name: 'Prime', w: { difficulty: 0.5, execution: 0.3, style: 0.2 } },
] as const;

export function cannedLine(name: string, score: number): string {
  if (score >= 10) return `${name}: THAT'S A TEN. Hand me the mic.`;
  if (score >= 9) return `${name}: about as good as it gets.`;
  if (score >= 7) return `${name}: real difficulty, clean finish.`;
  return `${name}: gets it done — I've seen bigger.`;
}

export function judgeDunk(difficulty: number, execution: number, style: number): JudgeScore[] {
  return JUDGES.map((j) => {
    const raw = difficulty * j.w.difficulty + execution * j.w.execution + style * j.w.style;
    const score = Math.max(6, Math.min(10, Math.round(6 + raw * 0.4)));
    return { name: j.name, score, line: cannedLine(j.name, score) };
  });
}

// ── Staged reveal ──────────────────────────────────────────────────────────
export interface RevealBeat {
  at: number;                    // seconds into the reveal
  kind: 'confer' | 'card' | 'drum' | 'total';
  judge?: JudgeScore;            // for 'card'
  total?: number;                // for 'total'
  band?: 'eruption' | 'approval' | 'tepid' | 'hush';
}

export const REVEAL_ORDER = ['Silk', 'Doc', 'Prime'] as const;

export function totalBand(total: number): 'eruption' | 'approval' | 'tepid' | 'hush' {
  if (total >= 27) return 'eruption';
  if (total >= 24) return 'approval';
  if (total >= 20) return 'tepid';
  return 'hush';
}

/** Build the timed beat plan for a judged dunk. */
export function planReveal(scores: JudgeScore[]): RevealBeat[] {
  const byName = new Map(scores.map((s) => [s.name, s]));
  const total = scores.reduce((s, j) => s + j.score, 0);
  return [
    { at: 0.0, kind: 'confer' },
    { at: 0.9, kind: 'card', judge: byName.get(REVEAL_ORDER[0]) },
    { at: 1.9, kind: 'card', judge: byName.get(REVEAL_ORDER[1]) },
    { at: 2.6, kind: 'drum' },                         // Prime makes you wait
    { at: 3.4, kind: 'card', judge: byName.get(REVEAL_ORDER[2]) },
    { at: 4.0, kind: 'total', total, band: totalBand(total) },
  ];
}

/** How long the reveal runs before the mode may advance. */
export const REVEAL_DURATION_SEC = 4.6;

/** Frame driver: returns beats that fired since the last call. */
export class ScoreReveal {
  private plan: RevealBeat[] = [];
  private t = 0;
  private fired = 0;
  active = false;

  start(scores: JudgeScore[]): void {
    this.plan = planReveal(scores);
    this.t = 0; this.fired = 0; this.active = true;
  }

  update(dt: number): RevealBeat[] {
    if (!this.active) return [];
    this.t += dt;
    const out: RevealBeat[] = [];
    while (this.fired < this.plan.length && this.plan[this.fired].at <= this.t) {
      out.push(this.plan[this.fired++]);
    }
    if (this.t >= REVEAL_DURATION_SEC) this.active = false;
    return out;
  }
}

// ── Crowd energy ───────────────────────────────────────────────────────────
export class CrowdEnergy {
  level = 0.25;                 // ambient bed never fully silent

  /** React to a revealed score. */
  onScore(total: number): void {
    const band = totalBand(total);
    if (band === 'eruption') this.level = 1;
    else if (band === 'approval') this.level = Math.max(this.level, 0.75);
    else if (band === 'tepid') this.level = Math.max(0.4, this.level * 0.8);
    else this.level = 0.18;                                    // the hush
  }

  /** Live drift toward what the moment deserves (hype + chain + tier). */
  update(dt: number, hype01: number, chain: number, onFire: boolean): void {
    const want = Math.min(1, 0.3 + hype01 * 0.45 + Math.min(0.2, chain * 0.06) + (onFire ? 0.2 : 0));
    const rate = want > this.level ? 0.8 : 0.35;               // rises fast, settles slow
    this.level += (want - this.level) * Math.min(1, rate * dt * 4);
  }
}
