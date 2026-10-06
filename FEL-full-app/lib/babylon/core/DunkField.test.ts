import { describe, it, expect } from 'vitest';
import {
  fieldFor, newField, standings, cutField, placeOf, bookCard, highlightSituation, simFinal, encodeField, decodeField, cutTiebreak,
  fieldTotal, FIELD_SIZE, FINALISTS, PLAYER_ID, type FieldDunker,
} from './DunkField';
import { DUNK_RIVALS, rivalById } from './DunkRivals';
import { DUNK_OFF_CAP } from './ContinuousNight';

const book = (f: FieldDunker[], m: Record<string, number[]>): FieldDunker[] => {
  let out = f;
  for (const [id, cs] of Object.entries(m)) for (const c of cs) out = bookCard(out, id, c);
  return out;
};

describe('the field', () => {
  it('is four dunkers: you, the rival on the floor, and two highlights — three different rival bodies of the five', () => {
    for (const foe of DUNK_RIVALS) {
      const f = newField(foe);
      expect(f).toHaveLength(FIELD_SIZE);
      expect(f.map((d) => d.kind)).toEqual(['player', 'live', 'highlight', 'highlight']);
      expect(f[1].id).toBe(foe.id);
      expect(new Set(f.map((d) => d.id)).size).toBe(FIELD_SIZE);
      expect(f.map((d) => d.order)).toEqual([0, 1, 2, 3]);
      for (const d of f.slice(1)) expect(DUNK_RIVALS.some((r) => r.id === d.id)).toBe(true);
    }
  });
  it('the highlights are the next two in the roster after the live rival (the roster walks, wrapping)', () => {
    expect(fieldFor(rivalById('cass')).map((r) => r.id)).toEqual(['ty', 'pilot']);
    expect(fieldFor(rivalById('stack')).map((r) => r.id)).toEqual(['cass', 'ty']);
  });
  it('booking a card never mutates the field it was given', () => {
    const f = newField(rivalById('ty'));
    const g = bookCard(f, 'ty', 44);
    expect(fieldTotal(f.find((d) => d.id === 'ty')!)).toBe(0);
    expect(fieldTotal(g.find((d) => d.id === 'ty')!)).toBe(44);
  });
});

describe('the cut', () => {
  it('the top two by total go through', () => {
    const f = book(newField(rivalById('cass')), { player: [40, 42], cass: [44, 45], ty: [38, 39], pilot: [41, 40] });
    const c = cutField(f);
    expect(c.through.map((d) => d.id)).toEqual(['cass', PLAYER_ID]);
    expect(c.out.map((d) => d.id)).toEqual(['pilot', 'ty']);
    expect(placeOf(f, PLAYER_ID)).toBe(2);
    expect(placeOf(f, 'nobody')).toBe(0);
    expect(FINALISTS).toBe(2);
  });
  it('level at the line: the best dunk, then the later dunk, then the draw — never a rule nobody saw', () => {
    // you 82 (40, 42) vs PILOT 82 (45, 37): PILOT's best dunk takes it
    let f = book(newField(rivalById('cass')), { player: [40, 42], cass: [48, 47], ty: [30, 30], pilot: [45, 37] });
    expect(cutField(f).through.map((d) => d.id)).toEqual(['cass', 'pilot']);
    expect(cutTiebreak(f)).toMatch(/BEST DUNK/);
    // same best: the later dunk
    f = book(newField(rivalById('cass')), { player: [42, 40], cass: [48, 47], ty: [30, 30], pilot: [40, 42] });
    expect(cutField(f).through.map((d) => d.id)).toEqual(['cass', 'pilot']);
    expect(cutTiebreak(f)).toMatch(/LAST DUNK/);
    // identical cards: the draw (you dunked first)
    f = book(newField(rivalById('cass')), { player: [41, 41], cass: [48, 47], ty: [30, 30], pilot: [41, 41] });
    expect(cutField(f).through.map((d) => d.id)).toEqual(['cass', PLAYER_ID]);
    expect(cutTiebreak(f)).toMatch(/DRAW/);
    expect(cutTiebreak(book(newField(rivalById('cass')), { player: [44], cass: [40] }))).toBe('');
  });
  it('the standings are a strict order (every pair decided)', () => {
    const f = book(newField(rivalById('zo')), { player: [40, 40], zo: [40, 40], stack: [40, 40], cass: [40, 40] });
    expect(standings(f).map((d) => d.order)).toEqual([0, 1, 2, 3]);
  });
});

describe('a highlight dunker reads the cut line', () => {
  it('his deficit is his total against the second-best of the others', () => {
    const f = book(newField(rivalById('cass')), { player: [44, 44], cass: [40, 40], ty: [41] });
    expect(highlightSituation(f, 'ty', 1, 44)).toEqual({ deficit: 41 - 80, isFinalRound: false, attemptsLeft: 1, playerPace: 44 });
    expect(highlightSituation(newField(rivalById('cass')), 'pilot', 2, 0).deficit).toBe(0);
  });
});

