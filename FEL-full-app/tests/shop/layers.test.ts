// PLAT-P07 (2026-11-02): every full-screen layer a page opens is drawn at the end of <body> (components/session-player/
// layer.tsx). Inside a page whose <main> animates in (fel-fade: a stacking context), a `fixed z-[70]` layer is stacked
// UNDER the shell's tab bar (z-50) and status rail (z-40). Measured on the rig (scene sigplayer, 390 px): before, the
// signature player's primary button was covered by the tab bar and its close button by the status rail; after, both clear.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const src = (f: string) => readFileSync(f, 'utf8');

describe('full-screen layers sit above the shell', () => {
  it('the signature program page, Today and the buy sheet open their layers through Layer', () => {
    expect(src('components/signature/program-page.tsx')).toMatch(/<Layer><SessionPlayer /);
    expect(src('app/coach/_components/today-view.tsx')).toMatch(/<Layer><CoachSessionPlayer/);
    expect(src('components/shop/buy-sheet.tsx')).toMatch(/<Layer>/);
  });
  it('Layer portals to <body>', () => {
    expect(src('components/session-player/layer.tsx')).toMatch(/createPortal\(children, host\)/);
    expect(src('components/session-player/layer.tsx')).toMatch(/document\.body/);
  });
});
