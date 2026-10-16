/**
 * lib/sessions/finishOutbox.ts — QA-H2 (hoops grade 0d16f5dd): a finish still in flight when the page reloaded never reached
 * the server — a WON 1v1 12–4 was lost with no retry. Now the finish is written to this device's outbox before it is sent,
 * retried on a network error or a 5xx, cleared once the server has decided, and re-sent the next time a game page opens.
 * QA FAIL on #265: a 401 (session lapsed mid-run) or a 404 (route not up yet) cleared the entry, so the finish was lost
 * after all. Those, a 403, a 408 and a 429 are not the server deciding about the RUN: the entry is KEPT and re-sent.
 * Each entry carries the userId that played it, and a page re-sends only the signed-in user's entries (a shared device
 * never posts one account's finish under another's session). The server finishes a runId once (a repeat is answered `replayed`), so a re-send can
 * never pay twice. PURE apart from the injected storage / fetch / sleep.
 */

export const OUTBOX_KEY = 'fel-finish-outbox';
/** A run the server has expired (RUN_EXPIRED after 50 min) is not worth re-sending; drop it a little before that. */
export const OUTBOX_MAX_AGE_MS = 45 * 60 * 1000;
/** Waits between sends: the first try, then three retries. */
export const FINISH_RETRY_MS: readonly number[] = [1000, 2000, 4000];

export interface PendingFinish { runId: string; body: string; at: number; userId: string | null }
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

function read(st: Store): PendingFinish[] {
  try {
    const v = JSON.parse(st?.getItem(OUTBOX_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((p) => p && typeof p.runId === 'string' && typeof p.body === 'string' && Number.isFinite(p.at))
      .map((p) => ({ runId: p.runId, body: p.body, at: p.at, userId: typeof p.userId === 'string' ? p.userId : null })) : [];
  } catch { return []; }
}
function write(st: Store, list: PendingFinish[]): void {
  try { st?.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch { /* private mode: the in-page retries still run */ }
}

export function saveFinish(st: Store, runId: string, body: string, now: number, userId: string | null): void {
  write(st, [...read(st).filter((p) => p.runId !== runId), { runId, body, at: now, userId }]);
}
export function clearFinish(st: Store, runId: string): void {
  write(st, read(st).filter((p) => p.runId !== runId));
}
/** What is still owed, oldest first; anything too old to be paid is dropped. */
export function pendingFinishes(st: Store, now: number): PendingFinish[] {
  const all = read(st);
  const live = all.filter((p) => now - p.at < OUTBOX_MAX_AGE_MS);
  if (live.length !== all.length) write(st, live);
  return live;
}

export interface FinishDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
}
/** Answers that say nothing about the run (signed out, forbidden, route missing, timed out, rate limited): keep and re-send. */
export const KEEP_STATUS: ReadonlySet<number> = new Set([401, 403, 404, 408, 429]);
/** Worth another try in this page: a 5xx, a request timeout, a rate limit. (A 401/403/404 waits for the next page.) */
const retryNow = (r: Response): boolean => r.status >= 500 || r.status === 408 || r.status === 429;
/** The server has decided about this run (clear the entry): a 2xx, or a 4xx that is not in KEEP_STATUS. */
export const settled = (r: Response): boolean => r.status < 500 && !KEEP_STATUS.has(r.status);

/** POST the finish; retry a network error, a 5xx, a 408 or a 429 on FINISH_RETRY_MS. The last answer, or null when none came. */
export async function postFinish(body: string, deps: FinishDeps): Promise<Response | null> {
  let last: Response | null = null;
  for (let i = 0; i <= FINISH_RETRY_MS.length; i++) {
    if (i > 0) await deps.sleep(FINISH_RETRY_MS[i - 1]);
    try {
      const r = await deps.fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
      if (!retryNow(r)) return r;
      last = r;
    } catch { /* offline / reset: try again */ }
  }
  return last;
}

/** Send one finish through the outbox: saved first, cleared once the server has decided. */
export async function sendFinish(st: Store, runId: string | null, deps: FinishDeps, now: number, body: string, userId: string | null): Promise<Response | null> {
  if (runId) saveFinish(st, runId, body, now, userId);
  const r = await postFinish(body, deps);
  if (runId && r && settled(r)) clearFinish(st, runId);
  return r;
}

/** Re-send what a reload left behind (no card: the page that played it is gone; the server pays it once) — only the
 *  signed-in user's entries; nothing at all when nobody is signed in. */
export async function flushFinishes(st: Store, deps: FinishDeps, now: number, userId: string | null): Promise<number> {
  if (!userId) return 0;
  let sent = 0;
  for (const p of pendingFinishes(st, now)) {
    if (p.userId !== userId) continue;
    const r = await postFinish(p.body, deps);
    if (r && settled(r)) { clearFinish(st, p.runId); sent += 1; }
  }
  return sent;
}
