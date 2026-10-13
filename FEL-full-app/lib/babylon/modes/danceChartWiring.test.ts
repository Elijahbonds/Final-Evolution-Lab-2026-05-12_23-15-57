// MUSIC-SUITE P9 re-land (2026-10-13): how the Cypher uses an authored chart (dance/chart.ts). The decisions are pure and
// tested beside their modules (chart.test.ts, chartPlay.test.ts); this pins the three lines that connect them to the room,
// whose closure needs the whole scene to run (the studioWiring pattern).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.join(__dirname, 'DanceMode.ts'), 'utf8');

describe('DanceMode plays an authored chart\'s density as STYLE', () => {
  it('the style beats are the chart\'s own when the song has one, else the computed groove beats', () => {
    expect(src).toContain('grooves = styleBeatsFor(track) ?? grooveBeats(routine);');
  });
  it('a press is asked first whether it is a STYLE tap (styleTapAt), and one pays GROOVE_STYLE into the style tally only', () => {
    const at = src.indexOf('function pressAt(');
    const body = src.slice(at, src.indexOf('\n  }\n', at));
    const tap = body.indexOf('styleTapAt(grooves, near, heardNow,');
    expect(tap).toBeGreaterThan(0);
    expect(body.indexOf('style += GROOVE_STYLE;')).toBeGreaterThan(tap);
    expect(body.indexOf('return;')).toBeGreaterThan(body.indexOf('style += GROOVE_STYLE;'));      // a STYLE tap never reaches perf.hit
    expect(body.indexOf('perf.hit(heardNow)')).toBeGreaterThan(body.indexOf('return;'));
    expect(body).not.toMatch(/perf\.score|perf\.combo|score \+=/);                                // …and never touches the score
  });
  it('the style tally is its own: finish() reports it beside the score, never inside it', () => {
    expect(src).toMatch(/style,\n\s+chartLevel:/);
    expect(src).not.toMatch(/ctx\.(end|card)\([^)]*\+ style/);
  });
});
