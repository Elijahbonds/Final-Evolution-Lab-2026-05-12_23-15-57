// VERTICAL-EASY (2026-10-27): the live setup card says itself — a picture and ONE big word: the fix in amber, or "Ready" in
// green with a tick; the jump's how-to picture before the countdown. Rendered from the real runner's views.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LiveHud } from '@/app/play/mirror/assess/_components/live-hud';
import { simulateLiveJump } from '@/lib/vertical/sim';
import type { RunnerView } from '@/lib/assess/runner';
import { JUMP_HOW, SETUP_READY, setupHeadline } from '@/lib/vertical/copy';

function first(pick: (v: RunnerView) => boolean, film?: object): RunnerView {
  let got: RunnerView | null = null;
  simulateLiveJump({ fps: 30, seed: 2, trials: [{ heightM: 0.4 }], limitMs: 15_000, ...(film ? { film } : {}), onView: (v) => { if (!got && pick(v)) got = { ...v }; } });
  if (!got) throw new Error('no such view');
  return got;
}
const hud = (v: RunnerView) => renderToStaticMarkup(createElement(LiveHud, { view: v, onPain: () => {}, onTakeoff: () => {}, onStop: () => {} }));

describe('the setup card', () => {
  it('too close: the picture, and one amber word that says the fix', () => {
    const v = first((x) => x.step === 'framing' && !!x.framing && !x.framing.ok && x.framing.worst !== 'noBody', { distance: 2.0 });
    const h = hud(v);
    expect(h).toContain('data-setup-card="fix"');
    expect(h).toContain('data-setup-picture');
    expect(h).toContain(`>${setupHeadline(v.framing, false).word}</p>`);
  }, 30_000);

  it('in the shot: a big green "Ready", no picture, no sentence to read', () => {
    const h = hud(first((x) => x.step === 'position' && x.setupReady));
    expect(h).toContain('data-setup-card="ready"');
    expect(h).toContain(SETUP_READY);
    expect(h).not.toContain('data-setup-picture');
    expect(h).toContain('data-jump-how');                                        // hands on hips, as a picture, before the countdown
    expect(h).toContain(JUMP_HOW);
  }, 30_000);

  it('"Jump!" shows big the moment the countdown ends', () => {
    expect(hud(first((x) => x.step === 'active' && x.flash === 'start'))).toContain('data-jump-go');
  }, 30_000);
});
