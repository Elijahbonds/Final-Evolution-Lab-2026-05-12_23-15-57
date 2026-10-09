import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOnboardingLink } from './payouts';
import { getInstagramStats } from './instagram';
import { notifyBooking } from './notify';

afterEach(() => vi.unstubAllGlobals());

describe('stubs', () => {
  it('Connect returns CONNECT_DISABLED by default and makes no call when switched on', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await createOnboardingLink('elijah-bonds', {} as NodeJS.ProcessEnv)).toEqual({ ok: false, reason: 'CONNECT_DISABLED' });
    expect(await createOnboardingLink('elijah-bonds', { STRIPE_CONNECT_ENABLED: '0' } as unknown as NodeJS.ProcessEnv))
      .toEqual({ ok: false, reason: 'CONNECT_DISABLED' });
    await expect(createOnboardingLink('elijah-bonds', { STRIPE_CONNECT_ENABLED: '1' } as unknown as NodeJS.ProcessEnv)).rejects.toThrow(/not implemented/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Instagram stats are fixture data flagged as an example', async () => {
    const stats = await getInstagramStats();
    expect(stats.isExample).toBe(true);
    expect(stats.source).toBe('fixture');
  });

  it('notifyBooking sends nothing', async () => {
    const result = await notifyBooking({} as never);
    expect(result).toEqual({ sent: false, reason: 'NOT_IMPLEMENTED' });
  });
});
