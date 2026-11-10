// SCREEN-FIXES (2026-11-10): the hydration mismatch on every game screen (React error #425, 32 screens on the
// every-screen scorecard). GameShell mounts GameCaptureHud on every game, and the HUD put its stream-frame CSS in a
// <style> as a TEXT child. React 18's server renderer escapes text (`"` → `&quot;`), but the HTML parser reads a
// <style> as raw text and never decodes it, so the phone's DOM held `[data-fel-stream=&quot;1&quot;]` while React's
// first client render held `[data-fel-stream="1"]`: a text mismatch at hydration, and broken CSS until React redrew it.
//
// What a browser sees is the raw bytes between <style> and </style>: this test reads exactly those from the server's
// HTML and holds them to the CSS the client renders.
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createRef } from 'react';
import { GameCaptureHud } from './game-capture-hud';
import { STREAM_FRAME_CSS } from './capture-hud-view';

/** The raw text of every <style> in an HTML string, as the HTML parser keeps it (no entity decoding). */
const styleTexts = (html: string) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);

describe('the capture HUD on the server (every game screen)', () => {
  it('writes its stream-frame CSS byte for byte, so the first client render matches the server HTML', () => {
    const html = renderToString(<GameCaptureHud mode="dunkContest" stageRef={createRef<HTMLDivElement>()} streamOn={false} onStreamMode={() => {}} />);
    const styles = styleTexts(html);
    expect(styles).toContain(STREAM_FRAME_CSS);
    for (const s of styles) expect(s, 'an HTML entity inside a <style> is drawn as text, not decoded').not.toMatch(/&(quot|amp|lt|gt|#x27|#39);/);
  });

  it('the CSS carries the characters React escapes (so the test above is not vacuous)', () => {
    expect(STREAM_FRAME_CSS).toMatch(/["]/);
  });
});
