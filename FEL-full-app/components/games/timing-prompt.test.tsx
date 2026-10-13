// QA P1-12 (2026-09-27): "the volleyball prompt text overlaps". The timing host drew each prompt at its own bottom offset
// (the shot at bottom-24, the tell and the contact grade at bottom-36, the rhythm cue at bottom-24) over a ~50 px meter at
// bottom-28, so a rally stacked the meter, the shot and the SPIKE tell. One slot now, the most urgent line in it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TimingPrompt, pickPrompt } from './timing-prompt';

const render = (hud: Record<string, string | number>) => renderToStaticMarkup(createElement(TimingPrompt, { hud }));
const lines = (m: string) => (m.match(/data-prompt=/g) ?? []).length;

describe('the timing host shows one prompt line at a time', () => {
  it('a volleyball rally with the shot, the SPIKE tell and a contact up at once: one line, the tell', () => {
    const m = render({ shotType: 'SET', incomingTell: 'SPIKE', answer: 'BLOCK', contact: 'PURE', shotMeterT: 0.6 });
    expect(lines(m)).toBe(1);
    expect(m).toContain('data-prompt="tell"');
    expect(m).toContain('INCOMING · SPIKE · answer BLOCK');
    expect(m).not.toContain('>SET<');
  });

  it('the priority: tell, then contact, then the graded shot, then the rhythm cue', () => {
    expect(pickPrompt({ contact: 'PURE', shotType: 'SET', nextStep: 'STEP' })?.kind).toBe('contact');
    expect(pickPrompt({ shotType: 'SET', nextStep: 'STEP' })?.kind).toBe('shot');
    expect(pickPrompt({ nextStep: 'STEP', nextStepIn: 1.24 })).toEqual({ kind: 'step', text: 'STEP · 1.2', gold: false });
    expect(pickPrompt({ nextStep: 'STEP', nextStepIn: 0.2 })).toEqual({ kind: 'step', text: 'NOW — STEP', gold: true });
    expect(pickPrompt({ shotType: '', incomingTell: '' })).toBeNull();
    expect(render({})).toBe('');
  });

  it('the slot sits under the meters (bottom-16), and the host draws no other prompt line', () => {
    expect(render({ shotType: 'SET' })).toMatch(/absolute inset-x-0 bottom-16/);
    const host = readFileSync(path.resolve(__dirname, 'timing-babylon.tsx'), 'utf8');
    expect(host).toContain('<TimingPrompt hud={hud} />');
    for (const key of ['shotType', 'incomingTell', 'contact', 'nextStep']) expect(host, key).not.toMatch(new RegExp(`typeof hud\\.${key} === 'string'`));
    // the meters keep their place above it
    expect(host.match(/absolute inset-x-0 bottom-28/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
