import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Certify } from './camp-view';

// HOTFIX (2026-09-24): the Certify tab reads its paper, and each module's attempt gate, from GET
// /api/v1/camp/assess. A server render is its first paint: pin that a resting module says why and
// cannot be opened, an open one says how many tries are left, and the rules are stated up front.

type State = NonNullable<Parameters<typeof Certify>[0]['state']>;

const mod = (ref: string, attempt: State['modules'][number]['attempt'], required = true): State['modules'][number] => ({
  ref, title: `Module ${ref}`, summary: 'summary', required, presentationId: 'p1',
  questions: [{ key: 'q1', prompt: 'A prompt?', options: ['w', 'x', 'y', 'z'] }],
  attempt,
});

const state: State = {
  status: 'in_progress', missingModules: ['blueprint/m1', 'blueprint/m2'], passedModules: ['blueprint/m3'], credentials: [],
  curriculumVersion: '2026.09-draft2', passMark: 80, policy: { cooldownSec: 300, attemptCap: 3, windowSec: 86_400 },
  modules: [
    mod('blueprint/m1', { open: false, reason: 'cooldown', retryAfterSec: 290, attemptsLeft: 2 }),
    mod('blueprint/m2', { open: true, reason: null, retryAfterSec: null, attemptsLeft: 3 }),
    mod('blueprint/m3', { open: false, reason: 'already_passed', retryAfterSec: null, attemptsLeft: 0 }),
    // Optional and passed: NOT in passedModules (that list is required modules only), so only the gate says so.
    mod('blueprint/m4', { open: false, reason: 'already_passed', retryAfterSec: null, attemptsLeft: 0 }, false),
  ],
};

function render(): string {
  return renderToStaticMarkup(createElement(Certify, { state, onDone: async () => {} }));
}

/** The markup of one module card, by its title. */
function card(markup: string, ref: string): string {
  const start = markup.indexOf(`Module ${ref}`);
  const next = markup.indexOf('Module blueprint/', start + 1);
  return markup.slice(start, next < 0 ? undefined : next);
}

describe('Certify, first paint', () => {
  it('states the rules: pass mark, cooldown, cap', () => {
    const m = render();
    expect(m).toContain('Pass every required module at 80% to certify.');
    expect(m).toContain('After a miss a module rests 5 min; 3 attempts per module every 24 h.');
  });

  it('a resting module says when it opens, and its button is disabled', () => {
    const c = card(render(), 'blueprint/m1');
    expect(c).toContain('Next attempt in 5 min.');
    expect(c).toMatch(/<button disabled=""[^>]*>Take assessment<\/button>/);
  });

  it('an open module says how many attempts are left, and can be opened', () => {
    const c = card(render(), 'blueprint/m2');
    expect(c).toContain('3 attempts left in this window.');
    expect(c).toMatch(/<button (?!disabled)[^>]*>Take assessment<\/button>/);
  });

  it('a passed module shows passed, not a gate line or a button', () => {
    const c = card(render(), 'blueprint/m3');
    expect(c).toContain('passed');
    expect(c).not.toContain('Take assessment');
    expect(c).not.toContain('data-testid="assess-gate"');
  });

  it('a passed OPTIONAL module shows passed too, not a greyed-out button', () => {
    const c = card(render(), 'blueprint/m4');
    expect(c).toContain('passed');
    expect(c).not.toContain('Take assessment');
    expect(c).not.toContain('data-testid="assess-gate"');
  });

  it('shows no questions until a module is opened', () => {
    expect(render()).not.toContain('A prompt?');
  });
});
