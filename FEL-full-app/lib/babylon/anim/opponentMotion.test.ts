import { describe, it, expect } from 'vitest';
import { OPPONENT_VARIANTS, variantFor, HERO_CAPTURE, CAPTURE_RELEASE_01, releaseFrameOf } from './opponentMotion';
import { MOCAP_OPPONENT_CLIPS } from './authored/mocapOpponents';
import { scopeAllows, scopeForMode } from './clipScope';

describe('opponentMotion — an opponent plays the capture that replaces the authored clip it asked for', () => {
  it('every capture is reachable from the authored clip it replaces, and two captures for one clip belong to different sports', () => {
    const all = [...OPPONENT_VARIANTS.values()].flat();
    expect(all.sort()).toEqual(MOCAP_OPPONENT_CLIPS.map((c) => c.name).sort());
    for (const [, list] of OPPONENT_VARIANTS) expect(new Set(list.map((n) => n.split('_mc_')[0])).size).toBe(list.length);
  });

  it('swaps only when the rig owns the capture', () => {
    const owned = new Set(['bball_crossover_left', 'bball_mc_crossover_left', 'jumpshot']);
    expect(variantFor('bball_crossover_left', owned)).toBe('bball_mc_crossover_left');
    expect(variantFor('jumpshot', owned)).toBe('jumpshot');            // capture not built on this rig: authored stays
    expect(variantFor('idle_stand', owned)).toBe('idle_stand');
  });

  it('follows an alias only for a clip the rig does not own itself', () => {
    // bball_dribble_run → run (alias) and the rig has no bball_dribble_run: the capture for the ALIAS request is used
    const owned = new Set(['run', 'bball_mc_run', 'bball_mc_dribble_run']);
    expect(variantFor('bball_dribble_run', owned)).toBe('bball_mc_dribble_run');   // its own capture wins
    // a registered clip whose alias target has a capture keeps its OWN clip (idle_stand aliases to guard)
    const owned2 = new Set(['idle_stand', 'jab', 'bball_mc_jab_for_test']);
    expect(variantFor('idle_stand', owned2)).toBe('idle_stand');
  });

  it('a capture is in scope exactly where the clip it stands in for is (a hoops foe gets the captured flinch, a board rival gets no hoops captures)', () => {
    const hoops = scopeForMode('onevone'), board = scopeForMode('skateboard');
    expect(scopeAllows(hoops, 'karate_hit_react')).toBe(true);
    expect(scopeAllows(hoops, 'karate_mc_hit_react')).toBe(true);
    expect(scopeAllows(hoops, 'karate_mc_guard_step')).toBe(false);    // not borrowed → its capture is not either
    expect(scopeAllows(board, 'bball_mc_crossover_left')).toBe(false);
  });

  it('HOOPS MOVEMENT + THE HUNDRED: the hero takes the hoops and fight captures, and a shot paces off the release of the clip that plays', () => {
    const hero = MOCAP_OPPONENT_CLIPS.filter((c) => HERO_CAPTURE(c.name)).map((c) => c.name);
    expect(hero.length).toBeGreaterThanOrEqual(18);   // 14 from the opponents' pass + pump fake, step-through, pivot, left layup
    expect(hero.every((n) => n.startsWith('bball_mc_') || n.startsWith('karate_mc_') || n.startsWith('dunk_mc_'))).toBe(true);
    expect(HERO_CAPTURE('dunk_mc_tomahawk')).toBe(true);                // MOCAP DUNKS (2026-09-18): the captured dunks play on the hero in every hoops mode
    for (const n of ['dunk_mc_tomahawk', 'dunk_mc_windmill', 'dunk_mc_power', 'dunk_mc_reverse', 'dunk_mc_two_hand']) expect(MOCAP_OPPONENT_CLIPS.some((c) => c.name === n), n).toBe(true);
    expect(HERO_CAPTURE('karate_mc_jab')).toBe(true);                    // THE HUNDRED: the fighter's strikes are captures too
    expect(HERO_CAPTURE('football_mc_run')).toBe(false);                 // football and boards stay the opponents' for now
    for (const n of Object.keys(CAPTURE_RELEASE_01)) expect(MOCAP_OPPONENT_CLIPS.some((c) => c.name === n), n).toBe(true);
    const withCapture = { clipNames: new Set(['jumpshot', 'bball_mc_jumpshot']) } as never;
    const authoredOnly = { clipNames: new Set(['jumpshot']) } as never;
    expect(releaseFrameOf(withCapture, 'jumpshot', 0.45)).toBe(CAPTURE_RELEASE_01.bball_mc_jumpshot);
    expect(releaseFrameOf(authoredOnly, 'jumpshot', 0.45)).toBe(0.45);
  });

  it('THE HUNDRED: every named move plays its OWN motion — no two strings share a clip, and each has a capture', async () => {
    const { MOVES } = await import('../core/HordeDynamics');
    // STORM COMBOS (2026-09-17): the AIR links and the SLAMs are situational variants of a grounded move (the air jab IS the jab
    // thrown at a launched body; the spike is the hammer coming down) — they share its capture by design and sit out this check
    const named = Object.values(MOVES).filter((m) => !m.air && !m.slam && !m.aerial && !m.authored);   // jump attacks reuse a grounded capture; the elbows are authored pose clips
    const clips = named.map((m) => m.clip);
    // the one intended share: jab and cross are different clips, the uppercut ender is its own capture
    expect(new Set(clips).size).toBe(clips.length);
    const owned = new Set(MOCAP_OPPONENT_CLIPS.map((c) => c.name));
    for (const m of Object.values(MOVES)) if (!m.authored) expect(variantFor(m.clip, owned), `${m.id} → ${m.clip}`).toMatch(/^karate_mc_/);
  });
});
