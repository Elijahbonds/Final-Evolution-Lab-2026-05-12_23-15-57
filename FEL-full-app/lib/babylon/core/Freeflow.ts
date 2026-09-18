// Freeflow — The Hundred's combo flow, Arkham-style (THE HUNDRED, owner 2026-09-15: "combos, get in your bag. Chains combos
// together." Decisions: ARKHAM FREEFLOW · a combo counter + meter · reactive enemies · cinematic finishers).
//
// The mode already counted hits (a `hits` HUD with a 1.2 s chain), but nothing a player DID changed the count except
// connecting: a swing at air cost nothing, taking a punch cost nothing, and the number had no use. That is the button-masher
// shape the mechanics pass measured. Freeflow is the rule set that makes the count mean something:
//
//   · A LANDED hit (each body the arc reaches) extends the flow and resets its drop clock. The clock is generous early and
//     longer at a high count, so a flow is kept by tempo — picking the next body — not by frame-perfect pressing.
//   · A WHIFF near a live body breaks it. Swinging with nobody around (between waves) is shadow-boxing and costs nothing.
//   · Getting HIT breaks it (a blocked hit does not — the guard is a read, not a mistake).
//   · A COUNTER (the perfect read on a wound-up attacker) extends it and pays the meter more than a hit: reading beats mashing.
//   · The MULTIPLIER climbs every 5 in the flow (×1, ×1.5 … ×4) and multiplies what the flow banks.
//   · The METER fills with each hit, weighted by the strike. At 8 in the flow and half a meter, a TAKEDOWN is ready: one
//     press ends a body outright, costs half the meter, and the flow carries on.
//   · MILESTONES (5, 10, 20, 40, 60, 100) are one event each per flow — the banner and the camera beat.
//
// Pure: no Babylon, no clock of its own. The mode feeds it the game clock.

export type FlowWeight = 'light' | 'medium' | 'heavy' | 'finisher';
export type FlowBreak = 'whiff' | 'hurt' | 'dropped';

export const FREEFLOW = {
  /** Seconds a flow survives with no new hit. */
  dropSec: 1.6,
  /** …at FLOW_LONG_AT or more, where finding the next body across a crowd takes longer. */
  dropSecLong: 2.3,
  longAt: 10,
  multStep: 5,
  multMax: 4,
  takedownAt: 8,
  takedownCost: 0.5,
  meterPer: { light: 0.05, medium: 0.07, heavy: 0.09, finisher: 0.12 } as Record<FlowWeight, number>,
  counterMeter: 0.14,
  /** Points a body is worth per hit before the multiplier. */
  hitPts: 10,
  milestones: [5, 10, 20, 40, 60, 100] as readonly number[],
} as const;

export interface FlowEvent {
  count: number;
  mult: number;
  /** The milestone this event crossed, if any. */
  milestone: number | null;
  /** True on the event that made a takedown available. */
  takedownUnlocked: boolean;
  points: number;
}

export interface FlowBroken { reason: FlowBreak; lost: number; best: number }

export class Freeflow {
  count = 0;
  best = 0;
  meter = 0;
  /** Everything the flows have banked this session (already multiplied). */
  points = 0;
  private lastAt = -Infinity;
  private crossed = new Set<number>();
  private wasReady = false;

  mult(count = this.count): number {
    return Math.min(FREEFLOW.multMax, 1 + Math.floor(count / FREEFLOW.multStep) * 0.5);
  }

  get takedownReady(): boolean { return this.count >= FREEFLOW.takedownAt && this.meter >= FREEFLOW.takedownCost; }

  /** Seconds this flow may wait for its next hit. */
  dropSec(): number { return this.count >= FREEFLOW.longAt ? FREEFLOW.dropSecLong : FREEFLOW.dropSec; }

  /** 1 → 0 as the drop clock runs out; 0 with no flow. */
  drop01(now: number): number {
    if (this.count === 0) return 0;
    return Math.max(0, 1 - (now - this.lastAt) / this.dropSec());
  }

  /** `bodies` is how many the strike reached (an arc hits a crowd). */
  hit(bodies: number, weight: FlowWeight, now: number): FlowEvent {
    return this.extend(Math.max(0, Math.floor(bodies)), FREEFLOW.meterPer[weight] * Math.max(1, bodies), now);
  }

  /** The perfect read turned into a strike back. */
  counter(now: number): FlowEvent { return this.extend(1, FREEFLOW.counterMeter, now); }

  /** A takedown: spends the meter, counts, keeps the flow. Returns null when it was not available. */
  takedown(now: number): FlowEvent | null {
    this.update(now);                                   // a flow whose clock ran out is not one you can cash in
    if (!this.takedownReady) return null;
    this.meter = Math.max(0, this.meter - FREEFLOW.takedownCost);
    this.wasReady = this.takedownReady;
    return this.extend(1, 0, now);
  }

  /** A swing that reached nobody. `bodyNear` = a live body was close enough that this was a MISS, not shadow-boxing. */
  whiff(bodyNear: boolean): FlowBroken | null { return bodyNear ? this.break('whiff') : null; }

  hurt(): FlowBroken | null { return this.break('hurt'); }

  /** Call every frame; a flow whose clock ran out drops. */
  update(now: number): FlowBroken | null {
    if (this.count > 0 && now - this.lastAt > this.dropSec()) return this.break('dropped');
    return null;
  }

  reset(): void { this.count = 0; this.best = 0; this.meter = 0; this.points = 0; this.lastAt = -Infinity; this.crossed.clear(); this.wasReady = false; }

  private extend(n: number, meter: number, now: number): FlowEvent {
    if (this.count > 0 && now - this.lastAt > this.dropSec()) this.break('dropped');
    const before = this.count;
    this.count += n;
    this.best = Math.max(this.best, this.count);
    this.lastAt = now;
    this.meter = Math.min(1, this.meter + meter);
    const pts = n * FREEFLOW.hitPts * this.mult();
    this.points += pts;
    let milestone: number | null = null;
    for (const m of FREEFLOW.milestones) if (before < m && this.count >= m && !this.crossed.has(m)) { this.crossed.add(m); milestone = m; }
    const ready = this.takedownReady;
    const takedownUnlocked = ready && !this.wasReady;
    this.wasReady = ready;
    return { count: this.count, mult: this.mult(), milestone, takedownUnlocked, points: pts };
  }

  private break(reason: FlowBreak): FlowBroken | null {
    if (this.count === 0) return null;
    const lost = this.count;
    this.count = 0;
    this.crossed.clear();
    this.wasReady = false;
    return { reason, lost, best: this.best };
  }
}
