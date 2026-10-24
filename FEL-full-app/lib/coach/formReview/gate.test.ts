// COACH-VIDEO-REVIEW (2026-10-24): who may send pose data to a coach, and the clip rule (minors never; adults not yet).
import { describe, expect, it } from 'vitest';
import { SEND_COPY, sendDecision, TEEN_POSE_REVIEW_ENABLED } from './gate';
import { CLIP_MAX_SECONDS, CLIP_UPLOADS_LIVE, clipDecision, clipWindows, VIDEO_STAYS_LINE } from './clipPolicy';
import type { RepFlag } from './score';

const adult = { linked: true, adult: true, canSaveScan: true, teen: null } as const;
const flag = (rep: number): RepFlag => ({ rep, score: 65, fault: 'kneeValgus', reason: `Left knee caves on rep ${rep}`, cue: null, worst: false });

describe('sending pose data', () => {
  it('an adult on the coach\'s live roster who opted in to saving movement numbers: yes', () => {
    expect(sendDecision(adult)).toEqual({ ok: true, band: 'adult' });
  });

  it('never without the live roster link, whoever it is', () => {
    expect(sendDecision({ ...adult, linked: false })).toEqual({ ok: false, error: 'not_on_roster' });
  });

  it('an adult who has not opted in: refused, pointed at their account settings', () => {
    expect(sendDecision({ ...adult, canSaveScan: false })).toEqual({ ok: false, error: 'scan_save_opt_in' });
    expect(SEND_COPY.scan_save_opt_in.href).toBe('/account');
  });

  it('13–17 with a guardian\'s coach-training consent: OFF until the owner decides (TEEN_POSE_REVIEW_ENABLED)', () => {
    expect(TEEN_POSE_REVIEW_ENABLED).toBe(false);
    const teen = { linked: true, adult: false, canSaveScan: false, teen: { ok: true as const, band: 'teen' as const } };
    expect(sendDecision(teen)).toEqual({ ok: false, error: 'teen_pose_review_off' });
    // the path is built: switched on, a consented teen sends pose data — still never video (clipDecision below)
    expect(sendDecision(teen, true)).toEqual({ ok: true, band: 'teen' });
  });

  it('the teen gate\'s refusals pass through: under 13, no birth year, no guardian consent', () => {
    for (const error of ['under_13', 'age_required', 'guardian_consent_required'] as const) {
      expect(sendDecision({ linked: true, adult: false, canSaveScan: false, teen: { ok: false, error } }, true)).toEqual({ ok: false, error });
    }
    expect(sendDecision({ linked: true, adult: false, canSaveScan: false, teen: null })).toEqual({ ok: false, error: 'age_required' });
  });

  it('every refusal has a line, and none restates consent or policy wording', () => {
    for (const c of Object.values(SEND_COPY)) {
      expect(c.message.length).toBeGreaterThan(10);
      expect(c.message).not.toMatch(/COPPA|GDPR|terms of|privacy policy|consent to/i);
    }
  });
});

describe('the optional clip', () => {
  it('is not live: no storage, no route (docs/COACH-VIDEO-REVIEW.md §5)', () => {
    expect(CLIP_UPLOADS_LIVE).toBe(false);
    expect(clipDecision({ band: 'adult', optedInThisSubmission: true, flags: [flag(4)] })).toEqual({ allowed: false, reason: 'not_available' });
  });

  it('a minor never gets one — consent, opt-in or a live store change nothing', () => {
    for (const band of ['teen', null] as const) {
      expect(clipDecision({ band, optedInThisSubmission: true, flags: [flag(4)] }, true)).toEqual({ allowed: false, reason: 'minor' });
    }
  });

  it('an adult only with a tick for this submission, and only when something was flagged', () => {
    expect(clipDecision({ band: 'adult', optedInThisSubmission: false, flags: [flag(4)] }, true)).toEqual({ allowed: false, reason: 'not_opted_in' });
    expect(clipDecision({ band: 'adult', optedInThisSubmission: true, flags: [] }, true)).toEqual({ allowed: false, reason: 'nothing_flagged' });
    expect(clipDecision({ band: 'adult', optedInThisSubmission: true, flags: [flag(4)] }, true)).toEqual({ allowed: true });
  });

  it('would cover the flagged reps only, padded, merged, capped', () => {
    const reps = [1, 2, 3, 4, 5].map((n) => ({ n, startMs: n * 3000, endMs: n * 3000 + 2000 }));
    expect(clipWindows(reps, [flag(4), flag(2)])).toEqual([{ startMs: 5500, endMs: 8500 }, { startMs: 11500, endMs: 14500 }]);
    const long = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, startMs: i * 20_000, endMs: i * 20_000 + 19_000 }));
    const w = clipWindows(long, long.map((r) => flag(r.n)));
    expect(w.reduce((a, x) => a + x.endMs - x.startMs, 0)).toBe(CLIP_MAX_SECONDS * 1000);
  });

  it('the client is told, on every set, that the video stays on the phone', () => {
    expect(VIDEO_STAYS_LINE).toMatch(/video stays on your phone/i);
  });
});
