import { describe, expect, it } from 'vitest';
import {
  GESTURE_BUTTON, GESTURE_LABEL, IDX, PoseController, T, calibrateFrom, readBody,
  type Calibration, type PoseInput, type PoseLandmark,
} from './poseControl';
import type { FelInput } from '../babylon/core/InputBus';

/** A body standing still, facing the camera, arms down. Shoulder width 0.20 is the ruler everything uses. */
function standing(over: Partial<Record<keyof typeof IDX, [number, number]>> = {}, vis = 0.9): PoseInput {
  const base: Record<keyof typeof IDX, [number, number]> = {
    shoulderL: [0.40, 0.30], shoulderR: [0.60, 0.30],
    elbowL: [0.38, 0.45], elbowR: [0.62, 0.45],
    wristL: [0.37, 0.58], wristR: [0.63, 0.58],
    hipL: [0.44, 0.55], hipR: [0.56, 0.55],
    kneeL: [0.44, 0.75], kneeR: [0.56, 0.75],
    ankleL: [0.44, 0.92], ankleR: [0.56, 0.92],
  };
  const pts = { ...base, ...over };
  const landmarks: PoseLandmark[] = [];
  for (let i = 0; i < 33; i++) landmarks[i] = { x: 0, y: 0, visibility: 0 };
  (Object.keys(pts) as (keyof typeof IDX)[]).forEach((k) => {
    landmarks[IDX[k]] = { x: pts[k][0], y: pts[k][1], visibility: vis };
  });
  return { landmarks, present: true };
}

const CAL: Calibration = calibrateFrom(standing())!;

function buttons(events: FelInput[]): { btn: string; pressed: boolean }[] {
  return events.filter((e): e is Extract<FelInput, { t: 'button' }> => e.t === 'button')
    .map((e) => ({ btn: e.btn, pressed: e.pressed }));
}
function stick(events: FelInput[]) {
  return events.find((e): e is Extract<FelInput, { t: 'stick' }> => e.t === 'stick') ?? null;
}
function trigger(events: FelInput[]) {
  return events.find((e): e is Extract<FelInput, { t: 'trigger' }> => e.t === 'trigger') ?? null;
}

describe('reading a body', () => {
  it('reads one that is standing there', () => {
    const b = readBody(standing())!;
    expect(b).not.toBeNull();
    expect(b.shoulderW).toBeCloseTo(0.20, 2);
  });

  it('refuses a frame with no body in it', () => {
    expect(readBody({ landmarks: [], present: false })).toBeNull();
    expect(readBody({ landmarks: [] })).toBeNull();
  });

  it('REFUSES A GUESS — a low-confidence landmark must not press a button', () => {
    expect(readBody(standing({}, 0.2))).toBeNull();
  });

  it('refuses a body turned edge-on, where the ruler collapses', () => {
    // Shoulders nearly on top of each other: dividing by that width turns a twitch into full deflection.
    expect(readBody(standing({ shoulderL: [0.50, 0.30], shoulderR: [0.505, 0.30] }))).toBeNull();
  });

  it('copes with the feet out of shot, which is normal with a phone close up', () => {
    const noFeet = standing();
    noFeet.landmarks[IDX.ankleL] = { x: 0, y: 0, visibility: 0 };
    noFeet.landmarks[IDX.ankleR] = { x: 0, y: 0, visibility: 0 };
    const b = readBody(noFeet);
    expect(b).not.toBeNull();
    expect(Number.isNaN(b!.ankleY)).toBe(true);
  });
});

describe('standing still does nothing', () => {
  it('emits no button at all', () => {
    const c = new PoseController(CAL);
    expect(buttons(c.read(standing()))).toEqual([]);
  });

  it('leaves the stick inside the deadzone at rest', () => {
    const c = new PoseController(CAL);
    const s = stick(c.read(standing()));
    expect(Math.abs(s?.x ?? 0)).toBe(0);
  });

  it('SAYS NOTHING on a second identical frame — a held button re-sent every frame is unusable', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    expect(c.read(standing())).toEqual([]);
  });
});

