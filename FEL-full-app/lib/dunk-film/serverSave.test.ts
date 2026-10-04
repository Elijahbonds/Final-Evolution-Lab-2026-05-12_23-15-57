// #103 saved film-dunk numbers when the person tapped "18 or older". That tap is not a verified age.
// The post runs only for a server-verified adult (verifiedAdult on User.dobYear) who opted in and checked the card.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dunkNumbersLeaveDevice, postDunkNumbers } from './serverSave';
import type { DunkHistoryBody } from './history';

const BODY: DunkHistoryBody = { verticalCm: 40, flightTimeMs: 500, family: 'ATTEMPT' };

describe('film dunk numbers leave the device only for a verified, opted-in adult', () => {
  it('under 18 and unknown post nothing, even if a caller claims the server said yes', async () => {
    const fetchImpl = vi.fn();
    for (const age of ['under-13', '13-17', 'unknown', null] as const) {
      const result = await postDunkNumbers({
        selfReportedAge: age,
        serverVerifiedAdult: true,
        optedIn: true,
        checked: true,
        bodies: [BODY],
        runIdFor: () => 'run-under-18',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(result, String(age)).toEqual({ kept: 0, posted: false, refused: '' });
      expect(dunkNumbersLeaveDevice({ selfReportedAge: age, serverVerifiedAdult: true, optedIn: true, checked: true }), String(age)).toBe(false);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a self-reported 18+ who is not server-verified posts nothing', async () => {
    const fetchImpl = vi.fn();
    const result = await postDunkNumbers({
      selfReportedAge: '18+',
      serverVerifiedAdult: false,
      optedIn: true,
      checked: true,
      bodies: [BODY],
      runIdFor: () => 'run-self-report',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.posted).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a verified adult who has not opted in, or who left the card off, posts nothing', async () => {
    const fetchImpl = vi.fn();
    for (const input of [
      { optedIn: false, checked: true },
      { optedIn: true, checked: false },
    ]) {
      const result = await postDunkNumbers({
        selfReportedAge: '18+',
        serverVerifiedAdult: true,
        ...input,
        bodies: [BODY],
        runIdFor: () => 'run-off',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(result.posted).toBe(false);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a verified adult with the card on posts the numbers once per clip, with a run id and no video', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const result = await postDunkNumbers({
      selfReportedAge: '18+',
      serverVerifiedAdult: true,
      optedIn: true,
      checked: true,
      bodies: [BODY],
      runIdFor: () => 'dunk-run-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ kept: 1, posted: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, { body: string }])[1].body));
    expect(sent).toEqual({ verticalCm: 40, flightTimeMs: 500, family: 'ATTEMPT', runId: 'dunk-run-1' });
    expect(sent).not.toHaveProperty('image');
    expect(sent).not.toHaveProperty('landmarks');
  });

  it('the film page posts through this function and not by calling the dunks route itself', () => {
    const src = readFileSync(join(__dirname, '../../components/capture/dunk-film.tsx'), 'utf8');
    expect(src).toMatch(/postDunkNumbers\(/);
    expect(src).not.toMatch(/['"`]\/api\/mirror\/dunks['"`]/);
    expect(src).toMatch(/isKid\(age\)/);
  });
});
