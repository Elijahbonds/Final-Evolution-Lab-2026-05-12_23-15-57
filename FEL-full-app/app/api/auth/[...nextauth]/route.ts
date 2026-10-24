import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { loginRateLimitRefusal } from '@/lib/rate-limits/login';

const handler = NextAuth(authOptions);

// RATE-LIMIT-WIRE (PR #289 QA rework): the credentials sign-in (POST /api/auth/callback/credentials) is counted per email
// and per the address the trusted proxy set, in the shared rate_limits table, BEFORE NextAuth runs bcrypt. Past the limit
// it answers 429 with Retry-After and NextAuth's own `{ url: …/error?error=RateLimited }` shape, so signIn() on the
// login form reads `error: 'RateLimited'` (components/auth-form.tsx). Every other auth request goes straight through.
export async function POST(req: Request, ctx: { params: { nextauth?: string[] } }) {
  const refusal = await loginRateLimitRefusal(prisma, req, ctx?.params?.nextauth);
  if (refusal) return refusal;
  return handler(req, ctx);
}

export { handler as GET };
