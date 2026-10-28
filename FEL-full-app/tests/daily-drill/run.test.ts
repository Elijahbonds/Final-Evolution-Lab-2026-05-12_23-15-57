// DAILY-DRILL — the page's claim call: it sends the day's key and nothing else, and reads the server's answer.
import { describe, expect, it } from 'vitest';
import { postClaim } from '@/app/train/today-drill/_components/today-drill-run';

describe('postClaim', () => {
  it('POSTs { key } to the claim route and returns the server\'s status and amount', async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response(JSON.stringify({ status: 'granted', amount: 30, streakBonus: 20, streakDays: 4 }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await postClaim('shot:safe-landing', f)).toEqual({ status: 'granted', amount: 30, streakDays: 4 });
    expect(sent[0].url).toBe('/api/daily-drill/claim');
    expect(JSON.parse(String(sent[0].init.body))).toEqual({ key: 'shot:safe-landing' });
  });

  it('a refusal or a network failure is null (the page says it could not save, and the drill can be claimed again)', async () => {
    expect(await postClaim('k', (async () => new Response('{}', { status: 409 })) as unknown as typeof fetch)).toBeNull();
    expect(await postClaim('k', (async () => { throw new Error('offline'); }) as unknown as typeof fetch)).toBeNull();
  });
});
