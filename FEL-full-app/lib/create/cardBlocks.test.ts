// CREATE HUB phase 4: the Signature moves block and the Community reads shelf.
import { describe, expect, it } from 'vitest';
import { EXCERPT_MAX, MOVES_MAX, READS_MAX, communityReads, excerptOf, runIdsOf, signatureMovesBlock } from './cardBlocks';

const sport = (id: string, art: Record<string, unknown>, at = '2026-10-01') => ({ id, title: `Card ${id}`, art: { kind: 'sport', ...art }, createdAt: at });

describe('Signature moves', () => {
  it('names the move, adds the run, newest first', () => {
    const rows = [sport('a', { signatureMoveId: 'Reverse windmill', routineId: 'gs1' }, '2026-10-01'), sport('b', { routineId: 'sig9' }, '2026-10-05')];
    const items = signatureMovesBlock(rows, [{ id: 'gs1', mode: 'dunk_contest', score: 1250, won: true }, { id: 'sig9', mode: 'threept', score: 88 }]);
    expect(items).toEqual([
      { id: 'b', name: 'Card b', detail: 'Threept · 88 pts' },
      { id: 'a', name: 'Reverse windmill', detail: 'Dunk Contest · 1,250 pts · won' },
    ]);
  });
  it('a run that is gone just drops the detail; non-sport rows are ignored; at most six', () => {
    expect(signatureMovesBlock([sport('a', { routineId: 'gone' })], [])[0].detail).toBeNull();
    expect(signatureMovesBlock([{ id: 'w', title: 't', art: { kind: 'writing' }, createdAt: '2026-10-01' }], [])).toEqual([]);
    expect(signatureMovesBlock(Array.from({ length: 9 }, (_, i) => sport(String(i), {})), [])).toHaveLength(MOVES_MAX);
  });
  it('runIdsOf collects each id once and skips junk', () => {
    expect(runIdsOf([sport('a', { routineId: 'x' }), sport('b', { routineId: 'x' }), sport('c', { routineId: 7 }), sport('d', { routineId: 'y'.repeat(65) })])).toEqual(['x']);
  });
});

describe('Community reads', () => {
  const w = (id: string, text: string, owner: Record<string, unknown> | null = { name: 'Ari', creatorCards: [{ slug: 'ari', published: true }] }, at = '2026-10-01') =>
    ({ id, title: `T${id}`, art: { kind: 'writing', text }, createdAt: at, owner });
  it('credits the creator, links their published card only', () => {
    const items = communityReads([
      w('1', 'A short verse about the court.'),
      w('2', 'Another one.', { name: 'Bo', creatorCards: [{ slug: 'bo', published: false }] }, '2026-10-02'),
      w('3', 'No name.', { name: null }, '2026-09-01'),
    ], (s) => `/card/${s}`);
    expect(items.map((i) => [i.id, i.by, i.href])).toEqual([['2', 'Bo', null], ['1', 'Ari', '/card/ari'], ['3', 'A FEL creator', null]]);
  });
  it('excerpts long text at a word, keeps the full text, skips non-writing and empty', () => {
    const long = 'word '.repeat(200);
    const [item] = communityReads([w('1', long), { id: 'x', title: 'x', art: { kind: 'art' }, createdAt: '2026-10-01' }, w('2', '   ')], (s) => s);
    expect(item.more).toBe(true);
    expect(item.excerpt.length).toBeLessThanOrEqual(EXCERPT_MAX + 1);
    expect(item.excerpt.endsWith('word…')).toBe(true);
    expect(item.text).toBe(long);
    expect(excerptOf('short')).toEqual({ excerpt: 'short', more: false });
    expect(communityReads(Array.from({ length: 20 }, (_, i) => w(String(i), 'text here')), (s) => s)).toHaveLength(READS_MAX);
  });
});
