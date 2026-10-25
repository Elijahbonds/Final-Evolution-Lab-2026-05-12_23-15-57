// COACH-PARITY (2026-10-26): CSV and spreadsheet rows without a dependency.
import { describe, expect, it } from 'vitest';
import { guessDelimiter, parseCsv } from './csv';

describe('parseCsv', () => {
  it('quotes: a delimiter, a newline and "" inside a cell; CRLF; a BOM; blank rows kept as []', () => {
    const text = '﻿Day,Exercise,Notes\r\nDay 1,"Squat, Back","Line one\nline two"\r\n\r\nDay 2,Bench,"Say ""brace"""\r\n';
    expect(parseCsv(text)).toEqual([['Day', 'Exercise', 'Notes'], ['Day 1', 'Squat, Back', 'Line one\nline two'], [], ['Day 2', 'Bench', 'Say "brace"']]);
  });
  it('a last line with no newline; cells trimmed', () => expect(parseCsv('a , b\nc,d')).toEqual([['a', 'b'], ['c', 'd']]));
  it('guesses the delimiter: tab, comma, semicolon', () => {
    expect(guessDelimiter('Day\tExercise\nMon\tSquat')).toBe('\t');
    expect(guessDelimiter('Day,Exercise\nMon,Squat')).toBe(',');
    expect(guessDelimiter('Day;Exercise;Load\nMon;Squat;"75,5 kg"')).toBe(';');
    expect(parseCsv('Day;Exercise;Load\nMon;Squat;"75,5 kg"')).toEqual([['Day', 'Exercise', 'Load'], ['Mon', 'Squat', '75,5 kg']]);
  });
});
