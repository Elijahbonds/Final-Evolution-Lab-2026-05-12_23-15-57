// CueEngine — the AI flexologist's voice. Pure: measured faults in, the
// book's cue out, with a coach's discipline: ONE cue at a time, let it land,
// measure the answer, escalate only when the fault survives.
//
// RNT framing (the Blueprint's chapter): the correction must become
// reflexive, not volitional — so the cue names the perturbation to resist
// ("my band pulls your knees IN — fight it OUT"), not the muscle to fire.
// When the fault clears, the coach confirms ONCE and then shuts up: a coach
// who never stops talking teaches nothing.
//
// Cue language follows the Playbook's coaching voice (short imperative
// external cues — "press the floor apart", not "contract your glutes").

export type FaultId =
  | 'kneeValgus' | 'heelRise' | 'armFall' | 'lateralShift' | 'shallow'
  | 'elbowFlare' | 'shrug' | 'trunkOffset';

interface CueCard { cue: string; escalate: string; regress: string }

/** Priority is the injury-risk order: the knee is the fuse first. */
export const FAULT_PRIORITY: FaultId[] = [
  'kneeValgus', 'heelRise', 'lateralShift', 'armFall', 'shallow',
  'elbowFlare', 'shrug', 'trunkOffset',
];

const CUES: Record<FaultId, CueCard> = {
  kneeValgus: {
    cue: 'Knees out over your second toes — press the floor apart.',
    escalate: 'My band is pulling your knees IN. Fight it out — all the way down, all the way up.',
    regress: 'Hold the bottom. Breathe. Own the position before you move again.',
  },
  heelRise: {
    cue: 'Heels heavy. Toes long and flat — pull the floor toward your heel.',
    escalate: 'Your heels are leaving me. Sit SLOWER, heels pinned — the ankle earns the depth.',
    regress: 'Stop the set. Ankle rocks against the wall, ten each side, then we go again.',
  },
  armFall: {
    cue: 'Chest tall — keep reaching the ceiling through the descent.',
    escalate: 'Your arms are falling to the floor. Ceiling. The WHOLE way down.',
    regress: 'Hold the top. Reach long, breathe twice, then descend only as far as tall survives.',
  },
  lateralShift: {
    cue: 'Fifty-fifty. Don\'t travel — split the floor between both feet.',
    escalate: 'You\'re sliding off center. Freeze at the bottom — find the middle, then rise.',
    regress: 'Stop. Reset your tripod, and give me a half-squat with no travel.',
  },
  shallow: {
    cue: 'Own the bottom — hip crease to your knee line, then drive up.',
    escalate: 'Deeper. Slow the way down and sit INTO it — then explode.',
    regress: 'Box squat: sit to a chair height, touch, and stand tall. Depth before speed.',
  },
  elbowFlare: {
    cue: 'Elbow tracks home — pull it to your ribs, not out to the side.',
    escalate: 'The elbow is drifting out. Pin it to your side and pull THROUGH the hip.',
    regress: 'Slow the rep down. Half speed, elbow glued, feel the lat do the work.',
  },
  shrug: {
    cue: 'Shoulder stays down — neck long. The trap stays out of this.',
    escalate: 'You\'re shrugging the pull. Depress the shoulder FIRST, then row.',
    regress: 'Reset. Shoulder blade down and back, hold two seconds, then pull.',
  },
  trunkOffset: {
    cue: 'Ribs stacked over pelvis — seal the cylinder before you move.',
    escalate: 'Your ribs are flaring off the pelvis. Exhale fully, lock the stack, then go.',
    regress: 'Stop. Ninety-ninety breathing, three breaths, then we rebuild the rep.',
  },
};

export interface CueEvent {
  fault: FaultId;
  text: string;
  level: 'cue' | 'escalate' | 'regress' | 'confirm';
}

const HOLD_DOWN_MS = 6000;        // TUNE(elijah): one cue lands before the next
const REPEAT_WINDOW_MS = 12000;   // TUNE(elijah): same fault still faulting → escalate
const CLEAR_CONFIRM_MS = 4000;    // TUNE(elijah): fault gone this long → confirm once

export class CueEngine {
  /** Null until the first cue — a 0 start would hold down the coach for the
   *  session's first HOLD_DOWN_MS (measured: the first fault never got cued). */
  private lastCueAt: number | null = null;
  private lastFault: FaultId | null = null;
  private faultSinceMs = new Map<FaultId, number>();
  private clearedAtMs = new Map<FaultId, number>();
  private confirmed = new Set<FaultId>();
  private escalations = new Map<FaultId, number>();

  reset(): void {
    this.lastCueAt = null;
    this.lastFault = null;
    this.faultSinceMs.clear();
    this.clearedAtMs.clear();
    this.confirmed.clear();
    this.escalations.clear();
  }

  /** Feed the measured fault set. Returns a cue when the coach speaks. */
  decide(nowMs: number, active: readonly FaultId[]): CueEvent | null {
    const activeSet = new Set(active);

    // track fault persistence + clearances
    for (const f of FAULT_PRIORITY) {
      if (activeSet.has(f)) {
        this.faultSinceMs.set(f, this.faultSinceMs.get(f) ?? nowMs);
        this.clearedAtMs.delete(f);
        this.confirmed.delete(f);
      } else if (this.faultSinceMs.has(f)) {
        this.faultSinceMs.delete(f);
        this.clearedAtMs.set(f, nowMs);
      }
    }

    // a cleared fault earns ONE confirmation ("there it is — own it"), then silence
    for (const [f, clearedAt] of this.clearedAtMs) {
      if (!this.confirmed.has(f) && nowMs - clearedAt >= CLEAR_CONFIRM_MS
          && (this.lastCueAt === null || nowMs - this.lastCueAt >= HOLD_DOWN_MS)) {
        this.confirmed.add(f);
        this.clearedAtMs.delete(f);
        this.lastCueAt = nowMs;
        this.escalations.delete(f);
        return { fault: f, text: 'There it is. Own it.', level: 'confirm' };
      }
    }

    // the highest-priority active fault gets the voice
    const fault = FAULT_PRIORITY.find((f) => activeSet.has(f));
    if (!fault) return null;
    if (this.lastCueAt !== null && nowMs - this.lastCueAt < HOLD_DOWN_MS) return null;

    const since = this.faultSinceMs.get(fault) ?? nowMs;
    const level = this.escalations.get(fault) ?? 0;
    // the same fault surviving a repeat window escalates: cue → firmer → regress
    const survived = since !== nowMs && nowMs - since >= REPEAT_WINDOW_MS * (level + 1) && this.lastFault === fault;
    const nextLevel = survived ? level + 1 : level;

    this.lastCueAt = nowMs;
    this.lastFault = fault;
    this.escalations.set(fault, nextLevel);
    const card = CUES[fault];
    if (nextLevel >= 2) return { fault, text: card.regress, level: 'regress' };
    if (nextLevel === 1) return { fault, text: card.escalate, level: 'escalate' };
    return { fault, text: card.cue, level: 'cue' };
  }
}

export { CUES };
