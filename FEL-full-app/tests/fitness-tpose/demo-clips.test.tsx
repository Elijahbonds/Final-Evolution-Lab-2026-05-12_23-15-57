// FITNESS-TPOSE (2026-10-26): every exercise and drill demo names a loop the library stage can build, or shows the cue
// card — never the old canvas (components/coach/exercise-avatar-canvas.tsx, /models/elijah.glb), whose one baked mocap
// played for every exercise and whose bind pose is a T-pose. And the R3F Avatar restarts a loop a remount stopped.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EXERCISE_CLIPS } from '@/lib/babylon/anim/authored/exercise';
import { scopeAllows, scopeForMode, suiteOfClip } from '@/lib/babylon/anim/clipScope';
import { CLIP_COVERAGE, DEMO_CLIPS } from '@/lib/library/demo';
import { DRILLS } from '@/lib/drills/drills';
import { ROUTE_DRILLS } from '@/lib/drills/route';
import { DrillDemo as ScreenDrillDemo } from '@/app/play/mirror/assess/_components/drill-demo';
import { DrillDemo, demoClip } from '@/app/play/drills/_components/drill-demo';
import { ExerciseDemo } from '@/components/coach/exercise-demo';
import { restartLoop } from '@/components/three/avatar';
import { SCREEN_TEST_NAMES } from '@/lib/screen/copy';

const LIBRARY = scopeForMode('library');
// an exercise loop, a core clip every body has (run, walk, jumpshot, idle_stand), or a hoops clip the library borrows
const playable = (clip: string) => (EXERCISE_CLIPS.includes(clip) || suiteOfClip(clip) === 'core' || clip.startsWith('bball_')) && scopeAllows(LIBRARY, clip);
const CUE_CARD = 'fel-cuecard flex';   // the card itself (the class name alone is also in the component's <style jsx>)

describe('every demo names a loop the library stage owns', () => {
  it('the Quick Screen checks (PM option A): every check opens to the still cue card, named, and nothing 3D loads', () => {
    for (const t of Object.keys(SCREEN_TEST_NAMES) as (keyof typeof SCREEN_TEST_NAMES)[]) {
      const h = renderToStaticMarkup(createElement(ScreenDrillDemo, { test: t, drill: 'The drill', initiallyOpen: true }));
      expect(h, t).toContain('data-demo-still');
      expect(h, t).toContain(SCREEN_TEST_NAMES[t]);
      expect(h, t).toContain('The drill');
      expect(h, t).not.toContain('Loading the demo');
    }
  });

  it('every drill (the chart and the route): an exercise loop for its moves, or the cue card', () => {
    const seen = new Map<string, string | null>();
    for (const d of [...DRILLS, ...ROUTE_DRILLS]) {
      const c = demoClip(d);
      seen.set(d.id, c);
      if (c) expect(EXERCISE_CLIPS, `${d.id} ${c}`).toContain(c);
      const jumps = d.phases.some((p) => p.targets.some((x) => x.move === 'jump' || x.move === 'land'));
      if (jumps) expect(c, d.id).toBe('ex_jump');
    }
    expect([...seen.values()].some((c) => c != null)).toBe(true);
  });

  it('every library loop (DEMO_CLIPS, CLIP_COVERAGE) is one the stage can play', () => {
    for (const c of DEMO_CLIPS) expect(playable(c), c).toBe(true);
    for (const c of Object.values(CLIP_COVERAGE)) if (c) expect(playable(c), c).toBe(true);
  });
});

