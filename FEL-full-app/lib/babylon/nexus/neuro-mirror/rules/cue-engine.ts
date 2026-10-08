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
//
// MIRROR-COACH P9 (2026-09-25 pass, built 2026-09-30) — three things changed here.
//   · THE CUES LEAD WITH THE WORLD, NOT THE BODY. The header above said "external cues", and most of the table did
//     not follow it: "Heels heavy", "Elbow tracks home", "Shoulder stays down … the trap stays out of this", "feel the
//     lat do the work", "Depress the shoulder FIRST", "set your brace". Those name a body part (or a muscle) to move or
//     squeeze. The rewrite leads with the floor, the handle, the wall or the ceiling, and keeps the body-part detail as
//     the second half, the fallback. lib/coach/cueLint.ts is the policy and its test runs every line here through it.
//   · THE COACH SAYS LESS AS THE REPS CLEAN UP (the faded schedule, below: every rep → every third → the set's summary
//     only, reset when the fault comes back). Before, a fault the athlete had fixed three sets ago was cued at the same
//     rate as a new one, forever.
//   · THE PRESS/ROW FAULTS REACH THIS ENGINE. elbowFlare, shrug and trunkOffset had cards and a priority slot and
//     could never fire: only the squat fed decide() (mirror-harness.tsx). lib/mirror/pressRowStage.ts turns the
//     press/row zone reads into these three faults, per camera frame, and the harness feeds them in.

export type FaultId =
  | 'kneeValgus' | 'heelRise' | 'armFall' | 'lateralShift' | 'shallow'
  | 'elbowFlare' | 'shrug' | 'trunkOffset';

/**
 * One fault's voice. `reply` (MIRROR-MOVES P2, 2026-10-07) is the REPLY TO A REPEATED FAULT: a different, simpler wording
 * of `cue` for a fault that keeps coming back in the same set (REPEAT_REPLY_FIRES) — said in place of the cue, never in
 * addition to it, and only where the cue itself would have been said (see decideVoice). Optional: a card without one
 * keeps saying its cue.
 */
export interface CueCard { cue: string; escalate: string; regress: string; reply?: string }

/**
 * What one engine coaches (MIRROR-MOVES P2): its faults in coaching order and a card for each. The squat and the press/row
 * share MIRROR_COACH_TABLE (this file's own CUES, FAULT_PRIORITY); a pattern with its own cue table (the lunge, the hinge,
 * the push-up — lib/mirror/patternCues.ts builds theirs from the pattern's CueRule list) gets its own engine and its own
 * table, so a fault id one pattern shares with another ('shallow': the squat's and the lunge's) never borrows the other
 * pattern's words.
 */
export interface CueTable<F extends string = FaultId> {
  priority: readonly F[];
  cards: Readonly<Record<F, CueCard>>;
}

/** Priority is the coaching order: the knee first, then the feet, then the trunk. */
export const FAULT_PRIORITY: FaultId[] = [
  'kneeValgus', 'heelRise', 'lateralShift', 'armFall', 'shallow',
  'elbowFlare', 'shrug', 'trunkOffset',
];

