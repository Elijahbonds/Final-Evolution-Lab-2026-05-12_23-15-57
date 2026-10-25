// SAFETY lane (SAF-02 / SAF-03, 2026-10-25): the guardian re-ask for the new wording, and the wordingVersion column.
//
// Owner decision 2026-10-23 ("ask guardians again"): a consent given under the camp-plan wording must not unlock a coach's
// roster or squads. The two go-live dates stay NULL until the owner approves the words (OWN-03); these tests inject a
// date to stand in the world after go-live, and pin that the shipped state is still null.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consentTable, acceptedConsent } from '@/tests/helpers/consentTable';
import { COACH_TRAINING_CONSENT_SINCE, coversCoachTraining } from '@/lib/coach/coachConsent';
import { SQUADS_CONSENT_SINCE, groupGate, squadsConsented } from '@/lib/groups/gates';
import { teenGate } from '@/lib/coach/teenGate';
import { GUARDIAN_CONSENT_COVERS, guardianConsentAsk } from '@/lib/consent/guardianGate';
import {
  GUARDIAN_CONSENT_DRAFT, OWNER_WORDING_TODO, askFor, coversForVersion, liveCovers, liveWordingVersion, reaskState,
  readWordingVersions, resetWordingProbe, stampWordingVersion,
} from '@/lib/consent/wording';
import { consentCovers, versionCovers, versionFor, WORDING_VERSIONS } from '@/lib/consent/wordingVersions';

const NOW = new Date();
const YEAR = NOW.getFullYear();
const LIVE = new Date('2026-10-01');
const before = new Date('2026-09-01');
const after = new Date('2026-10-10');

describe('SHIPPED STATE: both go-live dates are null, and the guardian reads today\'s words only', () => {
  it('the dates are null (OWN-03 blocks go-live)', () => {
    expect(COACH_TRAINING_CONSENT_SINCE).toBeNull();
    expect(SQUADS_CONSENT_SINCE).toBeNull();
  });
  it('the live list is exactly GUARDIAN_CONSENT_COVERS, and the ask reads word for word as before', () => {
    expect(liveCovers()).toEqual([...GUARDIAN_CONSENT_COVERS]);
    expect(askFor('Sam', liveCovers())).toBe(guardianConsentAsk('Sam'));
    expect(liveWordingVersion()).toBe(1);
  });
  it('the new scopes are owner placeholders, and a placeholder can never go live', () => {
    for (const line of GUARDIAN_CONSENT_DRAFT) expect(line.words).toContain(OWNER_WORDING_TODO);
    expect(() => liveCovers({ coachTraining: LIVE, squads: null })).toThrow(/placeholder/);
    expect(() => liveCovers({ coachTraining: null, squads: LIVE })).toThrow(/placeholder/);
  });
  it('once the owner writes the words, a live scope joins the list', () => {
    const approved = [{ unlocks: 'coach_training' as const, words: 'train with a coach on FEL' }];
    expect(liveCovers({ coachTraining: LIVE, squads: null }, approved).map((l) => l.unlocks)).toEqual(['camp_plan', 'coach_training']);
    expect(askFor('Sam', liveCovers({ coachTraining: LIVE, squads: null }, approved))).toContain('start a camp plan their coach builds with them or train with a coach on FEL');
  });
});

