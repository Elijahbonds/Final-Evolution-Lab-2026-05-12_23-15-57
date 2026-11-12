/**
 * app/api/challenge/mint/route.ts
 * ===============================
 * M13 Step 4 — mint a signed challenge link from a finished run. Works for
 * authed athletes and guests (owner is null for guests). The server stamps the
 * time + signature; the client only supplies mode/score/tag/keyMoments.
 *
 * CHALLENGES-2 (2026-10-24):
 *   · The name on the link is the server's call (lib/social/challenge-identity.ts): a verified adult's first name only
 *     when they ask for it (`showName`), otherwise none. The client's `athleteTag` is still validated (a \u0000 is a
 *     400, as before) but never stamped into the link: it could carry a teen's name to strangers.
 *   · `kind: 'rep'` challenges a friend on a measured Mirror number (`metric`, lib/social/challenge-rep.ts). The score is
 *     read from the minter's own saved rows; a `score` in the body is ignored. Adults who opted in to saving numbers
 *     only (403 `scan_save_adults_only` otherwise), and 409 `measure_first` with nothing measured in the last 7 days.
 *   · Every link minted from here lives 48 hours (lib/social/challenge-terms.ts); the answer says when it closes.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { mintChallenge } from '@/lib/social/challenge-service';
import { ChallengePayloadError } from '@/lib/social/challenge-sign';
import { challengeTagFor } from '@/lib/social/challenge-identity';
import { REP_MINT_WINDOW_MS, measuredRepScore, type RepDb } from '@/lib/social/challenge-rep';
import { extraFor, REP_METRICS } from '@/lib/social/challenge-terms';

export const dynamic = 'force-dynamic';

// CHALLENGE-SIGN-V2: moments are strict. `t` is a finite number; at most 8 extra keys, each a short identifier, each
// value a finite number, a string of at most 32 chars, or a boolean. No nested objects or arrays. Anything else: 400.
const MOMENT_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,23}$/;
const MOMENT_MAX_EXTRA_KEYS = 8;
const momentValue = z.union([z.number().finite(), z.string().max(32), z.boolean()]);
const momentSchema = z
  .object({ t: z.number().finite() })
  .catchall(momentValue)
  .superRefine((m, ctx) => {
    const extra = Object.keys(m).filter((k) => k !== 't');
    if (extra.length > MOMENT_MAX_EXTRA_KEYS) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'too many moment keys' });
    for (const k of extra) if (!MOMENT_KEY.test(k)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bad moment key' });
  });
const bodySchema = z.object({
  modeKey: z.string().min(1).max(40),
  // required for a score challenge (checked below); a rep challenge's score is the server's reading
  score: z.number().finite().optional(),
  display: z.string().max(120).optional(),
  athleteTag: z.string().max(16).refine((t) => !t.includes('\u0000')).optional(),
  keyMoments: z.array(momentSchema).max(40).optional(),
  kind: z.enum(['score', 'rep']).optional(),
  metric: z.enum(['jump', 'form']).optional(),
  showName: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const session = await getServerSession(authOptions);
  const ownerUserId = (session?.user as any)?.id ?? null;
  const d = parsed.data;

  let score: number;
  let display = d.display;
  if (d.kind === 'rep') {
    if (!d.metric) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    if (!ownerUserId) return NextResponse.json({ error: 'scan_save_adults_only' }, { status: 403 });
    const now = Date.now();
    const read = await measuredRepScore(prisma as unknown as RepDb, ownerUserId, d.metric, new Date(now - REP_MINT_WINDOW_MS), new Date(now + 1));
    if (!read.ok) {
      if (read.error === 'measure_first') return NextResponse.json({ error: 'measure_first', href: REP_METRICS[d.metric].measureHref }, { status: 409 });
      return NextResponse.json({ error: read.error === 'adults_only' ? 'scan_save_adults_only' : 'metric_closed' }, { status: 403 });
    }
    score = read.score;
    display = display ?? `${REP_METRICS[d.metric].label}: ${REP_METRICS[d.metric].format(read.score)}`;
  } else {
    if (d.score === undefined) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    score = Math.round(d.score);
  }

  try {
    const minted = await mintChallenge({
      ownerUserId,
      modeKey: d.kind === 'rep' ? `mirror:${d.metric}` : d.modeKey,
      score,
      display,
      athleteTag: await challengeTagFor(prisma as any, ownerUserId, d.showName === true),
      keyMoments: (d.keyMoments ?? []) as any,
      extra: d.kind === 'rep' ? extraFor({ metric: d.metric }) : undefined,
    });
    return NextResponse.json(minted);
  } catch (e) {
    // unsignable payload (over the 4096-byte cap, unsafe score, \u0000): the client's fault, not a 500
    if (e instanceof ChallengePayloadError) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    throw e;
  }
}
