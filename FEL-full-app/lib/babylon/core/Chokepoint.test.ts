// Do the rails hold a body out, is the lane the lane, is a run along a rail a rail run?
import { describe, it, expect } from 'vitest';
import { CHOKE, CHOKE_RAILS, readChoke, resolveRails, inChokeLane, railRunRead } from './Chokepoint';

describe('the chokepoint court', () => {
  it('reads its switch off the url', () => { expect(readChoke('?choke=1')).toBe(true); expect(readChoke('?choke=on')).toBe(true); expect(readChoke('?tier=rookie')).toBe(false); expect(readChoke('')).toBe(false); });
  it('a body inside a rail is pushed out along the shallower axis; outside it is left alone', () => {
    const r = CHOKE_RAILS[1];
    const p = { x: r.x - 0.1, z: r.z };
    expect(resolveRails(p, 0.4)?.id).toBe('rail-r'); expect(p.x).toBeCloseTo(r.x - r.halfX - 0.4, 6); expect(p.z).toBe(r.z);
    const q = { x: 0, z: 6 }; expect(resolveRails(q, 0.4)).toBeNull(); expect(q.x).toBe(0);
    const w = { x: CHOKE_RAILS[2].x, z: CHOKE_RAILS[2].z + 0.2 }; resolveRails(w, 0.4); expect(w.z).toBeCloseTo(CHOKE_RAILS[2].z + CHOKE_RAILS[2].halfZ + 0.4, 6);
  });
  it('the lane sits between the rails', () => { expect(inChokeLane({ x: 0, z: 6 })).toBe(true); expect(inChokeLane({ x: 4, z: 6 })).toBe(false); expect(inChokeLane({ x: 0, z: 12 })).toBe(false); expect(CHOKE.draftGain).toBeGreaterThan(1); });
  it('a run along a rail beside it is a rail run; across it or slow is not', () => {
    const r = CHOKE_RAILS[0];
    expect(railRunRead({ x: r.x + r.halfX + 0.4, z: r.z }, { x: 0, z: -5 })?.id).toBe('rail-l');
    expect(railRunRead({ x: r.x + r.halfX + 0.4, z: r.z }, { x: 5, z: 0 })).toBeNull();
    expect(railRunRead({ x: r.x + r.halfX + 0.4, z: r.z }, { x: 0, z: -2 })).toBeNull();
    expect(railRunRead({ x: 0, z: 6 }, { x: 0, z: -5 })).toBeNull();
  });
});
