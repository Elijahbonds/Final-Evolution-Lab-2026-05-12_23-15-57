// CREATE HUB: My Creations' status chip, the approver's note, and the review-status transitions that toast.
import { describe, expect, it } from 'vitest';
import { STATUS_STORAGE_KEY, diffStatus, loadSnapshot, saveSnapshot, snapshotOf, statusOf, toastFor } from './status';

type C = Parameters<typeof statusOf>[0];
const card = (over: Partial<C> = {}): C => ({ id: 'c1', title: 'Night Run', primary: 'music', reviewState: 'pending_review', isPublic: false, stats: { wantsPublic: true } as never, ...over });
const ADULT = { publicCreator: true }, TEEN = { publicCreator: false };
const review = (decision: 'approved' | 'rejected', note?: string) => ({ decision, by: 'founder', at: '2026-10-06T00:00:00Z', ...(note ? { note } : {}) });

describe('statusOf', () => {
  it('pending, public, private, rejected', () => {
    expect(statusOf(card(), ADULT).status).toBe('pending');
    expect(statusOf(card({ reviewState: 'approved', isPublic: true }), ADULT)).toMatchObject({ status: 'public', label: 'Public' });
    expect(statusOf(card({ reviewState: 'approved', stats: { wantsPublic: false } as never }), ADULT)).toMatchObject({ status: 'private', label: 'Private' });
    expect(statusOf(card({ reviewState: 'rejected', stats: { review: review('rejected', 'The hook samples a radio song.') } as never }), ADULT))
      .toMatchObject({ status: 'rejected', note: 'The hook samples a radio song.' });
  });
  it("a teen's approved card says why it is private", () => {
    expect(statusOf(card({ reviewState: 'approved' }), TEEN)).toMatchObject({ status: 'private', label: 'Approved, private', detail: expect.stringMatching(/confirmed 18\+/) });
  });
  it('approved music in rotation, featured, and play counts', () => {
    const on = statusOf(card({ reviewState: 'approved', isPublic: true, stats: { soundtrack: { rotation: 'on', by: 'f', at: 'x' }, plays: 41 } as never }), ADULT);
    expect(on).toMatchObject({ status: 'public', label: 'In rotation', inRotation: true, plays: 41 });
    const feat = statusOf(card({ reviewState: 'approved', isPublic: true, stats: { soundtrack: { rotation: 'featured', by: 'f', at: 'x' } } as never }), ADULT);
    expect(feat.detail).toMatch(/Featured/);
    // rotation on a non-music card, or a private one, is not "in rotation"
    expect(statusOf(card({ primary: 'art', reviewState: 'approved', isPublic: true, stats: { soundtrack: { rotation: 'on' } } as never }), ADULT).inRotation).toBe(false);
  });
});

describe('transitions', () => {
  const pending = card();
  const approvedPublic = card({ reviewState: 'approved', isPublic: true, stats: { review: review('approved') } as never });
  const inRotation = card({ reviewState: 'approved', isPublic: true, stats: { soundtrack: { rotation: 'on', by: 'f', at: 'x' } } as never });
  const pulled = card({ reviewState: 'approved', isPublic: true, stats: { soundtrack: { rotation: 'pulled', by: 'f', at: 'x' } } as never });
  const rejected = card({ reviewState: 'rejected', stats: { review: review('rejected', 'Too quiet.') } as never });

  it('nothing stored, or a card never seen, is not news (no burst of toasts on a first visit)', () => {
    expect(diffStatus(null, [approvedPublic])).toEqual([]);
    expect(diffStatus({}, [approvedPublic])).toEqual([]);
    expect(diffStatus(snapshotOf([pending]), [pending])).toEqual([]);
  });
  it.each([
    ['pending → approved public', pending, approvedPublic, ADULT, 'success', /approved\. It is public now/],
    ['pending → in rotation', pending, inRotation, ADULT, 'success', /^Your track "Night Run" is in rotation$/],
    ['approved → in rotation', approvedPublic, inRotation, ADULT, 'success', /in rotation/],
    ['in rotation → pulled', inRotation, pulled, ADULT, 'info', /left the soundtrack rotation/],
    ['pending → rejected with the note', pending, rejected, ADULT, 'error', /was not approved: Too quiet\.$/],
    ['pending → approved, teen stays private', pending, card({ reviewState: 'approved' }), TEEN, 'success', /stays private until/],
    ['rejected → pending again', rejected, pending, ADULT, 'info', /back in review/],
  ] as const)('%s', (_n, before, after, ctx, tone, text) => {
    const changes = diffStatus(snapshotOf([before]), [after]);
    expect(changes).toHaveLength(1);
    const t = toastFor(changes[0], ctx)!;
    expect(t.tone).toBe(tone);
    expect(t.text).toMatch(text);
  });
});

describe('snapshot storage', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };
  it('round-trips, and anything unreadable is "nothing stored"', () => {
    const s = mem();
    saveSnapshot(s, { a: 'x' });
    expect(loadSnapshot(s)).toEqual({ a: 'x' });
    s.m.set(STATUS_STORAGE_KEY, '{bad'); expect(loadSnapshot(s)).toBeNull();
    s.m.set(STATUS_STORAGE_KEY, '[1]'); expect(loadSnapshot(s)).toBeNull();
    s.m.set(STATUS_STORAGE_KEY, '{"a":1,"b":"y"}'); expect(loadSnapshot(s)).toEqual({ b: 'y' });
    expect(loadSnapshot(null)).toBeNull();
    expect(() => saveSnapshot({ setItem: () => { throw new Error('quota'); } }, {})).not.toThrow();
  });
});
