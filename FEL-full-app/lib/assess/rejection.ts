// Plain-language reasons a rep did not count (SCREEN-REALTIME 5b). Pure.
import type { PartId } from './runner';
import type { Rep } from './reps';

export type RejectReason = 'outOfFrame' | 'tooFast' | 'lowConfidence' | 'heelUp' | 'handsOff' | 'noLanding' | 'tooHigh' | 'shallow' | 'other';

export interface Rejection {
  reason: RejectReason;
  text: string;
}

const SAY: Record<RejectReason, string> = {
  outOfFrame: 'You stepped out of the shot.',
  tooFast: 'That was too fast — slow down a little.',
  lowConfidence: 'The camera lost you for a moment.',
  heelUp: 'Keep your heel flat on the floor.',
  handsOff: 'Keep your hands on your hips.',
  noLanding: 'The camera never saw you land.',
  tooHigh: 'The jump read too high — the camera lost your feet.',
  shallow: 'Go a little deeper on the next one.',
  other: 'That one did not count.',
};

export function rejectionFromInvalidWhy(why: string | null | undefined): Rejection {
  const w = (why ?? '').toLowerCase();
  if (w.includes('land')) return { reason: 'noLanding', text: SAY.noLanding };
  if (w.includes('hand')) return { reason: 'handsOff', text: SAY.handsOff };
  if (w.includes('130') || w.includes('feet')) return { reason: 'tooHigh', text: SAY.tooHigh };
  return { reason: 'other', text: why ? `That one did not count: ${why}` : SAY.other };
}

/** Live rep mark → what to show on screen (and log in memory). */
export function rejectionForPart(part: PartId, mark: 'notRead', rep?: Rep, invalidWhy?: string | null): Rejection {
  if (part === 'T2-left' || part === 'T2-right') return { reason: 'heelUp', text: SAY.heelUp };
  if (part === 'T5') return rejectionFromInvalidWhy(invalidWhy);
  if (rep && rep.tEnd - rep.tStart < 700) return { reason: 'tooFast', text: SAY.tooFast };
  if (part.startsWith('T3')) return { reason: 'shallow', text: SAY.shallow };
  return { reason: 'lowConfidence', text: SAY.lowConfidence };
}
