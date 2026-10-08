// MIRROR-COACH P7 (2026-09-29): every line the Dial-Up Breath can show is FEL's own words (lib/breath/rampGate.ts,
// components/coach/ramp-breath.tsx). The IP rule: no book, no book's method name — and no well-known breathing
// method's name either, so nothing reads as a borrowed protocol (the plan's own working name "ramp-up" stays in code
// and never reaches a screen). The honesty rule: no claim about the body (nervous system, heart rate, oxygen,
// hormones), no strength or performance promise, nothing about injury or risk, no diagnosis, no condition, no treatment
// (lib/share/screen.ts screenText). And the stop line says what the brief says it must: lightheaded or tingling → stop,
// breathe normally, sit down.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { screenText } from '@/lib/share/screen';
import {
  RAMP_DONE_LINE, RAMP_INTERRUPTED_LINE, RAMP_LIMIT, RAMP_NAME, RAMP_OFFER, RAMP_OFFER_BUTTON, RAMP_PHASE_LINES, RAMP_REFUSED_COPY, RAMP_SKIP_BUTTON,
  RAMP_START_BUTTON, RAMP_STOP_LINE, rampExplainLines, rampRefusedText,
} from './rampGate';

const BOOK = /Pain[- ]?Free|Rusin|Cordoza|Victory Belt|tension table|biphasic|pin[- ]and[- ]stretch|blueprint|pillar/i;
/** Named breathing methods, the plan's own working name included — none of them is FEL's. MIRROR-COACH P7 FIX
 *  (2026-09-29, review): the book's own names for its breaths are banned too — "huff" (its name for exactly this kind of
 *  breath), "double breath", "crocodile", "square breath" and its "90/90" position (the crossref's "Six breathing
 *  strategies" row). Today's copy was clean; a future "Huff breath before your key set" would have passed every lint. */
const METHODS = /\bramp(?:ing)?(?:[- ]?up)?\b|power[- ]?breath|tactical[- ]?breath|box[- ]?breath|combat[- ]?breath|rhythmic[- ]?breath|wim ?hof|tummo|breath of fire|kapalabhati|bhastrika|bellows|physiological sigh|cyclic sigh|hyperventilat|\bIAP\b|\b360\b|\bRAMP\b|\bhuff\w*|double[- ]?breath|crocodile|square[- ]?breath|90 ?\/ ?90/i;
const BODY = /nervous[- ]?system|sympathetic|vagus|\bHRV\b|heart[- ]?rate|adrenal|cortisol|oxygen|\bCO2\b|carbon dioxide|arousal|hormon|blood pressure|\bpH\b/i;
const CLAIMS = /\b(injur\w*|prevent\w*|risks?|reduc\w*|protect\w*|heal(?!th)\w*|cure\w*|treat\w*|rehab\w*|therap\w*|guarantee\w*|safer|safe|boost\w*|increas\w*|stronger|strength gains?|more power|power output|performance|PRs?|personal bests?|proven|science|studies)\b/i;

const lint = (text: string) => {
  expect(text, text).not.toMatch(BOOK);
  expect(text, text).not.toMatch(METHODS);
  expect(text, text).not.toMatch(BODY);
  expect(text, text).not.toMatch(CLAIMS);
  expect(text, text).not.toMatch(/diagnos/i);
  expect(screenText(text), text).toEqual([]);
};

const ALL_COPY = (): string[] => [
  RAMP_NAME, RAMP_OFFER, RAMP_OFFER_BUTTON, RAMP_STOP_LINE, RAMP_START_BUTTON, RAMP_SKIP_BUTTON, RAMP_DONE_LINE, RAMP_INTERRUPTED_LINE,
  ...Object.values(RAMP_PHASE_LINES), ...Object.values(RAMP_REFUSED_COPY).filter((v): v is string => typeof v === 'string'),
  ...[0, 1, 2].flatMap((n) => rampExplainLines(n).map((l) => l.text)),
];

