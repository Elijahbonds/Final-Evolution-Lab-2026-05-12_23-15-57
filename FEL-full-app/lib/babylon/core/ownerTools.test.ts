// ownerTools (device-perf, owner 2026-11-12): the owner's in-game tools open on the feel panel's server answer, and never on anything
// else. A failed or slow answer is "no".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ownerToolsAllowed, _resetOwnerTools } from './ownerTools';
import { resetFeelForTests, setFeelUser } from '@/lib/feel-panel/feel';

beforeEach(() => { _resetOwnerTools(); resetFeelForTests(); });
afterEach(() => { vi.unstubAllGlobals(); resetFeelForTests(); });

describe('ownerToolsAllowed', () => {
  it('is yes at once when the feel panel already has the server yes', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    setFeelUser(true);
    expect(await ownerToolsAllowed()).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
  it('asks GET /api/feel-panel and takes only enabled: true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) })));
    expect(await ownerToolsAllowed()).toBe(true);
    _resetOwnerTools();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ enabled: 'yes' }) })));
    expect(await ownerToolsAllowed()).toBe(false);
  });
  it('a failed request or a slow answer is no', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await ownerToolsAllowed()).toBe(false);
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    expect(await ownerToolsAllowed(20)).toBe(false);
  });
  it('asks the server once per page while the answer is pending', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) }));
    vi.stubGlobal('fetch', f);
    await Promise.all([ownerToolsAllowed(), ownerToolsAllowed()]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith('/api/feel-panel', { cache: 'no-store' });
  });
});
