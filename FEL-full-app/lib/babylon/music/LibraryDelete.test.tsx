// MUSIC-SUITE P3 (2026-09-25): the LIBRARY's DELETE asks first, says what it did, and names the walk-out.
// Driven with the repo's no-DOM helpers (tests/helpers/driveRender.ts): the real component, its real buttons.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import LibraryDelete from './LibraryDelete';
import type { RemoveResult } from './StudioLibrary';
import { button, buttons, drive } from '@/tests/helpers/driveRender';

const track = { id: 'trk_1', title: 'Flight Night', isWalkOut: false };

describe('LibraryDelete', () => {
  it('shows one DELETE and deletes nothing until asked twice', () => {
    const calls: string[] = [];
    const remove = async (id: string): Promise<RemoveResult> => { calls.push(id); return { ok: true, walkOutCleared: false, line: 'Deleted' }; };
    const { html } = drive(() => LibraryDelete({ track, onDone: () => {}, remove }));
    expect(html).toContain('DELETE');
    expect(html).not.toContain('YES, DELETE');
    expect(calls).toEqual([]);
  });

  it('DELETE opens the ask; KEEP IT closes it with nothing removed', () => {
    const calls: string[] = [];
    const remove = async (id: string): Promise<RemoveResult> => { calls.push(id); return { ok: true, walkOutCleared: false, line: 'Deleted' }; };
    const asked = drive(() => LibraryDelete({ track, onDone: () => {}, remove }), [(t) => button(t, /^DELETE$/).props.onClick()]);
    expect(asked.html).toContain('Delete &quot;Flight Night&quot;? This cannot be undone.');
    expect(buttons(asked.tree, /YES, DELETE/)).toHaveLength(1);
    const kept = drive(() => LibraryDelete({ track, onDone: () => {}, remove }), [
      (t) => button(t, /^DELETE$/).props.onClick(),
      (t) => button(t, /KEEP IT/).props.onClick(),
    ]);
    expect(kept.html).not.toContain('YES, DELETE');
    expect(calls).toEqual([]);
  });

  it('YES, DELETE runs the delete and hands the room its line — failures too', async () => {
    const said: Array<[string, boolean]> = [];
    const ok = async (): Promise<RemoveResult> => ({ ok: true, walkOutCleared: true, line: 'Deleted "Flight Night" — you have no walk-out now' });
    const asked = drive(() => LibraryDelete({ track: { ...track, isWalkOut: true }, onDone: (l, k) => said.push([l, k]), remove: ok }),
      [(t) => button(t, /^DELETE$/).props.onClick()]);
    expect(asked.html).toContain('It is your walk-out');
    button(asked.tree, /YES, DELETE/).props.onClick();
    await new Promise((r) => setTimeout(r, 0));
    expect(said).toEqual([['Deleted "Flight Night" — you have no walk-out now', true]]);

    const boom = async (): Promise<RemoveResult> => { throw new TypeError('x'); };
    const again = drive(() => LibraryDelete({ track, onDone: (l, k) => said.push([l, k]), remove: boom }),
      [(t) => button(t, /^DELETE$/).props.onClick()]);
    button(again.tree, /YES, DELETE/).props.onClick();
    await new Promise((r) => setTimeout(r, 0));
    expect(said[1]).toEqual(['Could not delete "Flight Night" (TypeError) — it is still in the library', false]);
  });

  it('renders as an element too (the one-line mount)', () => {
    expect(createElement(LibraryDelete, { track, onDone: () => {} }).props.track.id).toBe('trk_1');
  });
});
