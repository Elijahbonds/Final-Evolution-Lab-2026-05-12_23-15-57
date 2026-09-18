import { describe, expect, it } from 'vitest';
import { ARC, BRIDGE_PROMPTS, MEASURES, PATHWAY_FIELDS, SCAN_LABEL, STANDARDS, arcMilestones, arcWeek, bridgePromptFor, weekOf } from './curriculum';

const day = 24 * 60 * 60 * 1000;
describe('the Camp Blueprint arc', () => {
  it('is eight weeks, numbered in order, with the plateau scheduled in week 6', () => {
    expect(ARC.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ARC.filter((w) => w.plateau).map((w) => w.week)).toEqual([6]);
    expect(arcWeek(6).script.length).toBeGreaterThan(0);
  });
  it('names an output for every week except the two execution weeks', () => {
    expect(ARC.filter((w) => w.output === null).map((w) => w.week)).toEqual([5, 6]);
  });
  it('derives the week from the plan start and clamps to the arc', () => {
    const start = new Date('2026-09-07T00:00:00Z');
    expect(weekOf(start, start)).toBe(1);
    expect(weekOf(start, new Date(start.getTime() + 6 * day))).toBe(1);
    expect(weekOf(start, new Date(start.getTime() + 7 * day))).toBe(2);
    expect(weekOf(start, new Date(start.getTime() + 100 * day))).toBe(8);
    expect(weekOf(start, new Date(start.getTime() - 3 * day))).toBe(1);
    expect(weekOf('not a date', start)).toBe(1);
  });
  it('rotates the Bridge prompts so every one is used inside the first five weeks', () => {
    expect(new Set([1, 2, 3, 4, 5].map(bridgePromptFor))).toEqual(new Set(BRIDGE_PROMPTS));
    expect(bridgePromptFor(6)).toBe(BRIDGE_PROMPTS[0]);
  });
  it('offers the arc as eight milestones, each with the Bridge on the clock', () => {
    const ms = arcMilestones();
    expect(ms).toHaveLength(8);
    for (const m of ms) { expect(m.sessions).toHaveLength(5); expect(m.sessions.at(-1)?.label).toMatch(/Bridge/); }
    expect(ms[5].label).toBe('Week 6 — THE PLATEAU');
  });
  it('keeps the label discipline and the six-field protocol', () => {
    expect(SCAN_LABEL).toBe('estimated engagement');
    expect(STANDARDS.join(' ')).toContain(SCAN_LABEL);
    expect(arcWeek(2).body.join(' ')).toContain(SCAN_LABEL);
    expect(PATHWAY_FIELDS).toHaveLength(6);
    expect(MEASURES.neverClaim[0]).toMatch(/Career outcomes/);
  });
});
