// OV75-2 (ALL-MODES-TO-75 §9 H-02; Gameplay TUNE sheet 2026-10-23): one contact reaction per bump. A held lean called
// hardHit every frame — an impact sound, a feel hit and a shake each time. Now a hit is ACCEPTED only past the speed gate,
// and the same ordered pair (attacker → victim) is quiet for HARD_HIT_DEBOUNCE_MS after an accepted hit. Pure.

export const HARD_HIT_DEBOUNCE_MS = 250;   //TUNE(elijah) — Gameplay's start value

export class HardHitDebounce {
  private last = new Map<string, number>();
  constructor(private readonly windowMs = HARD_HIT_DEBOUNCE_MS) {}
  /** True (and the window restarts) when this pair has had no accepted hit in the last `windowMs`; false = a no-op call. */
  accept(attacker: string, victim: string, nowMs: number): boolean {
    const key = `${attacker}>${victim}`;
    const prev = this.last.get(key);
    if (prev !== undefined && nowMs - prev < this.windowMs) return false;
    this.last.set(key, nowMs);
    return true;
  }
  reset(): void { this.last.clear(); }
}
