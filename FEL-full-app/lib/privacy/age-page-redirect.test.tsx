import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as { user?: { id?: string } } | null,
  redirects: [] as string[],
  dobYear: null as number | null,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('next-auth/react', () => ({ signOut: async () => ({}) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    h.redirects.push(to);
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: async () => ({ dobYear: h.dobYear }),
    },
  },
}));

import AgePage from '@/app/age/page';

describe('/age page auth return path', () => {
  it('returns a signed-out user to age collection and preserves the requested post-age destination', async () => {
    h.session = null;
    h.redirects = [];

    await expect(AgePage({ searchParams: { next: '/play/dunk?mode=body#jump' } })).rejects.toThrow('NEXT_REDIRECT');

    expect(h.redirects).toEqual([
      '/login?next=%2Fage%3Fnext%3D%252Fplay%252Fdunk%253Fmode%253Dbody%2523jump',
    ]);
  });

  it('drops unsafe next values before constructing the login return path', async () => {
    h.session = null;
    h.redirects = [];

    await expect(AgePage({ searchParams: { next: '//evil.example' } })).rejects.toThrow('NEXT_REDIRECT');
    expect(h.redirects).toEqual(['/login?next=%2Fage']);

    h.redirects = [];
    await expect(AgePage({ searchParams: { next: '/%2F%2Fevil.example' } })).rejects.toThrow('NEXT_REDIRECT');
    expect(h.redirects).toEqual(['/login?next=%2Fage']);

    h.redirects = [];
    await expect(AgePage({ searchParams: { next: '/%252F%252Fevil.example' } })).rejects.toThrow('NEXT_REDIRECT');
    expect(h.redirects).toEqual(['/login?next=%2Fage']);
  });

  it('a signed-in account that already has a birth year continues only to a safe next', async () => {
    h.session = { user: { id: 'u1' } };
    h.dobYear = 1990;
    h.redirects = [];

    await expect(AgePage({ searchParams: { next: '/play/dunk' } })).rejects.toThrow('NEXT_REDIRECT');
    expect(h.redirects).toEqual(['/play/dunk']);

    h.redirects = [];
    await expect(AgePage({ searchParams: { next: '/\\evil.example' } })).rejects.toThrow('NEXT_REDIRECT');
    expect(h.redirects).toEqual(['/']);
  });
});
