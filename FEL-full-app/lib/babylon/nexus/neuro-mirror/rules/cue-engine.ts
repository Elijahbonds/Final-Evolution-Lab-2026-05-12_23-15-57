// CueEngine — the AI flexologist's voice. Pure: measured faults in, the
// book's cue out, with a coach's discipline: ONE cue at a time, let it land,
// measure the answer, escalate only when the fault survives.
//
// RNT framing (the Blueprint's chapter): the correction must become
// reflexive, not volitional — so the cue names the action ("press the floor
// apart"), not the muscle to fire. When the fault clears, the coach confirms
// ONCE and then shuts up: a coach who never stops talking teaches nothing.
//
// MIRROR-COACH P1 (2026-09-25). Three things this file said that were not true:
//   · The kneeValgus escalation said "My band is pulling your knees IN". There is no band — nothing in the Mirror
//     applies or measures one — and with the valgus sign inverted (squat-audit.ts, fixed the same day) that line
//     fired when the knees were already OUT, telling the athlete to push them further. Reworded to the action.
//   · The trunkOffset escalation said "Your ribs are flaring off the pelvis". The pose model has no rib landmark;
//     that fault is a shoulder-midpoint vs hip-midpoint offset. Reworded to what is measured. (It is not fed today.)
//   · The armFall card coached a forward fall; the audit reads the shoulders drifting sideways. Reworded to that.
// And the knee was SILENT until its read was confirmed: see VALGUS_CUE_VERIFIED below — switched on by the owner on
// 2026-09-26 (MIRROR-COACH P2) from the synthetic proof, with a squareness gate in front of it.
//
// Cue language follows the Playbook's coaching voice (short imperative
// external cues — "press the floor apart", not "contract your glutes").

export type FaultId =
  | 'kneeValgus' | 'heelRise' | 'armFall' | 'lateralShift' | 'shallow'
  | 'elbowFlare' | 'shrug' | 'trunkOffset';

interface CueCard { cue: string; escalate: string; regress: string }

/** Priority is the coaching order: the knee first, then the feet, then the trunk. */
export const FAULT_PRIORITY: FaultId[] = [
  'kneeValgus', 'heelRise', 'lateralShift', 'armFall', 'shallow',
  'elbowFlare', 'shrug', 'trunkOffset',
];

