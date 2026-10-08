// Coach-run session memory (SESSION-SETUP-V1).
//
// The whole roster, including nicknames of athletes under 18 or of unknown age, lives in this
// module and nowhere else. endSession() drops it. Verified adults may ALSO be copied to a
// key-value store through writeAdults; that path strips everyone else.

import { writeAdults, type Athlete, type KeyValueStore } from './roster';

let held: Athlete[] | null = null;
let heldDunks: number | null = null;

function copy(a: Athlete): Athlete {
  return { id: a.id, name: a.name, band: a.band };
}

export function holdSession(athletes: readonly Athlete[], dunksEach: number | null = null): void {
  held = athletes.map(copy);
  heldDunks = dunksEach;
}

export function readSession(): { athletes: Athlete[]; dunksEach: number | null } | null {
  if (!held) return null;
  return { athletes: held.map(copy), dunksEach: heldDunks };
}

export function endSession(): void {
  held = null;
  heldDunks = null;
}

/** Remember the session in page memory, and write verified adults if the store is given. */
export function rememberSession(
  athletes: readonly Athlete[],
  serverVerified: boolean,
  dunksEach: number | null = null,
  store?: KeyValueStore,
): void {
  holdSession(athletes, dunksEach);
  if (store) writeAdults(store, athletes, serverVerified);
}
