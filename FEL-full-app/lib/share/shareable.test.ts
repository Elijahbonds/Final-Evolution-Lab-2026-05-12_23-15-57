// A TEXT GETS FORWARDED (2026-09-13).
//
// The test this file is really about is the leak test. Every other rule here is a product decision that can
// be revisited; "the recipient's body measurements are not at a forwardable URL" is not one of them, so it
// is enforced by a guard that THROWS and by a sweep that walks real payloads rather than trusting the types.

import { describe, it, expect } from 'vitest';
import {
  shareProgram, shareDrill, shareRecommendation, shareSelection,
  assertNoAthleteData, ShareLeak, isShareToken, shareUrl, shareIsPublishable,
  MAX_SELECTION_ITEMS, MAX_FOR_NAME_CHARS, type SharedBy,
} from './shareable';
import type { CoachProgram } from '../profile/assignment';
import { PLATFORM_PROTOCOLS } from '../profile/protocol';
import { emptyProfile } from '../profile/sharedProfile';
import { newShareToken } from './service';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const BY: SharedBy = { coachId: 'coach_me', displayName: 'Coach Mike', credentialed: true };

const program = (over: Partial<CoachProgram> = {}): CoachProgram => ({
  key: 'knee8', title: '8-week knee resilience', coachId: 'coach_me',
  outcome: 'Land from height without a recovery step.',
  visibility: 'published', retestAfterWeeks: 3,
  weeks: [
    { week: 1, focus: 'Settle the ankle', items: [{ protocolKey: 'ankle_prep', frequency: 4 }] },
    { week: 2, focus: 'Load the hinge', items: [{ protocolKey: 'hinge_pattern', frequency: 3 }] },
    { week: 3, focus: 'Absorb it', items: [{ protocolKey: 'depth_drop', frequency: 2, prescription: '3 x 5, quiet landings' }] },
  ],
  ...over,
});

describe('A SHARE CARRIES CONTENT, NEVER A CLIENT', () => {
  it('the guard THROWS on athlete data rather than returning a boolean somebody forgets to check', () => {
    expect(() => assertNoAthleteData({ title: 'x', prq: [{ composite: 80 }] })).toThrow(ShareLeak);
    expect(() => assertNoAthleteData({ a: { b: { composite: 70 } } })).toThrow(ShareLeak);
    expect(() => assertNoAthleteData({ items: [{ ok: 1 }, { scans: [] }] })).toThrow(ShareLeak);
    expect(() => assertNoAthleteData({ clientId: 'cl_1' })).toThrow(/never a client/i);
  });

  it('and names where it found it, so the offending line is findable', () => {
    expect(() => assertNoAthleteData({ weeks: [{ items: [{ axes: {} }] }] }))
      .toThrow(/share\.weeks\[0\]\.items\[0\]/);
  });

  it('every built share survives the sweep', () => {
    const shares = [
      shareProgram(program(), PLATFORM_PROTOCOLS, BY, { forName: 'Ama', now: NOW }).share,
      shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { note: 'Quiet landings.', now: NOW }).share,
      shareRecommendation('Ready to train unsupervised. Strong on the hinge.', BY, { now: NOW }).share,
      shareSelection(['breath_reset', 'ankle_prep'], PLATFORM_PROTOCOLS, BY, { now: NOW }).share,
    ];
    for (const s of shares) {
      expect(s).not.toBeNull();
      expect(() => assertNoAthleteData(s)).not.toThrow();
    }
  });

  it('A WHOLE PROFILE SPREAD INTO A SHARE IS CAUGHT — the case the types cannot catch', () => {
    const profile = emptyProfile('cl_1', 'Ama');
    const sneaky = { ...shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { now: NOW }).share, ...profile };
    expect(() => assertNoAthleteData(sneaky)).toThrow(ShareLeak);
  });

  it('no share payload contains a composite, an axis or a scan, in any kind', () => {
    for (const s of [
      shareProgram(program(), PLATFORM_PROTOCOLS, BY, { forName: 'Ama', now: NOW }).share,
      shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { now: NOW }).share,
      shareSelection(['ankle_prep'], PLATFORM_PROTOCOLS, BY, { now: NOW }).share,
    ]) {
      const blob = JSON.stringify(s).toLowerCase();
      for (const bad of ['composite', 'prq', 'axes', 'scan', 'clientid']) {
        expect(blob, bad).not.toContain(bad);
      }
    }
  });
});

