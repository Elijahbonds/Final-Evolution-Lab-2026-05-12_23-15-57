// MIRROR-COACH P5 (2026-09-29): the pre-participation intake — questions, red-flag derivation, and the DB-touching
// functions against a fake client (vitest does not collect app/, same pattern as lib/prq-data-rights.test.ts).

import { describe, it, expect } from 'vitest';
import {
  INTAKE_QUESTIONS,
  INTAKE_VERSION,
  RED_FLAG_QUESTION_IDS,
  HEALTH_DATA_CONSENT_COPY,
  RED_FLAG_COPY,
  IntakeValidationError,
  isValidBirthYear,
  validateIntakeAnswers,
  redFlagsFor,
  birthYearFrom,
  isHardStopped,
  needsIntake,
  grantHealthDataConsent,
  submitIntake,
  latestIntake,
  clearIntake,
  type IntakeAnswers,
} from './intake';

describe('the question set', () => {
  it('has the eight questions the phase-5 contract names, each with a plain-words prompt', () => {
    expect(INTAKE_QUESTIONS.map((q) => q.id)).toEqual([
      'current_pain',
      'recent_injury_or_surgery',
      'dizziness_fainting_chest_pain',
      'heart_or_bp_condition',
      'pregnancy_or_postpartum',
      'heart_rate_or_balance_medicine',
      'clinician_told_to_avoid',
      'birth_year',
    ]);
    for (const q of INTAKE_QUESTIONS) expect(q.prompt.length).toBeGreaterThan(10);
  });

  it('every question is skippable (owner: skippable except consent + birth year, and birth year is skippable too — '
    + 'a skip there just means "prefer not to say", which is its own valid answer, not a blocked one)', () => {
    for (const q of INTAKE_QUESTIONS) expect(q.skippable).toBe(true);
  });

  it('exactly the three exertion/cardiac-and-clinician questions are red flags — see the file header assumption', () => {
    expect(RED_FLAG_QUESTION_IDS).toEqual([
      'dizziness_fainting_chest_pain',
      'heart_or_bp_condition',
      'clinician_told_to_avoid',
    ]);
  });

  it('current_pain, recent_injury_or_surgery, pregnancy_or_postpartum and the medicine question are NOT red flags', () => {
    for (const id of ['current_pain', 'recent_injury_or_surgery', 'pregnancy_or_postpartum', 'heart_rate_or_balance_medicine']) {
      expect(RED_FLAG_QUESTION_IDS).not.toContain(id);
    }
  });

  it('the consent screen names what is stored, why, who sees it, and how to erase it', () => {
    const text = HEALTH_DATA_CONSENT_COPY.bullets.join(' ').toLowerCase();
    expect(text).toMatch(/store/);
    expect(text).toMatch(/coach/);
    expect(text).toMatch(/erase/);
    expect(text).toMatch(/sold|ads/);
  });

  it('the red-flag copy names no condition and no diagnosis, only what to do next', () => {
    expect(RED_FLAG_COPY).toMatch(/clinician/i);
    expect(RED_FLAG_COPY).not.toMatch(/diagnos/i);
  });
});

describe('isValidBirthYear', () => {
  const now = new Date('2026-09-29T00:00:00.000Z');
  it('accepts a plausible year', () => expect(isValidBirthYear(1990, now)).toBe(true));
  it('accepts this very year (a birth this year is unusual but not invalid)', () => expect(isValidBirthYear(2026, now)).toBe(true));
  it('rejects a future year', () => expect(isValidBirthYear(2027, now)).toBe(false));
  it('rejects an implausibly old year', () => expect(isValidBirthYear(1800, now)).toBe(false));
  it('rejects a non-integer', () => expect(isValidBirthYear(1990.5, now)).toBe(false));
});

