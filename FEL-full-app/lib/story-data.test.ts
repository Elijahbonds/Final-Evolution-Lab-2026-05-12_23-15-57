// EVERY STORY NODE OPENS A REAL GAME THAT POSTS A SESSION IN ITS MODE.
//
// HOTFIX (2026-09-24): four zones shipped naming modes with no route — basketball, skate, fitness, skilllab — so 16
// of the 52 nodes opened a 404, the first node of the campaign among them. Nothing failed: story-map.tsx just pushes
// `/play/${node.mode}` and trusts it. These tests walk the real app directory, the way lib/nav/reachability.test.ts
// does, so a node can never again name a route that is not there.
//
// A route existing is not enough on its own. /play/calibrate exists and would have passed the first test, but it
// mounts no GameShell, posts no session, and so could never complete a node — the second test is the one that
// catches that. The third holds the completion route's mode check (storySessionMode) to what each host actually
// posts, read out of its loader rather than trusted from a table.
//
// What these do NOT prove is that a node's TARGET can be reached in that session — a route that posts a session on
// the wrong scale dead-ends just the same (the remapped Blacktop did: a 1v1 posts 11, the node asked 400). That is
// lib/story-yardstick.test.ts, which holds all 52 targets under their mode's own evidence.

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAMPAIGN, TOTAL_NODE_COUNT, getAllNodes } from './story-data';
import { storySessionMode } from './progression';
import { stripComments } from './testing/sourceScan';

const PLAY = join(__dirname, '..', 'app', 'play');

/** The `mode` prop every <GameShell> under app/play/<route> is mounted with — what its sessions are stored under. */
function shellModesFor(route: string): string[] {
  const dir = join(PLAY, route, '_components');
  if (!existsSync(dir)) return [];
  const modes: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!/\.tsx?$/.test(f) || /\.test\.tsx?$/.test(f)) continue;
    const src = stripComments(readFileSync(join(dir, f), 'utf8'));
    for (const m of src.matchAll(/<GameShell\b[^>]*?\bmode="([^"]+)"/g)) modes.push(m[1]);
  }
  return modes;
}

describe('the Nexus Initiative only opens games that exist', () => {
  const nodes = getAllNodes();

  it('covers the whole campaign', () => {
    expect(nodes.length).toBe(TOTAL_NODE_COUNT);
    expect(nodes.length).toBe(52);
  });

  it('every node opens an app/play/<mode> route that has a page', () => {
    const dead = nodes.filter((n) => !existsSync(join(PLAY, n.mode, 'page.tsx'))).map((n) => `${n.id} → /play/${n.mode}`);
    expect(dead, 'these nodes push the player to a route that does not exist').toEqual([]);
  });

  it('every node\'s route mounts a GameShell — the only thing that posts the session a node is completed by', () => {
    const sessionless = [...new Set(nodes.map((n) => n.mode))].filter((m) => shellModesFor(m).length === 0);
    expect(sessionless, 'these routes never post a GameSession, so a node on them can never complete').toEqual([]);
  });

  it('the completion check expects the mode each host actually posts under', () => {
    for (const zone of CAMPAIGN.zones) {
      expect(shellModesFor(zone.mode), `${zone.id} (/play/${zone.mode})`).toContain(storySessionMode(zone.boss));
    }
  });

  it('the four dead zones are remapped (owner defaults, except the Lab: Free Run, not the session-less calibration tapper)', () => {
    const modeOf = Object.fromEntries(CAMPAIGN.zones.map((z) => [z.id, z.mode]));
    expect(modeOf).toMatchObject({ blacktop: 'onevone', skateBowl: 'skateboard', gymDome: 'training', labHub: 'freerun' });
  });
});
