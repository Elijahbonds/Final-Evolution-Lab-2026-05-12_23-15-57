// FEL NETPLAY — the opt-in contract (2026-09-12).
//
// The single most important property of this integration: with no ?net= flag, nothing is
// constructed, nothing connects, and every mode behaves exactly as it did before netplay existed.
// 1v1 has a great deal of tuned single-player work in it and none of it may move.
import { describe, it, expect } from 'vitest';
import { netplayRoom, attachNetplay } from '../../lib/net/attach';

describe('netplay is off unless asked for', () => {
  it('no ?net= means no room', () => {
    expect(netplayRoom('')).toBeNull();
    expect(netplayRoom('?agent=1')).toBeNull();
    expect(netplayRoom('?foo=bar&baz=1')).toBeNull();
  });

  it('an empty or whitespace room is not a room', () => {
    expect(netplayRoom('?net=')).toBeNull();
    expect(netplayRoom('?net=%20%20')).toBeNull();
  });

  it('a real room is read, and trimmed', () => {
    expect(netplayRoom('?net=abc')).toBe('abc');
    expect(netplayRoom('?net=%20abc%20')).toBe('abc');
    expect(netplayRoom('?agent=1&net=room9')).toBe('room9');
  });

  it('attach returns null with no flag, so the mode keeps its AI opponent', () => {
    expect(attachNetplay('onevone', '')).toBeNull();
    expect(attachNetplay('onevone', '?agent=1')).toBeNull();
  });

  it('a missing server DEGRADES to single-player rather than throwing', () => {
    // ?net= asked for netplay, but NEXT_PUBLIC_NETD_URL is unset in this environment.
    // Breaking the page would be far worse than quietly staying offline.
    const prev = process.env.NEXT_PUBLIC_NETD_URL;
    delete process.env.NEXT_PUBLIC_NETD_URL;
    expect(() => attachNetplay('onevone', '?net=abc')).not.toThrow();
    expect(attachNetplay('onevone', '?net=abc')).toBeNull();
    if (prev !== undefined) process.env.NEXT_PUBLIC_NETD_URL = prev;
  });
});