describe("the Dial-Up Breath's words", () => {
  it('every line: no book, no method name, no body claim, no promise, no diagnosis, no condition', () => {
    const lines = ALL_COPY();
    expect(lines.length).toBeGreaterThan(15);
    lines.forEach(lint);
  });

  it('the controls: the lint does catch what it is for (so a green run means clean, not blind)', () => {
    for (const bad of [
      'Ramp-up breathing before your heaviest set', 'Power breathing', 'Box breathing to settle', 'Wakes up your nervous system',
      'Raises your heart rate', 'Boosts strength', 'Lowers injury risk', 'From Pain-Free Performance', 'Hyperventilate for 10 s',
      'Heals the back',
      // MIRROR-COACH P7 FIX: the book's own breath names
      'Huff breath before the set', 'A double breath first', 'Crocodile breathing', 'Square breathing to reset', 'Lie in 90/90 and breathe',
    ]) {
      const caught = [BOOK, METHODS, BODY, CLAIMS].some((re) => re.test(bad));
      expect(caught, bad).toBe(true);
    }
  });

  it('"health answers" is not a healing claim (the word the "who" line needs), while "heals" still is', () => {
    expect('your health answers').not.toMatch(CLAIMS);
    expect('it heals').toMatch(CLAIMS);
  });

  it("it has FEL's own name, from the owner's Playbook line \"Your Breath Is the Control Dial\"", () => {
    expect(RAMP_NAME).toBe('Dial-Up Breath');
    const playbook = readFileSync('lib/education/playbook.data.json', 'utf8');
    expect(playbook).toMatch(/Control Dial/);
  });

  it('the stop line: lightheaded or tingling → stop, breathe normally, sit down (the brief, word for word in meaning)', () => {
    expect(RAMP_STOP_LINE).toMatch(/lightheaded/i);
    expect(RAMP_STOP_LINE).toMatch(/tingling/i);
    expect(RAMP_STOP_LINE).toMatch(/\bstop\b/i);
    expect(RAMP_STOP_LINE).toMatch(/breathe normally/i);
    expect(RAMP_STOP_LINE).toMatch(/sit down/i);
  });

  it('the explanation says when (before the set, never during one), how often (the limit, from the constant), who, and that it is optional and unscored', () => {
    const lines = Object.fromEntries(rampExplainLines(1).map((l) => [l.id, l.text]));
    expect(Object.keys(lines)).toEqual(['what', 'when', 'limit', 'who', 'optional']);
    expect(lines.when).toMatch(/before you set up for the first set/i);
    expect(lines.when).toMatch(/never during a set or a rep/i);
    expect(lines.limit).toContain(`At most ${RAMP_LIMIT.perWindow} sessions in any ${RAMP_LIMIT.windowDays} days`);
    expect(lines.limit).toMatch(/one key set per session/);
    expect(lines.limit).toContain(`1 of ${RAMP_LIMIT.perWindow} left this week`);
    expect(lines.who).toMatch(/adults/i);
    expect(lines.optional).toMatch(/never scored, paid or counted toward a streak/);
    // the uses-left figure is clamped to what the limit allows, whatever the caller passes
    expect(rampExplainLines(99).find((l) => l.id === 'limit')!.text).toContain(`${RAMP_LIMIT.perWindow} of ${RAMP_LIMIT.perWindow} left`);
    expect(rampExplainLines(-3).find((l) => l.id === 'limit')!.text).toContain(`0 of ${RAMP_LIMIT.perWindow} left`);
  });

  it('a refusal always says the set is still there, and an unknown reason reads as the default', () => {
    for (const r of ['weekly_limit', 'this_session', 'too_soon', 'set_started', 'raced', 'consent_new', 'intake_history', 'minor', 'nonsense', null, undefined]) {
      expect(rampRefusedText(r as string | null)).toMatch(/set/i);
    }
    expect(rampRefusedText('minor')).toBe(RAMP_REFUSED_COPY.default);   // no health reason is ever repeated back
    // MIRROR-COACH P7 FIX: nor the new ones — a refusal never says "your consent is new" or "an earlier answer"
    expect(rampRefusedText('consent_new')).toBe(RAMP_REFUSED_COPY.default);
    expect(rampRefusedText('intake_history')).toBe(RAMP_REFUSED_COPY.default);
  });

  it("the card's own visible text (JSX text in ramp-breath.tsx) passes the same lint", () => {
    const src = readFileSync('components/coach/ramp-breath.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const texts = [...src.matchAll(/>([^<>{}=;()]*[A-Za-z][^<>{}=;()]*)</g)].map((m) => m[1].trim()).filter(Boolean);
    expect(texts).toContain('Stop');
    texts.forEach(lint);
  });
});