// MIRROR-COACH P9 (2026-09-30): every `cue` and `escalate` below now leads with something outside the body (the floor,
// the handle, the wall, the ceiling, the camera) and names a body part only after it; nothing names a muscle or asks
// for one to be squeezed. The old line is kept in a comment where it changed. Where the measured read limits the
// wording (armFall is a sideways read, so "floor"/"forward" stay out of it — cue-engine.test.ts; the press/row reads
// only the RIGHT arm, so its cards say "the handle", never "both elbows"), the wording follows the read.
const CUES: Record<FaultId, CueCard> = {
  kneeValgus: {
    // was: 'Knees out over your second toes — press the floor apart.'
    cue: 'Press the floor apart with your feet — knees travel out over your second toes.',
    escalate: 'Still drifting. Spread the floor apart with your feet — all the way down, all the way up.',
    regress: 'Hold the bottom. Breathe. Own the position before you move again.',
    // MIRROR-MOVES P2: the reply to a repeated fault — simpler, the same outside anchor
    reply: 'Spread the floor with your feet on the way down.',
  },
  heelRise: {
    // was: 'Heels heavy. Toes long and flat — pull the floor toward your heel.'
    cue: 'Stay heavy on the floor through the whole foot — heels stay down as you sit.',
    // was: 'Your heels are leaving me. Sit SLOWER, heels pinned — the ankle earns the depth.'
    escalate: 'Still lifting. Sit slower and keep the floor under your heels — the depth can wait.',
    regress: 'Stop the set. Ankle rocks against the wall, ten each side, then we go again.',
    reply: 'Whole foot on the floor. Sit slower.',
  },
  // armFall is the shoulder midpoint drifting SIDEWAYS (a front camera reads x — squat-audit.ts). The card used to
  // coach a forward fall ("reach the ceiling", "your arms are falling to the floor"), which is not what was measured.
  armFall: {
    // was: 'Stay centred — shoulders over the middle of your feet on the way down.'
    cue: 'Sink straight down the middle, square to the camera — shoulders stay over the centre of your stance.',
    // was: 'Still drifting to one side. Slow the descent and press both feet evenly.'
    escalate: 'Still drifting to one side. Slow the descent and press evenly into the ground under both feet.',
    regress: 'Hold the top. Reset your stance, breathe twice, then descend only as far as you stay centred.',
    reply: 'Straight down the middle of your stance.',
  },
  lateralShift: {
    cue: 'Fifty-fifty. Don\'t travel — split the floor between both feet.',
    escalate: 'You\'re sliding off centre. Freeze at the bottom — find the middle, then rise.',   // one spelling: centre (P1 review)
    regress: 'Stop. Reset your tripod, and give me a half-squat with no travel.',
    reply: 'Even on the floor under both feet.',
  },
  shallow: {
    // was: 'Own the bottom — hip crease to your knee line, then drive up.'
    cue: 'Own the bottom — sit to about chair height, then push the floor away.',
    escalate: 'Deeper. Slow the way down and sit INTO it — then explode.',
    regress: 'Box squat: sit to a chair height, touch, and stand tall. Depth before speed.',
    reply: 'Sit to chair height, then stand.',
  },
  // elbowFlare is the working (right) elbow rising toward or above the shoulder line, on the press or the row
  // (kinematic-engine.ts: flareRatio). The card used to say "pull it to your ribs, not out to the side" and "feel the
  // lat do the work": a body part to pin, and a muscle to feel.
  elbowFlare: {
    // was: 'Elbow tracks home — pull it to your ribs, not out to the side.'
    cue: 'Keep the handle\'s path low — row it to your back pocket, press it straight out at the wall.',
    // was: 'The elbow is drifting out. Pin it to your side and pull THROUGH the hip.'
    escalate: 'Still climbing. Aim the handle at your back pocket on the row, and straight at the wall ahead on the press.',
    // was: 'Slow the rep down. Half speed, elbow glued, feel the lat do the work.'
    regress: 'Half speed and a lighter handle — row to your back pocket until the path stays low.',
    reply: 'Handle to your back pocket.',
  },
  // shrug is the working shoulder riding up above the shoulder line during the PULL (kinematic-engine.ts).
  shrug: {
    // was: 'Shoulder stays down — neck long. The trap stays out of this.'
    cue: 'Pull the handle back toward the wall behind you, not up toward the ceiling.',
    // was: 'You\'re shrugging the pull. Depress the shoulder FIRST, then row.'
    escalate: 'Still riding up. Let the handle pull your arm long first, then row it back to your pocket.',
    // was: 'Reset. Shoulder blade down and back, hold two seconds, then pull.'
    regress: 'Reset with a lighter handle. Let it hang from a long arm for two seconds, then row.',
    reply: 'Pull back to the wall, not up.',
  },
  // MIRROR-COACH P1 review (2026-09-25): the base cue still said "Ribs stacked over pelvis — seal the cylinder" after the
  // escalation was reworded; the pose model has no rib landmark, and this fault is shoulders over hips.
  trunkOffset: {
    // was: 'Shoulders stacked over hips — set your brace before you move.'
    cue: 'Stand tall toward the ceiling — shoulders stay stacked over your hips.',
    // was: 'Your shoulders are drifting off your hips. Exhale fully, stack up, then go.'
    escalate: 'Still leaning off to one side. Exhale fully, grow tall toward the ceiling, then go.',
    regress: 'Stop. Ninety-ninety breathing, three breaths, then we rebuild the rep.',
    reply: 'Grow tall toward the ceiling.',
  },
};