describe('no demo mounts the old canvas', () => {
  it('the file is gone and no caller imports it; they load the library stage instead', () => {
    expect(existsSync('components/coach/exercise-avatar-canvas.tsx')).toBe(false);
    for (const f of ['components/coach/exercise-demo.tsx', 'app/play/drills/_components/drill-demo.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/exercise-avatar-canvas'\)/);
      expect(src, f).toMatch(/import\('@\/components\/library\/exercise-stage'\)/);
    }
    // the Quick Screen (PM option A): no stage, no old canvas, nothing from Babylon
    const screen = readFileSync('app/play/mirror/assess/_components/drill-demo.tsx', 'utf8');
    const imported = [...screen.matchAll(/(?:from\s*|import\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(imported).toEqual(['react', 'lucide-react', '@/lib/screen/copy']);
    expect(screen).not.toMatch(/components\/library\/exercise-stage|exercise-avatar-canvas'\)/);
  });

  it('the coach catalogue passes clip: null (a KB item has no library loop): the cue card', () => {
    expect(readFileSync('app/coach/_components/exercise-catalogue.tsx', 'utf8')).toMatch(/clip: null,/);
  });
});

describe('a demo with no loop is the cue card, never a 3D body', () => {
  it('ExerciseDemo with no clip (or clip left out): the cue card, no 3D loading', () => {
    for (const clip of [null, undefined]) {
      const h = renderToStaticMarkup(createElement(ExerciseDemo, { exercise: { name: 'Hip CARs', clip } }));
      expect(h).toContain(CUE_CARD);
      expect(h).not.toContain('Loading your avatar');
    }
  });

  it('ExerciseDemo with a clip: the stage loads (client-side)', () => {
    const h = renderToStaticMarkup(createElement(ExerciseDemo, { exercise: { name: 'Goblet squat', clip: 'ex_squat' } }));
    expect(h).toContain('Loading your avatar');
    expect(h).not.toContain(CUE_CARD);
  });


  it('a drill with no loop opens to the still card; a jump drill loads the stage', () => {
    const still = [...DRILLS, ...ROUTE_DRILLS].find((d) => demoClip(d) == null);
    if (still) expect(renderToStaticMarkup(createElement(DrillDemo, { drill: still, initiallyOpen: true }))).toContain('data-drill-demo-still');
    const jump = [...DRILLS, ...ROUTE_DRILLS].find((d) => demoClip(d) === 'ex_jump')!;
    expect(renderToStaticMarkup(createElement(DrillDemo, { drill: jump, initiallyOpen: true }))).toContain('Loading the demo');
  });
});

describe('the library stage: phone body, and a loop that will not play is said and becomes the cue card', () => {
  const src = readFileSync('components/library/exercise-stage.tsx', 'utf8');
  it('stamps felTier (as the Closet does) before the body is spawned', () => {
    const tier = src.indexOf('scene.metadata.felTier = detectQualityTier(');
    expect(tier).toBeGreaterThan(0);
    expect(tier).toBeLessThan(src.indexOf('CharacterLibrary.spawn('));
  });
  it('a failed build or a null play warns [FEL-LIBRARY] no loop and reports failed, with the canvas hidden', () => {
    expect(src).toMatch(/if \(!built \|\| !g\) \{\s*console\.warn\('\[FEL-LIBRARY\] no loop'/);
    expect(src).toMatch(/setState\(loopFailed \? 'failed' : 'ready'\)/);
    expect(src).toMatch(/visibility: state === 'failed' \? 'hidden'/);
  });
});

describe('Avatar: a loop stopped by a remount is started again (restartLoop)', () => {
  const act = (running: boolean) => ({ isRunning: () => running });
  it('nothing running after the cleanup: the last loop plays again, with its speed', () => {
    const calls: unknown[] = [];
    const ok = restartLoop({ name: 'Armature|Take', timeScale: 0.8, fadeIn: 0.15 }, new Map([['Armature|Take', act(false)]]), (n, o) => calls.push([n, o]));
    expect(ok).toBe(true);
    expect(calls).toEqual([['Armature|Take', { loop: true, timeScale: 0.8, fadeIn: 0.15 }]]);
  });
  it('the caller already played in onReady: left alone', () => {
    const calls: unknown[] = [];
    expect(restartLoop({ name: 'a', timeScale: 1, fadeIn: 0.15 }, new Map([['a', act(true)]]), () => calls.push(1))).toBe(false);
    expect(calls).toEqual([]);
  });
  it('no loop asked for, or a clip the model lacks: nothing is invented', () => {
    expect(restartLoop(null, new Map([['a', act(false)]]), () => { throw new Error('played'); })).toBe(false);
    expect(restartLoop({ name: 'missing', timeScale: 1, fadeIn: 0.15 }, new Map([['a', act(false)]]), () => { throw new Error('played'); })).toBe(false);
  });
  it('avatar.tsx records the last loop and restarts it right after onReady', () => {
    const src = readFileSync('components/three/avatar.tsx', 'utf8');
    expect(src).toMatch(/lastLoop\.current = loop \? \{ name, timeScale, fadeIn \} : null;/);
    expect(src).toMatch(/onReady\(handle\);\s*restartLoop\(lastLoop\.current, actionMap, handle\.play\);/);
  });
});
