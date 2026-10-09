// QA P1-19 (2026-09-27): Beach Sprint's subtitle said "Muscle Beach Gym" over a running track. Its places are Stadium
// Straight (home), Beach Dash and Night Meet; the header and the mode's venue say the place, never the gym. Beach Sprint
// is retired from the v1 roster but still reachable.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MODE_INFO } from './game-data';
import { looksFor } from './babylon/nexus/placeLooks';

describe('Beach Sprint names its track', () => {
  it('the mode\'s venue is its home place', () => {
    expect(MODE_INFO.sprint.venue).toBe(looksFor('sprint')[0].name);
    expect(MODE_INFO.sprint.venue).not.toMatch(/Gym/);
  });
  it('the loader names the place that loads, not the gym', () => {
    const loader = readFileSync(path.resolve(__dirname, '../app/play/sprint/_components/loader.tsx'), 'utf8');
    expect(loader).not.toContain('venue="Muscle Beach Gym"');
    expect(loader).toContain("readPlaceLook('sprint')");
    expect(loader).toContain('venue={venue}');
  });
});