describe('SAF-03: the wording version decides, the request date is only the fallback', () => {
  it('versions map to scopes; an unknown version covers nothing', () => {
    expect(versionFor({ coachTraining: false, squads: false })).toBe(1);
    expect(versionFor({ coachTraining: true, squads: false })).toBe(2);
    expect(versionFor({ coachTraining: false, squads: true })).toBe(3);
    expect(versionFor({ coachTraining: true, squads: true })).toBe(4);
    for (const v of Object.keys(WORDING_VERSIONS)) expect(WORDING_VERSIONS[Number(v)]).toContain('camp_plan');
    expect(versionCovers(99, 'coach_training')).toBe(false);
  });
  it('a null go-live date closes the scope whatever the row records (the owner\'s one switch)', () => {
    expect(consentCovers({ requestedAt: after, wordingVersion: 4 }, 'coach_training', null)).toBe(false);
    expect(coversCoachTraining({ requestedAt: after, wordingVersion: 4 })).toBe(false);
  });
  it('a recorded version beats the date: an OLD-wording row requested after go-live still fails, a new one passes', () => {
    expect(coversCoachTraining({ requestedAt: after, wordingVersion: 1 }, LIVE)).toBe(false);
    expect(coversCoachTraining({ requestedAt: after, wordingVersion: 2 }, LIVE)).toBe(true);
    expect(coversCoachTraining({ requestedAt: after, wordingVersion: 3 }, LIVE)).toBe(false);
  });
  it('a row with no version (every row before the SQL) is judged by its date, exactly as before', () => {
    expect(coversCoachTraining({ requestedAt: before }, LIVE)).toBe(false);
    expect(coversCoachTraining({ requestedAt: after }, LIVE)).toBe(true);
    expect(coversCoachTraining({ requestedAt: after, wordingVersion: null }, LIVE)).toBe(true);
  });
  it('squads read the same way', () => {
    const c = (o: object) => [{ requestedAt: after, acceptedAt: after, revokedAt: null, ...o }];
    expect(squadsConsented(c({ wordingVersion: 2 }), LIVE)).toBe(false);
    expect(squadsConsented(c({ wordingVersion: 3 }), LIVE)).toBe(true);
    expect(squadsConsented(c({}), LIVE)).toBe(true);
    expect(squadsConsented(c({ wordingVersion: 4, revokedAt: after }), LIVE)).toBe(false);
  });
  it('the accept page shows the words of the row\'s own version', () => {
    expect(coversForVersion(1).map((l) => l.unlocks)).toEqual(['camp_plan']);
    expect(coversForVersion(4).map((l) => l.unlocks)).toEqual(['camp_plan', 'coach_training', 'squads']);
    expect(coversForVersion(null)).toEqual(liveCovers());
  });
});

describe('SAF-02: a teen with the new-wording consent passes; the old camp-plan consent does not (dates injected)', () => {
  const teen = YEAR - 15;
  const consent = (o: object) => ({ requestedAt: after, acceptedAt: after, revokedAt: null, menteeBirthYear: teen, ...o });
  it('rosters, set logs, the cool-down and the combine (the coach-training gate)', () => {
    // shipped: the date is null, so even a version-2 consent is closed today
    expect(teenGate({ dobYear: teen, consents: [consent({ wordingVersion: 2 })] }).ok).toBe(false);
    expect(coversCoachTraining(consent({ wordingVersion: 2 }), LIVE)).toBe(true);
    expect(coversCoachTraining(consent({ requestedAt: before, wordingVersion: null }), LIVE)).toBe(false);
  });
  it('squads (the squads gate)', () => {
    expect(groupGate('squad', { dobYear: teen, consents: [consent({ wordingVersion: 3 })] }, NOW, LIVE)).toEqual({ ok: true, band: 'teen' });
    expect(groupGate('squad', { dobYear: teen, consents: [consent({ requestedAt: before })] }, NOW, LIVE)).toEqual({ ok: false, error: 'guardian_consent_required' });
    expect(groupGate('squad', { dobYear: teen, consents: [consent({ wordingVersion: 1 })] }, NOW, LIVE)).toEqual({ ok: false, error: 'guardian_consent_required' });
  });
});

describe('reaskState', () => {
  const dates = { coachTraining: LIVE, squads: null };
  const row = (o: object) => ({ id: 'c1', requestedAt: before, acceptedAt: before, revokedAt: null, ...o });
  it('not live → nothing to ask', () => expect(reaskState('coach_training', [row({})])).toEqual({ state: 'not_live' }));
  it('accepted under the old words → re-ask from that row', () => expect(reaskState('coach_training', [row({})], dates)).toMatchObject({ state: 'reask', from: { id: 'c1' } }));
  it('already covered, pending, or no guardian on file → no re-ask', () => {
    expect(reaskState('coach_training', [row({ requestedAt: after })], dates).state).toBe('covered');
    expect(reaskState('coach_training', [row({ acceptedAt: null })], dates).state).toBe('pending');
    expect(reaskState('coach_training', [], dates).state).toBe('no_guardian');
    expect(reaskState('coach_training', [row({ revokedAt: after })], dates).state).toBe('no_guardian');
  });
});