describe('a final you are not in, shown as highlights', () => {
  it('two dunks each, in the draw\'s order, on the night totals', () => {
    const f = book(newField(rivalById('cass')), { player: [30, 30], cass: [44, 45], ty: [30, 31], pilot: [42, 43] });
    const calls: string[] = [];
    const r = simFinal(f, ['pilot', 'cass'], (id) => { calls.push(id); return id === 'pilot' ? 46 : 41; });
    expect(calls).toEqual(['cass', 'pilot', 'cass', 'pilot']);
    expect(r.winner).toBe('pilot');   // 85 + 92 = 177 vs 89 + 82 = 171
    expect(r.offs).toBe(0);
    expect(fieldTotal(r.field.find((d) => d.id === 'cass')!)).toBe(89 + 82);
    expect(fieldTotal(f.find((d) => d.id === 'cass')!)).toBe(89);   // the given field is untouched
  });
  it('level → dunk-offs until somebody wins; dunk-off cards never join the totals', () => {
    const f = book(newField(rivalById('cass')), { cass: [40, 40], pilot: [40, 40] });
    let n = 0;
    const r = simFinal(f, ['cass', 'pilot'], (id) => { n++; return n <= 4 ? 40 : n <= 8 ? 38 : id === 'pilot' ? 44 : 41; });
    expect(r.offs).toBe(3);
    expect(r.winner).toBe('pilot');
    expect(r.offCards).toEqual([41, 44]);
    expect(fieldTotal(r.field.find((d) => d.id === 'pilot')!)).toBe(160);
  });
  it('the loop is capped: dead level at DUNK_OFF_CAP goes to the best dunk of the night, then the draw', () => {
    const f = book(newField(rivalById('cass')), { cass: [40, 46], pilot: [43, 43] });
    let calls = 0;
    const r = simFinal(f, ['cass', 'pilot'], () => { calls++; return 40; });
    expect(r.offs).toBe(DUNK_OFF_CAP);
    expect(calls).toBe(4 + 2 * DUNK_OFF_CAP);
    expect(r.winner).toBe('cass');   // 86 + 80 each, level; CASS's 46 is the best dunk
    const h = book(newField(rivalById('cass')), { cass: [43, 43], pilot: [40, 46] });
    expect(simFinal(h, ['cass', 'pilot'], () => 40).winner).toBe('pilot');   // the best dunk is the LATER dunker's — it beats the draw
    const g = book(newField(rivalById('cass')), { cass: [43, 43], pilot: [43, 43] });
    expect(simFinal(g, ['pilot', 'cass'], () => 40).winner).toBe('cass');   // all level: the draw (CASS dunked first)
  });
});

describe('the standings on the wire', () => {
  it('round trip: names, totals, kinds, and who is through / out / the champion', () => {
    const f = book(newField(rivalById('cass')), { player: [40, 42], cass: [44, 45], ty: [38, 39], pilot: [41, 40] });
    expect(decodeField(encodeField(f, 'round1'))?.rows.map((r) => r.state)).toEqual(['in', 'in', 'in', 'in']);
    const cut = decodeField(encodeField(f, 'cut'))!;
    expect(cut.stage).toBe('cut');
    expect(cut.rows).toEqual([
      { name: 'CASS', total: 89, kind: 'live', state: 'through' },
      { name: 'YOU', total: 82, kind: 'player', state: 'through' },
      { name: 'PILOT', total: 81, kind: 'highlight', state: 'out' },
      { name: 'TY', total: 77, kind: 'highlight', state: 'out' },
    ]);
    // the final: through/out still read off the FIRST round (a cut dunker never comes back), the champion marked
    const fin = book(f, { player: [48, 49], cass: [40, 40] });
    const done = decodeField(encodeField(fin, 'done', PLAYER_ID))!;
    expect(done.rows[0]).toEqual({ name: 'YOU', total: 179, kind: 'player', state: 'champ' });
    expect(done.rows.find((r) => r.name === 'PILOT')?.state).toBe('out');
  });
  it('through / out is the FIRST round\'s cut — a cut dunker never comes back, whatever the totals do after it', () => {
    const f = book(newField(rivalById('cass')), { player: [40, 42], cass: [44, 45], ty: [38, 39], pilot: [41, 40] });
    const later = book(f, { pilot: [50, 50] });   // (a cut dunker has no more cards; this pins the rule, not a night)
    const rows = decodeField(encodeField(later, 'final'))!.rows;
    expect(rows.find((r) => r.name === 'PILOT')?.state).toBe('out');
    expect(rows.find((r) => r.name === 'YOU')?.state).toBe('through');
  });
  it('garbage decodes to null, never a throw', () => {
    for (const v of [null, undefined, 3, '', 'round1', {}]) expect(decodeField(v)).toBeNull();
  });
});
