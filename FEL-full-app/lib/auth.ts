import { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { isUnreachable } from '@/lib/db/errors';
import { AUTH_SERVICE_UNAVAILABLE } from '@/lib/auth-errors';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,   // 30-day absolute session lifetime
    updateAge: 24 * 60 * 60,     // rolling refresh: token re-issued at most daily
  },
  jwt: { maxAge: 30 * 24 * 60 * 60 },
  // FIREBASE HOSTING FORWARDS ONE COOKIE (2026-09-18, owner: "i couldnt log in or sign up"). Hosting strips every request
  // cookie except `__session` before the SSR backend sees it (measured live: the credentials POST set
  // `__Secure-next-auth.session-token`, then every page and GET /api/auth/session read an EMPTY session — and the same
  // cookie sent straight to the Cloud Run URL returned the user). So the session token rides `__session`. The CSRF
  // cookie still reaches the sign-in POST (measured: a POST without it is refused with ?csrf=true, with it succeeds).
  // Secure only over https so the local http servers (next dev / next start) still get the cookie.
  cookies: {
    sessionToken: {
      name: '__session',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: (process.env.NEXTAUTH_URL ?? '').startsWith('https') },
    },
  },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // A database outage must not masquerade as a bad password. Returning
        // null here would render as "Invalid email or password" and leave the
        // athlete retrying a password that was never the problem; letting the
        // raw error escape would leak the database host:port into the
        // /api/auth/error redirect URL. Log it, then signal a distinct code.
        let user;
        try {
          user = await prisma.user.findUnique({
            where: { email: credentials.email.toLowerCase().trim() },
            include: { profile: { select: { id: true } } },
          });
        } catch (err) {
          if (isUnreachable(err)) {
            console.error('[auth] database unreachable during sign-in', err);
          } else {
            console.error('[auth] sign-in lookup failed', err);
          }
          throw new Error(AUTH_SERVICE_UNAVAILABLE);
        }

        if (!user?.password) return null;
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          profileId: (user as any).profile?.id ?? null,
          role: (user as any).role ?? 'player',
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.profileId = (user as any).profileId ?? null;
        token.role = (user as any).role ?? 'player';
      }
      // Ship pass 2 (2026-09-03): the admin routes read session.user.role, but the
      // session never carried it — every /api/admin/* answered 401 to everyone.
      // Backfill for tokens minted before, and refresh so a promotion takes.
      //
      // Both lookups below are best-effort. This callback runs on every token
      // refresh, so an unguarded throw here signs out every athlete at once the
      // moment the database blinks — the role refresh alone re-queries every
      // five minutes for everyone. On failure keep the claims the token already
      // carries and leave roleAt unset so the next refresh retries.
      if (token.sub && (!token.role || !token.roleAt || Date.now() - (token.roleAt as number) > 5 * 60_000)) {
        try {
          const u = await prisma.user.findUnique({ where: { id: token.sub as string }, select: { role: true } });
          token.role = u?.role ?? 'player';
          token.roleAt = Date.now();
        } catch (err) {
          // Deliberately does NOT fall back to 'player': that would silently
          // demote an admin mid-session. An absent role still reads as 'player'
          // in the session callback, so the safe direction is preserved.
          console.error('[auth] role refresh skipped', err);
        }
      }
      // Self-heal: backfill profileId for tokens minted before this upgrade
      if (token.sub && !token.profileId) {
        try {
          const profile = await prisma.playerProfile.findUnique({
            where: { userId: token.sub as string },
            select: { id: true },
          });
          token.profileId = profile?.id ?? null;
        } catch (err) {
          console.error('[auth] profileId backfill skipped', err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user && token?.sub) {
        (session.user as any).id = token.sub;
        (session.user as any).profileId = token.profileId ?? null;
        (session.user as any).role = token.role ?? 'player';
      }
      return session;
    },
  },
};
