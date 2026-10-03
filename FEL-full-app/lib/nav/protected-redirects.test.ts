import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  redirect: (to: string) => { throw new Error(`redirected to ${to}`); },
}));

import WorkoutPage from '@/app/workout/page';

describe('protected route redirects', () => {
  it('keeps the workout destination through login', async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);

    await expect(WorkoutPage()).rejects.toThrow('redirected to /login?next=%2Fworkout');
  });
});