/** The squat's and the press/row's table: this file's CUES in FAULT_PRIORITY order (MIRROR-MOVES P2: what every engine
 *  used before tables existed, and still the default). */
export const MIRROR_COACH_TABLE: CueTable<FaultId> = { priority: FAULT_PRIORITY, cards: CUES };

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

/** The press/row's three faults (lib/mirror/pressRowStage.ts reads them off the kinematic engine's zones). */
export const PRESS_ROW_CUE_FAULTS: readonly FaultId[] = ['elbowFlare', 'shrug', 'trunkOffset'];

/**
 * THE PRESS/ROW CUES — ON, VERIFIED ON SYNTHETIC GEOMETRY ONLY (NO REAL CAPTURE), THE KNEE'S STANDARD; the owner's word on
 * it is asked for in the P9 fix report. (MIRROR-COACH P9 fix, 2026-09-30, code review.)
 *
 * P9 fed the press/row's three faults to the voice on the Mirror's DEFAULT tab, on thresholds its own config calls
 * placeholders ("Nothing here has been calibrated yet" — rules/config.ts), with only noise-free stick frames behind it.
 * The knee cue waited for a jittered synthetic proof and the owner's word (DECISIONS-2 #19); this one had neither. It
 * now has the proof — lib/mirror/pressRowStage.test.ts, "under landmark jitter": a clean set and a set just inside each
 * fault's line, each filmed over many seeds at lib/pose/synth.ts's default jitter (DEFAULT_NOISE), cue nothing; the
 * three fault shapes still cue under the same jitter; and a whole-trunk side lean is cued as the lean, not a shrug.
 * Measured 2026-09-30: 24 seeds × 4 reps per shape, 0 cues on the clean set and on every just-inside-the-line shape
 * (and on a phone rolled 5°); every past-the-line shape cued on every seed. What it does not have is a person: like the
 * knee, it is verified on synthetic geometry only, and the thresholds (config.ts) are still placeholders — the proof is
 * that 2-D landmark jitter does not cross them, not that they are the right lines for a body.
 * Switch it HERE AND NOWHERE ELSE: false drops the three faults everywhere the knee flag drops the knee (cueableFaults),
 * so the press/row tab is silent (no voice, no bubble, no fade) and the zone dots and the written correctives stay.
 */
export const PRESS_ROW_CUE_VERIFIED = true;

/**
 * The faults the coach may speak about. Everything the audit measures, minus the knee while VALGUS_CUE_VERIFIED is
 * false. Pure, so the harness can gate its visual cues (the knee overlay, the red check) on the same rule the voice uses.
 */
export function cueableFaults<F extends string>(
  faults: readonly F[], valgusVerified: boolean = VALGUS_CUE_VERIFIED, pressRowVerified: boolean = PRESS_ROW_CUE_VERIFIED,
): F[] {
  return faults.filter((f) => (valgusVerified || f !== 'kneeValgus') && (pressRowVerified || !(PRESS_ROW_CUE_FAULTS as readonly string[]).includes(f)));
}

export interface CueEngineOptions<F extends string = FaultId> {
  /** What this engine coaches (MIRROR-MOVES P2). Absent: MIRROR_COACH_TABLE, the squat's and the press/row's. */
  table?: CueTable<F>;
  /** Defaults to VALGUS_CUE_VERIFIED (true since 2026-09-26). Tests of the silent path pass false. */
  valgusVerified?: boolean;
  /** Defaults to PRESS_ROW_CUE_VERIFIED (MIRROR-COACH P9 fix). Tests of the silent path pass false. */
  pressRowVerified?: boolean;
  /**
   * MIRROR-COACH P9 fix (2026-09-30, code review): A FAULT IS CLEARED BY A CLEAN REP, not by a frame without it. The
   * audits read several faults in one phase only (the shrug in the pull, the squat's knee on the way down), so a frame
   * without the fault is not evidence the athlete fixed it. With this on (the harness sets it for both of its engines,
   * which call endRep), decide() never clears a fault; endRep() clears every fault the finished rep did not show, and
   * that clearance also starts its escalation over — a fault that went a whole rep without showing and then came back
   * is cued, not "Stronger:". Off (the default), the engine clears on the first frame without the fault, as it always
   * did — the tests of the frame-timed engine hold that.
   */
  clearByRep?: boolean;
}

