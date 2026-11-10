// H2c ("stepping defensive slides and a sprinting chop-step close-out"; owner 2026-10-14: don't cap the defender's 4.2 m/s, author
// stepping clips instead). Inside 6 m a defender faces his man, and EVERY moving defender played a slide loop — sideways past what a
// slide can step (the right slide capture tops out at 3.98 m/s even at its 2.34× ceiling), and forward too: running at the man he slid.
import { describe, expect, it } from 'vitest';
import { inStepPhase, RIGHT_STRIKE_PHASE, CLOSEOUT_STEP_CLIP, chooseBasketballClip, defendRunFor, approachFor, DEF_RUN_ENTER_MPS, DEF_RUN_EXIT_MPS, APPROACH_MIN_M, APPROACH_MIN_MPS, APPROACH_EXIT_MPS, type AnimTreeInput } from './basketballTree';
import { rateFor, HOOPS_STRIDE, HOOPS_STRIDE_CAPTURE, DEF_RUN_STRIDE_MPS } from '../core/StrideMatch';

const D = (o: Partial<AnimTreeInput>): AnimTreeInput => ({
  speed01: 0.8, crossover: false, nearestDefender: Infinity, hasBall: false, shooting: false, dunking: false, driving: false,
  defending: true, bracing: false, staggered: false, ...o,
});

describe('the crossover step (defendRunFor)', () => {
  // yaw 0 faces +z; his right is +x
  it('sideways past a slide\'s reach is the crossover step; in at ENTER, out below EXIT (no flip on the line)', () => {
    expect(defendRunFor(0, { x: DEF_RUN_ENTER_MPS + 0.1, z: 0 }, 'defend_slide')).toBe(true);
    expect(defendRunFor(0, { x: -(DEF_RUN_ENTER_MPS + 0.1), z: 0 }, 'defend_slide')).toBe(true);
    const between = (DEF_RUN_ENTER_MPS + DEF_RUN_EXIT_MPS) / 2;
    expect(defendRunFor(0, { x: between, z: 0 }, 'defend_slide')).toBe(false);   // not in yet
    expect(defendRunFor(0, { x: between, z: 0 }, 'defend_run_right')).toBe(true);  // already in: stays
    expect(defendRunFor(0, { x: DEF_RUN_EXIT_MPS - 0.1, z: 0 }, 'defend_run_right')).toBe(false);
  });
  it('a slide still reads as a slide below ENTER, and backwards travel is the backpedal\'s', () => {
    expect(defendRunFor(0, { x: 2.0, z: 0 }, null)).toBe(false);
    expect(defendRunFor(0, { x: 3.0, z: -3.0 }, null)).toBe(false);
  });
});

describe('the sprint at him, then the chop (approachFor)', () => {
  it('running AT the man from beyond the chop range is the sprint; inside it, the closeout\'s chop', () => {
    expect(approachFor({ x: 0, z: 0 }, { x: 0, z: 3.5 }, { x: 0, z: 5 })).toBe(true);
    expect(approachFor({ x: 0, z: 0 }, { x: 0, z: 3.5 }, { x: 0, z: APPROACH_MIN_M - 0.1 })).toBe(false);
    expect(approachFor({ x: 0, z: 0 }, { x: 0, z: 1.0 }, { x: 0, z: 5 })).toBe(false);   // a walk up is not a sprint
    expect(approachFor({ x: 0, z: 0 }, { x: 3.5, z: 0 }, { x: 0, z: 5 })).toBe(false);   // sideways is not at him
    expect(approachFor({ x: 0, z: 0 }, { x: 0, z: 3.5 }, null)).toBe(false);
  });
  it('once he is running at him he stays running through the AI\'s speed wobble (out below EXIT or off his line)', () => {
    const wobble = (APPROACH_MIN_MPS + APPROACH_EXIT_MPS) / 2;
    expect(approachFor({ x: 0, z: 0 }, { x: 0, z: wobble }, { x: 0, z: 5 }, 'defend_slide')).toBe(false);
    expect(approachFor({ x: 0, z: 0 }, { x: 0, z: wobble }, { x: 0, z: 5 }, 'run')).toBe(true);
    expect(approachFor({ x: 0, z: 0 }, { x: 0, z: APPROACH_EXIT_MPS - 0.1 }, { x: 0, z: 5 }, 'run')).toBe(false);
    expect(approachFor({ x: 0, z: 0 }, { x: 2, z: 1 }, { x: 0, z: 5 }, 'run')).toBe(false);   // off his line (cos 0.45)
  });
});

