// THE FALSE POSITIVES ARE THE POINT (2026-09-13).
//
// A clinical screen that blocks real coaching is worse than no screen, because trainers learn to write
// around it and the first casualty is the safety line — "stop if you feel pain" is the most responsible
// sentence in a training note and a wordlist eats it first.
//
// So the first describe block is a corpus of ordinary, good, professional coaching text, every line of which
// must pass CLEAN. It is longer than the block that tests the refusals, deliberately. If a future tightening
// of the rules breaks one of these, the rule is wrong.

import { describe, it, expect } from 'vitest';
import { screenText, isPublishable, screenSummary, MAX_NOTE_CHARS } from './screen';

describe('REAL COACHING PASSES — including every sentence about pain', () => {
  const GOOD = [
    // the safety vocabulary, which a naive wordlist destroys first
    'Stop if you feel pain in the knee.',
    'This should feel hard, not painful. Back off if it hurts.',
    'Sore for a day or two is normal. Sharp pain is not — stop and tell me.',
    'If anything hurts, skip it and message me before the next session.',
    'Your ankles are tight — spend longer on the prep.',
    'Expect DOMS in the hamstrings on day two.',
    // ordinary correction language, which is the job
    'Fix your form before you add weight.',
    'Correct the timing on the second pull.',
    'Clean up your setup — feet under the bar, chest tall.',
    'Repair the bar path: it is drifting forward out of the hole.',
    'We need to fix your footwork on the closeout.',
    // body parts named without a claim
    'Drive through the knee, do not let it collapse in.',
    'Keep the shoulder packed at the bottom.',
    'Push the hips back first. The back stays flat.',
    'Land soft through the ankle and hold it for a count.',
    'Load the hamstrings, not the lower back.',
    // outcomes described without being promised
    'This block is built to change how you absorb a landing.',
    'Most people see their depth improve over eight weeks.',
    'The goal is to land from height without a recovery step.',
    'If you do the work, you should feel steadier by week four.',
    // prose a trainer actually writes
    '3 x 5, quiet landings. Focus on the landing, not the drop. If you hear it, it is too high.',
    'Ama — start at week one even though you will find it easy. The point is the ankle work.',
    'Two sessions a week, 48 hours apart. Do not stack them.',
    'Warm up however you like, but do the ankle prep last before the jumps.',
    'Video the third set and send it to me.',
  ];

  it.each(GOOD)('passes clean: %s', (text) => {
    const flags = screenText(text);
    expect(flags, flags.map((f) => `${f.kind}:"${f.found}"`).join(', ')).toEqual([]);
    expect(isPublishable(text)).toBe(true);
  });

  it('the whole corpus is clean, as one document', () => {
    expect(screenText(GOOD.join('\n\n'))).toEqual([]);
  });
});

describe('A NAMED CONDITION IS A DIAGNOSIS IN ANY FRAMING', () => {
  const BAD = [
    'Your knee pain is patellar tendinitis.',
    'I think this is shoulder impingement.',
    'This looks like plantar fasciitis to me.',
    'She has a herniated disc, so no loaded flexion.',
    'Working around his sprained ankle.',
    'Probably a minor meniscus tear — take it easy.',
    'Classic IT band syndrome.',
  ];

  it.each(BAD)('refuses: %s', (text) => {
    const flags = screenText(text);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.some((f) => f.kind === 'condition')).toBe(true);
    expect(isPublishable(text)).toBe(false);
  });

  it('hedging it does not help, because the condition is still named', () => {
    for (const hedge of [
      'I am not a doctor but this is tendinitis.',
      'Could be tendonitis, not sure.',
      'Your physio said tendinopathy, so we will train around it.',
    ]) {
      expect(isPublishable(hedge), hedge).toBe(false);
    }
  });
});

