// lib/csv: cells safe to open in a spreadsheet (formulas defused, numbers left as numbers), RFC 4180 quoting, and a
// reader that gives back what the writer wrote.
import { describe, expect, it } from 'vitest';
import { csvCell, csvFileName, csvRecords, parseCsv, toCsv } from './csv';

describe('csvCell', () => {
  it('quotes when needed and doubles quotes', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });
  it('defuses a string that starts like a formula (CSV injection)', () => {
    for (const s of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx', '=HYPERLINK("http://x")']) expect(csvCell(s).replace(/^"/, '').startsWith("'")).toBe(true);
  });
  it('numbers stay numbers, negative ones included; nothing for null, undefined or a non-finite number', () => {
    expect(csvCell(-1.5)).toBe('-1.5');
    expect(csvCell(4.85)).toBe('4.85');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(Infinity)).toBe('');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(true)).toBe('yes');
    expect(csvCell(false)).toBe('no');
  });
});

describe('toCsv and parseCsv', () => {
  it('round-trips, \\r\\n rows, a quoted comma and a defused formula', () => {
    const text = toCsv(['name', 'cm'], [['Maya, "M"', 40.5], ['=cmd', -2], [null, 3]]);
    expect(text).toBe('name,cm\r\n"Maya, ""M""",40.5\r\n\'=cmd,-2\r\n,3\r\n');
    expect(parseCsv(text)).toEqual([['name', 'cm'], ['Maya, "M"', '40.5'], ["'=cmd", '-2'], ['', '3']]);
  });
  it('reads \\n files, a BOM, and a line break inside quotes', () => {
    expect(parseCsv('﻿a,b\n"x\ny",2\n')).toEqual([['a', 'b'], ['x\ny', '2']]);
  });
  it('records by a trimmed, lower-cased header', () => {
    expect(csvRecords(' Participant ,Height_cm\nP01,40\n')).toEqual([{ participant: 'P01', height_cm: '40' }]);
  });
  it('a file name: letters, digits and dashes, and the day', () => {
    expect(csvFileName('My Jumps!', new Date(Date.UTC(2026, 9, 25)))).toBe('my-jumps-2026-10-25.csv');
    expect(csvFileName('***', new Date(Date.UTC(2026, 9, 25)))).toBe('export-2026-10-25.csv');
  });
});
