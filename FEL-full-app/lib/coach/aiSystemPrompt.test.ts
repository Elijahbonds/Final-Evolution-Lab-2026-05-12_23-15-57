// MIRROR-COACH P5 (2026-09-29): the AI coach's pain-safety addendum. See aiSystemPrompt.ts's own header for why this
// text lives here rather than in app/api/coach/chat/route.ts (vitest does not collect app/) and why it is that route
// — not lib/coach-service.ts's buildSystemPrompt — that actually needs it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_COACH_DISCLOSURE, withPainSafety } from './aiSystemPrompt';

describe('withPainSafety', () => {
  const base = 'You are Coach Elijah Bonds.';

  it('carries FEL\'s own "not a clinician" disclosure line', () => {
    expect(withPainSafety(base)).toContain(AI_COACH_DISCLOSURE);
    expect(AI_COACH_DISCLOSURE).toMatch(/not a clinician/i);
  });

  it('carries the same four rules lib/health/painRule.ts\'s decide() enforces, in prose', () => {
    const out = withPainSafety(base);
    expect(out).toMatch(/acute event/i);
    expect(out).toMatch(/clinician/i);
    expect(out).toMatch(/minor/i);
    expect(out).toMatch(/tell an adult/i);
    expect(out).toMatch(/pain check-in/i);
  });

  it('never diagnoses and never promises risk reduction — the honesty rule, in the model\'s own instructions', () => {
    const out = withPainSafety(base);
    expect(out).toMatch(/never (a )?diagnos/i);
    expect(out).toMatch(/reduces injury risk|prevents injury/i);
    expect(out).toMatch(/builds capacity/i);
  });

  it('keeps the base prompt intact — this only appends, never rewrites the persona', () => {
    expect(withPainSafety(base).startsWith(base)).toBe(true);
  });

  it('is idempotent: applying it twice does not duplicate the disclosure', () => {
    const once = withPainSafety(base);
    const twice = withPainSafety(once);
    expect(twice).toBe(once);
    expect(twice.split(AI_COACH_DISCLOSURE).length - 1).toBe(1);
  });

  it('names no book brand or method — IP rule: FEL\'s own words only', () => {
    const out = withPainSafety(base).toLowerCase();
    for (const banned of ['pain-free performance', 'rusin', 'cordoza']) expect(out).not.toContain(banned);
  });

  // MIRROR-COACH P5 FIX (2026-09-29, code review): the minor-safety rule (rule 2) used to rest entirely on the model
  // inferring age from the conversation. `isMinor` grounds it in the server's own fact instead — see the Finding
  // this closes: "AI coach's minor-safety rule depends on model inference, not the server's known age."
  it('states plainly when the athlete IS a minor on file, not left to the model to infer', () => {
    const out = withPainSafety(base, { isMinor: true });
    expect(out).toMatch(/this athlete IS a minor/i);
  });

  it('states plainly when the athlete is NOT on file as a minor, while still deferring to what they say', () => {
    const out = withPainSafety(base, { isMinor: false });
    expect(out).toMatch(/not on file as a minor/i);
    expect(out).toMatch(/believe them/i);
  });

  it('defaults to the not-a-minor grounding line when no opts are given at all', () => {
    expect(withPainSafety(base)).toMatch(/not on file as a minor/i);
  });

  it('idempotency does not let a later call flip the grounding line already sent', () => {
    const minorFirst = withPainSafety(base, { isMinor: true });
    const calledAgainAsAdult = withPainSafety(minorFirst, { isMinor: false });
    expect(calledAgainAsAdult).toBe(minorFirst);
    expect(calledAgainAsAdult).toMatch(/this athlete IS a minor/i);
  });
});

// The route itself is not collected by vitest (app/ is out — vitest.config.ts), so this reads its source the same
// way components/coach/attention-panel.test.tsx checks its own wiring: not a behavioural test, a guard against the
// addendum quietly falling out of the one route that actually needs it.
describe('app/api/coach/chat/route.ts wiring', () => {
  const src = readFileSync(new URL('../../app/api/coach/chat/route.ts', import.meta.url), 'utf8');

  it('imports and applies withPainSafety to the system prompt it actually sends', () => {
    expect(src).toMatch(/import\s*\{\s*withPainSafety\s*\}\s*from\s*['"]@\/lib\/coach\/aiSystemPrompt['"]/);
    expect(src).toMatch(/withPainSafety\(/);
  });

  // MIRROR-COACH P5 FIX (2026-09-29, code review): guards against the grounding regressing back to model-inference-only
  // by someone later "simplifying" the withPainSafety call back down to one argument.
  it('grounds the minor-safety rule in the server\'s own isMinorForMirror(User.dobYear), not model inference', () => {
    expect(src).toMatch(/import\s*\{\s*isMinorForMirror\s*\}\s*from\s*['"]@\/lib\/mirror\/youth['"]/);
    expect(src).toMatch(/isMinorForMirror\(/);
    expect(src).toMatch(/withPainSafety\([^)]*isMinor/s);
  });

  it('does not import the dead lib/coach-service.ts buildSystemPrompt instead', () => {
    expect(src).not.toMatch(/from\s*['"]@\/lib\/coach-service['"]/);
  });
});
