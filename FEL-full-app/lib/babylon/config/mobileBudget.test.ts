// The phone budget table's rules, on fixtures (perf-guard, 2026-10-06). scripts/mobile-budget-tests.ts gates the shipped
// table; this holds the gate itself to its rules, so a loosened check fails here first.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkTable, budgetFor, type BudgetTable } from '../../../scripts/mobile-budget-tests';

const CEIL = { drawCalls: 600, activeMeshes: 400, skinnedBodies: 16, textureMb: 256, particles: 1500 };
const row = (m: Partial<typeof CEIL>, b?: Partial<typeof CEIL>) => {
  const measured = { drawCalls: 100, activeMeshes: 50, skinnedBodies: 4, textureMb: 100, particles: 10, ...m };
  const budget = b ? { ...measured, ...b } : Object.fromEntries(Object.entries(measured).map(([k, v]) => [k, budgetFor(v, 1.2, CEIL[k as keyof typeof CEIL])]));
  return { measured, budget: budget as typeof CEIL };
};
const table = (modes: BudgetTable['modes'], knownOver: BudgetTable['knownOver'] = {}): BudgetTable => ({
  measuredAt: '2026-10-06', probe: 'p', profile: 'x', headroom: 1.2, ceiling: CEIL, modes, knownOver,
});

describe('mobile budget rules', () => {
  it('the shipped table passes', () => {
    const t = JSON.parse(readFileSync(join(__dirname, 'mobileBudget.json'), 'utf8')) as BudgetTable;
    expect(checkTable(t).fail).toEqual([]);
  });
  it('a mode that grew past its budget fails', () => {
    const r = row({});
    r.measured.drawCalls = r.budget.drawCalls + 1;
    expect(checkTable(table({ a: r })).fail.join()).toMatch(/a\.drawCalls: measured .* over its budget/);
  });
  it('a budget raised past measured × headroom fails', () => {
    expect(checkTable(table({ a: row({}, { drawCalls: 400 }) })).fail.join()).toMatch(/a budget is a measurement/);
  });
  it('headroom stops at the ceiling', () => {
    expect(budgetFor(250, 1.2, 256)).toBe(256);
    expect(checkTable(table({ a: row({ textureMb: 250 }, { textureMb: 300 }) })).fail.join()).toMatch(/past the phone ceiling/);
  });
  it('a mode over the ceiling must be listed, and its budget is frozen at what it measured', () => {
    expect(budgetFor(284, 1.2, 256)).toBe(284);
    expect(checkTable(table({ a: row({ textureMb: 284 }) })).fail.join()).toMatch(/not listed in knownOver/);
    expect(checkTable(table({ a: row({ textureMb: 284 }) }, { a: ['textureMb'] })).fail).toEqual([]);
    expect(checkTable(table({ a: row({ textureMb: 284 }, { textureMb: 300 }) }, { a: ['textureMb'] })).fail.join()).toMatch(/frozen/);
  });
  it('a stale knownOver entry fails', () => {
    expect(checkTable(table({ a: row({}) }, { a: ['textureMb'] })).fail.join()).toMatch(/stale/);
  });
  it('an unmeasured table fails', () => {
    expect(checkTable({ ...table({ a: row({}) }), measuredAt: null }).fail.join()).toMatch(/measuredAt/);
  });
});
