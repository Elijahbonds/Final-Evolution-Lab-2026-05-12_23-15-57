import { describe, it, expect } from 'vitest';
import { drillsAccess, drillToRun, CAREFUL_ACCESS, type DrillsAccess } from './access';
import { ROUTE_DRILLS } from './route';
import { WAKE_UP, COUNTERMOVEMENT_GEOMETRY, POGO_BILATERAL, POGO_UNILATERAL, SAFE_LANDING, drillById } from './drills';
import { NOTE_COPY, jumpGateNote, phaseImpact, FALLBACK_WARMUP_CONTEXT, type WarmupContext } from '../coach/warmup';

// Mirror & coaching plan Phase 6: the warm-up's gates (lib/coach/warmup.ts generateWarmup) on the drills page. Nothing
// here is a new rule: the same context, the same impact test (a 'jump' or 'land' target), the same words.

type Ctx = Pick<WarmupContext, 'isYouth' | 'painDecision' | 'hardStopped' | 'jumpGate' | 'unavailable'>;
const ADULT_OPEN: Ctx = { isYouth: false, painDecision: null, hardStopped: false, jumpGate: { closed: false, why: '', href: null } };
const GATE_WHY = 'Jumps wait for a landing check from the last 4 weeks.';
const ADULT_GATED: Ctx = { ...ADULT_OPEN, jumpGate: { closed: true, why: GATE_WHY, href: '/play/mirror/assess' } };
const gate = (a: DrillsAccess, id: string) => a.drills.find((d) => d.id === id)!;

describe('the drills on the route: the Playbook\'s ch. 5 wake-up and ch. 6 jump-and-land drills', () => {
  it('every Playbook ch. 5 and ch. 6 chart, in the page\'s order, and nothing else', () => {
    expect(ROUTE_DRILLS.map((d) => d.id)).toEqual(['wake-up', 'countermovement-geometry', 'pogo-bilateral', 'pogo-unilateral', 'safe-landing']);
    for (const d of ROUTE_DRILLS) {
      expect(d.source.book).toBe('playbook');
      expect([5, 6]).toContain(d.source.chapter);
    }
  });
});

describe('an adult with every check open: every drill as written', () => {
  it('open, all phases, no note', () => {
    const a = drillsAccess(ADULT_OPEN);
    expect(a.stopped).toBe(false);
    expect(a.impactHeld).toBeNull();
    expect(a.note).toBeNull();
    for (const d of ROUTE_DRILLS) {
      expect(gate(a, d.id)).toEqual({ id: d.id, gate: 'open', phases: d.phases.map((p) => p.id), heldPhases: [] });
      expect(drillToRun(a, d.id)).toBe(drillById(d.id));        // the chart itself, never a copy
    }
  });
});

describe('jumps and landings wait, by the warm-up\'s rules', () => {
  const shapeHeld = (a: DrillsAccess) => {
    // the Wake-Up keeps its four calm phases in order and drops the rhythm and the launch
    expect(gate(a, WAKE_UP.id).gate).toBe('trimmed');
    expect(gate(a, WAKE_UP.id).phases).toEqual(['release-the-locks', 'pressurize', 'wake-the-tripod', 'open-the-joints']);
    expect(gate(a, WAKE_UP.id).heldPhases).toEqual(['Build the Rhythm', 'Prime the Launch']);
    // the geometry check never leaves the floor
    expect(gate(a, COUNTERMOVEMENT_GEOMETRY.id).gate).toBe('open');
    // the pogos and the landing are all impact: held whole
    for (const d of [POGO_BILATERAL, POGO_UNILATERAL, SAFE_LANDING]) {
      expect(gate(a, d.id)).toMatchObject({ gate: 'held', phases: [] });
      expect(drillToRun(a, d.id)).toBeNull();
    }
    const run = drillToRun(a, WAKE_UP.id)!;
    expect(run.phases.some(phaseImpact)).toBe(false);
    expect(run.phases.map((p) => p.id)).toEqual(gate(a, WAKE_UP.id).phases);
    expect(run.phases.every((p) => WAKE_UP.phases.includes(p))).toBe(true);   // the chart's own phases, unedited
  };

  it('an adult whose jump gate is shut (no landing check yet: most adults at launch) — the gate\'s own line and link', () => {
    const a = drillsAccess(ADULT_GATED);
    shapeHeld(a);
    expect(a.impactHeld).toBe('jump_gate');
    expect(a.note).toBe(jumpGateNote(GATE_WHY));
    expect(a.noteHref).toBe('/play/mirror/assess');
  });

  it('an answer that does not say the gate is open is shut', () => {
    const a = drillsAccess({ ...ADULT_OPEN, jumpGate: undefined as unknown as Ctx['jumpGate'] });
    expect(a.impactHeld).toBe('jump_gate');
  });

  it('under 18, or no birth year — even with the gate open: the youth line (jumps wait for a coach)', () => {
    const a = drillsAccess({ ...ADULT_OPEN, isYouth: true });
    shapeHeld(a);
    expect(a.impactHeld).toBe('youth_impact');
    expect(a.note).toBe(NOTE_COPY.youth_impact);
    expect(a.noteHref).toBeNull();
  });

  it('a pain check-in that stepped down or stopped: the pain line, the harder one for a stop', () => {
    const soft = drillsAccess({ ...ADULT_OPEN, painDecision: 'step_down_flag_coach' });
    shapeHeld(soft);
    expect(soft.impactHeld).toBe('pain');
    expect(soft.note).toBe(NOTE_COPY.pain);
    const hard = drillsAccess({ ...ADULT_OPEN, painDecision: 'stop_see_clinician' });
    expect(hard.note).toBe(NOTE_COPY.pain_hard);
    // 'continue' and an easier variation leave the jumps alone
    expect(drillsAccess({ ...ADULT_OPEN, painDecision: 'continue' }).impactHeld).toBeNull();
    expect(drillsAccess({ ...ADULT_OPEN, painDecision: 'easier_variation' }).impactHeld).toBeNull();
  });

  it('the context that did not load is the careful one, and says the details did not load (not "under 18")', () => {
    for (const a of [drillsAccess(FALLBACK_WARMUP_CONTEXT), CAREFUL_ACCESS]) {
      shapeHeld(a);
      expect(a.impactHeld).toBe('unavailable');
      expect(a.note).toBe(NOTE_COPY.context_unavailable);
    }
  });
});

describe('a standing intake red flag: no drill at all', () => {
  it('stopped, every drill held, nothing runs', () => {
    const a = drillsAccess({ ...ADULT_OPEN, hardStopped: true });
    expect(a.stopped).toBe(true);
    for (const d of ROUTE_DRILLS) {
      expect(gate(a, d.id).gate).toBe('held');
      expect(drillToRun(a, d.id)).toBeNull();
    }
  });

  it('a drill off the route never runs, whatever the access', () => {
    expect(drillToRun(drillsAccess(ADULT_OPEN), 'wall-drive')).toBeNull();
    expect(drillToRun(drillsAccess(ADULT_OPEN), 'nope')).toBeNull();
  });
});
