// T-POSE (owner playtest, 2026-10-27): every 3D demo surface plays through the library stage and its bind-pose guard.
// The one-clip canvas (components/coach/exercise-avatar-canvas.tsx: elijah.glb's single unrelated capture for every
// exercise) is mounted by no surface; every drill names its loop or the still; every loop named is one the stage owns.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRILLS } from '@/lib/drills/drills';
import { DEMO_CLIPS } from './demo';
import { DRILL_DEMO_LOOPS, SCREEN_DEMO_LOOPS, WARMUP_DEMO_LOOPS, drillDemoLoop, warmupDemoLoop } from './surfaceDemo';
import { WAKE_UP } from '@/lib/drills/drills';
import { PRIMERS, ROCK_HOLDS } from '@/lib/coach/warmupContent';
import { RECOVERY_BREATH_STEP } from '@/lib/coach/cooldown';
import { fromCoachToday } from '@/lib/session-player/fromCoachToday';

const SURFACES = ['app/play/mirror/assess/_components/drill-demo.tsx', 'app/play/drills/_components/drill-demo.tsx', 'app/coach/_components/exercise-catalogue.tsx', 'components/library/library-demo.tsx'];

describe('the 3D demo surfaces', () => {
  it('none mounts the one-clip canvas; each goes through the library stage', () => {
    for (const f of SURFACES) {
      const src = readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '');   // the code, not the comments that tell the story
      expect(src, f).not.toMatch(/exercise-avatar-canvas|components\/coach\/exercise-demo'/);
      expect(src, f).toMatch(/components\/library\/(avatar-demo|library-demo)'|from '\.\/exercise-stage'|import\('\.\/exercise-stage'\)/);
    }
  });
  it('the stage shows the 3D only once the body is measured off its bind pose', () => {
    const src = readFileSync('components/library/exercise-stage.tsx', 'utf8');
    expect(src).toMatch(/atBindPose\(hero\.skeleton\)/);
    expect(src).not.toMatch(/sync\(\);\s*setState\('ready'\)/);
  });
  it('every drill names its loop or the still, and every loop named is one the library stage owns', () => {
    for (const d of DRILLS) expect(d.id in DRILL_DEMO_LOOPS, d.id).toBe(true);
    for (const c of [...Object.values(DRILL_DEMO_LOOPS), ...Object.values(SCREEN_DEMO_LOOPS)]) if (c) expect(DEMO_CLIPS, c).toContain(c);
    expect(drillDemoLoop('no-such-drill')).toBeNull();
  });
});

// DEMO-LOOPS-4 (2026-11-03): every step FEL's warm-up and cool-down can generate plays a loop — the Wake-Up's phases, the
// rock-and-holds, the primers, the recovery breath — and the coached session player passes it through.
describe('the warm-up and cool-down steps', () => {
  const IDS = [...WAKE_UP.phases.map((p) => p.id), ...ROCK_HOLDS.map((r) => r.id), ...PRIMERS.map((p) => p.id), RECOVERY_BREATH_STEP.id];
  it('every step the generators make has a loop, and every loop is one the stage owns', () => {
    expect(IDS.length).toBe(28);
    expect(IDS.filter((id) => !warmupDemoLoop(id))).toEqual([]);
    expect(Object.keys(WARMUP_DEMO_LOOPS).sort()).toEqual([...IDS].sort());
    for (const c of Object.values(WARMUP_DEMO_LOOPS)) if (c) expect(DEMO_CLIPS, c).toContain(c);
  });
  it('the coached session player plays a warm-up or cool-down step\'s loop', () => {
    const today = { block: { label: 'B' }, session: { id: 's', label: 'S', exercises: [] } } as unknown as Parameters<typeof fromCoachToday>[0];
    const s = fromCoachToday(today, { warmup: { steps: [{ id: 'ankle-rock', name: 'Ankle Rock and Hold', seconds: 60, cue: 'c', dose: null }] } as never, cooldown: { steps: [{ id: 'recovery-breath', name: 'Breath', seconds: 90, cue: 'c', dose: null }] } as never });
    expect(s.session.steps.map((x) => x.clip)).toEqual(['ex_ankle_rock', 'ex_breathe_supine']);
  });
});
