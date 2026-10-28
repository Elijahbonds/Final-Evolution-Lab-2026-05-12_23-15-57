// EXERCISE-LIBRARY (2026-10-25): the demo data the follow-up lanes render — clip keys by pattern, the rig's coverage,
// the anatomy keys, and the camera review chosen from tags (never from an English name).
import { describe, expect, it } from 'vitest';
import { CLIP_KEYS, CLIP_COVERAGE, DEMO_CLIPS, DEMO_RULES, ISO_HOLD_SEC, SHAPE_MODIFIERS, avatarClip, clipCoverage, demoClipFor, demoFor, muscleMap, reviewMovementOf } from './demo';
import { LIBRARY_HOOPS_BORROW, scopeAllows, scopeForMode } from '@/lib/babylon/anim/clipScope';
import { REAL_CLIPS } from '@/lib/babylon/anim/clipRegistry';
import { loadLibraryFiles } from './files';
import { MUSCLES } from './vocab';

const ALL = loadLibraryFiles();

describe('clip keys', () => {
  // LIBRARY-ANATOMY (2026-10-25), test changed: this pinned the three clips the old R3F demo named (idle_stand, jump_up,
  // run_forward) and `avatarClip('squat') === null`. Those names never played — the R3F model carries one baked animation
  // and every entry played it — and this lane authors the squat. The assertion now holds what replaced it: every key's
  // representative loop is a real clip the library stage owns.
  it('every entry has a clip key, and every covered key names a clip the library stage owns', () => {
    expect(ALL.every((e) => (CLIP_KEYS as readonly string[]).includes(e.demo.clipKey))).toBe(true);
    const scope = scopeForMode('library');
    for (const clip of Object.values(CLIP_COVERAGE)) if (clip) { expect(REAL_CLIPS.has(clip), clip).toBe(true); expect(scopeAllows(scope, clip), clip).toBe(true); }
    expect(avatarClip('squat')).toBe('ex_squat');
    const { covered, missing } = clipCoverage();
    expect(covered.length + missing.length).toBe(CLIP_KEYS.length);
    expect(covered.length).toBeGreaterThanOrEqual(17);
  });
});

