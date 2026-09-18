// A cosmetic must never be the thing that breaks a game, and a picker must never offer something broken.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  BALL_SKIN_IDS, BALL_SKINS, readyBallSkins, isBallSkinId, hexToRgb01, cycleTint,
} from './ballSkins';

describe('the ball list', () => {
  it('every id has a skin, and every skin knows its own id', () => {
    for (const id of BALL_SKIN_IDS) expect(BALL_SKINS[id].id).toBe(id);
  });

  it('every offered skin has a label, a tint and a line of its own', () => {
    for (const s of readyBallSkins()) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.tint).toMatch(/^#[0-9a-f]{6}$/i);
      expect(s.sub.length).toBeGreaterThan(8);
    }
  });

  it('the classic is always offered — there is always a ball', () => {
    expect(BALL_SKINS.classic.ready).toBe(true);
    expect(readyBallSkins().map((s) => s.id)).toContain('classic');
  });

  it('the owner asked for the rainbow and the hoopbus by name, and both are offered', () => {
    expect(BALL_SKINS.rainbow.ready).toBe(true);
    expect(BALL_SKINS.hoopbus.ready).toBe(true);
  });

  it('the picker offers more than one thing, or it is not a picker', () => {
    expect(readyBallSkins().length).toBeGreaterThan(1);
  });

  it('garbage is not a skin id', () => {
    for (const v of ['nope', '', null, undefined, 42, {}]) expect(isBallSkinId(v)).toBe(false);
  });
});

describe('colour handling never throws', () => {
  it('reads a normal hex', () => {
    expect(hexToRgb01('#ff0000')).toEqual({ r: 1, g: 0, b: 0 });
    expect(hexToRgb01('00ff00').g).toBe(1);
  });

  it('returns white on garbage rather than throwing — a cosmetic must not break a mode', () => {
    for (const bad of ['', 'red', '#ggg', '#12345', 'rgb(1,2,3)']) {
      expect(() => hexToRgb01(bad)).not.toThrow();
      expect(hexToRgb01(bad)).toEqual({ r: 1, g: 1, b: 1 });
    }
  });

  it('every shipped tint parses', () => {
    for (const s of readyBallSkins()) {
      expect(hexToRgb01(s.tint)).not.toEqual({ r: 1, g: 1, b: 1 });
      if (s.tint2) expect(hexToRgb01(s.tint2)).not.toEqual({ r: 1, g: 1, b: 1 });
    }
  });
});

describe('the rainbow cycles on SPIN, not on a clock', () => {
  it('a ball that is not spinning does not change colour — a still ball must not strobe', () => {
    expect(cycleTint(0)).toBe(cycleTint(0));
    expect(cycleTint(2.5)).toBe(cycleTint(2.5));
  });

  it('spinning moves the hue', () => {
    expect(cycleTint(0)).not.toBe(cycleTint(1.5));
  });

  it('it wraps instead of running off the end', () => {
    expect(cycleTint(1000)).toMatch(/^#[0-9a-f]{6}$/);
    expect(cycleTint(-1000)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('it always produces a parseable colour, at any spin', () => {
    for (let s = 0; s < 20; s += 0.37) {
      expect(hexToRgb01(cycleTint(s))).not.toEqual({ r: 1, g: 1, b: 1 });
    }
  });
});

describe('the pick lives on the SAME screen as the map', () => {
  // The owner's ask was specifically "on the same screen as their map". That is a structural claim about
  // one component, so it is checked against the source: a browser check was not possible here — the player
  // route is auth-gated and the dev page that mounts BootSplash sits in a "graphics were reset" error
  // branch in this environment, so neither could show the rows rendering.
  const splash = fs.readFileSync(path.resolve(__dirname, '../../../components/games/boot-splash.tsx'), 'utf8');

  it('the boot splash renders a BALL row as well as a LOCATION row', () => {
    expect(splash).toMatch(/>LOCATION</);
    expect(splash).toMatch(/>BALL</);
  });

  it('both rows are gated the same way, so they appear TOGETHER or not at all', () => {
    const gate = /isCourt && \(props\.phase === 'ready' \|\| props\.phase === 'loading'\)/g;
    expect((splash.match(gate) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('the ball row only offers skins the picker says are ready', () => {
    expect(splash).toMatch(/readyBallSkins\(\)/);
  });

  it('choosing a ball does NOT reload the route, unlike choosing a location', () => {
    // the location swaps the mounted venue so it reloads; the ball is read when the mode dresses it, so a
    // reload there would be a visible hitch for no reason
    const pick = splash.slice(splash.indexOf('const pickBall'), splash.indexOf('const pickBall') + 240);
    expect(pick).not.toMatch(/location\.assign|reload/);
  });

  it('every skin is reachable from the picker with a label and a swatch', () => {
    for (const s of readyBallSkins()) expect(s.label).toMatch(/^[A-Z]+$/);
  });
});