// MIRROR-COACH P5 (2026-09-29): Privacy §5 promises a health intake and pain check-ins "never appear on a share
// link". A share carries training content, never a client's data, and that line does not carve out an exception
// for health data being a different KIND of client data — so every field the three health models
// (schema.prisma HealthIntake / PainCheckIn / HealthConsent) can carry is fed through the same guard here.
describe('A SHARE NEVER CARRIES HEALTH DATA (Privacy §5)', () => {
  const HEALTH_INTAKE_ROW = {
    id: 'hi_1', userId: 'u1', version: '2026-09-29', answers: { current_pain: true }, redFlags: ['dizziness_fainting_chest_pain'],
    birthYear: 2010, consentedAt: '2026-09-29T00:00:00.000Z', clearedAt: null, createdAt: '2026-09-29T00:00:00.000Z',
  };
  const PAIN_CHECK_IN_ROW = {
    id: 'pci_1', userId: 'u1', programExerciseId: 'pe_1', exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 6,
    kind: 'after', acute: ['pop'], note: 'twinge on the way up', decision: 'step_down_flag_coach', createdAt: '2026-09-29T00:00:00.000Z',
  };
  const HEALTH_CONSENT_ROW = {
    id: 'hc_1', userId: 'u1', scope: 'coach_view', coachId: 'coach_me', grantedAt: '2026-09-29T00:00:00.000Z', revokedAt: null,
  };

  it('every field of every health model throws on its own, nested at any depth', () => {
    for (const row of [HEALTH_INTAKE_ROW, PAIN_CHECK_IN_ROW, HEALTH_CONSENT_ROW]) {
      for (const [field, value] of Object.entries(row)) {
        // id/createdAt/note/kind/coachId are generic names a legitimate share ALSO carries (see shareable.ts's own
        // comment on NEVER_SHARED — coachId is SharedBy's) — a health row leaking through one of THOSE names alone
        // is exactly the case userId already covers in the same row, so the assertion is on the whole row below,
        // not the bare field alone.
        if (['id', 'createdAt', 'note', 'kind', 'coachId'].includes(field)) continue;
        expect(() => assertNoAthleteData({ [field]: value }), `${field} must never travel on a share`).toThrow(ShareLeak);
      }
    }
  });

  it('a whole health row, spread into an otherwise-clean share, is caught (the case the types cannot catch)', () => {
    for (const row of [HEALTH_INTAKE_ROW, PAIN_CHECK_IN_ROW, HEALTH_CONSENT_ROW]) {
      const sneaky = { ...shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { now: NOW }).share, healthRow: row };
      expect(() => assertNoAthleteData(sneaky)).toThrow(ShareLeak);
    }
  });

  it('nested inside a program week\'s items, the way a whole profile spread already is', () => {
    expect(() => assertNoAthleteData({ weeks: [{ items: [{ painCheckIn: PAIN_CHECK_IN_ROW }] }] }))
      .toThrow(/share\.weeks\[0\]\.items\[0\]/);
  });

  it('every built share still survives the sweep once the health denylist is this much bigger', () => {
    const shares = [
      shareProgram(program(), PLATFORM_PROTOCOLS, BY, { forName: 'Ama', now: NOW }).share,
      shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { note: 'Quiet landings.', now: NOW }).share,
      shareRecommendation('Ready to train unsupervised. Strong on the hinge.', BY, { now: NOW }).share,
      shareSelection(['breath_reset', 'ankle_prep'], PLATFORM_PROTOCOLS, BY, { now: NOW }).share,
    ];
    for (const s of shares) expect(() => assertNoAthleteData(s)).not.toThrow();
  });

  it('none of the distinctive health field names appear in what a trainer actually sends (plaintext-shaped JSON)', () => {
    const share = shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { note: 'Quiet landings.', now: NOW }).share!;
    const blob = JSON.stringify(share).toLowerCase();
    for (const bad of ['healthintake', 'paincheckin', 'healthconsent', 'redflags', 'bodyarea', 'consentedat', 'birthyear']) {
      expect(blob, bad).not.toContain(bad);
    }
  });
});

