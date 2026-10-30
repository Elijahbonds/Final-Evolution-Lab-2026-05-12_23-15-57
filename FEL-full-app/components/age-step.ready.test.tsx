// PERF-834-LCP (a), PL-2 (2026-10-29): AgeStep's new optional `ready` prop. ready={false} disables Continue; no prop renders exactly
// what it rendered before (every other caller is unchanged).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgeStep } from './age-step';

const continueTag = (html: string) => (html.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Continue(?:(?!<\/button>)[\s\S])*<\/button>/) ?? [''])[0];

describe('PL-2: AgeStep ready', () => {
  it('ready={false}: Continue is disabled', () => {
    const tag = continueTag(renderToStaticMarkup(createElement(AgeStep, { mode: 'signup', ready: false })));
    expect(tag).toMatch(/<button[^>]*\sdisabled=""/);
  });
  it('no ready prop renders byte-identical to ready={true}, and Continue is enabled', () => {
    for (const mode of ['signup', 'account'] as const) {
      const none = renderToStaticMarkup(createElement(AgeStep, { mode }));
      expect(renderToStaticMarkup(createElement(AgeStep, { mode, ready: true }))).toBe(none);
      expect(continueTag(none)).not.toMatch(/<button[^>]*\sdisabled=""/);
    }
  });
});
