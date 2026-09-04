import { describe, expect, it } from 'vitest';
import { applyKit, kitOf } from './kit';

const mesh = (name: string) => ({ name, isVisible: true }) as unknown as import('@babylonjs/core').AbstractMesh;

describe('kit', () => {
  it('parses kit mesh names and ignores the rest', () => {
    expect(kitOf('Kit_tops_top_lab')).toEqual({ slot: 'tops', itemId: 'top_lab' });
    expect(kitOf('Kit_shoes_shoes_evo_c12')).toEqual({ slot: 'shoes', itemId: 'shoes_evo_c12' });
    expect(kitOf('Body_c10')).toBeNull(); expect(kitOf('Hair_afro')).toBeNull();
  });
  it('shows the equipped garment per slot and hides the others', () => {
    const ms = [mesh('Kit_tops_top_lab'), mesh('Kit_tops_top_bonds'), mesh('Kit_shorts_shorts_court'), mesh('Kit_shorts_shorts_glitch'), mesh('Body')];
    expect(applyKit(ms, { tops: 'top_bonds', shorts: 'shorts_court' })).toBe(4);
    expect(ms.map((m) => m.isVisible)).toEqual([false, true, true, false, true]);
  });
  it('falls back to the first garment when nothing (or something unknown) is equipped', () => {
    const ms = [mesh('Kit_tops_top_lab'), mesh('Kit_tops_top_bonds')];
    applyKit(ms, null); expect(ms.map((m) => m.isVisible)).toEqual([true, false]);
    applyKit(ms, { tops: 'top_from_the_future' }); expect(ms.map((m) => m.isVisible)).toEqual([true, false]);
  });
  it('is a no-op on a body without kit meshes', () => {
    const ms = [mesh('jersey'), mesh('shorts')]; expect(applyKit(ms, { tops: 'top_lab' })).toBe(0); expect(ms.every((m) => m.isVisible)).toBe(true);
  });
});