// MIRROR-COACH P6 (2026-09-29): the daily readiness check-in rides the same promise (Privacy §5 names it now). A
// whole row, its answers, the export's key and the card's read all fail the guard; every built share still passes.
describe('A SHARE NEVER CARRIES A READINESS CHECK-IN (Privacy §5, P6)', () => {
  const READINESS_ROW = {
    id: 'rc_1', userId: 'u1', date: '2026-09-29', sleep: 2, soreness: 4, energy: 2, mood: 3,
    createdAt: '2026-09-29T07:00:00.000Z', updatedAt: '2026-09-29T07:00:00.000Z',
  };
  const READ = { level: 'low', warmupMinutes: 14, extraWarmupMinutes: 4, suggestion: 'Running low today.', answered: 4, lowItems: ['sleep', 'soreness'] };

  it('each answer throws on its own, and so does the row, the export key and the read', () => {
    for (const f of ['sleep', 'soreness', 'energy', 'mood']) {
      expect(() => assertNoAthleteData({ [f]: 3 }), f).toThrow(ShareLeak);
    }
    expect(() => assertNoAthleteData({ readinessCheckIn: READINESS_ROW })).toThrow(ShareLeak);
    expect(() => assertNoAthleteData({ readinessCheckIns: [READINESS_ROW] })).toThrow(ShareLeak);
    expect(() => assertNoAthleteData({ readiness: READ })).toThrow(ShareLeak);
    expect(() => assertNoAthleteData(READ)).toThrow(ShareLeak);   // lowItems
  });

  it('spread into an otherwise-clean share, it is caught', () => {
    const sneaky = { ...shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { now: NOW }).share, ...READINESS_ROW };
    expect(() => assertNoAthleteData(sneaky)).toThrow(ShareLeak);
  });

  it('every built share still survives the sweep with the readiness names added', () => {
    const shares = [
      shareProgram(program(), PLATFORM_PROTOCOLS, BY, { forName: 'Ama', now: NOW }).share,
      shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { note: 'Quiet landings.', now: NOW }).share,
      shareRecommendation('Ready to train unsupervised. Strong on the hinge.', BY, { now: NOW }).share,
      shareSelection(['breath_reset', 'ankle_prep'], PLATFORM_PROTOCOLS, BY, { now: NOW }).share,
    ];
    for (const s of shares) expect(() => assertNoAthleteData(s)).not.toThrow();
  });
});

// MIRROR-COACH P7 FIX (2026-09-29, review): the Dial-Up Breath's use log rides the same promise (Privacy §5 names it).
// A whole row was already caught by its userId; a projection without one was not.
describe('A SHARE NEVER CARRIES THE DIAL-UP BREATH USE LOG (Privacy §5, P7)', () => {
  const USE = { kind: 'ramp', sessionId: 's-5', createdAt: '2026-09-29T07:00:00.000Z' };
  it('the table and export key throw — with or without a userId riding along', () => {
    expect(() => assertNoAthleteData({ breathLogs: [USE] })).toThrow(ShareLeak);
    expect(() => assertNoAthleteData({ breathLog: USE })).toThrow(ShareLeak);
    expect(() => assertNoAthleteData({ BreathLog: [USE] })).toThrow(ShareLeak);
    expect(() => assertNoAthleteData({ nested: { breathLogs: [] } })).toThrow(ShareLeak);
  });
  it('every built share still survives the sweep with the breath-log names added', () => {
    const shares = [
      shareProgram(program(), PLATFORM_PROTOCOLS, BY, { forName: 'Ama', now: NOW }).share,
      shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { note: 'Quiet landings.', now: NOW }).share,
      shareRecommendation('Ready to train unsupervised. Strong on the hinge.', BY, { now: NOW }).share,
      shareSelection(['breath_reset', 'ankle_prep'], PLATFORM_PROTOCOLS, BY, { now: NOW }).share,
    ];
    for (const s of shares) expect(() => assertNoAthleteData(s)).not.toThrow();
  });
});

describe('A FIRST NAME IS THE ONLY PERSONAL THING ALLOWED', () => {
  it('it is carried when the trainer types it', () => {
    const s = shareProgram(program(), PLATFORM_PROTOCOLS, BY, { forName: 'Ama', now: NOW }).share!;
    expect(s.forName).toBe('Ama');
  });

  it('a full name is trimmed to the first name rather than refused', () => {
    // refusing would just teach trainers to retype it, and the surname is the part worth not publishing
    const s = shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { forName: 'Ama Okafor', now: NOW }).share!;
    expect(s.forName).toBe('Ama');
    expect(JSON.stringify(s)).not.toContain('Okafor');
  });

  it('it is absent when not given, not an empty string', () => {
    const s = shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { now: NOW }).share!;
    expect(s.forName).toBeUndefined();
    expect('forName' in s).toBe(false);
  });

  it('and it is length-capped', () => {
    const s = shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { forName: 'A'.repeat(200), now: NOW }).share!;
    expect(s.forName!.length).toBeLessThanOrEqual(MAX_FOR_NAME_CHARS);
  });
});

