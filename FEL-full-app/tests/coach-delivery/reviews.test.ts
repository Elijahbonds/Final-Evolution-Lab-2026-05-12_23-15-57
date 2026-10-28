// COACH-DELIVERY COA-10 (2026-10-27): client reviews of a coach — only a verified adult whose package with the coach ENDED,
// one per client per coach, text screened (no health claims, no contact details), the coach can hide but never edit, and the
// public page shows stars and the count (text stays with the coach until SAF-06's shared screen lands). No money moves, so
// nothing here depends on the payments switch.
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanReview, coachReviews, packageEnded, publicReviews, REVIEW_AFTER_DAYS, REVIEW_TEXT_PUBLIC, reviewContext, reviewSummaries, setReviewStatus, SQL, submitReview } from '@/lib/coach-business/reviews';
import { resetDeliveryProbe } from '@/lib/coach/delivery/probe';
import { resetBusinessProbe } from '@/lib/coach-business/store';
import { fakeDeliveryDb, type FakeDeliveryDb } from '@/tests/helpers/fakeDeliveryDb';

const DAY = 86_400_000;
let db: FakeDeliveryDb;
let sales: { coachId: string; buyerId: string; id: string; kind: string; status: string; paidAt: Date | null }[];
let dob: Record<string, number | null>;
const anyDb = () => db as never;
const now = () => new Date(db.clock);

beforeEach(() => {
  resetDeliveryProbe(); resetBusinessProbe();
  db = fakeDeliveryDb();
  sales = []; dob = { ada: 1990, tia: new Date().getFullYear() - 16, c1: 1985 };
  const q = db.extra.query, e = db.extra.exec;
  const probeQ = db.$queryRawUnsafe;
  db.$queryRawUnsafe = (async (sql: string, ...v: unknown[]) => (sql.includes("'CoachApplication'") ? [{ ok: 1 }] : probeQ(sql, ...v))) as typeof probeQ;
  q.set(SQL.dob, (v) => [{ dobYear: dob[v[0] as string] ?? null }]);
  q.set(SQL.sales, (v) => sales.filter((s) => s.coachId === v[0] && s.buyerId === v[1] && s.paidAt));
  q.set(SQL.mine, (v) => db.reviews.filter((r) => r.coachId === v[0] && r.athleteId === v[1]));
  q.set(SQL.forCoach, (v) => db.reviews.filter((r) => r.coachId === v[0]).map((r) => ({ ...r, name: r.athleteId === 'ada' ? 'Ada Lane' : null })));
  q.set(SQL.summary, (v) => {
    const shown = db.reviews.filter((r) => (v[0] as string[]).includes(r.coachId) && r.status === 'shown');
    return shown.length ? [{ coachId: shown[0].coachId, n: shown.length, avg: shown.reduce((a, r) => a + r.stars, 0) / shown.length }] : [];
  });
  q.set(SQL.shownFor, (v) => db.reviews.filter((r) => r.coachId === v[0] && r.status === 'shown'));
  e.set(SQL.upsert, (v) => {
    const [id, coachId, athleteId, saleId, stars, text] = v;
    const r = db.reviews.find((x) => x.coachId === coachId && x.athleteId === athleteId);
    if (r) Object.assign(r, { stars, text, saleId, updatedAt: now() }); else db.reviews.push({ id, coachId, athleteId, saleId, stars, text, status: 'shown', updatedAt: now() });
    return 1;
  });
  e.set(SQL.setStatus, (v) => { const r = db.reviews.find((x) => x.id === v[0] && x.coachId === v[1]); if (!r) return 0; r.status = v[2]; return 1; });
});

