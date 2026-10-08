import { SIGNAL_MAX_BYTES, SIGNAL_MAX_ROWS, SIGNAL_TTL_MS } from '../constants';

export function signalTooBig(payload: string): boolean {
  return Buffer.byteLength(payload, 'utf8') > SIGNAL_MAX_BYTES;
}

export function signalRowCap(count: number): boolean {
  return count >= SIGNAL_MAX_ROWS;
}

export function signalExpiresAt(now: Date): Date {
  return new Date(now.getTime() + SIGNAL_TTL_MS);
}

/** Coach is impolite, client is polite. The server sets the role; the body cannot. */
export function signalRole(isCoach: boolean): 'coach' | 'client' {
  return isCoach ? 'coach' : 'client';
}

export function makingOfferCollision(polite: boolean, weHaveOffer: boolean): 'ignore' | 'rollback' {
  return polite ? 'rollback' : 'ignore';
}