describe('TRAINER TEXT IS SCREENED BEFORE IT CAN BE SHARED', () => {
  it('a clinical note blocks the share and reports the phrase to underline', () => {
    const r = shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { note: 'This will fix your knee tendinitis.', now: NOW });
    expect(r.share).toBeNull();
    expect(r.problems[0].flags?.length).toBeGreaterThan(0);
    expect(r.problems[0].flags!.some((f) => f.kind === 'condition')).toBe(true);
  });

  it('but ordinary coaching goes through untouched', () => {
    const note = 'Focus on the landing, not the drop. Stop if you feel pain.';
    const s = shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { note, now: NOW }).share!;
    expect(s.note).toBe(note);
  });

  it('a prescription inside a PROGRAM week is screened too — not just the top-level note', () => {
    const bad = program({ weeks: [{ week: 1, focus: 'x', items: [{ protocolKey: 'depth_drop', frequency: 2, prescription: 'To rehab your shoulder.' }] }] });
    const r = shareProgram(bad, PLATFORM_PROTOCOLS, BY, { now: NOW });
    expect(r.share).toBeNull();
    expect(r.problems.some((p) => p.where === 'week 1')).toBe(true);
  });

  it('a recommendation is screened, and an empty one is refused before screening', () => {
    expect(shareRecommendation('She has patellar tendinitis.', BY, { now: NOW }).share).toBeNull();
    expect(shareRecommendation('   ', BY, { now: NOW }).share).toBeNull();
    expect(shareRecommendation('Ready to train unsupervised. Excellent hinge mechanics.', BY, { now: NOW }).share).not.toBeNull();
  });

  it('shareIsPublishable agrees with what was allowed to be built', () => {
    const s = shareProgram(program(), PLATFORM_PROTOCOLS, BY, { now: NOW }).share!;
    expect(shareIsPublishable(s)).toBe(true);
  });
});

describe('what each kind will and will not accept', () => {
  it('a program names its gates so a recipient knows before they start', () => {
    const s = shareProgram(program(), PLATFORM_PROTOCOLS, BY, { now: NOW }).share!;
    const depth = s.weeks[2].items[0];
    expect(depth.opensAt?.length).toBeGreaterThan(0);
    expect(depth.opensAt![0]).toHaveProperty('need');
  });

  it('an ungated drill has no opensAt key at all', () => {
    const s = shareDrill('breath_reset', PLATFORM_PROTOCOLS, BY, { now: NOW }).share!;
    expect(s.item.opensAt).toBeUndefined();
  });

  it('an unknown protocol is refused in every kind', () => {
    expect(shareDrill('nope', PLATFORM_PROTOCOLS, BY, { now: NOW }).share).toBeNull();
    expect(shareSelection(['nope'], PLATFORM_PROTOCOLS, BY, { now: NOW }).share).toBeNull();
    expect(shareProgram(program({ weeks: [{ week: 1, focus: 'x', items: [{ protocolKey: 'nope', frequency: 1 }] }] }), PLATFORM_PROTOCOLS, BY, { now: NOW }).share).toBeNull();
  });

  it('a selection dedupes a double-pick and caps its length', () => {
    const dupe = shareSelection(['ankle_prep', 'ankle_prep'], PLATFORM_PROTOCOLS, BY, { now: NOW }).share!;
    expect(dupe.items).toHaveLength(1);
    const many = Array.from({ length: MAX_SELECTION_ITEMS + 1 }, (_, i) => `k${i}`);
    expect(shareSelection(many, PLATFORM_PROTOCOLS, BY, { now: NOW }).share).toBeNull();
  });

  it('an empty selection or empty program is refused', () => {
    expect(shareSelection([], PLATFORM_PROTOCOLS, BY, { now: NOW }).share).toBeNull();
    expect(shareProgram(program({ weeks: [] }), PLATFORM_PROTOCOLS, BY, { now: NOW }).share).toBeNull();
  });

  it('the certified flag is a boolean, never the credential list', () => {
    const s = shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { now: NOW }).share!;
    expect(typeof s.by.credentialed).toBe('boolean');
    expect(JSON.stringify(s)).not.toContain('academy');
  });
});

describe('THE URL IS THE ACCESS CONTROL, SO THE TOKEN IS NOT GUESSABLE', () => {
  it('192 bits, base64url, and never derived from anything', () => {
    const a = newShareToken(), b = newShareToken();
    expect(a).toHaveLength(32);
    expect(isShareToken(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('a thousand tokens collide zero times and share no prefix', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => newShareToken()));
    expect(seen.size).toBe(1000);
    expect(new Set([...seen].map((t) => t.slice(0, 6))).size).toBeGreaterThan(990);
  });

  it('junk is rejected before it reaches a database', () => {
    for (const bad of ['', 'short', '../../etc/passwd', 'a'.repeat(33), 'has spaces in it aaaaaaaaaaaaaaa', null, 42]) {
      expect(isShareToken(bad), String(bad)).toBe(false);
    }
  });

  it('the url is built without a double slash however the origin is written', () => {
    const t = newShareToken();
    expect(shareUrl('https://x.com', t)).toBe(`https://x.com/p/${t}`);
    expect(shareUrl('https://x.com/', t)).toBe(`https://x.com/p/${t}`);
  });
});
