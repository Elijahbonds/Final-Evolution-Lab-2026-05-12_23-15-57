// GAMEPLAY-CLEAN P2 follow-up (2026-11-03) — the skate goal list is clear of the touch deck's left column (the MOVE stick and the
// d-pad). It was anchored bottom-4 left-4, exactly where TouchOverlay puts that column (bottom-3 left-3), so on a sideways phone the
// list printed over the stick under the player's thumb. It now hangs from the top, under the chip row, the mirror of the meters.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
const BOARD = read('components/games/board-babylon.tsx');
const DECK = read('lib/babylon/ui/TouchOverlay.tsx');

/** The className of the first element carrying `attr` (a data attribute) in a TSX source. */
function classOf(src: string, attr: string): string {
  const m = src.match(new RegExp(`<div[^>]*\\b${attr}\\b[^>]*className="([^"]+)"`));
  if (!m) throw new Error(`no <div ${attr} className="…">`);
  return m[1];
}

describe('the skate goal list stays clear of the left stick', () => {
  it('the deck\'s left column is where the test assumes: bottom-left', () => {
    // the control: if the deck moves, this test must be revisited rather than pass by accident
    expect(DECK).toMatch(/ref=\{colL\} className=\{`pointer-events-auto absolute bottom-3 left-3 /);
  });

  it('the goal list hangs from the TOP, under the chip row — never anchored to the bottom', () => {
    const cls = classOf(BOARD, 'data-goal-list');
    expect(cls).toMatch(/(^|\s)top-24(\s|$)/);
    expect(cls).toMatch(/(^|\s)left-4(\s|$)/);
    expect(cls).not.toMatch(/(^|\s)bottom-/);
    expect(cls).toMatch(/pointer-events-none/);   // it never takes a touch meant for the stage
  });
});
