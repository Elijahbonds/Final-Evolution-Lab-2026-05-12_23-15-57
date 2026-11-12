// COMBINE-DAY: the jump station's live take, on the JUMP-PRO bench's filmed takes (lib/jump/ballistic.ts: a physics body
// filmed through the app's own virtual camera) — the readiness check's measured path with the station's attempts. Also
// the approach video's mapping to attempts, and the draft copy behind its flag.
import { describe, expect, it } from 'vitest';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { touchHeight } from '@/lib/jump/reach';
import type { ApproachJump } from '@/lib/jump/approach';
import { JumpTake, takeAttempts } from './jumpTake';
import { approachAttempts } from './approach';
import { DRAFT_LINES, HELD_LINES, KEPT_ON_DEVICE_LINE, draftCopyOn, say, NO_ACCURACY_LINE } from './copy';

function run(heights: number[], jumps: number, fps = 60, seed = 5) {
  const take = buildTake(heights.map((m) => ({ trial: { heightM: m } })), { leadS: 3.2 });
  const { frames, truth } = filmTake(take, { fps, seed });
  const c = new JumpTake({ jumps, aspect: 4 / 3, cameraFps: fps });
  const steps = new Set<string>();
  let doneAt: number | null = null;
  for (const f of frames) { const v = c.push(f); steps.add(v.step); if (v.step === 'done') { doneAt = f.t; break; } }
  return { r: c.finish(), truth, steps, doneAt };
}

describe('the jump station\'s take', () => {
  it.each([30, 60])('%i fps: stand → jump → done on the last asked landing; each jump an attempt near the truth', (fps) => {
    const { r, truth, steps, doneAt } = run([0.4, 0.43, 0.41], 3, fps);
    expect([...steps]).toEqual(['stand', 'jump', 'done']);
    expect(doneAt).not.toBeNull();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.attempts).toHaveLength(3);
    r.attempts.forEach((a, i) => {
      expect(a.value).not.toBeNull();
      expect(Math.abs((a.value as number) - truth[i].heightV0Cm)).toBeLessThan(3.5);
    });
  });

  it('asks for as many jumps as the station has attempts: one attempt ends on the first landing', () => {
    const { r, steps } = run([0.4, 0.42, 0.41], 1);
    expect(steps.has('done')).toBe(true);
    expect(r.ok && r.attempts.length).toBe(1);
  });

  it('no still stand, no read: it says what to fix', () => {
    const c = new JumpTake({ jumps: 3, aspect: 4 / 3 });
    for (let t = 0; t < 3000; t += 33) c.push({ t, present: false, image: [] });
    expect(c.view().step).toBe('stand');
    expect(c.finish().ok).toBe(false);
  });

  it('a refused jump or an outlier is a no-mark, never a number; no jump at all is not a take', () => {
    const t5 = {
      jumps: [
        { index: 1, valid: true, heightCm: 40.04 }, { index: 2, valid: false, heightCm: 12 }, { index: 3, valid: true, heightCm: 61 },
      ],
      session: { outliers: [3] },
    } as never;
    expect(takeAttempts(t5, 3)).toEqual({ ok: true, attempts: [{ value: 40 }, { value: null }, { value: null }] });
    expect(takeAttempts(t5, 1)).toEqual({ ok: true, attempts: [{ value: 40 }] });
    expect(takeAttempts({ jumps: [] } as never, 3).ok).toBe(false);
  });
});

describe('the approach video', () => {
  const jump = (o: Partial<ApproachJump>): ApproachJump => ({
    index: 1, valid: true, takeoffT: 0, landT: 600, flightMs: 600, heightCm: 70.04, heightSdCm: 1, heightFlightCm: 70, landDropCm: 0, method: 'refined',
    takeoffFoot: 'left', speedMps: 3, plusMinusCm: 4, legPathM: 0.87, legPathSdShare: 0.02, quality: { flags: [] } as never, ...o,
  });
  const REACH = { reachOverLeg: 2.4, reachOverLegSd: 0.03 };

  it('each jump in the clip is an attempt; with a standing reach read here, the touch height too (no ±)', () => {
    const read = { jumps: [jump({}), jump({ index: 2, valid: false }), jump({ index: 3, heightCm: 66 })] };
    const out = approachAttempts(read, REACH, 3);
    expect(out.map((a) => a.value)).toEqual([70, null, 66]);
    expect(out[0].touchCm).toBe(touchHeight(jump({}), REACH)!.touchCm);
    expect(out[1].touchCm).toBeNull();
    expect(Object.keys(out[0])).toEqual(['value', 'touchCm']);
  });

  it('no reach: the vertical only; a jump with no leg ruler has no touch; never more than the attempts', () => {
    expect(approachAttempts({ jumps: [jump({})] }, null, 3)).toEqual([{ value: 70, touchCm: null }]);
    expect(approachAttempts({ jumps: [jump({ legPathM: null })] }, REACH, 3)[0].touchCm).toBeNull();
    expect(approachAttempts({ jumps: [jump({}), jump({}), jump({})] }, null, 2)).toHaveLength(2);
  });
});

describe('the draft copy (owner approval pending)', () => {
  it('is off unless the flag is exactly "true": the placeholders show until then', () => {
    expect(draftCopyOn(undefined)).toBe(false);
    expect(draftCopyOn('1')).toBe(false);
    expect(draftCopyOn('true')).toBe(true);
    expect(say(KEPT_ON_DEVICE_LINE, false)).toBe('On this phone only.');
    expect(say(KEPT_ON_DEVICE_LINE, true)).toMatch(/^Kept on this phone only/);
  });

  it('every refusal of the team gate has a held line, and no line claims accuracy, lab grade or a ±', () => {
    expect(Object.keys(HELD_LINES).sort()).toEqual(['age_required', 'age_unknown', 'guardian_consent_required', 'under_13']);
    for (const l of [...DRAFT_LINES.flatMap((d) => [d.draft, d.placeholder]), NO_ACCURACY_LINE]) {
      expect(l).not.toMatch(/lab[- ]grade|±|\+\/-|accura|precise|clinical|diagnos/i);
    }
  });
});