describe('the version column through the pendingSchema seam', () => {
  beforeEach(() => { resetWordingProbe(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  const raw = (column: boolean) => {
    const exec: unknown[][] = [];
    return {
      exec,
      db: {
        async $queryRawUnsafe(q: string, ...v: unknown[]) {
          if (q.includes('information_schema.columns')) return column ? [{ ok: 1 }] : [];
          if (!column) throw Object.assign(new Error('column "wordingVersion" does not exist'), { code: '42703' });
          return (v[0] as string[]).map((id) => ({ id, wordingVersion: 2 }));
        },
        async $executeRawUnsafe(q: string, ...v: unknown[]) { exec.push([q, ...v]); return 1; },
      },
    };
  };
  it('before the SQL: no write, no read, nothing thrown', async () => {
    const r = raw(false);
    expect(await stampWordingVersion(r.db, 'c1', 2)).toBe(false);
    expect((await readWordingVersions(r.db, ['c1'])).size).toBe(0);
    expect(r.exec).toEqual([]);
  });
  it('after the SQL: the stamp is one parameterised UPDATE, and the read returns the versions', async () => {
    const r = raw(true);
    expect(await stampWordingVersion(r.db, 'c1', 2)).toBe(true);
    expect(r.exec).toEqual([['UPDATE "GuardianConsent" SET "wordingVersion" = $1 WHERE "id" = $2', 2, 'c1']]);
    expect([...(await readWordingVersions(r.db, ['c1']))]).toEqual([['c1', 2]]);
  });
});

// ── the re-ask route, end to end ─────────────────────────────────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({ user: null as string | null, users: [] as { id: string; dobYear: number | null; email?: string }[], consents: null as any, live: null as Date | null }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/consent/wording', async (orig) => {
  const real = await orig<typeof import('@/lib/consent/wording')>();
  return { ...real, reaskState: (s: any, c: any, d?: any) => real.reaskState(s, c, d ?? { coachTraining: h.live, squads: null }) };
});
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, k) => {
      if (k === 'then') return undefined;
      if (k === 'guardianConsent') return h.consents.model;
      if (k === 'user') return { findUnique: async (a: any) => h.users.find((u) => u.id === a.where.id) ?? null };
      return undefined;
    },
  }),
}));

import { POST as reaskPOST } from '@/app/api/consent/reask/route';

describe('POST /api/consent/reask', () => {
  beforeEach(() => {
    h.user = 'teen';
    h.users = [{ id: 'teen', dobYear: YEAR - 15 }, { id: 'adult', dobYear: 1985 }, { id: 'kid', dobYear: YEAR - 11 }];
    h.consents = consentTable([acceptedConsent('teen', YEAR - 15, { id: 'old', requestedAt: before })]);
    h.live = LIVE;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  const ask = async (scope: unknown = 'coach_training') => {
    const r = await reaskPOST(new Request('http://x/api/consent/reask', { method: 'POST', body: JSON.stringify({ scope }) }));
    return { status: r.status, json: await r.json() as Record<string, unknown> };
  };

  it('TODAY (wording not live): 409 not_live, nothing written', async () => {
    h.live = null;
    expect(await ask()).toEqual({ status: 409, json: { error: 'not_live' } });
    expect(h.consents.calls).not.toContain('create');
  });

  it('after go-live: a new PLAYER request from the guardian already on file; the teen typed nothing; the answer names nobody', async () => {
    const r = await ask();
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(['href', 'token']);
    const made = h.consents.rows.find((c: any) => c.id !== 'old');
    expect(made).toMatchObject({ menteeId: 'teen', guardianName: 'Pat Guardian', guardianEmail: 'pat@example.test', menteeBirthYear: YEAR - 15, selfRequested: true, acceptedAt: null });
    expect(JSON.stringify(r.json)).not.toMatch(/Pat|example\.test/);
    // now pending: a second ask answers pending, not a second row
    expect((await ask()).json.error).toBe('pending');
  });

  it('refuses adults, under-13s, a blank year, signed out, an unknown scope', async () => {
    h.user = 'adult'; expect((await ask()).json.error).toBe('not_teen');
    h.user = 'kid'; expect((await ask()).json.error).toBe('not_teen');
    h.users.push({ id: 'blank', dobYear: null }); h.user = 'blank'; expect((await ask()).json.error).toBe('age_required');
    h.user = null; expect((await ask()).status).toBe(401);
    h.user = 'teen'; expect((await ask('mirror')).json.error).toBe('scope_invalid');
  });

  it('no accepted guardian on file: the first ask is the door, not a re-ask', async () => {
    h.consents = consentTable([]);
    expect((await ask()).json.error).toBe('no_guardian');
  });
});