describe('lean to move', () => {
  it('pushes the stick when the body leans, and the right way round', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    // Leaning towards larger x — screen-right for a mirrored preview — should read as right on the stick.
    const right = stick(c.read(standing({ hipL: [0.60, 0.55], hipR: [0.72, 0.55] })));
    expect(right!.x).toBeLessThan(0);   // mirrored: image-right is the player's left
    const left = stick(c.read(standing({ hipL: [0.28, 0.55], hipR: [0.40, 0.55] })));
    expect(left!.x).toBeGreaterThan(0);
  });

  it('ignores a lean smaller than the deadzone, because nobody stands perfectly still', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    const tiny = (T.leanDead * 0.2) * 0.20;
    expect(stick(c.read(standing({ hipL: [0.44 + tiny, 0.55], hipR: [0.56 + tiny, 0.55] })))?.x ?? 0).toBe(0);
  });

  it('never exceeds full deflection however far somebody leans', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    const s = stick(c.read(standing({ hipL: [0.90, 0.55], hipR: [1.02, 0.55] })));
    expect(Math.abs(s!.x)).toBeLessThanOrEqual(1);
  });

  it('IS THE SAME GAME FOR A BIG BODY AND A SMALL ONE', () => {
    // Everything is measured in the player's own shoulder widths, so a tall adult far away and a small kid
    // up close have to produce the same stick for the same proportional lean.
    const small = standing({ shoulderL: [0.45, 0.30], shoulderR: [0.55, 0.30], hipL: [0.47, 0.55], hipR: [0.53, 0.55] });
    const calSmall = calibrateFrom(small)!;
    const cSmall = new PoseController(calSmall);
    cSmall.read(small);
    // lean by 0.5 shoulder widths — small body's width is 0.10
    const leanedSmall = standing({ shoulderL: [0.45, 0.30], shoulderR: [0.55, 0.30], hipL: [0.52, 0.55], hipR: [0.58, 0.55] });
    const sSmall = stick(cSmall.read(leanedSmall))!;

    const cBig = new PoseController(CAL);          // width 0.20
    cBig.read(standing());
    const leanedBig = standing({ hipL: [0.54, 0.55], hipR: [0.66, 0.55] });  // also 0.5 widths
    const sBig = stick(cBig.read(leanedBig))!;

    expect(Math.abs(sSmall.x - sBig.x)).toBeLessThan(0.08);
  });
});

describe('squat to charge', () => {
  it('ramps the trigger with depth', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    const shallow = trigger(c.read(standing({ hipL: [0.44, 0.60], hipR: [0.56, 0.60] })));
    const deep = trigger(c.read(standing({ hipL: [0.44, 0.68], hipR: [0.56, 0.68] })));
    expect(shallow!.value).toBeGreaterThan(0);
    expect(deep!.value).toBeGreaterThan(shallow!.value);
    expect(deep!.value).toBeLessThanOrEqual(1);
  });

  it('is zero while standing', () => {
    const c = new PoseController(CAL);
    expect(trigger(c.read(standing()))?.value ?? 0).toBe(0);
  });
});

describe('the gestures', () => {
  const armUpR = standing({ wristR: [0.63, 0.20] });
  const armUpL = standing({ wristL: [0.37, 0.20] });
  const bothUp = standing({ wristL: [0.37, 0.20], wristR: [0.63, 0.20] });
  const reachR = standing({ wristR: [0.86, 0.32] });

  it('maps one gesture to one button, with nothing doubled up', () => {
    const used = Object.values(GESTURE_BUTTON);
    expect(new Set(used).size).toBe(used.length);
  });

  it('names every gesture for the calibration card', () => {
    for (const g of Object.keys(GESTURE_BUTTON) as (keyof typeof GESTURE_BUTTON)[]) {
      expect(GESTURE_LABEL[g].length).toBeGreaterThan(3);
    }
  });

  it('presses B for the right hand and X for the left', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    expect(buttons(c.read(armUpR))).toContainEqual({ btn: 'B', pressed: true });
    const c2 = new PoseController(CAL);
    c2.read(standing());
    expect(buttons(c2.read(armUpL))).toContainEqual({ btn: 'X', pressed: true });
  });

  it('TREATS BOTH HANDS UP AS ITS OWN GESTURE, not as the two single ones at once', () => {
    // Otherwise raising both fires three buttons and there is no way to ask for Y on its own.
    const c = new PoseController(CAL);
    c.read(standing());
    const b = buttons(c.read(bothUp));
    expect(b).toContainEqual({ btn: 'Y', pressed: true });
    expect(b.filter((x) => x.pressed).map((x) => x.btn)).toEqual(['Y']);
  });

  it('releases the single-hand button when the second hand joins it', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    c.read(armUpR);
    const b = buttons(c.read(bothUp));
    expect(b).toContainEqual({ btn: 'B', pressed: false });
    expect(b).toContainEqual({ btn: 'Y', pressed: true });
  });

  it('reads an arm held out as a shoulder button', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    expect(buttons(c.read(reachR))).toContainEqual({ btn: 'R1', pressed: true });
  });

  it('does not fire a reach while that arm is raised — one arm, one verb', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    const b = buttons(c.read(standing({ wristR: [0.86, 0.18] })));
    expect(b.filter((x) => x.pressed).map((x) => x.btn)).not.toContain('R1');
  });
});

