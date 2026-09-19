import { describe, it, expect } from 'vitest';
import { readCourtLayout, COURT_LAYOUTS } from './courtLayout';
describe('the court layout pick', () => {
  it('reads the url first, only for the modes that have layouts', () => {
    expect(readCourtLayout('threevthree', '?choke=1')).toBe('chokepoint');
    expect(readCourtLayout('threevthree', '?court=chokepoint')).toBe('chokepoint');
    expect(readCourtLayout('threevthree', '?choke=0')).toBe('open');
    expect(readCourtLayout('threevthree', '')).toBe('open');
    expect(readCourtLayout('onevone', '?choke=1')).toBe('open');
    expect(COURT_LAYOUTS.map((l) => l.id)).toEqual(['open', 'chokepoint']);
  });
});
