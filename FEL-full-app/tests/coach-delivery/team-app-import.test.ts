// COACH-DELIVERY COA-07 (2026-10-27): TeamSnap / SportsEngine / LeagueApps roster exports, read by name. Each fixture
// carries guardian emails beside the players'; none of them may become an athlete's invite address.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importFormatLine, parseRosterImport, teamAppOf } from '@/lib/coach/bulkImport';

const fixture = (name: string) => readFileSync(join(__dirname, '../fixtures/team-apps', name), 'utf8');
const GUARDIAN = /parent|mom|dad|home|work|coleparents/;

describe('named team-app exports', () => {
  it('TeamSnap: First/Last Name and Email Address 1 (the member\'s); Email Address 2 and contact emails never read', () => {
    const r = parseRosterImport(fixture('teamsnap-roster.csv'));
    expect(r.format).toBe('teamsnap');
    expect(r.rows).toEqual([
      { line: 2, name: 'Maya Ortiz', email: 'maya.ortiz@example.com' },
      { line: 3, name: 'Leo Park', email: null },
      { line: 4, name: "Sam O'Neil, Jr.", email: 'sam.oneil@example.com' },
    ]);
    expect(r.problems).toEqual([]);
  });

  it('SportsEngine: Participant First/Last Name and Participant Email; Primary Contact and Guardian emails never read', () => {
    const r = parseRosterImport(fixture('sportsengine-roster.csv'));
    expect(r.format).toBe('sportsengine');
    expect(r.rows.map((x) => [x.name, x.email])).toEqual([['Ava Nguyen', 'ava.n@example.com'], ['Ben Cole', null], ['Cara Diaz', 'cara.diaz@example.com']]);
  });

  it('LeagueApps: Player First/Last Name and Player Email; Parent 1/2 Email never read', () => {
    const r = parseRosterImport(fixture('leagueapps-roster.csv'));
    expect(r.format).toBe('leagueapps');
    expect(r.rows.map((x) => [x.name, x.email])).toEqual([['Dev Patel', 'dev.patel@example.com'], ['Eli Brooks', null], ['Fay Kim', 'fay.kim@example.com']]);
  });

  it('no guardian address is ever an invite address, in any of the three', () => {
    for (const f of ['teamsnap-roster.csv', 'sportsengine-roster.csv', 'leagueapps-roster.csv']) {
      const r = parseRosterImport(fixture(f));
      expect(r.rows.length, f).toBe(3);
      for (const row of r.rows) expect(row.email ?? '', f).not.toMatch(GUARDIAN);
    }
  });

  it('a TeamSnap export pasted from a spreadsheet (tabs) reads the same', () => {
    const tabs = fixture('teamsnap-roster.csv').split('\n').map((l) => l.replace(/"([^"]*)"/g, (_, x: string) => x.replace(/,/g, '\u0000')).split(',').map((c) => c.replace(/\u0000/g, ',')).join('\t')).join('\n');
    expect(parseRosterImport(tabs).rows.map((x) => x.email)).toEqual(['maya.ortiz@example.com', null, 'sam.oneil@example.com']);
  });

  it('a plain header and a pasted list are still read as before, and named generic / list', () => {
    expect(parseRosterImport('Name,Email\nSam Lee,sam@x.com').format).toBe('generic');
    expect(parseRosterImport('Sam Lee, sam@x.com').format).toBe('list');
    expect(teamAppOf(['Name', 'Email'])).toBeNull();
  });

  it('the coach is told which export it was read as', () => {
    expect(importFormatLine('leagueapps')).toMatch(/LeagueApps.*guardian emails were left out/);
    expect(importFormatLine('generic')).toBeNull();
  });
});
