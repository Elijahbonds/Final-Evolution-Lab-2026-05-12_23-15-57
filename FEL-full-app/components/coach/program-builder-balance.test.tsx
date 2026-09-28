// The builder's weekly pull-over-push line, rendered (MIRROR-COACH P2, compliance-and-roster lane, 2026-09-25).
//
// The rule is lib/coach/coverage.ts pullPushCheck (tested there); this pins the wiring: the builder reads each
// exercise's pattern from the coach's catalogue, checks each week (block) on its own, and tilts the rule when a coach
// note in the tree — or a client note handed in through `notes` — mentions the shoulder.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProgramBuilder, type BuilderCatalogueItem } from './program-builder';
import type { ProgramTree, TreeExercise } from '@/lib/coach/loop';

const catalogue: BuilderCatalogueItem[] = [
  { id: 'pe-bench', name: 'DB Bench Press', pattern: 'push' },
  { id: 'pe-dip', name: 'Ring Dip', pattern: 'push' },
  { id: 'pe-row', name: 'One-arm Row', pattern: 'pull' },
  { id: 'pe-rot', name: 'Landmine Rotation', pattern: null },
];
let n = 0;
const ex = (exerciseId: string, sets: number, over: Partial<TreeExercise> = {}): TreeExercise => ({
  id: `se-${++n}`, order: n, exerciseId, name: catalogue.find((c) => c.id === exerciseId)!.name, sets, reps: '8', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90,
  coachNote: null, section: 'key', isKeySet: false, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null, ...over,
});
const tree = (weeks: TreeExercise[][]): ProgramTree => ({
  id: 'p1', name: 'Base', coachId: 'coach-1', clientId: 'c1',
  blocks: weeks.map((exercises, i) => ({ id: `b${i + 1}`, order: i + 1, label: `Week ${i + 1}`, targetDate: null, sessions: [{ id: `s${i + 1}`, order: 1, label: 'Day 1', exercises }] })),
});
const render = (t: ProgramTree, notes?: string[]) =>
  renderToStaticMarkup(createElement(ProgramBuilder, { tree: t, completedSessionIds: [], catalogue, onTree: () => {}, notes }));
const lines = (html: string) => [...html.matchAll(/data-testid="pull-push"[^>]*>.*?<span>(.*?)<\/span>/g)].map((m) => m[1].replace(/&#x27;/g, "'"));

describe('ProgramBuilder: the weekly pull-over-push suggestion', () => {
  it('shows on the week whose pressing outnumbers its pulling, and only there', () => {
    const html = render(tree([
      [ex('pe-bench', 4), ex('pe-dip', 3), ex('pe-row', 3)],        // 7 v 3 → suggestion
      [ex('pe-bench', 3), ex('pe-row', 3)],                          // 3 v 3 → nothing
    ]));
    expect(lines(html)).toEqual([
      "Suggestion for Week 1: 7 pressing sets and 3 pulling sets. FEL's default is at least as much pulling as pressing. Add 4 pulling sets, or trade a pressing set for a row.",
    ]);
  });

  it('a coach note in the tree that mentions the shoulder tilts it to 3 pulling for every 2 pressing', () => {
    const html = render(tree([[ex('pe-bench', 4, { coachNote: 'Shoulder blades tucked on the way down' }), ex('pe-row', 4)]]));
    expect(lines(html)[0]).toMatch(/mentions the shoulder.*6 in all\. Add 2 pulling sets/);
  });

  it("…and so does a client's log note handed in through `notes`", () => {
    const t = tree([[ex('pe-bench', 4), ex('pe-row', 4)]]);
    expect(lines(render(t))).toEqual([]);
    expect(lines(render(t, ['My left shoulder felt tight on the last set']))[0]).toMatch(/mentions the shoulder/);
  });

  it('an untagged exercise is counted as neither, and the line says so', () => {
    const html = render(tree([[ex('pe-bench', 6), ex('pe-row', 2), ex('pe-rot', 2)]]));
    expect(lines(html)[0]).toMatch(/Counted from tagged exercises only: 2 sets here have no pattern tag\.$/);
  });
});