describe('CHATTER — the thing that makes gesture control unplayable', () => {
  it('does not machine-gun a button held at the boundary', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    // Just over the ON line, then wobbling in the gap between ON and OFF.
    const onLine = 0.30 - (T.raiseOn + 0.01) * 0.20;
    c.read(standing({ wristR: [0.63, onLine] }));

    let presses = 0;
    for (let i = 0; i < 40; i++) {
      const jitter = (i % 2 === 0 ? 1 : -1) * 0.004;   // inside the hysteresis gap
      presses += buttons(c.read(standing({ wristR: [0.63, onLine + jitter] }))).length;
    }
    expect(presses, 'the button fired again while the hand hovered').toBe(0);
  });

  it('needs a real drop below the OFF line to let go', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    const on = 0.30 - (T.raiseOn + 0.02) * 0.20;
    c.read(standing({ wristR: [0.63, on] }));
    // Still above the OFF line: stays pressed.
    expect(buttons(c.read(standing({ wristR: [0.63, 0.30 - (T.raiseOff + 0.01) * 0.20] })))).toEqual([]);
    // Now below it.
    expect(buttons(c.read(standing({ wristR: [0.63, 0.58] })))).toContainEqual({ btn: 'B', pressed: false });
  });
});

describe('LOSING THE BODY LETS GO OF EVERYTHING', () => {
  it('releases a held button and centres the stick when tracking drops', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    c.read(standing({ wristR: [0.63, 0.20], hipL: [0.60, 0.55], hipR: [0.72, 0.55] }));

    const lost = c.read({ landmarks: [], present: false });
    expect(buttons(lost)).toContainEqual({ btn: 'B', pressed: false });
    const s = stick(lost);
    expect(s).toEqual({ t: 'stick', side: 'L', x: 0, y: 0 });
  });

  it('is quiet while the body stays gone, rather than releasing over and over', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    c.read({ landmarks: [], present: false });
    expect(c.read({ landmarks: [], present: false })).toEqual([]);
  });

  it('lets go when asked directly, for switching body control off mid-game', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    c.read(standing({ wristR: [0.63, 0.20] }));
    expect(buttons(c.release())).toContainEqual({ btn: 'B', pressed: false });
  });

  it('A LOW-CONFIDENCE FRAME COUNTS AS LOST, not as a neutral body', () => {
    // The failure this prevents: the tracker half-loses somebody mid-lean, reports garbage landmarks with low
    // confidence, and the character keeps running because nothing said stop.
    const c = new PoseController(CAL);
    c.read(standing());
    c.read(standing({ hipL: [0.60, 0.55], hipR: [0.72, 0.55] }));
    const s = stick(c.read(standing({}, 0.1)));
    expect(s).toEqual({ t: 'stick', side: 'L', x: 0, y: 0 });
  });
});

describe('calibration', () => {
  it('is taken from a frame of somebody standing still', () => {
    const cal = calibrateFrom(standing())!;
    expect(cal.shoulderW).toBeCloseTo(0.20, 2);
    expect(cal.centreX).toBeCloseTo(0.50, 2);
  });

  it('refuses to calibrate on a frame with no usable body', () => {
    expect(calibrateFrom({ landmarks: [], present: false })).toBeNull();
    expect(calibrateFrom(standing({}, 0.1))).toBeNull();
  });

  it('can be retaken mid-session, because people move the phone', () => {
    const c = new PoseController(CAL);
    c.read(standing());
    const shifted = standing({ hipL: [0.64, 0.55], hipR: [0.76, 0.55] });
    expect(Math.abs(stick(c.read(shifted))?.x ?? 0)).toBeGreaterThan(0);
    c.recalibrate(calibrateFrom(shifted)!);
    c.read(shifted);
    expect(Math.abs(stick(c.read(shifted))?.x ?? 0)).toBe(0);
  });
});
