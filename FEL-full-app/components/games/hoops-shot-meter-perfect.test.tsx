// lane/hoops-shot-core (owner, 2026-10-20): the PERFECT band inside the green on the 1v1 / 3v3 HUD bar — the band release() grades.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HoopsShotMeter, shotMeterPerfect } from './hoops-shot-meter';
import { perfectHud } from '@/lib/babylon/core/ShotWindow';
import { ShotMeter } from '@/lib/babylon/core/BasketballCore';
import { PERFECT_BAND_SHARE } from '@/lib/babylon/core/shotBands';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/&amp;/g, '&');

describe('the perfect band on the HUD bar', () => {
  it('is centred on the green at the half-width the mode publishes', () => {
    const p = shotMeterPerfect('0.7,0.08', '0.028');
    expect(p?.from).toBeCloseTo(0.672, 10);
    expect(p?.to).toBeCloseTo(0.728, 10);
  });

  it('never spills out of the green, and draws nothing for a dunk bar (\'\') or junk', () => {
    const p = shotMeterPerfect('0.7,0.08', 0.5);
    expect(p?.from).toBeCloseTo(0.62, 10); expect(p?.to).toBeCloseTo(0.78, 10);
    for (const bad of ['', undefined, null, 'x', -0.1, 0]) expect(shotMeterPerfect('0.7,0.08', bad)).toBeNull();
    expect(shotMeterPerfect(undefined, '0.03')).toBeNull();
  });

  it('the band drawn IS the band graded: the mode publishes the real meter\'s green × PERFECT_BAND_SHARE', () => {
    const m = new ShotMeter(); m.start(0.3, 'jumper', 0.12);
    expect(Number(perfectHud(m.greenHalfWidth01))).toBeCloseTo(m.greenHalfWidth01 * PERFECT_BAND_SHARE, 3);
    // a release on the edge of the drawn band grades perfect; just past it, good
    const edge = m.greenHalfWidth01 * PERFECT_BAND_SHARE;
    const a = new ShotMeter(); a.start(0.3, 'jumper', 0.12); a.update((m.greenCenter01 + edge * 0.98) * a.durationSec); expect(a.release()).toBe('perfect');
    const b = new ShotMeter(); b.start(0.3, 'jumper', 0.12); b.update((m.greenCenter01 + edge * 1.05) * b.durationSec); expect(b.release()).toBe('good');
  });

  it('renders the green and the perfect band inside it; without a perfect band, the green alone (as before)', () => {
    const both = html(h(HoopsShotMeter, { t: 0.5, green: '0.7,0.08', perfect: '0.028' }));
    expect(both).toContain('left:62%');      // the green
    expect(both).toContain('width:16%');
    expect(both).toContain('left:67.2%');    // the perfect band
    expect(both).toContain('width:5.6%');
    const green = html(h(HoopsShotMeter, { t: 0.5, green: '0.7,0.08' }));
    expect(green).toContain('left:62%');
    expect(green).not.toContain('left:67.2%');
  });

  it('both hosts hand the bar the mode\'s perfect band', () => {
    for (const f of ['basketball-babylon.tsx', 'three-v-three-babylon.tsx']) {
      expect(readFileSync(path.resolve(__dirname, f), 'utf8')).toContain('perfect={hud.shotMeterPerfect}');
    }
  });
});
