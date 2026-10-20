// visitor — what the HOST knows about who is playing, for the Babylon side, which has no session (FIRST-DUNK-BUDGET, 2026-10-17).
//
// /try renders the guest dunk only for a visitor the server found signed out (app/try/page.tsx sends everyone else to /play/dunk),
// so its host knows for certain. The spawn's closet read (playerIdentity) and the season lane (SeasonSpecials) asked anyway and got
// a 401 on every guest run — and a 401 already meant "the defaults" to both. runMode sets this from HarnessOpts.guest on every
// mount, so a host that says nothing (every other one) is "not known to be signed out" and asks exactly as before.

let signedOut = false;

/** The host's word for this mount: true only when it KNOWS the visitor is signed out. */
export function setSignedOutVisitor(on: boolean): void { signedOut = on; }

/** True when the host said the visitor is signed out: skip the reads a guest can only be refused. */
export function signedOutVisitor(): boolean { return signedOut; }
