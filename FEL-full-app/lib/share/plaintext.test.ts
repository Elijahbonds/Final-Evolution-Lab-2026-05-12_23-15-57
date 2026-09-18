// IT HAS TO LOOK LIKE SOMETHING A PERSON WROTE (2026-09-13).
//
// This output is pasted into iMessage by a human, so the tests are about the shape of a message rather than
// the presence of fields: no markdown, no stranded blank lines, the link always present, and a drill
// complete enough that the recipient never has to tap anything.

import { describe, it, expect } from 'vitest';
import { toPlainText, toSummaryLine, WEEK_PREVIEW, RECOMMENDATION_INLINE_CHARS } from './plaintext';
import { shareProgram, shareDrill, shareRecommendation, shareSelection, type SharedBy } from './shareable';
import type { CoachProgram } from '../profile/assignment';
import { PLATFORM_PROTOCOLS } from '../profile/protocol';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const URL = 'https://felapp.com/p/K3n9xQw2LmPv8rTz4bYc7dHf';
const BY: SharedBy = { coachId: 'c', displayName: 'Coach Mike', credentialed: true };
const PLAIN: SharedBy = { coachId: 'c2', displayName: 'Dana', credentialed: false };

const program = (weeks = 3): CoachProgram => ({
  key: 'p', title: 'Knee resilience', coachId: 'c', outcome: 'Land without a recovery step.',
  visibility: 'published', retestAfterWeeks: 1,
  weeks: Array.from({ length: weeks }, (_, i) => ({
    week: i + 1, focus: `Week ${i + 1} focus`, items: [{ protocolKey: 'ankle_prep', frequency: 3 }],
  })),
});

const drill = (o = {}) => shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, { now: NOW, ...o }).share!;
const prog = (weeks = 3) => shareProgram(program(weeks), PLATFORM_PROTOCOLS, BY, { now: NOW }).share!;
const sel = () => shareSelection(['breath_reset', 'ankle_prep'], PLATFORM_PROTOCOLS, BY, { now: NOW }).share!;
const rec = (body: string, o = {}) => shareRecommendation(body, BY, { now: NOW, ...o }).share!;