describe('the loop an entry plays (demoFor)', () => {
  it('every loop a rule names is a real clip, inside the library stage scope; the hoops ones are exactly its borrow list', () => {
    const scope = scopeForMode('library');
    for (const c of DEMO_CLIPS) { expect(REAL_CLIPS.has(c), c).toBe(true); expect(scopeAllows(scope, c), c).toBe(true); }
    expect(new Set(DEMO_CLIPS.filter((c) => c.startsWith('bball_')))).toEqual(new Set(LIBRARY_HOOPS_BORROW));
    for (const c of Object.keys(ISO_HOLD_SEC)) expect(DEMO_CLIPS, c).toContain(c);
  });
  it('reads the structured tags: family, base variation, modifiers, equipment — never the name', () => {
    expect(demoClipFor({ family: 'squat', variation: 'goblet-squat', equipment: ['dumbbell'] })).toBe('ex_squat');
    expect(demoClipFor({ family: 'squat', variation: 'squat', equipment: ['barbell'] })).toBe('ex_squat_bar');
    expect(demoClipFor({ family: 'squat', variation: 'front-squat', equipment: ['barbell'] })).toBe('ex_squat');
    expect(demoClipFor({ family: 'squat', variation: 'overhead-squat', equipment: ['barbell'] })).toBe('ex_overhead_squat');   // DEMO-LOOPS: its own loop now (the arms overhead), never the plain squat's
    expect(demoClipFor({ family: 'overhead-press', variation: 'shoulder-press', equipment: ['dumbbell'] })).toBe('ex_press');
    expect(demoClipFor({ family: 'overhead-press', variation: 'seat-press', equipment: ['dumbbell'] })).toBe('ex_seated_press');   // seated: its own loop, on a bench
    expect(demoClipFor({ family: 'overhead-press', variation: 'landmine', equipment: ['landmine'] })).toBeNull();   // a landmine press is neither
    // LIBRARY-ANATOMY-2, test changed: this held a preacher curl to the cue card (no loop showed it). It now has its own loop,
    // on the pad (exerciseProps.ts ex_preacher_curl); the intent — never the standing curl — is what the assertion keeps.
    expect(demoClipFor({ family: 'curl', variation: 'preacher-curl', equipment: ['barbell'] })).toBe('ex_preacher_curl');
    expect(demoClipFor({ family: 'curl', variation: 'zottman-preacher-curl', equipment: ['dumbbell'] })).toBeNull();   // the turn of the wrist is the exercise: no loop shows it
    expect(demoClipFor({ family: 'finish-series', variation: 'overhand-wing', equipment: ['basketball'] })).toBe('bball_layup_gather');
    expect(demoClipFor({ family: 'finish-series', variation: 'overhand-wing-weak', equipment: ['basketball'] })).toBe('bball_layup_gather_left');
    expect(demoClipFor({ family: 'machine-intervals', variation: 'bike-sprint', equipment: ['bike'] })).toBeNull();   // a bike is not a run
  });
  it('a modifier that changes the body is a cue card; an isometric hold is the loop held at its hardest point', () => {
    expect(demoFor({ family: 'squat', variation: 'goblet-squat+paused', equipment: [] })).toEqual({ clip: 'ex_squat', hold: null });
    for (const m of SHAPE_MODIFIERS) if (m !== 'iso-hold') expect(demoFor({ family: 'squat', variation: `goblet-squat+${m}`, equipment: [] }), m).toBeNull();
    expect(demoFor({ family: 'squat', variation: 'goblet-squat+iso-hold', equipment: [] })).toEqual({ clip: 'ex_squat', hold: ISO_HOLD_SEC.ex_squat });
    expect(demoFor({ family: 'finish-series', variation: 'overhand-wing+iso-hold', equipment: [] })).toBeNull();   // no hold point for a layup
  });
  it('LIBRARY-ANATOMY-2: every loop any entry plays is listed in DEMO_CLIPS, a real clip, inside the stage scope', () => {
    const scope = scopeForMode('library');
    const bad = new Set<string>();
    for (const e of ALL) { const d = demoFor(e); if (d && (!DEMO_CLIPS.includes(d.clip) || !REAL_CLIPS.has(d.clip) || !scopeAllows(scope, d.clip))) bad.add(d.clip); }
    expect([...bad]).toEqual([]);
  });
  it('every rule matches at least one entry (a rule that matches nothing is a typo)', () => {
    const hits = new Map<number, number>();
    for (const e of ALL) {
      const [base] = e.variation.split('+');
      DEMO_RULES.forEach((r, i) => { if (r.families.includes(e.family) && r.bases.test(base)) hits.set(i, (hits.get(i) ?? 0) + 1); });
    }
    const dead = DEMO_RULES.map((r, i) => (hits.get(i) ? null : `${String(r.clip)} ${r.families.join('/')} ${r.bases}`)).filter(Boolean);
    expect(dead).toEqual([]);
  });
  it('coverage over the whole library (reported, and held from falling)', () => {
    const shown = ALL.filter((e) => demoFor(e)).length;
    // LIBRARY-ANATOMY-2: 21.5% at the first pass → 45.6%; DEMO-LOOPS: 46.8%. The floor follows (0.18 → 0.45 → 0.465)
    expect(shown / ALL.length).toBeGreaterThan(0.465);
  });
});

describe('muscle map', () => {
  it('maps to anatomy keys from the fixed list, primary first, no repeats', () => {
    const keys = new Set(MUSCLES.map((m) => m.anatomyKey));
    for (const e of ALL) {
      const m = muscleMap(e);
      expect([...m.primary, ...m.secondary].every((k) => keys.has(k))).toBe(true);
      expect(m.secondary.some((k) => m.primary.includes(k))).toBe(false);
    }
  });
});

describe('camera review by pattern, not by name', () => {
  it('reads the tags', () => {
    expect(reviewMovementOf({ pattern: 'squat', family: 'squat', laterality: 'bilateral' })).toBe('squat');
    expect(reviewMovementOf({ pattern: 'squat', family: 'single-leg-squat', laterality: 'unilateral' })).toBeNull();
    expect(reviewMovementOf({ pattern: 'lunge', family: 'split-squat', laterality: 'unilateral' })).toBe('lunge');
    expect(reviewMovementOf({ pattern: 'hinge', family: 'hinge-pattern', laterality: 'bilateral' })).toBe('hinge');
    expect(reviewMovementOf({ pattern: 'push', family: 'push-up', laterality: 'bilateral' })).toBe('pushup');
    expect(reviewMovementOf({ pattern: 'push', family: 'bench-press', laterality: 'bilateral' })).toBeNull();
  });
  it('a renamed entry keeps its review (the name plays no part)', () => {
    const e = ALL.find((x) => x.id === 'goblet-squat')!;
    expect(reviewMovementOf({ ...e, name: 'Zzz' } as typeof e)).toBe(reviewMovementOf(e));
  });
});
