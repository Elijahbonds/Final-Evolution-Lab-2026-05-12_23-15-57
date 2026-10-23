/**
 * app/api/challenge/mint/route.ts
 * ===============================
 * M13 Step 4 — mint a signed challenge link from a finished run. Works for
 * authed athletes and guests (owner is null for guests). The server stamps the
 * time + signature; the client only supplies mode/score/tag/keyMoments.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { mintChallenge } from '@/lib/social/challenge-service';
import { ChallengePayloadError } from '@/lib/social/challenge-sign';

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
  score: z.number().finite(),
  display: z.string().max(120).optional(),
  athleteTag: z.string().max(16).optional(),
  keyMoments: z.array(momentSchema).max(40).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const session = await getServerSession(authOptions);
  const ownerUserId = (session?.user as any)?.id ?? null;

  try {
    const minted = await mintChallenge({
      ownerUserId,
      modeKey: parsed.data.modeKey,
      score: Math.round(parsed.data.score),
      display: parsed.data.display,
      athleteTag: parsed.data.athleteTag,
      keyMoments: (parsed.data.keyMoments ?? []) as any,
    });
    return NextResponse.json(minted);
  } catch (e) {
    // unsignable payload (over the 4096-byte cap, unsafe score, \u0000): the client's fault, not a 500
    if (e instanceof ChallengePayloadError) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    throw e;
  }
}
