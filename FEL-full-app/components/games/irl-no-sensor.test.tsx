// QA P1-22 (2026-09-27): Hang Time with no motion sensor (a desktop browser: DeviceMotionEvent exists and never fires)
// went LIVE, counted nothing, and ended on "push off harder". It says there is no sensor now; the jump advice stays for a
// session that did hear the sensor and saw no clean jump.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NO_SENSOR_COPY, NoSensorScreen, ResultsScreen, SENSOR_WAIT_MS, isMotionSample } from './irl-game';
import { summarise } from '@/lib/babylon/core/IRLCore';

describe('Hang Time without a motion sensor', () => {
  it('no events: the no-sensor screen, with a way back', () => {
    const m = renderToStaticMarkup(createElement(NoSensorScreen, { reason: null, onRetry: () => {} }));
    expect(m).toContain(NO_SENSOR_COPY);
    expect(m).toContain('No motion sensor found. Hang Time needs a phone with motion access.');
    expect(m).toMatch(/Try again/);
    expect(m).toMatch(/href="\/creator"/);
    expect(m).not.toMatch(/push off harder/);
  });

  it('permission refused: the same screen, saying why', () => {
    const m = renderToStaticMarkup(createElement(NoSensorScreen, { reason: 'Motion access was denied. Enable it in your browser settings to measure jumps.', onRetry: () => {} }));
    expect(m).toContain(NO_SENSOR_COPY);
    expect(m).toContain('Motion access was denied');
  });

  it('events but no jump: the existing advice', () => {
    const m = renderToStaticMarkup(createElement(ResultsScreen, { session: summarise([]), onReplay: () => {}, onMenu: () => {} }));
    expect(m).toMatch(/No clean jumps detected\. Secure the phone and push off harder/);
    expect(m).not.toContain(NO_SENSOR_COPY);
  });

  it('a sample is an event with a reading; a sensorless event (nulls) is not', () => {
    expect(isMotionSample({ accelerationIncludingGravity: { x: 0.1, y: 9.8, z: 0.2 } })).toBe(true);
    expect(isMotionSample({ accelerationIncludingGravity: { x: null, y: null, z: null } })).toBe(false);
    expect(isMotionSample({ accelerationIncludingGravity: null })).toBe(false);
  });

  it('the wait is ~1.5 s from the start, and the live session hands off to the no-sensor screen', () => {
    expect(SENSOR_WAIT_MS).toBe(1500);
    const src = readFileSync(path.resolve(__dirname, 'irl-game.tsx'), 'utf8');
    expect(src).toMatch(/if \(sawMotionRef\.current\) return;[\s\S]{0,200}setPhase\('no-sensor'\);[\s\S]{0,20}\}, SENSOR_WAIT_MS\);/);
    expect(src).toContain("if (!sawMotionRef.current) { setPhase('no-sensor'); return; }");   // End pressed inside the wait
  });
});
