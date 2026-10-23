// Assign one program to a group (coach-loop P1): the groups a roster already implies, with no schema change.
import { describe, expect, it } from 'vitest';
import { impliedGroups } from './assign-program';

const row = (clientId: string, ...programs: string[]) => ({ clientId, name: clientId, programs: programs.map((name, i) => ({ id: `${clientId}-${i}`, name, isActive: true })) });

describe('impliedGroups', () => {
  it('one group per program name held by two or more athletes, sorted by name', () => {
    const groups = impliedGroups([row('a', 'U16 Strength', 'Return to play'), row('b', 'U16 Strength'), row('c', 'Return to play'), row('d', 'Solo block')]);
    expect(groups).toEqual([
      { name: 'Return to play', clientIds: ['a', 'c'] },
      { name: 'U16 Strength', clientIds: ['a', 'b'] },
    ]);
  });
  it('an athlete holding two copies of one program counts once; nobody shared means no groups', () => {
    expect(impliedGroups([row('a', 'X', 'X'), row('b', 'Y')])).toEqual([]);
  });
});