describe('A TREATMENT VERB IS ONLY A PROBLEM WHEN IT IS AIMED AT A BODY', () => {
  it('aimed at a body: refused', () => {
    for (const text of [
      'This will fix your knee.',
      'These drills heal the tendon.',
      'We are going to rehab that shoulder.',
      'This program repairs your back.',
      'It corrects your posture permanently.',
      'Six weeks to fix that bad ankle.',
    ]) {
      const flags = screenText(text);
      expect(flags.some((f) => f.kind === 'treatment'), text).toBe(true);
    }
  });

  it('aimed at movement: allowed', () => {
    for (const text of [
      'This will fix your squat.',
      'It corrects your timing.',
      'We are going to fix the approach.',
      'Repair the bar path.',
      'This fixes your rhythm off the dribble.',
    ]) {
      expect(screenText(text), text).toEqual([]);
    }
  });

  it('the pair does not reach across a sentence boundary', () => {
    // "fix" ends one sentence and "knee" begins another — not a claim
    expect(screenText('We will fix that. Knee stays out over the toe.')).toEqual([]);
  });

  it('practising medicine is refused with no object needed', () => {
    for (const text of [
      'I can diagnose this from the video.',
      'Six weeks of therapy should do it.',
      'Take an anti-inflammatory before the session.',
      'I prescribe three sessions a week.',
      'This will cure it.',
    ]) {
      expect(isPublishable(text), text).toBe(false);
    }
  });
});

describe('OUTCOMES MAY BE DESCRIBED, NEVER GUARANTEED', () => {
  it('refuses a promise', () => {
    for (const text of [
      'Guaranteed to add six inches to your vertical.',
      'This will definitely get you dunking by June.',
      'It is 100% effective.',
      'This never fails.',
    ]) {
      expect(isPublishable(text), text).toBe(false);
    }
  });

  it('but a described intent is fine', () => {
    expect(screenText('This block is designed to add height to your vertical.')).toEqual([]);
    expect(screenText('Most athletes add a couple of inches over a cycle like this.')).toEqual([]);
  });
});

describe('IT FLAGS RATHER THAN REWRITES, AND SAYS WHERE', () => {
  it('the original text is never modified — there is no rewritten output at all', () => {
    const text = 'Your knee pain is patellar tendinitis.';
    const flags = screenText(text);
    // the API returns flags only; a caller literally cannot get a "cleaned" string out of this module
    expect(Object.keys(flags[0]).sort()).toEqual(['at', 'fix', 'found', 'kind']);
    expect(text).toBe('Your knee pain is patellar tendinitis.');
  });

  it('the offset points at the phrase so a UI can underline it', () => {
    const text = 'Great session. I think this is shoulder impingement, so go easy.';
    const flag = screenText(text).find((f) => f.kind === 'condition')!;
    expect(text.slice(flag.at, flag.at + flag.found.length).toLowerCase()).toBe('impingement');
  });

  it('EVERY problem is reported at once — a trainer will not resubmit four times', () => {
    const text = 'This therapy is guaranteed to cure your tendinitis.';
    const kinds = new Set(screenText(text).map((f) => f.kind));
    expect(kinds.has('condition')).toBe(true);
    expect(kinds.has('treatment')).toBe(true);
    expect(kinds.has('guarantee')).toBe(true);
  });

  it('overlapping matches report once, at the longest phrase', () => {
    const flags = screenText('She has a herniated disc.');
    expect(flags.filter((f) => f.kind === 'condition')).toHaveLength(1);
    expect(flags[0].found.toLowerCase()).toBe('herniated disc');
  });

  it('the summary speaks to a professional and names what tripped', () => {
    const s = screenSummary(screenText('Your knee pain is patellar tendinitis.'))!;
    expect(s).toContain('"tendinitis"');
    expect(s).toMatch(/forwarded/i);
    expect(s).toMatch(/coaching cues are fine/i);
    expect(s).not.toMatch(/violat|prohibited|policy/i);     // not a compliance scolding
  });

  it('a clean text has no summary at all', () => {
    expect(screenSummary(screenText('Stop if you feel pain.'))).toBeNull();
  });
});

describe('edges', () => {
  it('empty and whitespace are publishable', () => {
    expect(isPublishable('')).toBe(true);
    expect(isPublishable('   \n  ')).toBe(true);
  });

  it('does not fire inside longer words', () => {
    for (const text of [
      'He was restrained on the counter.',           // must not hit "strain"
      'Acclimate to the volume first.',              // must not hit "acl"
      'The discussion can wait.',                    // must not hit "disc"
      'Backfill the volume next week.',              // must not hit "back" as a body part
    ]) {
      expect(screenText(text), text).toEqual([]);
    }
  });

  it('is case-insensitive and survives punctuation', () => {
    expect(isPublishable('TENDINITIS!')).toBe(false);
    expect(isPublishable('...tendinitis?')).toBe(false);
  });

  it('the note limit is a number a form and a route can share', () => {
    expect(MAX_NOTE_CHARS).toBeGreaterThan(200);
  });
});
