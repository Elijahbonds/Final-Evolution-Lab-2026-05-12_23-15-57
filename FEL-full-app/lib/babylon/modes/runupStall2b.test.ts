// RUNUP-STALL-2b (2026-10-30), knob dunk.preloadSet (default off): the cut's finalist walks out on a body the preload set up.
// AM's c9e199db trace: finishCut → swapRivalBody set up a whole body (431 + 338 ms) at the start of your final run-up.
// Why not the onlooker's body: the onlookers (grit, volt …) and the finalists (TY = grit, STACK = volt) load the same GLB and
// skeleton, but spawn in different ROLES — a tinted hero-URL spawn is an 'opponent' (opponent captures, a colourway fit, its
// accessories dealt off the tint), a direct roster-URL spawn with no tint is a 'player' (the hero captures). Different clips,
// a different look: so the finalists are pre-spawned hidden instead.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { finalistCandidates } from './dunkContestDefer';
import { PLAYER_ID, newField } from '../core/DunkField';
import { DUNK_RIVALS } from '../core/DunkRivals';

const root = join(__dirname, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const dunk = read('lib/babylon/modes/DunkMode.ts');
const lib = read('lib/babylon/core/CharacterLibrary.ts');
const between = (s: string, a: string, b: string) => { const i = s.indexOf(a); expect(i, a).toBeGreaterThan(-1); const j = s.indexOf(b, i); expect(j, b).toBeGreaterThan(i); return s.slice(i, j); };

describe('RUNUP-STALL-2b: who can walk out for the final', () => {
  it('every field dunker but you and tonight\'s foe, once each; a classic night (no field) has none', () => {
    for (const foe of DUNK_RIVALS) {
      const field = newField(foe);
      const ids = finalistCandidates(field, foe.id, PLAYER_ID);
      expect(ids).toEqual(field.map((d) => d.id).filter((id) => id !== PLAYER_ID && id !== foe.id));
      expect(ids).not.toContain(foe.id); expect(ids).not.toContain(PLAYER_ID);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(field.length - 2);   // the two the cut can send through in his place
    }
    expect(finalistCandidates([], 'cass', PLAYER_ID)).toEqual([]);
    expect(finalistCandidates([{ id: 'ty' }, { id: 'ty' }, { id: PLAYER_ID }], 'cass', PLAYER_ID)).toEqual(['ty']);
  });
  it('the cut\'s walk-out is exactly that set: opp is the finalist who is not you, swapped only when he is not the foe', () => {
    const cut = between(dunk, 'function finishCut(ctx: ModeContext): void {', '\n  /** Round hand-off');
    expect(cut).toContain('const opp = through.find((d) => d.id !== PLAYER_ID)!;');
    expect(cut).toMatch(/if \(opp\.id !== foe\.id\) \{[\s\S]*void swapRivalBody\(ctx, foe\);/);
  });
});

describe('RUNUP-STALL-2b: the rig check (why the onlooker body is not reused)', () => {
  it('a tinted spawn is an opponent; an untinted non-hero URL is a player', () => {
    expect(lib).toMatch(/if \(opts\.tint\) return 'opponent';\n\s+return heroRequest && hasLivePlayer\(scene\) \? 'opponent' : 'player';/);
  });
  it('the onlooker is tinted on the hero URL; the finalist is the roster URL with no tint', () => {
    const look = read('lib/babylon/visual/Onlookers.ts');
    expect(look).toMatch(/CharacterLibrary\.spawn\(scene, DEFAULT_HERO_URL, \{[^}]*tint: seed/);
    const body = between(dunk, 'async function spawnRivalBody(', '\n  /** GO AGAIN');
    expect(body).toContain('CharacterPipeline.spawnNpc(ctx.scene, rosterBodyUrl(who.body) ?? CFG.heroUrl, {');
    expect(body).not.toMatch(/tint:/);
  });
  it('the two roles get different clip sets and looks', () => {
    expect(lib).toContain('if (role === \'opponent\') installOpponentMotion(animator, scene, skeleton);');
    expect(lib).toMatch(/else installOpponentMotion\(animator, scene, skeleton, undefined, HERO_CAPTURE\);/);
    expect(lib).toContain('const fit = opts.tint || opts.name ? fitForName(String(opts.name ?? opts.tint)) : null;');
  });
});

describe('RUNUP-STALL-2b: the hidden finalists (knob on only)', () => {
  const pre = between(dunk, 'async function preloadContestSet(ctx: ModeContext)', '\n  /** The corner props');
  const fin = between(dunk, 'async function prespawnFinalists(ctx: ModeContext)', '\n  /** The corner props');
  it('only the preload sets them up, after the onlookers and before the shaders warm', () => {
    expect(dunk.match(/prespawnFinalists\(ctx\)/g)).toHaveLength(1);
    const at = ['await Onlookers.settled(ctx.scene);', 'await prespawnFinalists(ctx);', 'await warmSceneShaders(ctx.scene);'].map((s) => pre.indexOf(s));
    for (const i of at) expect(i).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(dunk.match(/finalistBodies\.set\(/g)).toHaveLength(1);   // knob off: nothing fills the map, the swap spawns as before
    expect(fin).toContain('finalistBodies.set(id, body);');
  });
  it('each is set up one at a time, hidden and off the ground lock; a failed one leaves the cut to spawn him', () => {
    expect(fin).toContain('for (const id of finalistCandidates(field, foe.id, PLAYER_ID)) {');
    expect(fin).toContain('const body = await spawnRivalBody(ctx, rivalById(id));');
    expect(fin.indexOf('ctx.groundLock?.untrack(body.root);')).toBeLessThan(fin.indexOf('finalistBodies.set(id, body);'));
    expect(fin.indexOf('body.root.setEnabled(false);')).toBeLessThan(fin.indexOf('finalistBodies.set(id, body);'));
    expect(fin).toMatch(/catch \(e\) \{ console\.warn\(`\[DUNK-PRELOAD\] finalist/);
  });
  it('the swap takes the set-up body before it would spawn one, and falls back to spawning', () => {
    const swap = between(dunk, 'async function swapRivalBody(ctx: ModeContext, who: DunkRival)', '\n  }\n');
    const take = swap.indexOf('const kept = takeFinalistBody(ctx, who.id);');
    expect(take).toBeGreaterThan(-1);
    expect(swap.indexOf('if (kept) next = kept;')).toBeGreaterThan(take);
    expect(swap.indexOf('else try { next = await spawnRivalBody(ctx, who); }')).toBeGreaterThan(take);
  });
  it('taking one shows it, puts it back on the ground lock and drops the other; a new field or the mode going drops them all', () => {
    const take = between(dunk, 'function takeFinalistBody(ctx: ModeContext, id: string)', '\n  function dropFinalistBodies(');
    expect(take).toContain('finalistBodies.delete(id);');
    expect(take.indexOf('dropFinalistBodies(ctx);')).toBeGreaterThan(take.indexOf('finalistBodies.delete(id);'));
    expect(take).toContain('body.root.setEnabled(true);');
    expect(take).toContain('ctx.groundLock?.track(body.root, body.skeleton);');
    expect(between(dunk, 'function startField(ctx: ModeContext): void {', '\n  }')).toContain('dropFinalistBodies(ctx);');
    expect(dunk).toContain('dropFinalistBodies(null);   // RUNUP-STALL-2b: unused hidden finalists go with the mode');
  });
  it('a model of the map: one spawn per finalist, the cut takes his, the other is disposed, a miss spawns', () => {
    const disposed: string[] = []; let spawns = 0;
    const map = new Map<string, { id: string }>();
    const body = (id: string) => ({ id });
    for (const id of ['ty', 'stack']) { spawns++; map.set(id, body(id)); }
    const take = (id: string) => { const b = map.get(id) ?? null; if (!b) return null; map.delete(id); for (const o of map.values()) disposed.push(o.id); map.clear(); return b; };
    const swap = (id: string) => take(id) ?? (spawns++, body(id));
    expect(swap('stack')).toEqual({ id: 'stack' });
    expect(spawns).toBe(2); expect(disposed).toEqual(['ty']); expect(map.size).toBe(0);
    swap('ty'); expect(spawns).toBe(3);   // nothing kept (a new night): the swap spawns, as with the knob off
  });
});
