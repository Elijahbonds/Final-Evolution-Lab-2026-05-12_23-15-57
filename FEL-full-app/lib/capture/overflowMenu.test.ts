import { describe, expect, it } from 'vitest';
import { OVERFLOW_CLOSED, hudIndicator, overflowStep } from './overflowMenu';

describe('overflow menu state machine', () => {
  it('starts closed', () => {
    expect(OVERFLOW_CLOSED).toEqual({ open: false, focus: null });
  });

  it('the trigger opens the menu and puts focus on the first item, so a controller press lands in the menu', () => {
    const open = overflowStep(OVERFLOW_CLOSED, { type: 'trigger' });
    expect(open).toEqual({ open: true, focus: 'first-item' });
  });

  it('the trigger again closes the menu and returns focus to the trigger', () => {
    const open = overflowStep(OVERFLOW_CLOSED, { type: 'trigger' });
    const closed = overflowStep(open, { type: 'trigger' });
    expect(closed).toEqual({ open: false, focus: 'trigger' });
  });

  it('Esc closes an open menu and returns focus to the trigger', () => {
    const open = overflowStep(OVERFLOW_CLOSED, { type: 'trigger' });
    expect(overflowStep(open, { type: 'escape' })).toEqual({ open: false, focus: 'trigger' });
  });

  it('Esc while closed is a no-op — the game keeps its keys', () => {
    expect(overflowStep(OVERFLOW_CLOSED, { type: 'escape' })).toBe(OVERFLOW_CLOSED);
  });

  it('an outside tap closes the menu without stealing focus back', () => {
    const open = overflowStep(OVERFLOW_CLOSED, { type: 'trigger' });
    expect(overflowStep(open, { type: 'outside-tap' })).toEqual({ open: false, focus: null });
  });

  it('an outside tap while closed is a no-op', () => {
    expect(overflowStep(OVERFLOW_CLOSED, { type: 'outside-tap' })).toBe(OVERFLOW_CLOSED);
  });

  it('activating an item closes the menu and returns focus to the trigger', () => {
    const open = overflowStep(OVERFLOW_CLOSED, { type: 'trigger' });
    expect(overflowStep(open, { type: 'item-activated' })).toEqual({ open: false, focus: 'trigger' });
  });
});

describe('REC/LIVE indicator', () => {
  it('is dark when nothing is recording or streaming', () => {
    expect(hudIndicator('idle', false)).toEqual({ rec: false, live: false });
    expect(hudIndicator('buffering', false)).toEqual({ rec: false, live: false });
    expect(hudIndicator('ready', false)).toEqual({ rec: false, live: false });
  });

  it('shows REC while a take is recording', () => {
    expect(hudIndicator('recording', false)).toEqual({ rec: true, live: false });
  });

  it('shows LIVE while stream mode is on', () => {
    expect(hudIndicator('idle', true)).toEqual({ rec: false, live: true });
  });

  it('shows both when a recording runs during a stream', () => {
    expect(hudIndicator('recording', true)).toEqual({ rec: true, live: true });
  });
});
