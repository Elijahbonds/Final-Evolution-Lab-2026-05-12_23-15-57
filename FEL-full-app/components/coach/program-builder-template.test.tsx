// "Start from a FEL template" in the program builder, rendered (MIRROR-COACH P8, 2026-09-29). The clone itself is
// lib/coach/templates/clone-route.test.ts (the real route); this pins the panel: it shows on a blank program only — not
// once anything is prescribed, a session is done, or a week has a target date — lists all seven templates grouped
// adults / youth and camp, and says what the first one holds: its shape, what it needs, the wave as FEL's choice, and
// that it is for adults.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProgramBuilder } from './program-builder';
import { TEMPLATES } from '@/lib/coach/templates/list';
import type { ProgramTree, TreeExercise } from '@/lib/coach/loop';

const ex: TreeExercise = {
  id: 'se-1', order: 1, exerciseId: 'pe-1', name: 'Goblet Squat', sets: 3, reps: '8', load: '', tempo: '3-0-1-0', restSeconds: 90, coachNote: null,
  section: 'key', isKeySet: true, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: 'drive',
};
const tree = (over: { exercises?: TreeExercise[]; targetDate?: string | null; blocks?: number } = {}): ProgramTree => ({
  id: 'p1', name: 'Block A', coachId: 'coach-1', clientId: 'c1',
  blocks: Array.from({ length: over.blocks ?? 2 }, (_, b) => ({
    id: `b${b + 1}`, order: b + 1, label: `Week ${b + 1}`, targetDate: b === 0 ? over.targetDate ?? null : null,
    sessions: [{ id: `s${b + 1}`, order: 1, label: 'Session 1', exercises: b === 0 ? over.exercises ?? [] : [] }],
  })),
});
const render = (t: ProgramTree, done: string[] = []) =>
  renderToStaticMarkup(createElement(ProgramBuilder, { tree: t, completedSessionIds: done, catalogue: [], onTree: () => {}, gatesEndpoint: null }));
const text = (html: string, attr: string) => new RegExp(`${attr}[^>]*>(.*?)</div>`).exec(html)?.[1]?.replace(/&#x27;/g, "'").replace(/&amp;/g, '&') ?? null;

describe('ProgramBuilder: start from a FEL template', () => {
  it('shows on a blank program: seven templates grouped adults / youth and camp, the first one described', () => {
    const html = render(tree());
    expect(html).toContain('data-testid="template-picker"');
    expect(html).toContain('Start from a FEL template');
    const picker = html.slice(html.indexOf('data-testid="template-picker"'), html.indexOf('data-clone-template'));
    expect([...picker.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1])).toEqual(TEMPLATES.map((t) => t.id));
    expect([...picker.matchAll(/<optgroup label="([^"]+)"/g)].map((m) => m[1])).toEqual(['Adults', 'Youth and camp']);
    expect(text(html, 'data-template-summary')).toBe(TEMPLATES[0].summary);
    expect(text(html, 'data-template-shape')).toMatch(/^4 weeks · 3 sessions a week · Needs: A backpack/);
    expect(text(html, 'data-template-wave')).toMatch(/FEL's choice, not a medical rule/);
    expect(text(html, 'data-template-adult')).toMatch(/For adults with a birth year on file/);
    expect(html).not.toContain('data-template-target');   // adults have no daily target line
    expect(html).toContain('data-clone-template');
  });

  it('is gone once anything is prescribed, a session is done, or a week has a target date', () => {
    expect(render(tree({ exercises: [ex] }))).not.toContain('template-picker');
    expect(render(tree(), ['s1'])).not.toContain('template-picker');
    expect(render(tree({ targetDate: '2026-11-01T00:00:00.000Z' }))).not.toContain('template-picker');
  });

  it('shows on a program with no weeks at all, above the "no weeks yet" line', () => {
    const html = render(tree({ blocks: 0 }));
    expect(html.indexOf('template-picker')).toBeGreaterThan(-1);
    expect(html.indexOf('template-picker')).toBeLessThan(html.indexOf('This program has no weeks yet.'));
  });
});