export interface CueEvent<F extends string = FaultId> {
  fault: F;
  text: string;
  /** 'reply': the card's simpler wording for a fault repeated this set (REPEAT_REPLY_FIRES) — the cue's own level, said
   *  in its place (MIRROR-MOVES P2). */
  level: 'cue' | 'reply' | 'escalate' | 'regress' | 'confirm';
}

const HOLD_DOWN_MS = 6000;        // TUNE(elijah): one cue lands before the next
const REPEAT_WINDOW_MS = 12000;   // TUNE(elijah): same fault still faulting → escalate
const CLEAR_CONFIRM_MS = 4000;    // TUNE(elijah): fault gone this long → confirm once

// ── THE FADED SCHEDULE (MIRROR-COACH P9, 2026-09-30) ───────────────────────────────────────────────────────────────
//
// WHAT WAS WRONG. The coach cued a fault at the same rate however long ago the athlete had fixed it: every set, every
// rep it showed on, for as long as the page was open. Feedback that never thins out is the thing the athlete learns to
// lean on — the crossref's "Mirror feedback design" row (Kent 2023: sensor biofeedback added nothing on top of good
// coaching) and its cueing row ("fewer cues as reps clean up").
//
// WHAT IT DOES NOW. Each fault the coach has cued keeps a schedule, and the schedule outlives a set:
//   · 'everyRep'    — the coach may speak on any rep that shows the fault (the engine as it always was: one cue at a
//                     time, HOLD_DOWN_MS between cues, escalate after REPEAT_WINDOW_MS).
//   · 'everyThird'  — the coach speaks on every FADED_CUE_EVERY-th rep that shows the fault; the athlete gets the reps
//                     in between to fix it without being told.
//   · 'summaryOnly' — nothing is said during the set; the reps that showed it are listed when the set ends.
// A cue has LANDED when the fault then reads clear for LANDED_CLEAR_REPS reps in a row at the end of the set (at
// 'everyRep' the fault must have been cued at some point — a fault never cued has nothing to fade). A landed fault steps
// one level down for the NEXT set; the level never changes mid-set on its own. The fault COMING BACK — showing on
// RETURN_FAULT_REPS reps in a row — resets it to 'everyRep' at once, in the same set, and the coach speaks on the rep
// that brought it back. A single slip at a faded level is not a return: at 'everyThird' it counts toward the third, at
// 'summaryOnly' it goes in the summary.
//
// WHAT A REP IS. This engine is timed (decide() runs per camera frame); the harness tells it where reps end (endRep, with
// the faults that rep showed) and where a set ends (endSet). With neither called, it behaves exactly as it did before
// (every fault stays at 'everyRep') — cue-engine.test.ts holds that.
//
// The numbers are FEL's first guess, not a finding: TUNE(elijah) on real sets, like the three timers above.

export type FadeLevel = 'everyRep' | 'everyThird' | 'summaryOnly';
/** The schedule, most feedback first. A landed fault moves one step right per set; a returning one goes back to 0. */
export const FADE_SCHEDULE: readonly FadeLevel[] = ['everyRep', 'everyThird', 'summaryOnly'];
/** K: clear reps in a row, at the end of a set, for a cue to have landed. TUNE(elijah) */
export const LANDED_CLEAR_REPS = 3;
/** At 'everyThird', the coach speaks on every this-many-th rep that shows the fault. TUNE(elijah) */
export const FADED_CUE_EVERY = 3;
/** A faded fault on this many reps in a row has come back: straight back to 'everyRep'. TUNE(elijah) */
export const RETURN_FAULT_REPS = 2;

// ── THE REPLY TO A REPEATED FAULT (MIRROR-MOVES P2, 2026-10-07) ─────────────────────────────────────────────────────
//
// A fault that keeps coming back in a set used to hear the SAME cue each time it was voiced: with clearByRep a clean rep
// starts the fault's escalation over, so a fault on reps 1, 3, 5 and 7 heard "Press the floor apart with your feet —
// knees travel out over your second toes." four times — nagging, in the coach's own words. Now, from the
// REPEAT_REPLY_FIRES-th rep of a set that shows the fault, a voiced cue-level line says the card's `reply` instead: a
// different, shorter wording of the same action. It alternates with the cue after that (reply, cue, reply…), so neither
// wording is said twice running for the same fault. NOTHING ELSE MOVES: the reply is said only where the cue would have
// been — the same voiceable() schedule (every rep / every third / summary only), the same hold-down, the same priority —
// and escalate and regress are untouched (a fault that survives the repeat window still gets "Still …" and then the
// regression). It counts reps the way the fade does (endRep), so a set that never calls endRep never replies.
/** The rep of a set (counting the one under way) from which a repeated fault's cue is said as its reply. TUNE(elijah) */
export const REPEAT_REPLY_FIRES = 3;

