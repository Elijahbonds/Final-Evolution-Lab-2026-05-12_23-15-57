// COACH-AI-DRAFT (2026-10-24): the Drafts inbox and the athlete's plan card, drawn from real drafts.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DraftsBoard } from './drafts-inbox';
import { PlanUpdateBody } from './plan-update-card';
import { draftForClient } from '@/lib/coach/weeklyDraft/rules';
import { planUpdateView } from '@/lib/coach/weeklyDraft/planUpdates';
import { editRows, editsFrom, pendingSafe, type InboxAnswer, type InboxDraft } from '@/lib/coach/weeklyDraft/view';
import { adult, exposure, hipPrescription } from '@/tests/helpers/weeklyDraftFixtures';

const busyWeek = (): InboxDraft => ({
  ...draftForClient(adult({
    exposures: [
      exposure('pe-tbdl', 3, [10, 10, 10], 6, { load: '60 kg' }), exposure('pe-tbdl', 10, [10, 10, 10], 7, { load: '60 kg' }),
      exposure('pe-goblet', 2, [8, 7, 6], 9), exposure('pe-goblet', 9, [8, 7, 7], 9),
    ],
    screen: { prescriptions: [hipPrescription(true), hipPrescription(false)], atIso: null },
  })),
  draftId: 'd-1', decisions: {},
});
const skipped: InboxDraft = { ...draftForClient(adult({ clientId: 'tee', name: 'Tee', program: null })), status: 'skipped', skipReason: 'Under 18: no draft until a guardian approves coach training.', draftId: null, decisions: {} };
const render = (data: InboxAnswer) => renderToStaticMarkup(createElement(DraftsBoard, { data }));

describe('the Drafts inbox', () => {
  it('one card per athlete; each change with its safety class, confidence, reason and buttons', () => {
    const d = busyWeek();
    const m = render({ weekKey: '2026-10-19', approvals: true, drafts: [d, skipped] });
    expect(m).toContain('Drafts for this week');
    expect(m).toContain('data-draft="client-1"');
    expect((m.match(/data-change=/g) ?? []).length).toBe(d.changes.length);
    expect(m).toContain('data-safety="review"');
    expect(m).toContain('data-safety="safe"');
    expect(m).toContain('High confidence');
    expect(m).toContain('Trap-bar deadlift: 60 kg → 62.5 kg');
    expect(m).toMatch(/Approve all safe \(\d\)/);
    expect(m).toContain('Held back (1)');                 // the unmatched screen finding
    expect(m).toContain('1 athlete with nothing to draft');
    expect(m).toContain('Under 18: no draft until a guardian approves coach training.');
    expect((m.match(/>Approve</g) ?? []).length).toBe(d.changes.length);
  });

  it('before the drafts tables exist: readable, with no buttons, and says why', () => {
    const m = render({ weekKey: '2026-10-19', approvals: false, drafts: [{ ...busyWeek(), draftId: null }] });
    expect(m).toContain('data-testid="drafts-not-ready"');
    expect(m).not.toContain('>Approve<');
    expect(m).not.toContain('approve-all-safe');
  });

  it('a decided change shows its decision instead of buttons, and leaves "approve all safe"', () => {
    const d = busyWeek();
    const safe = pendingSafe(d);
    const decided: InboxDraft = { ...d, decisions: { [safe[0].id]: { decision: 'approved', decidedAt: '2026-10-22T16:00:00Z', note: null } } };
    const m = render({ weekKey: '2026-10-19', approvals: true, drafts: [decided] });
    expect(m).toContain('data-decision="approved"');
    expect(m).toContain(`Approve all safe (${safe.length - 1})`);
  });

  it('an edit sends only what the coach changed', () => {
    const c = busyWeek().changes.find((x) => x.kind === 'progress_load')!;
    const rows = editRows(c);
    expect(rows).toEqual([{ label: 'Trap-bar deadlift · Day 1 — Lower', sets: '3', reps: '8-10', load: '62.5 kg', effortBand: '' }]);
    expect(editsFrom(c, rows)).toEqual([{}]);
    expect(editsFrom(c, [{ ...rows[0], load: '61 kg', sets: '4' }])).toEqual([{ sets: 4, load: '61 kg' }]);
  });
});

describe('the athlete’s plan card', () => {
  it('the approved lines, newest first and said once, with the coach’s note', () => {
    const v = planUpdateView([
      { clientLine: 'Trap-bar deadlift moves up: 60 kg → 62.5 kg. You earned it.', note: 'Strong week.', decidedAt: '2026-10-22T16:00:00Z' },
      { clientLine: 'New in your Prep: Side-lying clamshell.', note: null, decidedAt: '2026-10-22T16:01:00Z' },
      { clientLine: 'New in your Prep: Side-lying clamshell.', note: 'Strong week.', decidedAt: '2026-10-22T16:02:00Z' },
    ])!;
    expect(v.lines).toEqual(['New in your Prep: Side-lying clamshell.', 'Trap-bar deadlift moves up: 60 kg → 62.5 kg. You earned it.']);
    expect(v.notes).toEqual(['Strong week.']);
    const m = renderToStaticMarkup(createElement(PlanUpdateBody, { view: v, coachName: 'Coach Eli' }));
    expect(m).toContain('Your coach updated your plan');
    expect(m).toContain('Coach Eli: </span>Strong week.');
  });
  it('nothing approved → no card', () => {
    expect(planUpdateView([])).toBeNull();
    expect(planUpdateView(null)).toBeNull();
  });
});
