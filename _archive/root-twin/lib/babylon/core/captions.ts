// captions — the accessibility cue bus (M82 contract, integrated in Pass 2/M100).
//
// M100 measured ZERO aria-live regions across dunk, karate, onevone and tennis
// on the deployed build: every scoring/tell/sound cue the game produces was
// being written into nowhere because no surface subscribed to it and no bus
// existed to carry it. This is that bus.
//
// It is deliberately tiny and framework-free: modes call cue() during play,
// and `CaptionRegion.tsx` (the only current subscriber) renders the visible
// set into two aria-live regions so a screen reader announces them. Keeping it
// Babylon-free and React-free means it can be unit tested and called from any
// layer without pulling the engine or the DOM into scope.

/**
 * How much a cue justifies interrupting the player.
 *
 * `critical` is the only importance that becomes an assertive live region —
 * assertive cuts the screen reader off mid-sentence, so using it for routine
 * feedback makes the game unusable. Everything else is announced politely.
 */
export type CueImportance = 'critical' | 'feedback' | 'ambient';

export interface Caption {
  id: string;
  text: string;
  importance: CueImportance;
  /** ms timestamp the cue was raised, for age-out ordering. */
  at: number;
}

type Listener = (all: Caption[]) => void;

/**
 * How long a cue stays in the visible set before it ages out, per importance.
 * Critical cues linger a little so a slow reader is not cut short; ambient
 * ones clear fast so they never bury a cue the player must act on.
 */
const TTL_MS: Record<CueImportance, number> = {
  critical: 6000,
  feedback: 4000,
  ambient: 2500,
};

/** Importance sort weight — critical first, so `slice(0, n)` keeps the cues
 *  that matter and drops ambient chatter. CaptionRegion relies on this order. */
const RANK: Record<CueImportance, number> = { critical: 0, feedback: 1, ambient: 2 };

class CaptionBus {
  private items: Caption[] = [];
  private listeners = new Set<Listener>();
  private seq = 0;
  /** Injectable clock so tests are deterministic. */
  now: () => number = () => Date.now();

  /** Raise a cue. Called by modes, sounds and tells during play. */
  cue(text: string, importance: CueImportance = 'feedback'): Caption {
    const c: Caption = { id: `c${++this.seq}`, text, importance, at: this.now() };
    this.items.push(c);
    this.emit();
    return c;
  }

  /**
   * The cues that should be on screen right now, CRITICAL FIRST.
   * Aged-out cues are pruned here so a stale reading never lingers.
   */
  visible(): Caption[] {
    const t = this.now();
    this.items = this.items.filter((c) => t - c.at < TTL_MS[c.importance]);
    return [...this.items].sort((a, b) =>
      RANK[a.importance] - RANK[b.importance] || b.at - a.at);
  }

  /**
   * Subscribe to the visible set. Fires immediately with the current state —
   * a live region must be told what is already showing when it mounts —
   * and returns an unsubscribe.
   */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.visible());
    return () => { this.listeners.delete(fn); };
  }

  /** Drop everything. Used between sessions so cues never leak across modes. */
  clear(): void {
    this.items = [];
    this.emit();
  }

  private emit(): void {
    const snapshot = this.visible();
    this.listeners.forEach((fn) => fn(snapshot));
  }
}

/** Process-wide singleton — one bus every producer and the region share. */
export const captions = new CaptionBus();