describe('the tree picks them (chooseBasketballClip)', () => {
  it('the crossover step plays its own sided loop; the backpedal and the box-out still win', () => {
    expect(chooseBasketballClip(D({ defendRun: true, slideDir: 'right' }))).toMatchObject({ state: 'defend_run_right', clip: 'bball_def_cross_run_right', loop: true });
    expect(chooseBasketballClip(D({ defendRun: true, slideDir: 'left' }))).toMatchObject({ state: 'defend_run', clip: 'bball_def_cross_run_left' });
    expect(chooseBasketballClip(D({ defendRun: true, retreat: true })).state).toBe('defend_backpedal');
    expect(chooseBasketballClip(D({ defendRun: true, bracing: true })).state).toBe('box_out');
    expect(chooseBasketballClip(D({ defendRun: false, slideDir: 'right' })).state).toBe('defend_slide_right');   // unwired: as before
  });
  it('the approach is the run, and the closeout (the chop) wins inside its range', () => {
    expect(chooseBasketballClip(D({ approach: true })).state).toBe('run');
    expect(chooseBasketballClip(D({ approach: true, closeout: true })).state).toBe('closeout');
  });
  it('the crossover step paces against its authored stride on every rig (the authored table\'s jog), inside the clamp at the AI\'s 4.2 m/s', () => {
    expect(DEF_RUN_STRIDE_MPS).toBe(HOOPS_STRIDE.jog);
    for (const s of ['defend_run', 'defend_run_right']) {
      expect(rateFor(s, DEF_RUN_STRIDE_MPS, HOOPS_STRIDE_CAPTURE)!).toBeCloseTo(1, 6);
      expect(rateFor(s, DEF_RUN_STRIDE_MPS, HOOPS_STRIDE)!).toBeCloseTo(1, 6);
      expect(rateFor(s, 4.2, HOOPS_STRIDE_CAPTURE)!).toBeLessThan(1.6);
    }
  });
});

// hoops-p05b: THE CLOSEOUT STEPS — the closeout state plays bball_closeout_step (its chop steps cover its pace), behind hoops.closeoutStepOn
describe('the stepping closeout (hoops-p05b)', () => {
  it('the closeout state plays the stepping clip; knob 0 gives the old chop clip back exactly', async () => {
    const { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } = await import('../../feel-panel/feel');
    const { CLOSEOUT_STEP_CLIP } = await import('./basketballTree');
    expect(chooseBasketballClip(D({ closeout: true })).clip).toBe(CLOSEOUT_STEP_CLIP);
    try { setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.closeoutStepOn', 0); expect(chooseBasketballClip(D({ closeout: true })).clip).toBe('bball_closeout'); }
    finally { resetFeelForTests(); }
  });
  it('its keys pace to the closeout\'s stride reference: a planted foot travels 2 × Z in half the loop, 3.6 m/s at rate 1, and the matcher covers 2.9 m/s up', async () => {
    const { CLOSEOUT_STEP_SEC, CLOSEOUT_STEP_Z } = await import('./authored/basketball');
    expect((2 * CLOSEOUT_STEP_Z) / (CLOSEOUT_STEP_SEC / 2)).toBeCloseTo(HOOPS_STRIDE.run, 6);
    expect(rateFor('closeout', 2.9, HOOPS_STRIDE_CAPTURE)!).toBeGreaterThan(0.55);
    expect(rateFor('closeout', 6.4, HOOPS_STRIDE_CAPTURE)!).toBeLessThan(1.85);
  });
});

// hoops-p05b: the stepping closeout picks up a run in step (the right foot where the run had it) — the crossfade's leg pops
describe('a run into the stepping closeout stays in step (inStepPhase)', () => {
  it('starts the closeout at the run\'s point of the stride: the run\'s right-foot landing is the closeout\'s', () => {
    const a = RIGHT_STRIKE_PHASE.bball_mc_run;
    expect(inStepPhase('bball_mc_run', a, CLOSEOUT_STEP_CLIP)).toBeCloseTo(0, 9);
    expect(inStepPhase('bball_mc_run', (a + 0.25) % 1, CLOSEOUT_STEP_CLIP)).toBeCloseTo(0.25, 9);   // a quarter stride on, either way round
    expect(inStepPhase(CLOSEOUT_STEP_CLIP, 0.5, 'bball_mc_run')).toBeCloseTo((a + 0.5) % 1, 9);
    for (let p = 0; p < 1; p += 0.05) { const q = inStepPhase('bball_mc_run', p, CLOSEOUT_STEP_CLIP)!; expect(q).toBeGreaterThanOrEqual(0); expect(q).toBeLessThan(1); }
  });
  it('a loop not listed, the same loop, or no playhead: none (the new loop starts as it did)', () => {
    expect(inStepPhase('bball_mc_defend_stance', 0.3, CLOSEOUT_STEP_CLIP)).toBeUndefined();
    expect(inStepPhase('bball_mc_run', 0.3, 'bball_mc_run')).toBeUndefined();
    expect(inStepPhase(null, 0.3, CLOSEOUT_STEP_CLIP)).toBeUndefined();
    expect(inStepPhase('bball_mc_run', NaN, CLOSEOUT_STEP_CLIP)).toBeUndefined();
  });
});

