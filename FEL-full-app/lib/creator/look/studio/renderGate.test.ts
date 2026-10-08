// CREATOR-PLAN phase 4d: render on demand — draw while something changes or moves, hold the frame otherwise.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IDLE_GRACE, KICK_MS, RenderGate } from './renderGate';
import { STUDIO_POSES, STUDIO_VENUES } from './poses';
import { MOODS } from '../../../babylon/scene/moods';

describe('the gate', () => {
  it('draws through the idle grace after it opens, then holds the frame', () => {
    let t = 0; const g = new RenderGate(() => t);
    expect(g.due()).toBe(true);
    t = IDLE_GRACE + 1;
    expect(g.due()).toBe(false);
    expect(g.skipped).toBe(1); expect(g.frames).toBe(1);
  });
  it('an edit draws for KICK_MS; an interaction for the idle grace', () => {
    let t = 100_000; const g = new RenderGate(() => t);
    t += IDLE_GRACE + 1; expect(g.due()).toBe(false);
    g.kick(); t += KICK_MS - 1; expect(g.due()).toBe(true);
    t += 2; expect(g.due()).toBe(false);
    g.touch(); t += IDLE_GRACE - 1; expect(g.due()).toBe(true);
  });
  it('a hold draws until released, and releasing kicks a last stretch (the frame settles)', () => {
    let t = 100_000; const g = new RenderGate(() => t);
    t += IDLE_GRACE + 1;
    g.hold('turntable'); t += 60_000;
    expect(g.due()).toBe(true);
    expect(g.reasons()).toEqual(['turntable']);
    g.hold('turntable', false);
    expect(g.due()).toBe(true);
    t += KICK_MS + 1;
    expect(g.due()).toBe(false);
    g.hold('pose', false);   // releasing what is not held changes nothing
    expect(g.due()).toBe(false);
  });
});

describe('poses and venue lights', () => {
  it('the five mode poses and the stand, each a clip the authored registry builds', () => {
    const reg = readFileSync('lib/babylon/anim/authored/index.ts', 'utf8');
    const aliases = readFileSync('lib/babylon/anim/clipAliases.ts', 'utf8');
    expect(STUDIO_POSES.map((p) => p.id)).toEqual(['idle', 'dunkHang', 'fight', 'boardGrab', 'sprintStart', 'victory']);
    for (const p of STUDIO_POSES) {
      if (!p.clip) continue;
      expect(reg.includes(`['${p.clip}'`) || aliases.includes(`  ${p.clip}: [`), p.clip).toBe(true);
    }
  });
  it('every venue is the Studio or a real mood', () => {
    for (const v of STUDIO_VENUES) if (v.id !== 'studio') expect(MOODS[v.id]).toBeTruthy();
    for (const p of STUDIO_POSES) if (p.mood) expect(MOODS[p.mood]).toBeTruthy();
  });
});
