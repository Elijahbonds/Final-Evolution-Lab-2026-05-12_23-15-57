import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultResultSink } from './sessionResult';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('defaultResultSink', () => {
  it('posts Babylon session results to the canonical session endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
    vi.stubGlobal('fetch', fetchMock);

    await defaultResultSink({
      modeId: 'training',
      outcome: 'GREAT',
      score: 1200,
      stats: { hits: 8, misses: 1, dodges: 2, combos: 3, maxCombo: 5 },
      durationSec: 42,
      timestamp: '2026-09-18T00:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      mode: 'training',
      score: 1200,
      won: true,
      duration: 42,
      tallies: { hits: 8, misses: 1, dodges: 2, combos: 3 },
      maxCombo: 5,
      played: true,
    });
  });

  it('keeps completed zero-score idle results from minting rewards', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
    vi.stubGlobal('fetch', fetchMock);

    await defaultResultSink({
      modeId: 'practice',
      outcome: 'timeout',
      score: 0,
      stats: { hits: 0, misses: 0, dodges: 0, combos: 0, maxCombo: 0 },
      durationSec: 60,
      timestamp: '2026-09-18T00:00:00.000Z',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.played).toBe(false);
    expect(body.won).toBe(false);
  });
});