describe('EVERY MESSAGE IS PLAIN TEXT AND CARRIES ITS LINK', () => {
  const all = () => [drill(), prog(), sel(), rec('She is ready to train unsupervised.')];

  it('the link is in every one', () => {
    for (const s of all()) expect(toPlainText(s, URL), s.kind).toContain(URL);
  });

  it('no markdown, no box drawing, no emoji — this lands in a plain text field', () => {
    for (const s of all()) {
      const t = toPlainText(s, URL);
      expect(t, s.kind).not.toMatch(/\*\*|__|^#|\||```/m);
      expect(t, s.kind).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });

  it('never leads or trails with blank lines, and never stacks three', () => {
    for (const s of all()) {
      const t = toPlainText(s, URL);
      expect(t, s.kind).toBe(t.trim());
      expect(t, s.kind).not.toMatch(/\n{3,}/);
    }
  });

  it('the sender is named, and the certified mark is only for those who hold it', () => {
    expect(toPlainText(drill(), URL)).toContain('Coach Mike · Certified');
    const uncert = shareDrill('depth_drop', PLATFORM_PROTOCOLS, PLAIN, { now: NOW }).share!;
    expect(toPlainText(uncert, URL)).toContain('Dana');
    expect(toPlainText(uncert, URL)).not.toContain('Certified');
  });
});

describe('A DRILL IS COMPLETE IN THE MESSAGE — no tap required', () => {
  it('the dose and the coaching note are both in the text', () => {
    const t = toPlainText(drill({ prescription: '3 x 5', note: 'Quiet landings. Stop if you feel pain.' }), URL);
    expect(t).toContain('Depth drop');
    expect(t).toContain('3 x 5');
    expect(t).toContain('Quiet landings. Stop if you feel pain.');
  });

  it('and the gate is stated, so nobody is sent work they cannot start', () => {
    expect(toPlainText(drill(), URL)).toMatch(/opens at .+\d+/i);
  });

  it('an ungated drill says nothing about opening', () => {
    const easy = shareDrill('breath_reset', PLATFORM_PROTOCOLS, BY, { now: NOW }).share!;
    expect(toPlainText(easy, URL)).not.toMatch(/opens at/i);
  });

  it('the client’s name leads the message when the trainer gave one', () => {
    expect(toPlainText(drill({ forName: 'Ama' }), URL).split('\n')[0]).toMatch(/^Ama — /);
  });
});

describe('A PROGRAM IS A SUMMARY THAT FOLDS', () => {
  it('a short block lists every week', () => {
    const t = toPlainText(prog(3), URL);
    expect(t).toContain('Wk1'); expect(t).toContain('Wk3');
    expect(t).not.toMatch(/more weeks/);
  });

  it('A SIXTEEN-WEEK BLOCK IS STILL A READABLE MESSAGE', () => {
    const t = toPlainText(prog(16), URL);
    expect(t).toContain(`Wk${WEEK_PREVIEW}`);
    expect(t).not.toContain(`Wk${WEEK_PREVIEW + 1} `);
    expect(t).toMatch(/and 12 more weeks/);
    expect(t.split('\n').length).toBeLessThan(20);     // fits a phone screen
  });

  it('one folded week is singular', () => {
    expect(toPlainText(prog(WEEK_PREVIEW + 1), URL)).toMatch(/and 1 more week\b/);
  });

  it('the outcome and the retest are both there — the promise and its check', () => {
    const t = toPlainText(prog(3), URL);
    expect(t).toContain('Land without a recovery step.');
    expect(t).toMatch(/retest after week 1/i);
  });
});

describe('A RECOMMENDATION IS ITS WORDS', () => {
  it('a short one goes in whole — the words belong in the thread, not behind a tap', () => {
    const body = 'Ready to train unsupervised. Excellent hinge mechanics, disciplined about prep work.';
    const t = toPlainText(rec(body), URL);
    expect(t).toContain(body);
    expect(t).not.toContain('Full version:');
  });

  it('a long one excerpts on a SENTENCE boundary and points at the rest', () => {
    const long = `${'This athlete has trained with me for eight months and is ready for more. '.repeat(12)}`;
    const t = toPlainText(rec(long), URL);
    expect(t).toContain('Full version:');
    const shown = t.split('\n\n')[1];
    expect(shown.length).toBeLessThanOrEqual(RECOMMENDATION_INLINE_CHARS);
    expect(shown.trimEnd()).toMatch(/[.!?]$/);            // not cut mid-sentence
    expect(shown).not.toMatch(/\w…$/);                    // and certainly not mid-word
  });

  it('does not repeat the name when the title already says it', () => {
    const t = toPlainText(rec('Strong hinge.', { title: 'Recommendation for Ama', forName: 'Ama' }), URL);
    expect(t.match(/Ama/g)!.length).toBe(1);
  });

  it('but does name them when the title does not', () => {
    expect(toPlainText(rec('Strong hinge.', { forName: 'Ama' }), URL)).toContain('For Ama');
  });
});

describe('A SELECTION IS ITS LIST', () => {
  it('every picked item appears, one per line', () => {
    const t = toPlainText(sel(), URL);
    expect(t).toContain('· Breathing reset');
    expect(t).toContain('· Ankle preparation');
  });

  it('with the trainer’s note under it', () => {
    const s = shareSelection(['ankle_prep'], PLATFORM_PROTOCOLS, BY, { note: 'Twice a week, whenever suits.', now: NOW }).share!;
    expect(toPlainText(s, URL)).toContain('Twice a week, whenever suits.');
  });
});

describe('the one-line preview says what KIND of thing arrived', () => {
  it('each kind names itself', () => {
    expect(toSummaryLine(drill())).toMatch(/sent you a drill/);
    expect(toSummaryLine(prog(8))).toMatch(/sent you a 8-week program/);
    expect(toSummaryLine(sel())).toMatch(/sent you 2 things/);
    expect(toSummaryLine(rec('x'))).toMatch(/wrote you a recommendation/);
  });

  it('and it is one line, always', () => {
    for (const s of [drill(), prog(8), sel(), rec('x')]) {
      expect(toSummaryLine(s), s.kind).not.toContain('\n');
    }
  });
});
