import { describe, it, expect } from 'vitest';
import { iconForDiscipline, readPlayerIcon } from './playerIcon';
describe('playerIcon', () => {
  it('maps disciplines to the glyphs the owner named', () => {
    expect(iconForDiscipline('onevone')).toBe('basketball'); expect(iconForDiscipline('dunk')).toBe('basketball');
    expect(iconForDiscipline('studio')).toBe('music'); expect(iconForDiscipline('dance')).toBe('dance');
    expect(iconForDiscipline('scene')).toBe('camera'); expect(iconForDiscipline('brainbrawl')).toBe('controller');
  });
  it('with no window and no record, a gamer', () => { expect(readPlayerIcon()).toBe('controller'); });
});
