// FIRST-DUNK-BUDGET (2026-10-17): dunk 1 on /try loads only what dunk 1 needs.
//
// AM's Lighthouse phone run: ~25 MB before TAP TO START, and a phone on 4G never got there (the load timer failed it mid-
// download). The PM's bar: before dunk 1 the Venice court, the ball, the hoop and one player; the rival, the venue's dressing
// (racing props, the parked bus and sedan, the onlookers), the corner bus and tent, the voices and the songs after it; and the
// /try chunk carrying the dunk's code, not every game's. These hold the shape that does it.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const dunk = read('lib/babylon/modes/DunkMode.ts');
const between = (src: string, from: string, to: string) => { const a = src.indexOf(from); const b = src.indexOf(to, a + from.length); return a < 0 || b < 0 ? '' : src.slice(a, b); };
const load = between(dunk, 'async load(ctx: ModeContext) {', '\n    onInput(ctx: ModeContext');

/** The files `entry` reaches through static imports (`@/` and relative; type-only imports and dynamic import() are not edges). */
function staticGraph(entry: string): Set<string> {
  const exts = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
  const resolve = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/') ? path.join(ROOT, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
    if (!base) return null;
    if (existsSync(base) && statSync(base).isFile()) return base;
    for (const e of exts) if (existsSync(base + e)) return base + e;
    return null;
  };
  const seen = new Set<string>([path.join(ROOT, entry)]);
  const queue = [...seen];
  const edge = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  while (queue.length) {
    const f = queue.shift()!;
    const src = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    for (const m of src.matchAll(edge)) { const r = resolve(f, m[1]); if (r && !seen.has(r)) { seen.add(r); queue.push(r); } }
  }
  return seen;
}

describe('the /try chunk is the dunk, not every game', () => {
  it('the dunk host mounts MODES.dunk from the registry\'s dunk entry alone, not the 29-mode registry', () => {
    // MODES.dunk is the spelling registry.drift.test's door check reads; dunkRegistry.test holds the entry to registry.ts's own
    const host = read('components/games/dunk-babylon.tsx');
    expect(host).toContain("import { MODES } from '@/lib/babylon/modes/dunkRegistry';");
    expect(host).toContain('runMode(MODES.dunk, {');
    expect(host).not.toMatch(/from '@\/lib\/babylon\/modes\/registry'/);
  });
  it('the guest retry button remounts a rejected boot instead of only pressing START into a dead bus', () => {
    const host = read('components/games/dunk-babylon.tsx');
    expect(host).toContain('const [bootAttempt, setBootAttempt] = useState(0);');
    expect(host).toContain('setBootAttempt((n) => n + 1);');
    expect(host).toContain('}, [bootAttempt]);');
    expect(host).toContain('onRetry={retryBoot}');
    expect(host).not.toContain('onRetry={tapStart}');
  });
  it('its static graph reaches no other mode and not registry.ts (control: the registry reaches them all)', () => {
    const modes = (g: Set<string>) => [...g].filter((f) => /lib\/babylon\/modes\/[A-Z]\w*Mode\.ts$/.test(f)).map((f) => path.basename(f)).sort();
    const host = staticGraph('components/games/dunk-babylon.tsx');
    expect(modes(host)).toEqual(['DunkMode.ts']);
    expect([...host].some((f) => f.endsWith('lib/babylon/modes/registry.ts'))).toBe(false);
    expect(modes(staticGraph('lib/babylon/modes/registry.ts')).length).toBeGreaterThan(20);
  });
});