const CUES: Record<FaultId, CueCard> = {
  kneeValgus: {
    cue: 'Knees out over your second toes — press the floor apart.',
    escalate: 'Still drifting. Spread the floor apart with your feet — all the way down, all the way up.',
    regress: 'Hold the bottom. Breathe. Own the position before you move again.',
  },
  heelRise: {
    cue: 'Heels heavy. Toes long and flat — pull the floor toward your heel.',
    escalate: 'Your heels are leaving me. Sit SLOWER, heels pinned — the ankle earns the depth.',
    regress: 'Stop the set. Ankle rocks against the wall, ten each side, then we go again.',
  },
  // armFall is the shoulder midpoint drifting SIDEWAYS (a front camera reads x — squat-audit.ts). The card used to
  // coach a forward fall ("reach the ceiling", "your arms are falling to the floor"), which is not what was measured.
  armFall: {
    cue: 'Stay centred — shoulders over the middle of your feet on the way down.',
    escalate: 'Still drifting to one side. Slow the descent and press both feet evenly.',
    regress: 'Hold the top. Reset your stance, breathe twice, then descend only as far as you stay centred.',
  },
  lateralShift: {
    cue: 'Fifty-fifty. Don\'t travel — split the floor between both feet.',
    escalate: 'You\'re sliding off centre. Freeze at the bottom — find the middle, then rise.',   // one spelling: centre (P1 review)
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
  // MIRROR-COACH P1 review (2026-09-25): the base cue still said "Ribs stacked over pelvis — seal the cylinder" after the
  // escalation was reworded; the pose model has no rib landmark, and this fault is shoulders over hips.
  trunkOffset: {
    cue: 'Shoulders stacked over hips — set your brace before you move.',
    escalate: 'Your shoulders are drifting off your hips. Exhale fully, stack up, then go.',
    regress: 'Stop. Ninety-ninety breathing, three breaths, then we rebuild the rep.',
  },
};

/**
 * THE KNEE CUE — ON SINCE 2026-09-26, VERIFIED ON SYNTHETIC GEOMETRY ONLY (NO REAL CAPTURE).
 *
 * MIRROR-COACH P1 (2026-09-25) kept it silent: squat-audit.ts's knee read had been backwards (it fired on knees pushed
 * OUT on the app's non-mirrored stream), and the fix was proven only on lib/pose/synth.ts's virtual webcam
 * (squat-audit.test.ts). The owner switched it on from that proof (painfree/DECISIONS-2.md #19, 2026-09-25: "turn it on
 * from the synthetic proof ... documented as verified on synthetic geometry, not a real capture") — MIRROR-COACH P2,
 * 2026-09-26. What stands behind it, every item measured on the synth under its default landmark jitter, none on a
 * person (cue-engine.test.ts holds each with the production engine):
 *   1. The SIGN, on real geometry: NOT DONE. No real, non-mirrored recording of knees going in and out exists yet; the
 *      owner's decision overrides this for switching the cue on, and it is still the only way to confirm the left and
 *      right labels (P1 report, "Owner action").
 *   2. A jittered straight squat does not cue the knee: squat-audit.ts's persistence gate (valgusPersistFrames 3, now
 *      counted in POSE frames — a repeated camera frame returns the audit's cached read; P2) — 0 of 50 flagged, against
 *      26 of 50 at one frame; caving squats still caught 50 of 50.
 *   3. A side-on or turned squat does not cue the knee: squat-audit.ts frontalReadable (P1 review).
 *   4. A squat a few degrees off square does not cue the knee: squat-audit.ts squareOn (P2) — the shoulder and hip
 *      lines' depth order, averaged over 20 pose frames, within 4°. Straight squats 5°, 6°, 8°, 10° and 20° off square:
 *      0 of 20 seeds cued (before the gate the audit flagged 8, 15, 20, 20 and 19 of 20). assumption: a phone's
 *      MediaPipe z resolves a turn this small when averaged — unchecked on a recording; if it does not, the cost is
 *      the knee "not read" (said once, "square up to the camera"), never a cue about a knee that was not there.
 * Switch it off HERE AND NOWHERE ELSE: every visual and spoken knee cue reads this flag through cueableFaults.
 */
export const VALGUS_CUE_VERIFIED = true;

/**
 * The faults the coach may speak about. Everything the audit measures, minus the knee while VALGUS_CUE_VERIFIED is
 * false. Pure, so the harness can gate its visual cues (the knee overlay, the red check) on the same rule the voice uses.
 */
export function cueableFaults<F extends string>(faults: readonly F[], valgusVerified: boolean = VALGUS_CUE_VERIFIED): F[] {
  return valgusVerified ? [...faults] : faults.filter((f) => f !== 'kneeValgus');
}

export interface CueEngineOptions {
  /** Defaults to VALGUS_CUE_VERIFIED (true since 2026-09-26). Tests of the silent path pass false. */
  valgusVerified?: boolean;
}

export interface CueEvent {
  fault: FaultId;
  text: string;
  level: 'cue' | 'escalate' | 'regress' | 'confirm';
}

const HOLD_DOWN_MS = 6000;        // TUNE(elijah): one cue lands before the next
const REPEAT_WINDOW_MS = 12000;   // TUNE(elijah): same fault still faulting → escalate
const CLEAR_CONFIRM_MS = 4000;    // TUNE(elijah): fault gone this long → confirm once

export class CueEngine {
  private readonly valgusVerified: boolean;

  constructor(opts: CueEngineOptions = {}) {
    this.valgusVerified = opts.valgusVerified ?? VALGUS_CUE_VERIFIED;
  }

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
    // an unverified knee read is dropped before anything else sees it: it cannot be cued, escalated, confirmed, or
    // hold the voice down for the fault behind it
    const activeSet = new Set(cueableFaults(active, this.valgusVerified));

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
