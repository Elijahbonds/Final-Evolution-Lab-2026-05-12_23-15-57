// OWNER-APPROVALS (2026-10-27; owner, in chat: "You do it. I approve."): the wording cards C02, C03, C08, C09, C10 and
// C15 are approved. These pins hold (1) the approved guardian-consent words in code to the drafts the owner read, word
// for word; (2) what the approval does NOT do: no 13–17 gate opens, and no screen shows the new words before their
// go-live steps; (3) the one approved change (C02: no internal document name on a coach's screen).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
  GUARDIAN_WITHDRAW_LIVE, coachTrainingConsentWords, guardianConsentAsk, squadsConsentWords,
} from '@/lib/consent/guardianGate';
import { COACH_TRAINING_CONSENT_SINCE } from '@/lib/coach/coachConsent';
import { SQUADS_CONSENT_SINCE } from '@/lib/groups/gates';
import { DRAFTS_COPY } from '@/lib/coach/weeklyDraft/copy';

/** The blockquote right after `marker` in a doc, as one line per paragraph, with **{name}** → `name`. */
function quoted(doc: string, marker: string, name: string): string[] {
  const text = readFileSync(doc, 'utf8');
  const at = text.indexOf(marker);
  expect(at, `${doc}: ${marker}`).toBeGreaterThan(-1);
  const lines = text.slice(at).split('\n');
  const start = lines.findIndex((l) => l.trimStart().startsWith('>'));
  const out: string[] = [];
  let para = '';
  for (const raw of lines.slice(start)) {
    const l = raw.trim();
    if (!l.startsWith('>')) break;
    const body = l.replace(/^>\s?/, '');
    if (body === '' || body.startsWith('- ')) { if (para) out.push(para); para = body.replace(/^- /, ''); continue; }
    if (/^If you say yes:$/.test(body)) { if (para) out.push(para); out.push(body); para = ''; continue; }
    para = para ? `${para} ${body}` : body;
  }
  if (para) out.push(para);
  return out.filter(Boolean).map((p) => p.replace(/\*\*\{name\}\*\*/g, name).replace(/\s+/g, ' ').trim());
}

describe('C10: the coach-training consent words are the approved draft, word for word', () => {
  it('matches docs/COACH-LOOP.md §1, every paragraph, the withdraw one included when it is live', () => {
    const doc = quoted('docs/COACH-LOOP.md', '### Approved wording (owner, in chat, 2026-10-27, card C10)', 'Sam');
    const w = coachTrainingConsentWords('Sam', true);
    expect([w.lead, w.yesHeading, ...w.yes, w.never, w.withdraw]).toEqual(doc);
  });
});

describe('C08: the squads consent words are the approved draft, word for word', () => {
  it('matches docs/TEAMS-SQUADS.md §3', () => {
    const doc = quoted('docs/TEAMS-SQUADS.md', '**Approved by the owner, in chat, 2026-10-27 (card C08)', 'Sam').join(' ');
    expect(squadsConsentWords('Sam', true).join(' ')).toBe(doc);
  });
});

describe('what the approval does not do', () => {
  it('the withdraw sentences stay out until a withdraw path exists (nothing writes GuardianConsent.revokedAt)', () => {
    expect(GUARDIAN_WITHDRAW_LIVE).toBe(false);
    expect(coachTrainingConsentWords('Sam').withdraw).toBeNull();
    expect(squadsConsentWords('Sam').join(' ')).not.toMatch(/withdraw/);
    // every file that writes a GuardianConsent row (the generated client aside): none sets revokedAt
    const writers = execSync('grep -rlE "guardianConsent\\.(update|updateMany|upsert|create)" app lib --include=*.ts --include=*.tsx --exclude=*.test.ts --exclude=*.test.tsx || true', { encoding: 'utf8' })
      .split('\n').filter((f) => f && !f.startsWith('lib/generated/'));
    expect(writers.length).toBeGreaterThan(0); // control: the grep finds the consent route's accept writes
    const revokers = writers.filter((f) => /revokedAt\s*:/.test(readFileSync(f, 'utf8')));
    // control: if a guardian withdraw route appears, this fails, and GUARDIAN_WITHDRAW_LIVE is the switch to revisit
    expect(revokers).toEqual([]);
  });

  it('no 13–17 gate opens: both consent dates are still null, so every teen fails closed as before', () => {
    expect(COACH_TRAINING_CONSENT_SINCE).toBeNull();
    expect(SQUADS_CONSENT_SINCE).toBeNull();
  });

  it("the guardian's screens still say today's camp-plan line (the new words go live with their steps, together)", () => {
    expect(guardianConsentAsk('Jordan')).toBe("FEL is a training app. Before Jordan can start a camp plan their coach builds with them, we ask a parent or guardian to confirm that's OK.");
    for (const f of ['app/consent/guardian/[token]/page.tsx', 'app/consent/guardian/[token]/player-request.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src).toContain('guardianConsentAsk(menteeName)');
      expect(src).not.toMatch(/coachTrainingConsentWords|squadsConsentWords/);
    }
  });
});

describe('C02: the one approved change', () => {
  it("the coach's not-ready line names no internal document", () => {
    expect(DRAFTS_COPY.notReady).toBe('Approvals switch on when the drafts table is set up. You can read this week’s drafts now.');
    expect(DRAFTS_COPY.notReady).not.toMatch(/docs\/|\.md/);
  });
});

describe('the approved copy files say so, with the date', () => {
  it.each([
    ['lib/coach/weeklyDraft/copy.ts', 'C02'], ['lib/coach/formReview/clipPolicy.ts', 'C03'], ['lib/groups/copy.ts', 'C09'],
    ['lib/coach/readiness/copy.ts', 'C15'], ['lib/signature/copy.ts', 'C20'], ['lib/consent/guardianGate.ts', 'C10'],
  ])('%s (%s)', (file, card) => {
    const src = readFileSync(file, 'utf8');
    expect(src).toContain('2026-10-27');
    expect(src).toContain(card);
    expect(src).toMatch(/owner, in chat/);
    expect(src).not.toMatch(/DRAFT PRODUCT COPY|OWNER CALL: all of this/);
  });
});
