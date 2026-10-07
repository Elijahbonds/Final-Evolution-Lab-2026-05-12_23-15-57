// controls-screen-2 (console-view lane, 2026-10-06): the CONTROLS panel's curated short lists. Owner: "Yes to both
// proposed fixes for texts and impeding gameplay view" — the 1v1 list (~25 lines) and the 3v3's made short and readable,
// on one screen a pad player never has to scroll.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PANEL_LINES, PANEL_MAX_LINES, PANEL_MAX_CHARS, BODY_BOOST_LINE, PANEL_GROUPS, panelLinesFor } from './panelLines';
import { MODES } from '../modes/registry';
import { BOOST_MODES } from './modeVerbs';
import { staticControlsFor, isStaticControlsHint } from './staticControls';
import { controlLines, controlsSheet, splitHint } from '../../ui/controlsScreen';
import { CONTROLS_OFFENCE as ONES_OFFENCE, CONTROLS_DEFENCE as ONES_DEFENCE } from '../modes/onevoneRules';
import * as threesRules from '../modes/threevthreeRules';

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

  // test changed (HOOPS PAUSE, owner 2026-10-06: "Hoops pause: Controls panel only"): the 1v1 and 3v3 short lists (4–8 lines,
  // controls-screen-2) are replaced by their full OFFENSE / DEFENSE lists as two titled groups — the list the hosts drew along
  // the bottom on pause, now the panel's only one. Was: 4–8 curated lines with the brief's essentials, == controlLines.
  it('the hoops panel: no short list — two groups, OFFENSE and DEFENSE, in the rules files\' own words', () => {
    expect(PANEL_LINES.onevone).toBeUndefined();
    expect(PANEL_LINES.threevthree).toBeUndefined();
    expect(PANEL_GROUPS.onevone.map((g) => [g.title, g.text])).toEqual([['OFFENSE', ONES_OFFENCE], ['DEFENSE', ONES_DEFENCE]]);
    // the 3v3's lists come through threevthreeControls (no Babylon under the panel); the rules file still exports the same strings
    expect(PANEL_GROUPS.threevthree.map((g) => [g.title, g.text])).toEqual([['OFFENSE', threesRules.CONTROLS_OFFENCE], ['DEFENSE', threesRules.CONTROLS_DEFENCE]]);
    for (const mode of ['onevone', 'threevthree']) {
      const groups = PANEL_GROUPS[mode];
      // nothing reworded: the panel's lines are the lists split at their dots, every word of them, offence then defence
      expect(controlLines(mode)).toEqual([...splitHint(groups[0].text), ...splitHint(groups[1].text)]);
      expect(controlLines(mode).join(' · ').replace(/\s+/g, ' ')).toBe(`${groups[0].text} · ${groups[1].text}`.replace(/\s+/g, ' '));
      const all = controlLines(mode).join(' | ');
      for (const verb of [/SPRINT/, /DUNK/, /LAY IT IN/, /release in the green/, /POST UP/, /STAY IN FRONT/, /TAKE THE CHARGE/, /BOX OUT/, /UP AND UNDER/]) expect(all, `${mode} ${verb}`).toMatch(verb);
      expect(controlLines(mode, { body: true }), mode).toEqual(controlLines(mode));   // no body words: the same list
      expect(panelLinesFor(mode), mode).toBeNull();
    }
    expect(controlLines('threevthree').join(' ')).toMatch(/FAKE/);
    expect(controlLines('threevthree').join(' ')).toMatch(/SCREEN/);
    expect(controlLines('onevone').join(' ')).toMatch(/SNATCHBACK/);   // the depth the short list left out is back
    // the hoops modes write no static map (one live line per state, owner picks 1v1 #1 / 3v3 #7)
    expect(staticControlsFor('onevone')).toEqual([]);
    expect(staticControlsFor('threevthree')).toEqual([]);
  });

  it('the 3v3\'s lists reach the panel without Babylon: threevthreeControls imports nothing, the panel never the rules file', () => {
    const controls = readFileSync(path.join(__dirname, '../modes/threevthreeControls.ts'), 'utf8');
    expect(controls).not.toMatch(/^\s*import\b/m);
    expect(controls).toMatch(/export const CONTROLS_OFFENCE = '/);
    const panel = readFileSync(path.join(__dirname, 'panelLines.ts'), 'utf8');
    expect(panel).not.toMatch(/from '\.\.\/modes\/threevthreeRules'/);
    expect(readFileSync(path.join(__dirname, '../modes/onevoneRules.ts'), 'utf8').match(/^import (?!type\b).*$/gm) ?? []).toEqual([]);
  });

  it('the panel draws the hoops groups titled, in order, every line under its heading', () => {
    for (const mode of ['onevone', 'threevthree']) for (const d of ['pad', 'keys', 'touch'] as const) {
      const s = controlsSheet(mode, d);
      expect(s.groups.map((g) => g.title), `${mode} ${d}`).toEqual(['OFFENSE', 'DEFENSE']);
      expect(s.groups.map((g) => g.color)).toEqual(['var(--fel-cyan)', 'var(--fel-gold)']);
      expect(s.lines).toEqual(s.groups.flatMap((g) => g.lines));
      expect(s.groups[1].lines[0]).toMatch(/^STAY IN FRONT/);
    }
    // every other mode is one untitled group, its lines as before
    for (const mode of ['dunk', 'surf', 'karate', 'velocitykart']) {
      const s = controlsSheet(mode, 'pad');
      expect(s.groups, mode).toEqual([{ lines: s.lines }]);
    }
  });

  it('the panel reads the curated list in place of the split hint; a mode without one keeps its hint', () => {
    // test changed (HOOPS PAUSE): the 3v3 has no curated list any more (its groups, above); karate's holds this instead
    expect(panelLinesFor('karate')).toEqual([...PANEL_LINES.karate.lines]);
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
