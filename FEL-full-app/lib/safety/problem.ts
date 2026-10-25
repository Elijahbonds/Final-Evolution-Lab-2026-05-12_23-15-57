// lib/safety/problem.ts — SAFETY lane (SAF-04, 2026-10-25): "Report a problem", server side. The route is three lines.
//
// A report is the automatic context (lib/safety/problemContext.ts) plus, ONLY from a signed-in verified adult, a short
// typed note — screened (lib/safety/textScreen.ts: contact details included, so nobody leaves an email or a number in it)
// and capped. From anyone else typed text is dropped, never stored, and the answer says so. Nothing in the stored row
// names the sender: no account id, no email, no address (the rate-limit buckets are HMACs and live in another table).
//
// RATE LIMIT (new, owner can tune): 5 reports per 15 minutes per sender — counted in the shared table
// (lib/rate-limits/store.ts hitBucket: by account when signed in, by the trusted address when there is one) and in this
// instance's memory by address as a backstop, since the table fails open before its own SQL is applied.
import { bucketKey, hitBucket } from '@/lib/rate-limits/store';
import { trustedClientIp } from '@/lib/rate-limits/clientIp';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';
import type { Caller } from './caller';
import { buildId } from './buildId';
import { parseProblemBody, PROBLEM_TEXT_MAX } from './problemContext';
import { cleanTyped, screenAbuse, screenRefusal } from './textScreen';
import { insertProblem, type RawDb } from './store';

export const PROBLEM_RATE = { limit: 5, windowMs: 15 * 60_000 } as const;

export interface Res { status: number; body: Record<string, unknown> }

export async function fileProblem(db: RawDb, caller: Caller, headers: Headers, body: unknown, now: number = Date.now()): Promise<Res> {
  const parsed = parseProblemBody(body, now);
  if (!parsed) return { status: 400, body: { error: 'invalid_report' } };

  if (!rateLimit(`problem-report:${clientKeyFromHeaders(headers)}`, PROBLEM_RATE.limit, PROBLEM_RATE.windowMs).ok) {
    return { status: 429, body: { error: 'rate_limited' } };
  }
  const subject = caller.userId ? { kind: 'user', value: caller.userId } : { kind: 'ip', value: trustedClientIp(headers) };
  if (subject.value) {
    const hit = await hitBucket(db, bucketKey('problemReport', subject.kind, subject.value), PROBLEM_RATE, now);
    if (!hit.ok) return { status: 429, body: { error: 'rate_limited' } };
  }

  let text: string | null = null;
  let textDropped = false;
  const typed = cleanTyped(parsed.text, PROBLEM_TEXT_MAX);
  if (typed) {
    if (!caller.adult) {
      textDropped = true;   // no free text from a minor, or from anyone whose age FEL does not know
    } else {
      const hits = screenAbuse(typed);
      if (hits.length) return { status: 422, body: { error: 'text_refused', message: screenRefusal(hits) } };
      text = typed;
    }
  }

  const w = await insertProblem(db, { route: parsed.route, buildId: buildId(), deviceClass: parsed.deviceClass, diagKind: parsed.diagKind, clientAt: parsed.clientAt, text }, now);
  return { status: 200, body: { received: true, stored: w.ok, ...(textDropped ? { textDropped: true } : {}) } };
}
