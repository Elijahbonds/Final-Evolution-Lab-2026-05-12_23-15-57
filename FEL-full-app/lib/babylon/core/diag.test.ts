import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
import { track } from '@/lib/analytics';
import { _resetDiag, reportDiag, setDiagMode } from './diag';

describe('reportDiag', () => {
  beforeEach(() => { _resetDiag(); vi.mocked(track).mockClear(); });
  it('sends one event per kind per ten seconds, carrying the mode', () => {
    setDiagMode('onevone');
    expect(reportDiag('frame', 'hero off-screen', 1000)).toBe(true);
    expect(reportDiag('frame', 'hero off-screen again', 4000)).toBe(false);
    expect(reportDiag('clip', 'MISSING CLIP x', 4000)).toBe(true);
    expect(reportDiag('frame', 'later', 12_000)).toBe(true);
    expect(vi.mocked(track)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(track).mock.calls[0]).toEqual(['game_diag', { kind: 'frame', mode: 'onevone', detail: 'hero off-screen' }]);
  });
  it('trims long details and never throws when tracking fails', () => {
    vi.mocked(track).mockImplementationOnce(() => { throw new Error('offline'); });
    expect(() => reportDiag('ident', 'x'.repeat(1000), 0)).not.toThrow();
    expect(reportDiag('cam', 'y'.repeat(1000), 0)).toBe(true);
    expect((vi.mocked(track).mock.calls[1][1] as { detail: string }).detail.length).toBe(240);
  });
});
