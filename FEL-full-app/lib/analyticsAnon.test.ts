import { describe, it, expect } from 'vitest';
import { isAnonymousEvent } from './analyticsAnon';

describe('analyticsAnon: the perf stats are stored with no user, guest or page key', () => {
  it('fps and ttfp diag rows are anonymous', () => {
    expect(isAnonymousEvent('game_diag', { kind: 'fps', mode: 'onevone', detail: 'w=1' })).toBe(true);
    expect(isAnonymousEvent('game_diag', { kind: 'ttfp', mode: 'dunk', detail: 'ready=1' })).toBe(true);
  });
  it('every other row keeps its ids as before', () => {
    expect(isAnonymousEvent('game_diag', { kind: 'load', mode: 'dunk', detail: 'x' })).toBe(false);
    expect(isAnonymousEvent('game_diag', { kind: 'frame' })).toBe(false);
    expect(isAnonymousEvent('session_complete', { kind: 'fps' })).toBe(false);
    expect(isAnonymousEvent('game_diag', null)).toBe(false);
    expect(isAnonymousEvent('game_diag', { kind: 7 })).toBe(false);
  });
});
