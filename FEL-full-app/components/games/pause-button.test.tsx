// gameplay-clean (2026-10-28): the on-screen pause. It shows only while a harness game plays or is paused, and it pauses
// the way the keyboard does: ESC on the window, which the InputBus reads as START (and the harness pauses / resumes on).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PauseButton, pressStart, PAUSE_GLYPH } from './pause-button';
import { sessionStore } from '@/lib/babylon/core/sessionStore';
import { InputBus, type FelInput } from '@/lib/babylon/core/InputBus';
import { controlRows } from '@/lib/ui/controlsScreen';

const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
beforeEach(() => { for (const k of ['window', 'KeyboardEvent', 'requestAnimationFrame', 'cancelAnimationFrame']) saved[k] = g[k]; });
afterEach(() => { for (const k of Object.keys(saved)) g[k] = saved[k]; });

describe('the pause button', () => {
  it('draws nothing until a harness game is playing; Pause while playing, Resume while paused', () => {
    expect(renderToStaticMarkup(h(PauseButton))).toBe('');
    const w = sessionStore.mount({ modeId: 'golf', key: 'golf', lines: [], drives: false, later: null });
    w.setPhase('ready');
    expect(renderToStaticMarkup(h(PauseButton))).toBe('');
    w.setPhase('playing');
    const m = renderToStaticMarkup(h(PauseButton));
    expect(m).toContain('aria-label="Pause"');
    expect(m).toContain('data-fel-pause');
    w.setPhase('paused');
    expect(renderToStaticMarkup(h(PauseButton))).toContain('aria-label="Resume"');
    w.setPhase('ended');
    expect(renderToStaticMarkup(h(PauseButton))).toBe('');
  });

  it('presses START through the InputBus, as ESC does on the keys', () => {
    let keyHandler: ((ev: { key: string; type: string; preventDefault: () => void }) => void) | null = null;
    const win = {
      addEventListener: (type: string, fn: unknown) => { if (type === 'keydown') keyHandler = fn as typeof keyHandler; },
      removeEventListener: () => {},
      dispatchEvent: (ev: { key: string; type: string }) => { keyHandler?.({ key: ev.key, type: ev.type, preventDefault: () => {} }); return true; },
    };
    g.window = win;
    g.KeyboardEvent = class { constructor(public type: string, init: { key: string }) { (this as unknown as { key: string }).key = init.key; } };
    g.requestAnimationFrame = () => 0; g.cancelAnimationFrame = () => {};
    const bus = new InputBus();
    const seen: FelInput[] = [];
    bus.on((e) => seen.push(e));
    bus.start();
    pressStart(win as unknown as Window);
    expect(seen).toEqual([
      { t: 'button', btn: 'START', pressed: true },
      { t: 'button', btn: 'START', pressed: false },
    ]);
    bus.stop();
  });

  it('the touch CONTROLS list names it', () => {
    expect(controlRows('golf', 'touch').find((r) => r.action === 'PAUSE')?.input).toBe(PAUSE_GLYPH);
  });
});