/** One fault's set, as endSet() closes it. */
export interface FaultSetReport<F extends string = FaultId> {
  fault: F;
  /** The schedule it ran on this set (after any return — 'everyRep' if it came back). */
  level: FadeLevel;
  /** The schedule it starts the next set on. */
  next: FadeLevel;
  /** Reps of this set that showed it. */
  faultReps: number;
  /** Cues spoken for it this set (confirmations not counted). */
  spoken: number;
  /** It read clear for LANDED_CLEAR_REPS+ reps at the end of the set (and has a cue to fade). */
  landed: boolean;
  /** It came back this set (RETURN_FAULT_REPS in a row) and was reset to 'everyRep'. */
  returned: boolean;
  /** MIRROR-COACH P9 fix: faded, did not land, and showed on FADED_CUE_EVERY+ reps — one step back up for the next set. */
  slipped: boolean;
}

export interface SetReport<F extends string = FaultId> {
  reps: number;
  /** Every fault that was cued, showed, or carries a faded schedule — in the table's priority order. */
  faults: FaultSetReport<F>[];
}

export class CueEngine<F extends string = FaultId> {
  private readonly valgusVerified: boolean;
  private readonly pressRowVerified: boolean;
  private readonly clearByRep: boolean;
  private readonly priority: readonly F[];
  private readonly cards: Readonly<Record<F, CueCard>>;

  constructor(opts: CueEngineOptions<F> = {}) {
    this.valgusVerified = opts.valgusVerified ?? VALGUS_CUE_VERIFIED;
    this.pressRowVerified = opts.pressRowVerified ?? PRESS_ROW_CUE_VERIFIED;
    this.clearByRep = opts.clearByRep ?? false;
    const table = (opts.table ?? MIRROR_COACH_TABLE) as unknown as CueTable<F>;
    this.priority = table.priority;
    this.cards = table.cards;
  }

  /** The faults this engine may know about at all (the unverified reads are dropped first, everywhere). */
  private cueable(faults: readonly F[]): F[] {
    return cueableFaults(faults, this.valgusVerified, this.pressRowVerified);
  }
  /** The last pose time decide() saw — the clock a rep-level clearance is stamped with when endRep gets none. */
  private lastNowMs: number | null = null;

  /** Null until the first cue — a 0 start would hold down the coach for the
   *  session's first HOLD_DOWN_MS (measured: the first fault never got cued). */
  private lastCueAt: number | null = null;
  private lastFault: F | null = null;
  private faultSinceMs = new Map<F, number>();
  private clearedAtMs = new Map<F, number>();
  private confirmed = new Set<F>();
  private escalations = new Map<F, number>();

  // the faded schedule — outlives a set (reset() keeps it; forget() clears it)
  private schedule = new Map<F, FadeLevel>();
  /** Faults the coach has spoken a cue for, ever (a fault never cued has nothing to fade). */
  private everCued = new Set<F>();
  // this set's rep book — cleared by reset() and endSet()
  private setReps = 0;
  private faultReps = new Map<F, number>();
  private faultStreak = new Map<F, number>();
  private lastFaultRep = new Map<F, number>();
  private spoken = new Map<F, number>();
  private returned = new Set<F>();
  /** The cue-level wording last said for each fault this set (cue or reply) — the reply alternates with the cue. */
  private lastSaid = new Map<F, string>();

  /**
   * A new set: the timers and this set's rep book are cleared. The faded schedule is KEPT — what the athlete fixed last
   * set is what the coach says less about this set. (MIRROR-COACH P9: reset() used to be the only clear, and it cleared
   * everything the engine knew; it still clears everything it knew before P9.) A set abandoned before endSet() earns no
   * step down: its reps are dropped here.
   */
  reset(): void {
    this.lastCueAt = null;
    this.lastFault = null;
    this.faultSinceMs.clear();
    this.clearedAtMs.clear();
    this.confirmed.clear();
    this.escalations.clear();
    this.setReps = 0;
    this.faultReps.clear();
    this.faultStreak.clear();
    this.lastFaultRep.clear();
    this.spoken.clear();
    this.returned.clear();
    this.lastSaid.clear();
  }

