// LIVE-PAGE-FLAGOFF: /live/schedule is gated by isLiveStreamScheduleEnabled and
// must notFound() while the flag is off (default). Mirrors the mocking pattern
// in lib/admin/coachAdminGate.test.ts for importing an app/ page from a lib/ test.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));

const ORIGINAL = process.env.LIVE_STREAM_SCHEDULE_ENABLED;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.LIVE_STREAM_SCHEDULE_ENABLED;
  else process.env.LIVE_STREAM_SCHEDULE_ENABLED = ORIGINAL;
});

describe('/live/schedule page', () => {
  it('404s while the flag is unset (default off)', async () => {
    delete process.env.LIVE_STREAM_SCHEDULE_ENABLED;
    const { default: LiveStreamSchedulePage } = await import('@/app/live/schedule/page');
    expect(() => LiveStreamSchedulePage()).toThrow('NEXT_NOT_FOUND');
  });

  it('404s for other falsy values ("", "0", "false")', async () => {
    const { default: LiveStreamSchedulePage } = await import('@/app/live/schedule/page');
    for (const v of ['', '0', 'false']) {
      process.env.LIVE_STREAM_SCHEDULE_ENABLED = v;
      expect(() => LiveStreamSchedulePage()).toThrow('NEXT_NOT_FOUND');
    }
  });

  it('renders (no notFound) when the flag is on', async () => {
    process.env.LIVE_STREAM_SCHEDULE_ENABLED = '1';
    const { default: LiveStreamSchedulePage } = await import('@/app/live/schedule/page');
    const { isValidElement } = await import('react');
    expect(isValidElement(LiveStreamSchedulePage())).toBe(true);
  });
});
