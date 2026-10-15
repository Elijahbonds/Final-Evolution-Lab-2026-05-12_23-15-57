// NetSportMode's volleyball wiring (IMPROVE 2026-10-06, docs/IMPROVEMENTS-2026-10-05.md Volleyball #5, #8, #12, #17):
// the rules are executed in core/VolleyPlay.test.ts; these check the mode actually plays them, by source scan with the
// SAFE comment stripper (lib/testing/sourceScan).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

describe('NetSportMode wiring (source scan, comments stripped)', () => {
  const net = stripComments(fs.readFileSync(path.resolve(__dirname, 'NetSportMode.ts'), 'utf8'));
  const update = net.slice(net.indexOf('update(ctx: ModeContext, dt: number)'));

  // test changed (w3-crowds, 2026-10-14): #8 pinned `crowd?.update(dt)` ahead of the rest pause's return, because the
  // Onlookers only moved when the mode stepped them and the rest skipped the step, so the cheer's hop never played. The
  // Onlookers are replaced by the stands (visual/crowd), which run on their own clock off the scene's render: a cheer plays
  // through any rest by construction. What #8 protected — the cheer is seen after the point — is asserted on that design.
  it('#8: the stands are mounted and never stepped by the mode — the cheer plays through the rest pause', () => {
    expect(net).toMatch(/crowd = mountModeCrowd\(ctx, VOLLEY \? 'volleyball' : 'tennis'\)/);
    expect(update).not.toMatch(/crowd\?\.update\(/);
    expect(net).not.toMatch(/new Onlookers\(/);
  });

  it('#12: the rally cap replays the point instead of awarding it', () => {
    const cap = update.slice(update.indexOf('rallyAge >= RALLY_CAP_SEC'), update.indexOf('rallyAge >= RALLY_CAP_SEC') + 200);
    expect(cap).toMatch(/replayPoint\(ctx\)/);
    expect(cap).not.toMatch(/awardPoint/);
  });

  it('#17: the footwork steps in place — no per-frame spread of the state', () => {
    expect(update).not.toMatch(/stepFootwork\(\{\s*\.\.\.foot/);
    expect(update).toMatch(/stepFootwork\(foot, intent, dt, FOOT, foot\)/);
  });

  it('#5: the player\'s dig of THEIR spike goes through the shared rule at the player\'s shank rate', () => {
    expect(net).toMatch(/degradeDig\(q, 1, HUMAN_SPIKE_SHANK\)/);
    expect(net).toMatch(/degradeDig\(q, steps, AI_SPIKE_SHANK\)/);
  });
});