  /** Everything, the faded schedule included: a different athlete, or a coach starting the fade over. */
  forget(): void {
    this.reset();
    this.schedule.clear();
    this.everCued.clear();
  }

  /** The schedule a fault is on right now. */
  levelOf(fault: F): FadeLevel {
    return this.schedule.get(fault) ?? 'everyRep';
  }

  /**
   * May the harness PAINT this fault on the rep under way (MIRROR-COACH P9 fix)? The same rule as the voice: every rep at
   * 'everyRep', on the voiced rep at 'everyThird', never at 'summaryOnly' unless it is coming back. The fade's reason —
   * feedback that never thins out is what the athlete leans on — holds for the red overlay as much as for the voice.
   */
  isVoiceable(fault: F): boolean {
    return this.voiceable(fault);
  }

  /** A confirmation is speech: at a faded level it is said only for a fault the coach spoke about this set. */
  private mayConfirm(f: F): boolean {
    return this.levelOf(f) === 'everyRep' || (this.spoken.get(f) ?? 0) > 0;
  }

  /**
   * May the coach speak about this active fault on the rep under way? 'everyRep' always; 'everyThird' when this rep is
   * the third (sixth, …) of the set to show it; never at 'summaryOnly' — unless this rep brings it back (the one before
   * showed it too), which is a return and gets the voice at once.
   */
  private voiceable(f: F): boolean {
    const level = this.levelOf(f);
    if (level === 'everyRep') return true;
    if ((this.faultStreak.get(f) ?? 0) + 1 >= RETURN_FAULT_REPS) return true;
    if (level === 'everyThird') return ((this.faultReps.get(f) ?? 0) + 1) % FADED_CUE_EVERY === 0;
    return false;
  }

  /**
   * A rep ended, and these are the faults it showed (any frame of it). Call once per counted rep, after that rep's
   * frames went through decide(). A fault showing on RETURN_FAULT_REPS reps in a row is reset to 'everyRep' here.
   */
  endRep(faults: readonly F[], nowMs?: number): void {
    const shown = new Set(this.cueable(faults));
    const t = nowMs ?? this.lastNowMs;
    this.setReps += 1;
    for (const f of this.priority) {
      if (!shown.has(f)) {
        this.faultStreak.set(f, 0);
        // MIRROR-COACH P9 fix: a whole rep without it is a clearance (clearByRep, above) — and its escalation starts over
        if (this.clearByRep && this.faultSinceMs.has(f)) {
          this.faultSinceMs.delete(f);
          this.escalations.delete(f);
          if (t !== null) this.clearedAtMs.set(f, t);
        }
        continue;
      }
      this.faultReps.set(f, (this.faultReps.get(f) ?? 0) + 1);
      const streak = (this.faultStreak.get(f) ?? 0) + 1;
      this.faultStreak.set(f, streak);
      this.lastFaultRep.set(f, this.setReps);
      if (streak >= RETURN_FAULT_REPS && this.levelOf(f) !== 'everyRep') {
        this.schedule.set(f, 'everyRep');
        this.returned.add(f);
      }
    }
  }

