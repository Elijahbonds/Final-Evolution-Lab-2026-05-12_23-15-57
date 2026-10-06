// controls-screen-2 (console-view lane, 2026-10-06): the CONTROLS panel's curated short lists. Owner: "Yes to both
// proposed fixes for texts and impeding gameplay view" — the 1v1 list (~25 lines) and the 3v3's made short and readable,
// on one screen a pad player never has to scroll.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PANEL_LINES, PANEL_MAX_LINES, PANEL_MAX_CHARS, BODY_BOOST_LINE, panelLinesFor } from './panelLines';
import { MODES } from '../modes/registry';
import { BOOST_MODES } from './modeVerbs';
import { staticControlsFor, isStaticControlsHint } from './staticControls';
import { controlLines, controlsSheet } from '../../ui/controlsScreen';

describe('panel lines — a curated list per long mode', () => {
  it('every entry is a real mode, within the budget: at most 8 lines, each one row of a sideways phone', () => {
    for (const [mode, p] of Object.entries(PANEL_LINES)) {
      expect(MODES[mode], mode).toBeDefined();
      for (const list of [p.lines, p.body ?? []]) {
        expect(list.length, mode).toBeLessThanOrEqual(PANEL_MAX_LINES);
        for (const l of list) expect(l.length, `${mode}: ${l}`).toBeLessThanOrEqual(PANEL_MAX_CHARS);
        expect(new Set(list).size, mode).toBe(list.length);
      }
      expect(p.lines.length, mode).toBeGreaterThan(0);
    }
  });

  it('the hoops lists: 4–8 lines covering the brief\'s essentials, and the 1v1 down from 22 lines', () => {
    for (const mode of ['threevthree', 'onevone']) {
      const lines = PANEL_LINES[mode].lines;
      expect(lines.length).toBeGreaterThanOrEqual(4);
      const all = lines.join(' | ');
      for (const verb of [/SPRINT/, /SHOOT: hold, let go in the green/, /DUNK/, /LAY-UP/, /POST UP/, /DEFENCE/]) expect(all, `${mode} ${verb}`).toMatch(verb);
    }
    expect(PANEL_LINES.threevthree.lines.join(' ')).toMatch(/FAKE/);
    expect(PANEL_LINES.threevthree.lines.join(' ')).toMatch(/SCREEN/);
    // integration-2: the 1v1 writes no static map any more (one live line per state, owner pick 1v1 #1), so the curated list is
    // the panel's only copy of its controls
    expect(staticControlsFor('onevone')).toEqual([]);
    expect(controlLines('onevone')).toEqual(PANEL_LINES.onevone.lines);
    expect(controlLines('threevthree')).toEqual(PANEL_LINES.threevthree.lines);
  });

  it('the panel reads the curated list in place of the split hint; a mode without one keeps its hint', () => {
    expect(panelLinesFor('threevthree')).toEqual([...PANEL_LINES.threevthree.lines]);
    expect(panelLinesFor('dunk')).toBeNull();
    expect(controlLines('dunk')).toEqual(['HOLD to run', 'tap JUMP at the line — then SLAM on NOW!']);
  });

  it('a curated mode\'s static hint still leaves the play screen word for word (the list replaces only the panel\'s copy)', () => {
    for (const mode of Object.keys(PANEL_LINES)) {
      for (const text of staticControlsFor(mode)) expect(isStaticControlsHint(text), mode).toBe(true);
    }
  });
});

describe('the boost line — off the gauge, onto the panel', () => {
  it('every body boost line is a boost mode\'s, and the panel shows it only while the body plays', () => {
    for (const [mode, line] of Object.entries(BODY_BOOST_LINE)) {
      expect(BOOST_MODES.has(mode), mode).toBe(true);
      expect(line).toMatch(/^BOOST: .*FILL/);
      expect(controlLines(mode, { body: true }), mode).toContain(line);
      expect(controlLines(mode), mode).not.toContain(line);
    }
  });

  it('the snowboard\'s words are the ones SnowboardSlalomMode gave its gauge', () => {
    const src = readFileSync(path.join(__dirname, '../modes/SnowboardSlalomMode.ts'), 'utf8');
    const fills = /boostHint: '(FILLS FROM [^']+)'/.exec(src)?.[1];
    expect(fills).toBeTruthy();
    expect(BODY_BOOST_LINE.snowboard_slalom).toContain(fills!);
  });

  it('a pad, the keys and touch have the BOOST row in every boost mode', () => {
    for (const mode of BOOST_MODES) for (const d of ['pad', 'keys', 'touch'] as const) {
      expect(controlsSheet(mode, d).rows.some((r) => r.action === 'BOOST'), `${mode} ${d}`).toBe(true);
    }
  });
});
