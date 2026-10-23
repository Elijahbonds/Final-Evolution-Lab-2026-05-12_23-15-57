// DunkContact — CONTACT-RIM-SOUND (2026-10-22): the jam's CONTACT decision and the dunk's sound hooks (DUNK-MODE-PLAN §11.1).
//
//   The rim sound and contactPunch (thud, hit-stop, shake, flash, camera pulse, net burst) used to fire on the 0.28 s timeout
//   after the slam press, or on the flush leaving the lip — wherever the ball was ("9 cm of daylight", "0.35 m off the iron").
//   CONTACT is now the frame the ball in the dunking hand meets the iron BY GEOMETRY, and only that frame. A jam that never
//   reaches the iron is a miss — SHORT OF THE IRON at JAM_SHORT_SEC — and never a contact.
//
//   `ironContact` keeps its tested contract (it still returns true on its timeout); `jamIronStep` asks it the geometric question
//   only, with the timeout switched off. Nothing here touches Babylon.
import { ironContact, type IronContactInput } from './DunkHands';

/** The jam's safety: no geometric contact this long after the press is a SHORT miss (DUNK-MODE-PLAN §2 C1), never a flush. */
export const JAM_SHORT_SEC = 0.60;

/** 'clean' = the ball came down inside the ring; 'rimHit' = it met the metal (the touching branch). */
export type DunkContactQuality = 'clean' | 'rimHit';
export type JamIronStep = { kind: 'contact'; quality: DunkContactQuality } | { kind: 'short' } | null;

/** One jam frame: 'contact' on the frame the ball in the palm is at the iron by geometry, 'short' once `shortSec` has passed
 *  without it, null while the jam is still carrying the ball in. The timeout in `i` is ignored — it never counts as contact. */
export function jamIronStep(i: IronContactInput, shortSec = JAM_SHORT_SEC): JamIronStep {
  if (ironContact({ ball: i.ball, rim: i.rim, rimRadius: i.rimRadius, ballRadius: i.ballRadius, sincePress: i.sincePress, centred: i.centred, timeout: Infinity })) {
    const radial = Math.hypot(i.ball.x - i.rim.x, i.ball.z - i.rim.z);
    const inRing = i.centred ? radial <= i.rimRadius - i.ballRadius + 0.03 : radial <= i.rimRadius + i.ballRadius * 0.5;
    return { kind: 'contact', quality: inRing ? 'clean' : 'rimHit' };
  }
  return i.sincePress >= shortSec ? { kind: 'short' } : null;
}

// ── the hook surface (DUNK-MODE-PLAN §11.1 onContact / onMiss; §11.2 H1, H2, H5; §11.9 rival tag) ──────────────────────────
export type DunkMissKind = 'rim' | 'glass' | 'short';
export interface DunkHookWho { source: 'player' | 'rival'; actorId?: string }
export interface DunkHooks {
  /** the frame the dunking hand with the ball meets the iron — once per attempt */
  onContact?(kind: string, quality: DunkContactQuality, styleTier: string, who: DunkHookWho): void;
  /** the attempt missed — once per attempt, never alongside onContact */
  onMiss?(kind: DunkMissKind, who: DunkHookWho): void;
}

/** Latches the hooks per attempt: the first of contact / miss wins and every later call that attempt is refused (H2, H5).
 *  `reset()` where the mode resets `contactLatch`. A listener that throws never breaks the dunk. */
export class DunkHookLatch {
  private hooks: DunkHooks = {};
  private resolved: 'contact' | 'miss' | null = null;
  set(hooks: DunkHooks | null): void { this.hooks = hooks ?? {}; }
  reset(): void { this.resolved = null; }
  get state(): 'contact' | 'miss' | null { return this.resolved; }
  contact(kind: string, quality: DunkContactQuality, styleTier: string, who: DunkHookWho): boolean {
    if (this.resolved) return false;
    this.resolved = 'contact';
    try { this.hooks.onContact?.(kind, quality, styleTier, who); } catch (e) { console.warn('[DUNK-HOOK] onContact threw', e); }
    return true;
  }
  miss(kind: DunkMissKind, who: DunkHookWho): boolean {
    if (this.resolved) return false;
    this.resolved = 'miss';
    try { this.hooks.onMiss?.(kind, who); } catch (e) { console.warn('[DUNK-HOOK] onMiss threw', e); }
    return true;
  }
}

/** The dunk mode's hooks. Audio (or a test) subscribes with `dunkHooks.set({ onContact, onMiss })`. */
export const dunkHooks = new DunkHookLatch();