describe('validateIntakeAnswers', () => {
  const now = new Date('2026-09-29T00:00:00.000Z');

  it('accepts a fully-answered payload', () => {
    const { answers, errors } = validateIntakeAnswers(
      {
        current_pain: false,
        recent_injury_or_surgery: false,
        dizziness_fainting_chest_pain: false,
        heart_or_bp_condition: false,
        pregnancy_or_postpartum: false,
        heart_rate_or_balance_medicine: false,
        clinician_told_to_avoid: false,
        birth_year: 1995,
      },
      now,
    );
    expect(errors).toEqual([]);
    expect(answers.birth_year).toBe(1995);
    expect(answers.current_pain).toBe(false);
  });

  it('every question skipped (all null/undefined) is valid — nothing is required except consent', () => {
    const { answers, errors } = validateIntakeAnswers({}, now);
    expect(errors).toEqual([]);
    expect(answers).toEqual({});
  });

  it('an explicit null is treated the same as a skip, not a "no"', () => {
    const { answers, errors } = validateIntakeAnswers({ current_pain: null }, now);
    expect(errors).toEqual([]);
    expect(answers.current_pain).toBeUndefined();
  });

  it('a non-boolean for a yes/no question is an error, not a silent drop', () => {
    const { errors } = validateIntakeAnswers({ current_pain: 'yes' }, now);
    expect(errors).toEqual(['current_pain: expected boolean']);
  });

  it('an implausible birth year is an error', () => {
    const { errors } = validateIntakeAnswers({ birth_year: 3000 }, now);
    expect(errors).toEqual(['birth_year: expected a plausible birth year']);
  });

  it('a non-number birth year is an error', () => {
    const { errors } = validateIntakeAnswers({ birth_year: 'nineteen-ninety' }, now);
    expect(errors).toEqual(['birth_year: expected a plausible birth year']);
  });

  it('unknown keys are dropped, not stored and not errors — only this app\'s own question ids are ever written', () => {
    const { answers, errors } = validateIntakeAnswers({ current_pain: true, some_other_field: 'x' }, now);
    expect(errors).toEqual([]);
    expect(answers).toEqual({ current_pain: true });
    expect('some_other_field' in answers).toBe(false);
  });

  it('a non-object payload is rejected outright', () => {
    expect(validateIntakeAnswers(null).errors.length).toBeGreaterThan(0);
    expect(validateIntakeAnswers('nope').errors.length).toBeGreaterThan(0);
    expect(validateIntakeAnswers(42).errors.length).toBeGreaterThan(0);
  });
});

describe('redFlagsFor', () => {
  it('no answers -> no red flags', () => expect(redFlagsFor({})).toEqual([]));

  it('every red-flag question answered "no" -> no red flags', () => {
    const answers: IntakeAnswers = {
      dizziness_fainting_chest_pain: false,
      heart_or_bp_condition: false,
      clinician_told_to_avoid: false,
    };
    expect(redFlagsFor(answers)).toEqual([]);
  });

  it('each red-flag question answered "yes" is named, one at a time', () => {
    for (const id of RED_FLAG_QUESTION_IDS) {
      expect(redFlagsFor({ [id]: true } as IntakeAnswers)).toEqual([id]);
    }
  });

  it('all three at once are all named, in question order', () => {
    const answers: IntakeAnswers = {
      dizziness_fainting_chest_pain: true,
      heart_or_bp_condition: true,
      clinician_told_to_avoid: true,
    };
    expect(redFlagsFor(answers)).toEqual([...RED_FLAG_QUESTION_IDS]);
  });

  it('a "yes" on a non-red-flag question never appears', () => {
    expect(redFlagsFor({ current_pain: true, pregnancy_or_postpartum: true })).toEqual([]);
  });
});

describe('birthYearFrom', () => {
  it('reads a numeric answer', () => expect(birthYearFrom({ birth_year: 2001 })).toBe(2001));
  it('null for a skipped/absent answer (decision #20: blank = youth rules, enforced elsewhere)', () => {
    expect(birthYearFrom({})).toBeNull();
  });
});

