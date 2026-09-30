// The builder's off days, rendered (MIRROR-COACH P6, 2026-09-29). The route is lib/coach/offDay-builder-route.test.ts;
// this pins what the coach sees: an off day in the week reads as one (its badge and line, not "Session N"), one the
// athlete has not done can be taken out, and every training session offers "Off day after this" — an off day does not.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProgramBuilder } from './program-builder';
import type { ProgramTree } from '@/lib/coach/loop';
import { OFF_DAY_LABEL, OFF_DAY_LINE } from '@/lib/coach/offDay';

const t: ProgramTree = {
  id: 'p1', name: 'Base', coachId: 'coach-1', clientId: 'c1',
  blocks: [{ id: 'b1', order: 1, label: 'Week 1', targetDate: null, sessions: [
    { id: 's1', order: 1, label: 'Day 1', kind: 'training', exercises: [] },
    { id: 'off', order: 2, label: OFF_DAY_LABEL, kind: 'recovery', exercises: [] },
    { id: 's2', order: 3, label: 'Day 2', exercises: [] },   // a tree from before the column: training
  ] }],
};
const render = (done: string[] = []) => renderToStaticMarkup(createElement(ProgramBuilder, { tree: t, completedSessionIds: done, catalogue: [], onTree: () => {} }))
  .replace(/&#x27;/g, "'");

describe('ProgramBuilder: off days', () => {
  it('an off day reads as one — its badge and line — and training sessions offer "Off day after this"; the off day does not', () => {
    const m = render();
    expect([...m.matchAll(/data-session="(\w+)" data-kind="(\w+)"/g)].map((x) => `${x[1]}:${x[2]}`)).toEqual(['s1:training', 'off:recovery', 's2:training']);
    expect(m.match(/data-off-day-badge/g)).toHaveLength(1);
    expect(m).toContain(OFF_DAY_LINE);
    expect(m.match(/data-add-off-day/g)).toHaveLength(2);
    expect(m.match(/data-remove-off-day/g)).toHaveLength(1);
  });
  it('an off day the athlete has done cannot be removed from here', () => {
    expect(render(['off'])).not.toContain('data-remove-off-day');
  });
});
