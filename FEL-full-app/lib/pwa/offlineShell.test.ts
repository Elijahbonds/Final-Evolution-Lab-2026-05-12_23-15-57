// The game shell's offline seams (lib/pwa/offlineShell.ts): what is kept from /api/profile, when a game may start
// from it, and what a run with no server run becomes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionResultQueue } from '@/lib/offline-cache';
import { OFFLINE_PROFILE_KEY, OFFLINE_QUEUED_EVENT, PLAYED_OFFLINE, forgetOfflineProfile, offlineAnswer, offlineProfile, queueOfflineRun, rememberOfflineProfile } from './offlineShell';
import { unpaidLine, unpaidReason, unpaidTitle } from '@/lib/sessions/unpaidCopy';

const PROFILE = {
  prq: 71, grade: { key: 'PRIMED', label: 'PRIMED', color: '#00E5FF', speedMult: 1.05, hangBonus: 0.15 },
  prqDisplay: { score: 71, measured: 3, total: 5 }, profile: { userId: 'u1', streakDays: 4, labCredits: 900 },
  wallet: { coins: 4300 }, email: 'someone@fel.test',
};

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

describe('the kept profile', () => {
  it('keeps only what a game needs to start: account id, PRQ, grade, the badge — not the wallet, email or anything else', () => {
    const st = memStore();
    rememberOfflineProfile(PROFILE, st, true);
    expect(JSON.parse(st.m.get(OFFLINE_PROFILE_KEY)!)).toEqual({
      userId: 'u1', prq: 71, grade: PROFILE.grade, prqDisplay: { score: 71, measured: 3, total: 5 },
    });
  });

  it('with offline play off nothing is kept and nothing is offered', () => {
    const st = memStore();
    rememberOfflineProfile(PROFILE, st, false);
    expect(st.m.size).toBe(0);
    rememberOfflineProfile(PROFILE, st, true);
    expect(offlineProfile('', st, false)).toBeNull();
  });

  it('a ranked, staked or Arena play never starts from it', () => {
    const st = memStore();
    rememberOfflineProfile(PROFILE, st, true);
    expect(offlineProfile('?graphics=low', st, true)?.userId).toBe('u1');
    for (const q of ['?arena=m1', '?mp=AB', '?c=x', '?tier=2', '?stake=5', '?ranked=1']) expect(offlineProfile(q, st, true)).toBeNull();
  });

  it('a broken or foreign value is ignored, and sign-out forgets it', () => {
    const st = memStore();
    st.setItem(OFFLINE_PROFILE_KEY, '{"userId":1}');
    expect(offlineProfile('', st, true)).toBeNull();
    st.setItem(OFFLINE_PROFILE_KEY, 'not json');
    expect(offlineProfile('', st, true)).toBeNull();
    rememberOfflineProfile(PROFILE, st, true);
    forgetOfflineProfile(st);
    expect(offlineProfile('', st, true)).toBeNull();
  });
});

describe('a run with no server run', () => {
  const events: string[] = [];
  beforeEach(() => {
    const store = memStore();
    vi.stubGlobal('localStorage', store);
    vi.stubGlobal('window', { dispatchEvent: (e: Event) => { events.push(e.type); return true; } });
    vi.stubGlobal('CustomEvent', class extends Event { detail: unknown; constructor(t: string, i?: { detail?: unknown }) { super(t); this.detail = i?.detail; } });
    getSessionResultQueue().clear();
    events.length = 0;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is queued under the account that played it, whole-number score, seconds to ms, and the banner hears', () => {
    expect(queueOfflineRun('dunkContest', { score: 41.6, won: true, duration: 75 }, 'u1', '', Date.UTC(2026, 9, 26), true)).toBe(true);
    const [e] = getSessionResultQueue().peek();
    expect(e.userId).toBe('u1');
    expect(e.payload).toEqual({ mode: 'dunkContest', score: 42, won: true, completedAt: '2026-10-26T00:00:00.000Z', durationMs: 75_000 });
    expect(events).toEqual([OFFLINE_QUEUED_EVENT]);
  });

  it('is not queued with offline play off, signed out, or on an Arena play', () => {
    expect(queueOfflineRun('dunkContest', { score: 1 }, 'u1', '', 0, false)).toBe(false);
    expect(queueOfflineRun('dunkContest', { score: 1 }, null, '', 0, true)).toBe(false);
    expect(queueOfflineRun('dunkContest', { score: 1 }, 'u1', '?arena=m1', 0, true)).toBe(false);
    expect(getSessionResultQueue().pendingCount).toBe(0);
  });

  it('the card reads it as a decided, unpaid run: "played offline — practice"', async () => {
    const r = offlineAnswer();
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toEqual({ ok: false, paid: false, reason: PLAYED_OFFLINE });
    expect(unpaidTitle(unpaidReason(j.reason))).toBe('PLAYED OFFLINE — PRACTICE');
    expect(unpaidLine(unpaidReason(j.reason))).toMatch(/Saved on this phone.*history.*nothing was paid/);
  });
});
