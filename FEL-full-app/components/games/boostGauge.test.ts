// The boost gauge in play (controls-screen-2, console-view lane, 2026-10-06). Owner: "the boost gauge's caption ('HOLD
// RB · SHIFT', the 'FILLS …' lines) still shows during play. Take that text off the play screen. The meter itself stays,
// as a clean bar or icon with no instruction text."
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoostGauge } from './boost-hud';
import { PAD_BOOST_HINT, SKATE_BODY_BOOST_HINT } from '@/lib/babylon/modes/rideHud';

const gauge = (hud: Record<string, string | number | boolean>): string => renderToStaticMarkup(createElement(BoostGauge, { hud }));
const text = (html: string): string => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '');

describe('BoostGauge — the meter, and no instruction text', () => {
  it('no caption: not the keys, not a mode\'s boostHint, not the empty tank\'s "earn it"', () => {
    for (const hud of [
      { boost: 40 },
      { boost: 40, boostHint: PAD_BOOST_HINT },
      { boost: 40, boostHint: SKATE_BODY_BOOST_HINT },
      { boost: 40, boostHint: 'FILLS FROM GATES + TRICKS' },
      { boost: 0, boostDenied: true },
    ]) {
      const t = text(gauge(hud));
      expect(t, JSON.stringify(hud)).toMatch(/^BOOST( EMPTY)?$/);
      expect(t).not.toMatch(/HOLD|SHIFT|FILL|EARN|RB/);
    }
  });

  it('the meter stays: its bar at the tank\'s level, and the state word (BOOST, BOOST READY, BOOSTING, BOOST EMPTY)', () => {
    expect(gauge({ boost: 40 })).toContain('width:40%');
    expect(text(gauge({ boost: 100, boostFull: true }))).toBe('BOOST READY');
    expect(text(gauge({ boost: 60, boosting: true }))).toBe('BOOSTING');
    expect(text(gauge({ boost: 0, boostDenied: true }))).toBe('BOOST EMPTY');
    expect(gauge({})).toBe('');   // no tank in the HUD, no gauge
  });
});