describe('isHardStopped', () => {
  it('null/undefined intake -> not stopped', () => {
    expect(isHardStopped(null)).toBe(false);
    expect(isHardStopped(undefined)).toBe(false);
  });
  it('no red flags -> not stopped', () => expect(isHardStopped({ redFlags: [], clearedAt: null })).toBe(false));
  it('a red flag with no clearedAt -> stopped', () => expect(isHardStopped({ redFlags: ['heart_or_bp_condition'], clearedAt: null })).toBe(true));
  it('a red flag with a clearedAt -> not stopped', () => {
    expect(isHardStopped({ redFlags: ['heart_or_bp_condition'], clearedAt: new Date() })).toBe(false);
  });
});

describe('needsIntake — re-asked yearly', () => {
  const now = new Date('2026-09-29T00:00:00.000Z');
  it('no intake on file -> needed', () => expect(needsIntake(null, now)).toBe(true));
  it('a fresh, current-version intake -> not needed', () => {
    expect(needsIntake({ version: INTAKE_VERSION, createdAt: new Date('2026-09-01T00:00:00.000Z') }, now)).toBe(false);
  });
  it('a stale version -> needed even if recent', () => {
    expect(needsIntake({ version: '2025-01-01-draft', createdAt: now }, now)).toBe(true);
  });
  it('the current version but over a year old -> needed', () => {
    expect(needsIntake({ version: INTAKE_VERSION, createdAt: new Date('2025-09-01T00:00:00.000Z') }, now)).toBe(true);
  });
  it('exactly at the boundary is still within the year (strictly greater-than triggers a re-ask)', () => {
    const justUnder = new Date(now.getTime() - 364 * 24 * 60 * 60 * 1000);
    expect(needsIntake({ version: INTAKE_VERSION, createdAt: justUnder }, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Fake Prisma client — the same shape lib/prq-data-rights.test.ts uses, extended with `healthConsent` and `user`.
// ---------------------------------------------------------------------------------------------------------------

interface FakeIntakeRow {
  id: string;
  userId: string;
  version: string;
  answers: IntakeAnswers;
  redFlags: string[];
  birthYear: number | null;
  consentedAt: Date;
  clearedAt: Date | null;
  createdAt: Date;
}

interface FakeConsentRow {
  id: string;
  userId: string;
  scope: string;
  coachId: string | null;
  grantedAt: Date;
  revokedAt: Date | null;
}

interface FakeGuardianRow { menteeId: string; requestedAt: Date; acceptedAt: Date | null; revokedAt: Date | null }

function fakeDb() {
  let nextId = 1;
  const intakes: FakeIntakeRow[] = [];
  const consents: FakeConsentRow[] = [];
  // MIRROR-COACH P5 FIX (2026-09-29, code review) — Finding "A minor's full health intake … is collected before any
  // guardian consent exists": submitIntake() now holds the WHOLE submission for anyone whose effective birth year
  // reads as needing a guardian (lib/consent/guardianGate.ts needsGuardian) and no GuardianConsent has been accepted.
  // u1 has no dobYear on file, which — since almost every test below skips the birth_year question — would read as
  // needing a guardian under decision #20's own "blank = minor" default. Seeding u1 with an ALREADY-ACCEPTED
  // guardian consent here keeps every pre-existing test in this describe block testing exactly what it always
  // tested (consent handling, red flags, dobYear writes); the guardian-HOLD behavior itself gets its own describe
  // block below, using a user with no guardian consent on file at all.
  const guardianConsents: FakeGuardianRow[] = [
    { menteeId: 'u1', requestedAt: new Date('2020-01-01'), acceptedAt: new Date('2020-01-02'), revokedAt: null },
  ];
  const users = new Map<string, { id: string; dobYear: number | null }>([
    ['u1', { id: 'u1', dobYear: null }],
    ['u2', { id: 'u2', dobYear: 1980 }],
  ]);

  const healthIntake = {
    create: async ({ data }: { data: Omit<FakeIntakeRow, 'id' | 'createdAt'> & { createdAt?: Date } }) => {
      const row: FakeIntakeRow = { id: `hi${nextId++}`, createdAt: data.consentedAt, clearedAt: null, ...data };
      intakes.push(row);
      return row;
    },
    findFirst: async ({ where, orderBy }: { where: { userId: string }; orderBy?: { createdAt: 'desc' | 'asc' } }) => {
      const rows = intakes.filter((r) => r.userId === where.userId);
      if (!rows.length) return null;
      const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return orderBy?.createdAt === 'asc' ? sorted[0] : sorted[sorted.length - 1];
    },
    findUnique: async ({ where }: { where: { id: string } }) => intakes.find((r) => r.id === where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<FakeIntakeRow> }) => {
      const row = intakes.find((r) => r.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    },
  };

  const healthConsent = {
    findFirst: async ({ where }: { where: { userId: string; scope: string; revokedAt: null } }) =>
      consents.find((c) => c.userId === where.userId && c.scope === where.scope && c.revokedAt === null) ?? null,
    create: async ({ data }: { data: Omit<FakeConsentRow, 'id' | 'revokedAt'> }) => {
      const row: FakeConsentRow = { id: `hc${nextId++}`, revokedAt: null, ...data };
      consents.push(row);
      return row;
    },
  };

  const user = {
    findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: { dobYear?: number } }) => {
      const u = users.get(where.id);
      if (!u) throw new Error('not found');
      Object.assign(u, data);
      return u;
    },
  };

  const guardianConsent = {
    findMany: async ({ where }: { where: { menteeId: string } }) => guardianConsents.filter((c) => c.menteeId === where.menteeId),
  };

  return { db: { healthIntake, healthConsent, user, guardianConsent } as never, intakes, consents, users, guardianConsents };
}

describe('grantHealthDataConsent', () => {
  it('creates a grant when none exists', async () => {
    const f = fakeDb();
    const c = await grantHealthDataConsent(f.db, 'u1', new Date('2026-09-29'));
    expect(c.scope).toBe('health_data');
    expect(f.consents).toHaveLength(1);
  });

  it('is idempotent: granting twice while active writes nothing new', async () => {
    const f = fakeDb();
    await grantHealthDataConsent(f.db, 'u1', new Date('2026-09-29'));
    await grantHealthDataConsent(f.db, 'u1', new Date('2026-09-30'));
    expect(f.consents).toHaveLength(1);
  });

  it('a revoked grant is not reactivated — a fresh row is created instead', async () => {
    const f = fakeDb();
    const first = await grantHealthDataConsent(f.db, 'u1', new Date('2026-09-29'));
    f.consents.find((c) => c.id === first.id)!.revokedAt = new Date('2026-09-30');
    await grantHealthDataConsent(f.db, 'u1', new Date('2026-10-01'));
    expect(f.consents).toHaveLength(2);
    expect(f.consents[1].revokedAt).toBeNull();
  });
});

describe('submitIntake', () => {
  const now = new Date('2026-09-29T12:00:00.000Z');

  it('refuses without consent — no row is written', async () => {
    const f = fakeDb();
    await expect(submitIntake(f.db, { userId: 'u1', rawAnswers: {}, consent: false, now })).rejects.toMatchObject({ code: 'consent_required' });
    expect(f.intakes).toHaveLength(0);
    expect(f.consents).toHaveLength(0);
  });

  it('refuses a malformed payload — no row is written', async () => {
    const f = fakeDb();
    await expect(
      submitIntake(f.db, { userId: 'u1', rawAnswers: { current_pain: 'yes' }, consent: true, now }),
    ).rejects.toMatchObject({ code: 'invalid_answers' });
    expect(f.intakes).toHaveLength(0);
  });

  it('grants health_data consent and stores the intake with a snapshot of the red flags', async () => {
    const f = fakeDb();
    const { intake, hardStopped } = await submitIntake(f.db, {
      userId: 'u1',
      rawAnswers: { heart_or_bp_condition: true, current_pain: true },
      consent: true,
      now,
    });
    expect(f.consents).toHaveLength(1);
    expect(intake.redFlags).toEqual(['heart_or_bp_condition']);
    expect(intake.version).toBe(INTAKE_VERSION);
    expect(intake.consentedAt).toEqual(now);
    expect(hardStopped).toBe(true);
  });

  it('no red flags -> not hard-stopped', async () => {
    const f = fakeDb();
    const { hardStopped } = await submitIntake(f.db, { userId: 'u1', rawAnswers: { current_pain: false }, consent: true, now });
    expect(hardStopped).toBe(false);
  });

  it('writes User.dobYear when it was blank', async () => {
    const f = fakeDb();
    await submitIntake(f.db, { userId: 'u1', rawAnswers: { birth_year: 2001 }, consent: true, now });
    expect(f.users.get('u1')!.dobYear).toBe(2001);
  });

  it('never overwrites an existing User.dobYear (decision #20)', async () => {
    const f = fakeDb();
    await submitIntake(f.db, { userId: 'u2', rawAnswers: { birth_year: 1999 }, consent: true, now });
    expect(f.users.get('u2')!.dobYear).toBe(1980);
  });

  it('a skipped birth year writes nothing to User.dobYear', async () => {
    const f = fakeDb();
    await submitIntake(f.db, { userId: 'u1', rawAnswers: {}, consent: true, now });
    expect(f.users.get('u1')!.dobYear).toBeNull();
  });
});

// MIRROR-COACH P5 FIX (2026-09-29, code review) — Finding "A minor's full health intake (including cardiac/red-flag
// answers) is collected before any guardian consent exists": submitIntake() now holds the ENTIRE submission — no
// HealthIntake row, no health_data consent grant, no dobYear write — when the effective birth year reads as needing
// a guardian and none has been accepted. 'u3' below has NO guardianConsents row at all (unlike u1's seeded-accepted
// default above), so it exercises the hold path directly.
describe('submitIntake — holds the whole submission for a minor with no accepted guardian consent (decision #6)', () => {
  const now = new Date('2026-09-29T12:00:00.000Z');
  const freshMinor = () => {
    const f = fakeDb();
    f.users.set('u3', { id: 'u3', dobYear: null });
    return f;
  };

  it('a brand-new account with no birth year answered at all is held — nothing is written', async () => {
    const f = freshMinor();
    await expect(
      submitIntake(f.db, { userId: 'u3', rawAnswers: { current_pain: true, heart_or_bp_condition: true }, consent: true, now }),
    ).rejects.toMatchObject({ code: 'guardian_consent_required' });
    expect(f.intakes).toHaveLength(0);
    expect(f.consents).toHaveLength(0); // not even the health_data grant
    expect(f.users.get('u3')!.dobYear).toBeNull();
  });

  it('answering a birth year that reads as a minor is ALSO held, even though it is the very answer that proves it', async () => {
    const f = freshMinor();
    await expect(
      submitIntake(f.db, { userId: 'u3', rawAnswers: { birth_year: 2014, heart_or_bp_condition: true }, consent: true, now }),
    ).rejects.toMatchObject({ code: 'guardian_consent_required' });
    expect(f.intakes).toHaveLength(0);
    // the red flag answer is exactly the sensitive data the Finding says must not be collected before consent
    expect(f.consents).toHaveLength(0);
  });

  it('answering a birth year that reads as an ADULT goes through normally — no guardian needed', async () => {
    const f = freshMinor();
    const { intake } = await submitIntake(f.db, { userId: 'u3', rawAnswers: { birth_year: 1990 }, consent: true, now });
    expect(f.intakes).toHaveLength(1);
    expect(intake.birthYear).toBe(1990);
    expect(f.users.get('u3')!.dobYear).toBe(1990);
  });

  it('once a guardian consent is accepted, the SAME submission goes through and IS persisted', async () => {
    const f = freshMinor();
    f.guardianConsents.push({ menteeId: 'u3', requestedAt: new Date('2026-09-20'), acceptedAt: new Date('2026-09-25'), revokedAt: null });
    const { intake, hardStopped } = await submitIntake(f.db, { userId: 'u3', rawAnswers: { birth_year: 2014, heart_or_bp_condition: true }, consent: true, now });
    expect(f.intakes).toHaveLength(1);
    expect(intake.redFlags).toEqual(['heart_or_bp_condition']);
    expect(hardStopped).toBe(true);
    expect(f.consents).toHaveLength(1); // health_data consent IS granted once it actually persists
  });

  it('a REVOKED guardian consent reads the same as none — still held', async () => {
    const f = freshMinor();
    f.guardianConsents.push({ menteeId: 'u3', requestedAt: new Date('2026-09-01'), acceptedAt: new Date('2026-09-02'), revokedAt: new Date('2026-09-10') });
    await expect(
      submitIntake(f.db, { userId: 'u3', rawAnswers: { birth_year: 2014 }, consent: true, now }),
    ).rejects.toMatchObject({ code: 'guardian_consent_required' });
  });

  it('an EXISTING dobYear on file is what decides it when birth_year is skipped this time, not a blank re-derivation', async () => {
    // A returning ADULT whose dobYear is already on file skips the (already-answered) birth_year question — this
    // must read as adult from the STORED dobYear, never fall back to "blank = minor" just because it was skipped.
    const f = freshMinor();
    f.users.set('u3', { id: 'u3', dobYear: 1990 });
    const { intake } = await submitIntake(f.db, { userId: 'u3', rawAnswers: { current_pain: true }, consent: true, now });
    expect(f.intakes).toHaveLength(1);
    expect(intake.birthYear).toBeNull(); // this submission didn't answer it — nothing new to snapshot
  });
});

describe('latestIntake', () => {
  it('returns the newest of several, and null for nobody on file', async () => {
    const f = fakeDb();
    await submitIntake(f.db, { userId: 'u1', rawAnswers: {}, consent: true, now: new Date('2026-01-01') });
    await submitIntake(f.db, { userId: 'u1', rawAnswers: { current_pain: true }, consent: true, now: new Date('2026-09-01') });
    const latest = await latestIntake(f.db, 'u1');
    expect(latest?.consentedAt).toEqual(new Date('2026-09-01'));
    expect(await latestIntake(f.db, 'nobody')).toBeNull();
  });
});

describe('clearIntake', () => {
  it('sets a dated, self-attested clearedAt', async () => {
    const f = fakeDb();
    const { intake } = await submitIntake(f.db, { userId: 'u1', rawAnswers: { heart_or_bp_condition: true }, consent: true, now: new Date('2026-09-01') });
    const cleared = await clearIntake(f.db, { userId: 'u1', intakeId: intake.id, now: new Date('2026-09-15') });
    expect(cleared.clearedAt).toEqual(new Date('2026-09-15'));
  });

  it('is idempotent — clearing twice keeps the first date', async () => {
    const f = fakeDb();
    const { intake } = await submitIntake(f.db, { userId: 'u1', rawAnswers: { heart_or_bp_condition: true }, consent: true, now: new Date('2026-09-01') });
    await clearIntake(f.db, { userId: 'u1', intakeId: intake.id, now: new Date('2026-09-15') });
    const again = await clearIntake(f.db, { userId: 'u1', intakeId: intake.id, now: new Date('2026-09-20') });
    expect(again.clearedAt).toEqual(new Date('2026-09-15'));
  });

  it('refuses a different user\'s intake id — the same answer as not-found, not a leak', async () => {
    const f = fakeDb();
    const { intake } = await submitIntake(f.db, { userId: 'u1', rawAnswers: { heart_or_bp_condition: true }, consent: true, now: new Date('2026-09-01') });
    await expect(clearIntake(f.db, { userId: 'u2', intakeId: intake.id })).rejects.toBeInstanceOf(IntakeValidationError);
  });

  it('refuses an unknown intake id', async () => {
    const f = fakeDb();
    await expect(clearIntake(f.db, { userId: 'u1', intakeId: 'nope' })).rejects.toMatchObject({ code: 'not_found' });
  });
});
