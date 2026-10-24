import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_ROWS, detectDelimiter, parseCsv, parseRosterImport } from './bulkImport';

describe('parseCsv', () => {
  it('reads RFC 4180 quoting: commas and line breaks inside quotes, "" for a quote', () => {
    const text = 'name,email\r\n"Lee, Sam","sam@x.com"\r\n"Jo ""JJ"" Park",jo@x.com\n"Two\nLines",t@x.com';
    expect(parseCsv(text, ',')).toEqual([
      { line: 1, cells: ['name', 'email'] },
      { line: 2, cells: ['Lee, Sam', 'sam@x.com'] },
      { line: 3, cells: ['Jo "JJ" Park', 'jo@x.com'] },
      { line: 4, cells: ['Two\nLines', 't@x.com'] },
    ]);
  });
  it('a last line with no newline, and an empty quoted cell, are kept', () => {
    expect(parseCsv('a,""', ',')).toEqual([{ line: 1, cells: ['a', ''] }]);
  });
  it('detects tabs (a spreadsheet paste) and semicolons (a European export)', () => {
    expect(detectDelimiter('\n\nName\tEmail\n')).toBe('\t');
    expect(detectDelimiter('Name;Email')).toBe(';');
    expect(detectDelimiter('Name;Email,x')).toBe(',');
    expect(detectDelimiter('sam@x.com')).toBe(',');
  });
});

describe('parseRosterImport', () => {
  it('a CSV export with a header, a BOM and extra columns', () => {
    const r = parseRosterImport('﻿First Name,Last Name,Team,E-mail\nSam,Lee,U16,SAM@X.COM\nRia,Khan,U16,\n');
    expect(r.rows).toEqual([
      { line: 2, name: 'Sam Lee', email: 'sam@x.com' },
      { line: 3, name: 'Ria Khan', email: null },
    ]);
    expect(r.problems).toEqual([]);
  });

  it('a pasted list in every shape a coach types', () => {
    const r = parseRosterImport([
      'Sam Lee, sam@x.com',
      'Ria Khan <ria@x.com>',
      'jo@x.com',
      'Ana Silva',
      '',
      '   ',
      'Max  Power\tmax@x.com',
    ].join('\n'));
    expect(r.rows).toEqual([
      { line: 1, name: 'Sam Lee', email: 'sam@x.com' },
      { line: 2, name: 'Ria Khan', email: 'ria@x.com' },
      { line: 3, name: null, email: 'jo@x.com' },
      { line: 4, name: 'Ana Silva', email: null },
    ]);
    // line 7 mixes a tab into a comma paste: read as one cell, it is refused by line rather than guessed at
    expect(r.problems).toEqual([{ line: 7, problem: 'bad_email' }]);
    // on its own, the tab is the delimiter and the line reads cleanly
    expect(parseRosterImport('Max  Power\tmax@x.com').rows).toEqual([{ line: 1, name: 'Max Power', email: 'max@x.com' }]);
  });

  it('a bad email is refused by line, and nothing is guessed from it', () => {
    const r = parseRosterImport('name,email\nSam,sam@x\nRia,ria@x.com\nJo,jo@@x.com');
    expect(r.rows).toEqual([{ line: 3, name: 'Ria', email: 'ria@x.com' }]);
    expect(r.problems).toEqual([{ line: 2, problem: 'bad_email' }, { line: 4, problem: 'bad_email' }]);
  });

  it('two emails on one loose line is a problem, not a pick', () => {
    expect(parseRosterImport('a@x.com, b@x.com').problems).toEqual([{ line: 1, problem: 'bad_email' }]);
  });

  it('duplicates by email are dropped and counted; the same name twice is two athletes', () => {
    const r = parseRosterImport('Sam, sam@x.com\nSammy, SAM@x.com\nAna\nAna');
    expect(r.rows.map((x) => x.name)).toEqual(['Sam', 'Ana', 'Ana']);
    expect(r.duplicates).toBe(1);
  });

  it('a header row with a blank row under it says so', () => {
    expect(parseRosterImport('name,email,team\n,,U16').problems).toEqual([{ line: 2, problem: 'empty' }]);
  });

  it('caps the list and names every line over the cap', () => {
    const lines = Array.from({ length: MAX_IMPORT_ROWS + 3 }, (_, i) => `Athlete ${i + 1}`).join('\n');
    const r = parseRosterImport(lines);
    expect(r.rows.length).toBe(MAX_IMPORT_ROWS);
    expect(r.problems.map((p) => p.problem)).toEqual(['too_many', 'too_many', 'too_many']);
  });

  it('20 athletes pasted from a spreadsheet: 20 rows, in order', () => {
    const paste = ['Name\tEmail', ...Array.from({ length: 20 }, (_, i) => `Player ${i + 1}\tp${i + 1}@team.org`)].join('\n');
    const r = parseRosterImport(paste);
    expect(r.rows.length).toBe(20);
    expect(r.rows[19]).toEqual({ line: 21, name: 'Player 20', email: 'p20@team.org' });
  });

  it('nothing at all is an empty result, not an error', () => {
    expect(parseRosterImport('')).toEqual({ rows: [], problems: [], duplicates: 0 });
    expect(parseRosterImport(undefined as unknown as string).rows).toEqual([]);
  });
});