describe('who may review', () => {
  it('a package has ended: monthly cancelled, or a one-off paid two weeks ago; never one refunded in full or never paid', () => {
    const t = new Date('2026-10-27T00:00:00Z');
    const ago = (d: number) => new Date(t.getTime() - d * DAY);
    expect(packageEnded([{ kind: 'monthly', status: 'ACTIVE', paidAt: ago(40) }], t)).toBe(false);
    expect(packageEnded([{ kind: 'monthly', status: 'CANCELED', paidAt: ago(40) }], t)).toBe(true);
    expect(packageEnded([{ kind: 'session_pack', status: 'PAID', paidAt: ago(REVIEW_AFTER_DAYS - 1) }], t)).toBe(false);
    expect(packageEnded([{ kind: 'session_pack', status: 'PAID', paidAt: ago(REVIEW_AFTER_DAYS) }], t)).toBe(true);
    expect(packageEnded([{ kind: 'program', status: 'REFUNDED', paidAt: ago(60) }], t)).toBe(false);
    expect(packageEnded([{ kind: 'program', status: 'PENDING', paidAt: null }], t)).toBe(false);
  });

  it('adults only; no ended package, no review', async () => {
    sales.push({ coachId: 'c1', buyerId: 'tia', id: 's0', kind: 'program', status: 'PAID', paidAt: new Date(db.clock - 30 * DAY) });
    expect((await submitReview(anyDb(), 'tia', { coachId: 'c1', stars: 5 }, now()))).toMatchObject({ status: 403, body: { error: 'adults_only' } });
    expect((await submitReview(anyDb(), 'ada', { coachId: 'c1', stars: 5 }, now()))).toMatchObject({ status: 409, body: { error: 'no_ended_package' } });
    expect((await reviewContext(anyDb(), 'ada', 'c1', now())).body).toMatchObject({ available: true, eligible: false, why: 'no_ended_package' });
    expect(db.reviews).toEqual([]);
  });
});

describe('the text', () => {
  it('stars 1–5; no health claims; no contact details or links', () => {
    expect(cleanReview({ stars: 0 })).toEqual({ ok: false, error: 'stars' });
    expect(cleanReview({ stars: 5, text: 'Cured my back pain in a week' })).toEqual({ ok: false, error: 'text_claims' });
    for (const t of ['email me at sam@x.com', 'see www.mysite.com', 'call 555 123 4567', 'dm @samtrains']) expect(cleanReview({ stars: 4, text: t }), t).toEqual({ ok: false, error: 'text_contact' });
    expect(cleanReview({ stars: 4, text: '  Clear plans,  quick replies. ' })).toEqual({ ok: true, stars: 4, text: 'Clear plans, quick replies.' });
  });
});

describe('review, hide, show', () => {
  beforeEach(() => { sales.push({ coachId: 'c1', buyerId: 'ada', id: 's1', kind: 'monthly', status: 'CANCELED', paidAt: new Date(db.clock - 60 * DAY) }); });

  it('before the pending SQL: unavailable / 503', async () => {
    db.deliveryTables = false;
    expect((await reviewContext(anyDb(), 'ada', 'c1', now())).body).toEqual({ available: false });
    expect((await submitReview(anyDb(), 'ada', { coachId: 'c1', stars: 5 }, now())).status).toBe(503);
  });

  it('one review per client per coach (a second replaces the first); the public page shows stars and the count', async () => {
    expect((await submitReview(anyDb(), 'ada', { coachId: 'c1', stars: 3, text: 'Good plans.' }, now())).status).toBe(200);
    expect((await submitReview(anyDb(), 'ada', { coachId: 'c1', stars: 5, text: 'Great plans and quick replies.' }, now())).status).toBe(200);
    expect(db.reviews).toHaveLength(1);
    expect(db.reviews[0]).toMatchObject({ stars: 5, saleId: 's1' });
    expect((await reviewSummaries(anyDb(), ['c1'])).get('c1')).toEqual({ count: 1, avg: 5 });
    const pub = await publicReviews(anyDb(), 'c1');
    expect(REVIEW_TEXT_PUBLIC).toBe(false);
    expect(pub.items).toEqual([{ stars: 5, text: null, at: expect.any(String) }]);   // text stays with the coach for now
    expect(((await coachReviews(anyDb(), 'c1', now())).body as { reviews: { text: string; name: string }[] }).reviews[0]).toMatchObject({ text: 'Great plans and quick replies.', name: 'Ada' });
  });

  it('the coach can hide one from their page (never edit it); another coach cannot touch it', async () => {
    await submitReview(anyDb(), 'ada', { coachId: 'c1', stars: 2 }, now());
    const id = db.reviews[0].id;
    expect((await setReviewStatus(anyDb(), 'c2', { action: 'hide', id }, now())).status).toBe(404);
    expect((await setReviewStatus(anyDb(), 'c1', { action: 'hide', id }, now())).status).toBe(200);
    expect((await reviewSummaries(anyDb(), ['c1'])).get('c1')).toBeUndefined();
    expect((await setReviewStatus(anyDb(), 'c1', { action: 'edit', id, stars: 5 }, now())).status).toBe(400);
    expect(db.reviews[0].stars).toBe(2);
  });

  it('a coach cannot review themselves', async () => {
    expect((await submitReview(anyDb(), 'c1', { coachId: 'c1', stars: 5 }, now())).body).toEqual({ error: 'bad_coach' });
  });
});