  /**
   * The set is over: every fault whose cue landed steps one level down for the next set, and the set's report comes
   * back (what the review says — fadeReviewLines). The timers and the rep book are cleared, as reset() does.
   * One engine per pattern: a fault this set never could show (the elbow, in a squat set) would read "clear" here and
   * step down for nothing — mirror-harness.tsx keeps the squat's engine and the press/row's apart for that reason.
   */
  endSet(): SetReport<F> {
    const faults: FaultSetReport<F>[] = [];
    for (const f of this.priority) {
      const level = this.levelOf(f);
      const faultReps = this.faultReps.get(f) ?? 0;
      const spoken = this.spoken.get(f) ?? 0;
      if (level === 'everyRep' && !this.everCued.has(f) && faultReps === 0) continue;   // nothing to say about it
      const clearTail = this.setReps - (this.lastFaultRep.get(f) ?? 0);
      const hasCue = level !== 'everyRep' || this.everCued.has(f);
      const landed = hasCue && clearTail >= LANDED_CLEAR_REPS;
      // MIRROR-COACH P9 fix (2026-09-30, code review): A FADED FAULT THAT KEPT SHOWING STEPS BACK UP. A return is two reps
      // in a row, and this could only ever step a fault down or keep it — so a fault at 'summaryOnly' on every other rep
      // (4 of 8) was never said again, never reset, and the review told the athlete "you had been holding it". Now a
      // faded fault that did not land and showed on FADED_CUE_EVERY or more reps of the set goes one step back up.
      const slipped = !landed && !this.returned.has(f) && level !== 'everyRep' && faultReps >= FADED_CUE_EVERY;
      const at = FADE_SCHEDULE.indexOf(level);
      const next = landed ? FADE_SCHEDULE[Math.min(at + 1, FADE_SCHEDULE.length - 1)] : slipped ? FADE_SCHEDULE[Math.max(at - 1, 0)] : level;
      if (next !== 'everyRep') this.schedule.set(f, next); else this.schedule.delete(f);
      faults.push({ fault: f, level, next, faultReps, spoken, landed, returned: this.returned.has(f), slipped });
    }
    const report: SetReport<F> = { reps: this.setReps, faults };
    this.reset();
    return report;
  }

  /** Feed the measured fault set. Returns a cue when the coach speaks. */
  decide(nowMs: number, active: readonly F[]): CueEvent<F> | null {
    const evt = this.decideVoice(nowMs, active);
    if (evt && evt.level !== 'confirm') {
      this.everCued.add(evt.fault);
      this.spoken.set(evt.fault, (this.spoken.get(evt.fault) ?? 0) + 1);
    }
    return evt;
  }

