// COMBINE-DAY: the report's CSV, made on the phone: one row per testable athlete in composite order, every station's best,
// rank, percentile and attempts; hand-timed headers say so; cells safe to open in a spreadsheet.
import { describe, expect, it } from 'vitest';
import { combineCsv, csvCell, csvFileName } from './csv';
import { newEvent, recordAttempts } from './draft';
import type { CombineAthlete } from './types';
import { HELD_TODAY, OPEN_TODAY } from './today';

const adult = (id: string, name: string): CombineAthlete => ({ id, name, source: 'roster', access: { testable: true, camera: true, saveCamera: true, held: null, today: OPEN_TODAY } });
const held: CombineAthlete = { id: 't', name: 'Teen', source: 'roster', access: { testable: false, camera: false, saveCamera: false, held: 'guardian_consent_required', today: HELD_TODAY } };

function sample() {
  let ev = newEvent({
    name: 'Fall tryout', now: Date.UTC(2026, 9, 25), localId: 'L',
    athletes: [adult('a', 'Maya Okafor'), adult('b', 'Jordan, "JJ" Reyes'), adult('c', '=HYPERLINK("x")'), held],
    stations: [{ id: '', kind: 'cmj', variant: 'standing', attempts: 2 }, { id: '', kind: 'sprint', variant: '40yd', attempts: 2 }],
  });
  ev = recordAttempts(ev, 'a', 'cmj:standing', [{ value: 50.8 }, { value: null }]);
  ev = recordAttempts(ev, 'a', 'sprint:40yd', [{ value: 5.214 }, { value: 5.1 }]);
  ev = recordAttempts(ev, 'b', 'cmj:standing', [{ value: 45.72 }]);
  ev = recordAttempts(ev, 'b', 'sprint:40yd', [{ value: 4.8 }, { value: 4.9 }]);
  return ev;
}

describe('the CSV', () => {
  it('header: composite first, then per station best (unit, and inches for a jump), rank, percentile, attempts; hand-timed said', () => {
    const [header] = combineCsv(sample()).split('\r\n');
    expect(header).toBe([
      'Composite rank', 'Athlete', 'Composite (0-100)', 'Stations done',
      'Vertical jump best (cm)', 'Vertical jump best (in)', 'Vertical jump rank', 'Vertical jump percentile', 'Vertical jump attempt 1', 'Vertical jump attempt 2',
      'Sprint · 40 yd (hand-timed) best (s)', 'Sprint · 40 yd (hand-timed) rank', 'Sprint · 40 yd (hand-timed) percentile', 'Sprint · 40 yd (hand-timed) attempt 1', 'Sprint · 40 yd (hand-timed) attempt 2',
    ].join(','));
  });

  it('rows in composite order; X = no mark, blank = not taken; the held athlete is not in the file', () => {
    const lines = combineCsv(sample()).trimEnd().split('\r\n');
    expect(lines).toHaveLength(4);
    // a: jump 100, sprint 0 → 50; b: jump 0, sprint 100 → 50 — tied, both 1st; c has nothing
    expect(lines[1]).toBe('1,Maya Okafor,50,2/2,50.8,20,1,100,50.8,X,5.1,2,0,5.21,5.1');
    expect(lines[2]).toBe('1,"Jordan, ""JJ"" Reyes",50,2/2,45.7,18,2,0,45.7,,4.8,1,100,4.8,4.9');
    expect(lines[3].startsWith(',"\'=HYPERLINK(""x"")",,0/2')).toBe(true);
    expect(combineCsv(sample())).not.toContain('Teen');
    expect(combineCsv(sample()).endsWith('\r\n')).toBe(true);
  });

  it('cells: quoted when needed, formulas defused, nothing for null', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    for (const s of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx']) expect(csvCell(s).replace(/^"/, '').startsWith("'")).toBe(true);
    expect(csvCell(null)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(4.85)).toBe('4.85');
  });

  it('the file name: letters, digits and dashes, and the day', () => {
    expect(csvFileName({ name: 'Fall Tryout: Varsity!', createdAt: Date.UTC(2026, 9, 25) })).toBe('fall-tryout-varsity-2026-10-25.csv');
    expect(csvFileName({ name: '***', createdAt: Date.UTC(2026, 9, 25) })).toBe('combine-2026-10-25.csv');
  });
});
