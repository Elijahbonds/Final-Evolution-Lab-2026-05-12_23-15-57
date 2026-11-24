// Look pass C3 (lane/look-world): the Closet held sideways (ui.closetSideways)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLOSET_SIDEWAYS, walkthroughPlaces } from './sideways';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';

describe('ui.closetSideways (look pass C3)', () => {
  it('the knob: on by default, the shipped constant; 0 is today', () => {
    const k = FEEL_KNOB_BY_ID.get('ui.closetSideways')!;
    expect(k.def).toBe(CLOSET_SIDEWAYS);
    expect(k.min).toBe(0);
  });

  it('off adds nothing to either place (the layout exactly as before)', () => {
    expect(walkthroughPlaces(false)).toEqual({ stage: '', editor: '' });
  });

  it('on: hidden over the stage and shown in the editor, only on a short sideways screen', () => {
    const on = walkthroughPlaces(true);
    expect(on.stage).toBe('[@media(orientation:landscape)_and_(max-height:520px)]:hidden');
    expect(on.editor).toBe('[@media(orientation:landscape)_and_(max-height:520px)]:block');
    // Tailwind only emits what it finds spelled whole in the source
    const src = readFileSync('components/closet/sideways.ts', 'utf8');
    expect(src).toContain(`'${on.stage}'`);
    expect(src).toContain(`'${on.editor}'`);
  });

  it('the Closet wires both places, the same card each time', () => {
    const src = readFileSync('components/closet-view.tsx', 'utf8');
    expect(src).toContain('setSideways(closetSidewaysOn())');
    expect(readFileSync('lib/ui/closetSideways.ts', 'utf8')).toContain("feel('ui.closetSideways', CLOSET_SIDEWAYS)");
    expect(src).toContain('max-md:hidden ${walkAt.stage}');
    expect(src).toContain('md:hidden ${walkAt.editor}');
    expect((src.match(/<WalkthroughCard /g) ?? []).length).toBe(2);
  });
});
