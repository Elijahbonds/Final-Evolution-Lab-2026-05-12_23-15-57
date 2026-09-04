import { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

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
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          include: { profile: { select: { id: true } } },
        });
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
      if (token.sub && (!token.role || !token.roleAt || Date.now() - (token.roleAt as number) > 5 * 60_000)) {
        const u = await prisma.user.findUnique({ where: { id: token.sub as string }, select: { role: true } });
        token.role = u?.role ?? 'player';
        token.roleAt = Date.now();
      }
      // Self-heal: backfill profileId for tokens minted before this upgrade
      if (token.sub && !token.profileId) {
        const profile = await prisma.playerProfile.findUnique({
          where: { userId: token.sub as string },
          select: { id: true },
        });
        token.profileId = profile?.id ?? null;
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