  private decideVoice(nowMs: number, active: readonly F[]): CueEvent<F> | null {
    this.lastNowMs = nowMs;
    // an unverified read (the knee, the press/row) is dropped before anything else sees it: it cannot be cued,
    // escalated, confirmed, or hold the voice down for the fault behind it.
    //
    // MIRROR-COACH P9 FIX (2026-09-30, code review): A QUIET FAULT IS STILL A FAULT. P9 dropped a faded fault on a rep its
    // schedule keeps quiet from this set too — BEFORE the persistence and clearance bookkeeping — so a fault that was
    // present but quiet had its onset deleted and a clearance stamped, as if the athlete had fixed it; four seconds on,
    // the coach said "There it is. Own it." on a frame where it was still showing (measured with the real engine, driven
    // the way the harness drives it: heelRise at 'everyThird' on reps 1, 3, 5 and 7 of a slow set confirmed on rep 7,
    // heels lifting). The bookkeeping runs on everything PRESENT; the schedule only decides who gets the voice, below.
    const present = new Set(this.cueable(active));

    // track fault persistence + clearances (a clearance on the first frame without it — or, with clearByRep, only at
    // the end of a whole rep without it: endRep)
    for (const f of this.priority) {
      if (present.has(f)) {
        this.faultSinceMs.set(f, this.faultSinceMs.get(f) ?? nowMs);
        this.clearedAtMs.delete(f);
        this.confirmed.delete(f);
      } else if (!this.clearByRep && this.faultSinceMs.has(f)) {
        this.faultSinceMs.delete(f);
        this.clearedAtMs.set(f, nowMs);
      }
    }

    // a cleared fault earns ONE confirmation ("there it is — own it"), then silence. Never for a fault on screen, and
    // (P9 fix) at a faded level only for a fault the coach spoke about this set — a confirmation is speech too, and
    // 'summaryOnly' says nothing during the set.
    for (const [f, clearedAt] of this.clearedAtMs) {
      if (present.has(f)) continue;
      if (!this.mayConfirm(f)) { this.clearedAtMs.delete(f); continue; }
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
    // (P9 fix: the faded schedule decides this, and only this — a quiet fault is present, just not voiced)
    const fault = this.priority.find((f) => present.has(f) && this.voiceable(f));
    if (!fault) return null;
    // MIRROR-COACH P4 review (2026-09-25) — A LOWER-PRIORITY FAULT COULD HOLD THE MIC DOWN ON THE KNEE. The hold-down
    // used to block ANY new cue for HOLD_DOWN_MS once one had spoken, whichever fault it was for — so a false or minor
    // fault (the heel-rise bug above is exactly this) that fired first kept the coach silent about a real, active,
    // higher-priority fault (the knee) for up to HOLD_DOWN_MS. The hold-down still protects a fault from being
    // interrupted by one of EQUAL or LOWER priority (one cue lands before the coach moves on); it no longer protects a
    // lower one from being pre-empted by a higher one that has since started faulting.
    const heldFault = this.lastFault !== null ? this.priority.indexOf(this.lastFault) : -1;
    const outranksHeld = heldFault >= 0 && this.priority.indexOf(fault) < heldFault;
    if (!outranksHeld && this.lastCueAt !== null && nowMs - this.lastCueAt < HOLD_DOWN_MS) return null;

    const since = this.faultSinceMs.get(fault) ?? nowMs;
    const level = this.escalations.get(fault) ?? 0;
    // the same fault surviving a repeat window escalates: cue → firmer → regress
    const survived = since !== nowMs && nowMs - since >= REPEAT_WINDOW_MS * (level + 1) && this.lastFault === fault;
    const nextLevel = survived ? level + 1 : level;

    this.lastCueAt = nowMs;
    this.lastFault = fault;
    this.escalations.set(fault, nextLevel);
    const card = this.cards[fault];
    if (nextLevel >= 2) return { fault, text: card.regress, level: 'regress' };
    if (nextLevel === 1) return { fault, text: card.escalate, level: 'escalate' };
    // THE REPLY TO A REPEATED FAULT (MIRROR-MOVES P2, above): from the REPEAT_REPLY_FIRES-th rep of the set that shows it,
    // the cue's slot says the simpler wording — alternating with the cue, so neither is said twice running
    const fires = (this.faultReps.get(fault) ?? 0) + 1;
    const reply = card.reply && fires >= REPEAT_REPLY_FIRES && this.lastSaid.get(fault) !== card.reply;
    const text = reply ? card.reply! : card.cue;
    this.lastSaid.set(fault, text);
    return { fault, text, level: reply ? 'reply' : 'cue' };
  }
}

/**
 * What the review says about the fade, one line per fault that has something to say (MIRROR-COACH P9). 'summaryOnly'
 * is where a faded fault's reps are said — here, after the set, never during it. `label` names a fault in the review's
 * words (lib/mirror/squatStage.ts SQUAT_FAULT_LABEL, lib/mirror/pressRowStage.ts PRESS_ROW_FAULT_LABEL).
 */
export function fadeReviewLines<F extends string>(report: SetReport<F>, label: (f: F) => string): string[] {
  const lines: string[] = [];
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  for (const r of report.faults) {
    const name = label(r.fault);
    if (r.returned) {
      lines.push(`${name} came back on ${r.faultReps} of ${report.reps} reps, so the cues for it started again.`);
    } else if (r.slipped) {
      // MIRROR-COACH P9 fix: the words follow the reps — a fault on half the set was not being "held"
      lines.push(`${name}: ${r.faultReps} of ${report.reps} reps${r.level === 'summaryOnly' ? ', not cued during the set' : ', cued every third time it showed'}. `
        + `That is too often to leave it, so next set it gets ${r.next === 'everyRep' ? 'a cue every time it shows' : 'a cue every third time it shows'} again.`);
    } else if (r.level === 'summaryOnly' && r.faultReps > 0) {
      lines.push(`${name}: ${r.faultReps} of ${report.reps} reps. Left for this summary: it had stayed away at the end of your earlier sets.`);
    } else if (r.level === 'everyThird' && r.faultReps > r.spoken) {
      lines.push(`${name}: ${r.faultReps} of ${report.reps} reps, cued every third time it showed.`);
    }
    // MIRROR-COACH P9 fix (2026-09-30, code review): it said "<fault> held." — read plainly, the FAULT persisted, the
    // opposite of what landed means (the fix held: the fault stayed away for the last LANDED_CLEAR_REPS reps)
    if (r.landed && r.next !== r.level) {
      lines.push(r.next === 'everyThird'
        ? `Fixed and kept: ${lower(name)} stayed away for the last ${LANDED_CLEAR_REPS}+ reps. Next set it gets a cue every third time it shows.`
        : `Fixed and kept again: ${lower(name)} stayed away for the last ${LANDED_CLEAR_REPS}+ reps. Next set it is saved for the end of the set.`);
    }
  }
  return lines;
}

export { CUES };