describe('load() waits for, and starts, only what dunk 1 needs', () => {
  it('the venue mounts with its dressing deferred; the booth reads its words and holds its voices', () => {
    expect(load).toContain("mountVenue(ctx, 'basketball_dunk', { keepGameplayCamera: true, location: ctx.location, deferDressing: true })");
    expect(load).toMatch(/new ModeMic\(ctx, \{[^}]*\}, deferAudio: true \}\)/);
  });
  it('no rival body, no corner prop, no catalogue song is loaded by load() itself', () => {
    expect(load).not.toMatch(/spawnRivalBody\(/);
    expect(load).not.toMatch(/copyKitModel\(|spawnMeshyProp\(|ImportMeshAsync\(/);
    expect(load).toContain('if (walkCue) void walkPlayer.prepare(walkCue');   // your own song is a local mixdown (no download)
    expect(load).toContain('if (walkCue) startWalkOut();');
    expect(load).toContain('contestSetStarted = false; rivalArrival = null; awaitingRival = false;');
  });
  it('the dunk never loads a GLB by hand: the corner bus and tent are copies of the venue set\'s one import', () => {
    expect(dunk).not.toMatch(/SceneLoader\.|spawnMeshyProp\(/);
    const corner = between(dunk, 'function parkCornerProps(', '\n  function bindBody(');
    expect(corner).toContain("copyKitModel(scene, 'meshy', rideKey, `dunk_${rideKey}`)");
    expect(corner).toContain("copyKitModel(scene, 'racing', 'tent', 'dunk_tent')");
  });
});

describe('the contest set comes once dunk 1 is in', () => {
  it('your first finished attempt starts it — made, missed or on the practice runway', () => {
    const fin = between(dunk, 'async function finishAttempt(ctx: ModeContext, made: boolean)', 'if (practice && turn');
    expect(fin).toContain("if (turn === 'player') startContestSet(ctx);");
  });
  it('his body first, then the dressing, the corner props, the voices and a catalogue walk-out', () => {
    const set = between(dunk, 'function startContestSet(ctx: ModeContext)', '\n  /** His body,');
    const order = ['rivalArrival = bringRival(ctx);', 'rivalArrival.finally(', 'dunkVenue?.mountDressing();', 'parkCornerProps(ctx);', 'mic?.loadAudio();', 'startWalkOut();'];
    let at = -1;
    for (const step of order) { const i = set.indexOf(step); expect(i, step).toBeGreaterThan(at); at = i; }
    // the rival is still spawned as an NPC — never with the player's identity (scripts/spawn-path-tests.ts)
    expect(between(dunk, 'async function bringRival(', '\n  /** The corner props')).toContain('rival = await spawnRivalBody(ctx, foe);');
  });
  it('his turn waits for his body on a slow line, and nothing else advances the night while it does', () => {
    expect(between(dunk, 'async function rivalRound(ctx: ModeContext)', 'player.root.position.set(-3.2')).toMatch(/if \(!rival\) \{[\s\S]*awaitingRival = true;[\s\S]*await rivalArrival;[\s\S]*awaitingRival = false;/);
    expect(dunk).toContain("if (phase !== 'judging' || awaitingRival) return;");
    expect(dunk).toContain('if (phaseSec <= BUDGET_SEC[phase] || finishing || awaitingRival) return;');
  });
  it('a corner face is kicked off only once its prop stands on it', () => {
    const glass = between(dunk, 'function tryGlass(ctx: ModeContext', 'function startBusRun(');
    expect(glass).toContain('paneRebound(player.root.position.x, player.root.position.z, vx, vz, parkedPanes)');
    expect(glass).toContain('wallRunMiss(player.root.position.x, player.root.position.z, vx, vz, parkedPanes)');
  });
});

describe('a deferDressing venue holds its dressing until mountDressing()', () => {
  const venue = read('lib/babylon/core/NexusVenue.ts');
  const walk = read('lib/babylon/nexus/veniceBoardwalk.ts');
  it('the prop set is a dressing job, started at once unless the mode deferred it', () => {
    expect(venue).toMatch(/dressingJobs\.push\(\(\) => mountVenueProps\(ctx\.scene, propSet, built\.root\)/);
    expect(venue).not.toMatch(/void mountVenueProps\(/);   // nothing mounts the set outside the jobs
    expect(venue).toContain('if (!options.deferDressing) void mountDressing();');
    expect(venue).toMatch(/mountDressing = \(\): Promise<void> => \(dressing \?\?= /);   // idempotent
  });
  it('the boardwalk\'s onlookers fill with the dressing, and its lamp flags wait for the lamps', () => {
    expect(walk).toContain('if (dressing) dressing.start(fillRail); else fillRail();');
    expect(walk).toMatch(/if \(dressing\) \{ for \(const f of flags\) f\.setEnabled\(false\); dressing\.landed\(/);
    expect(walk).not.toMatch(/\n {2}const rail = new Onlookers\(/);   // not built straight in the function body any more (only in fillRail)
  });
});

describe('the Meshy props load from one path', () => {
  it('nothing in the game builds a /models/props/meshy URL (the venue kit reads /models/meshy, meshyProps\' folder)', () => {
    const venue = read('lib/babylon/visual/VenueProps.ts');
    expect(venue).toContain("const kitDir = (kit: string): string => (kit === 'meshy' ? MESHY_DIR : `/models/props/${kit}/`);");
    expect(read('lib/babylon/visual/meshyProps.ts')).toContain("export const MESHY_DIR = '/models/meshy/';");
  });
});
