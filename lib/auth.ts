import { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { isDatabaseUnreachable, AUTH_SERVICE_UNAVAILABLE } from '@/lib/db-health';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,   // 30-day absolute session lifetime
    updateAge: 24 * 60 * 60,     // rolling refresh: token re-issued at most daily
  },
  jwt: { maxAge: 30 * 24 * 60 * 60 },
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
          if (isDatabaseUnreachable(err)) {
            console.error('[auth] database unreachable during sign-in', err);
            throw new Error(AUTH_SERVICE_UNAVAILABLE);
          }
          console.error('[auth] sign-in lookup failed', err);
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
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.profileId = (user as any).profileId ?? null;
      }
      // Self-heal: backfill profileId for tokens minted before this upgrade.
      // Best-effort — a database outage must not invalidate an otherwise valid
      // session. Leave profileId unset and retry on the next token refresh.
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
      }
      return session;
    },
  },
};
