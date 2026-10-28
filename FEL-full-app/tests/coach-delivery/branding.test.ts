// COACH-DELIVERY COA-04 (2026-10-26): a coach's brand — name, accent (readable on FEL's dark background), logo (signed PUT into
// the existing public creator bucket; off without it) — on the coach page, the athlete's Today and the invite email.
import { beforeEach, describe, expect, it } from 'vitest';
import { brandSignOff, checkLogo, cleanAccent, contrast, logoObjectOk } from '@/lib/coach/branding';
import { brandingAct, brandingBoard, brandingFor, myBranding } from '@/lib/coach/brandingServer';
import { inviteEmail } from '@/lib/coach/inviteEmail';
import { resetDeliveryProbe } from '@/lib/coach/delivery/probe';
import { seedPerson } from '@/tests/helpers/fakeParityDb';
import { fakeDeliveryDb, program, type FakeDeliveryDb } from '@/tests/helpers/fakeDeliveryDb';

let db: FakeDeliveryDb;
const anyDb = () => db as never;
const BUCKETS = { CREATOR_MEDIA_PUBLIC_BUCKET: 'fel-creator-public' };
const SIGN = { sign: async () => 'ab'.repeat(32), now: () => new Date('2026-10-28T18:00:00Z') };
const now = () => new Date(db.clock);

beforeEach(() => {
  resetDeliveryProbe();
  db = fakeDeliveryDb();
  seedPerson(db, 'c1', 'adult', 'Dee Lane'); seedPerson(db, 'ada', 'adult', 'Ada');
  db.certified.push('c1');
});

describe('the rules', () => {
  it('an accent must read on FEL\'s dark background (WCAG AA 4.5:1)', () => {
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 0);
    expect(cleanAccent('#00e5ff')).toEqual({ ok: true, accent: '#00E5FF' });
    expect(cleanAccent('#1A1A40')).toEqual({ ok: false, error: 'accent_too_dark' });
    expect(cleanAccent('cyan')).toEqual({ ok: false, error: 'accent_format' });
    expect(cleanAccent(null)).toEqual({ ok: true, accent: null });
  });
  it('a logo is a small PNG/JPEG/WebP under the coach\'s own prefix', () => {
    expect(checkLogo('image/png', 40_000)).toEqual({ ok: true, ext: 'png' });
    expect(checkLogo('image/svg+xml', 4_000)).toEqual({ ok: false, error: 'logo_type' });
    expect(checkLogo('image/png', 600 * 1024)).toEqual({ ok: false, error: 'logo_size' });
    expect(logoObjectOk('c1', 'coach-logos/c1/abcdef1234.png')).toBe(true);
    expect(logoObjectOk('c1', 'coach-logos/c2/abcdef1234.png')).toBe(false);
    expect(logoObjectOk('c1', 'coach-logos/c1/../x/abcdef1234.png')).toBe(false);
  });
});

describe('the coach sets it', () => {
  it('before the SQL: unavailable / 503; an uncertified user: 403', async () => {
    db.deliveryTables = false;
    expect((await brandingBoard(anyDb(), 'c1', now())).body).toEqual({ available: false });
    expect((await brandingAct(anyDb(), 'c1', { action: 'save', name: 'X' }, now())).status).toBe(503);
    db.deliveryTables = true; resetDeliveryProbe();   // applied: the next probe finds it
    expect((await brandingAct(anyDb(), 'ada', { action: 'save', name: 'X' }, now())).body).toEqual({ error: 'facilitator_not_certified' });
  });

  it('saves a name and accent; a logo needs the public bucket (off = 503), then a signed, size-bound PUT, then logo_set', async () => {
    expect((await brandingAct(anyDb(), 'c1', { action: 'save', name: 'Dee Strength', accent: '#00e5ff' }, now())).status).toBe(200);
    expect((await brandingAct(anyDb(), 'c1', { action: 'save', accent: '#101010' }, now())).body).toEqual({ error: 'accent_too_dark' });
    expect((await brandingAct(anyDb(), 'c1', { action: 'logo_upload', contentType: 'image/png', bytes: 30_000 }, now(), {}, SIGN)).body).toEqual({ error: 'uploads_off' });
    const up = await brandingAct(anyDb(), 'c1', { action: 'logo_upload', contentType: 'image/png', bytes: 30_000 }, now(), BUCKETS, SIGN);
    const j = up.body as { objectName: string; put: { url: string; headers: Record<string, string> } };
    expect(j.objectName).toMatch(/^coach-logos\/c1\/[a-f0-9]{32}\.png$/);
    expect(j.put.url).toMatch(/^https:\/\/storage\.googleapis\.com\/fel-creator-public\/coach-logos\/c1\/.*X-Goog-Signature=abab/);
    expect(j.put.headers['x-goog-content-length-range']).toBe('30000,30000');
    expect((await brandingAct(anyDb(), 'c1', { action: 'logo_set', objectName: 'coach-logos/c2/abcdef1234.png' }, now(), BUCKETS)).status).toBe(400);
    expect((await brandingAct(anyDb(), 'c1', { action: 'logo_set', objectName: j.objectName }, now(), BUCKETS)).status).toBe(200);
    const b = (await brandingFor(anyDb(), ['c1'], db.clock, BUCKETS)).get('c1');
    expect(b).toEqual({ name: 'Dee Strength', accent: '#00E5FF', logoUrl: `https://storage.googleapis.com/fel-creator-public/${j.objectName}` });
    // no bucket set: the name and accent still show, the logo does not
    expect((await brandingFor(anyDb(), ['c1'], db.clock, {})).get('c1')?.logoUrl).toBeNull();
  });
});

describe('where it shows', () => {
  it('the athlete\'s Today: their active program\'s coach\'s brand; none without a program', async () => {
    await brandingAct(anyDb(), 'c1', { action: 'save', name: 'Dee Strength', accent: '#00E5FF' }, now());
    expect((await myBranding(anyDb(), 'ada', now())).body).toEqual({ branding: null });
    program(db, 'p1', 'c1', 'ada');
    expect((await myBranding(anyDb(), 'ada', now())).body).toEqual({ branding: { name: 'Dee Strength', accent: '#00E5FF', logoUrl: null } });
  });

  it('the invite email: plain text, signed with the brand (no logo or colour in an email)', () => {
    const signOff = brandSignOff({ name: 'Dee Strength' }, 'Dee Lane');
    const m = inviteEmail({ coachName: 'Dee Lane', athleteName: 'Ada', link: 'https://x/j/t', code: null, codeUrl: null, expiresAt: new Date('2026-11-01'), signOff });
    expect(m.text.split('\n').pop()).toBe('— Dee Lane · Dee Strength');
    expect(m.text).not.toMatch(/<|#00E5FF/);
    expect(brandSignOff(null, 'Dee Lane')).toBeNull();
  });
});
