import { describe, expect, it } from 'vitest';
import { decodePose, encodePose, fromBase64, parseCtl, POSE_BYTES, POSE_POINTS, toBase64, XY_MAX, XY_MIN } from './wire';
import { squatSet } from '@/tests/helpers/liveSets';

describe('pose frames on the wire', () => {
  const f = squatSet(['clean'])[40];

  it('are compact: 105 bytes, numbers only', () => {
    expect(POSE_BYTES).toBe(10 + POSE_POINTS.length * 5);
    expect(POSE_BYTES).toBe(105);
    expect(encodePose(f, 7, f.t + 30).byteLength).toBe(POSE_BYTES);
  });

  it('round-trip to within the 16-bit step on x and y, 1/255 on visibility', () => {
    const d = decodePose(encodePose(f, 70000, f.t + 31))!;
    expect(d.seq).toBe(70000 & 0xffff);
    expect(d.t).toBe(Math.round(f.t));
    expect(d.lag).toBe(31);
    expect(d.present).toBe(true);
    expect(d.image).toHaveLength(33);
    const step = (XY_MAX - XY_MIN) / 65535;
    for (const i of POSE_POINTS) {
      expect(Math.abs(d.image[i].x - f.image[i].x)).toBeLessThanOrEqual(step);
      expect(Math.abs(d.image[i].y - f.image[i].y)).toBeLessThanOrEqual(step);
      expect(Math.abs(d.image[i].v - f.image[i].v)).toBeLessThanOrEqual(1 / 255);
    }
    // the points not sent read as unseen, never as a guess
    expect(d.image[17].v).toBe(0);
  });

  it('a frame with no body is still a frame (present false, no landmarks)', () => {
    const d = decodePose(encodePose({ t: 5, present: false, image: [] }, 1, 5))!;
    expect(d.present).toBe(false);
    expect(d.image).toEqual([]);
  });

  it('anything else decodes to null', () => {
    expect(decodePose(new ArrayBuffer(10))).toBeNull();
    const wrongKind = encodePose(f, 1, f.t); new DataView(wrongKind).setUint8(0, 9);
    expect(decodePose(wrongKind)).toBeNull();
  });

  it('base64 for the relay round-trips and is bounded', () => {
    const b = encodePose(f, 3, f.t);
    expect(decodePose(fromBase64(toBase64(b))!)).toEqual(decodePose(b));
    expect(fromBase64('x'.repeat(10_000))).toBeNull();
  });
});

describe('control messages from the other side are untrusted', () => {
  it('takes the known shapes', () => {
    expect(parseCtl('{"t":"cue","id":3,"key":"gen:good"}')).toEqual({ t: 'cue', id: 3, key: 'gen:good' });
    expect(parseCtl({ t: 'set_start', set: 1, movement: 'squat' })).toEqual({ t: 'set_start', set: 1, movement: 'squat' });
    expect(parseCtl({ t: 'rep', set: 1, movement: 'squat', rep: { n: 2, faults: ['kneeValgus'], sides: { kneeValgus: 'left' }, read: true } }))
      .toEqual({ t: 'rep', set: 1, movement: 'squat', rep: { n: 2, faults: ['kneeValgus'], sides: { kneeValgus: 'left' }, read: true } });
  });

  it('drops the rest: unknown types, wrong movements, foreign faults, bad numbers, oversize', () => {
    expect(parseCtl('not json')).toBeNull();
    expect(parseCtl({ t: 'chat', text: 'hi' })).toBeNull();
    expect(parseCtl({ t: 'set_start', set: 1, movement: 'deadlift' })).toBeNull();
    expect(parseCtl({ t: 'rep', set: 1, movement: 'squat', rep: { n: 2, faults: ['bodyLine'], sides: {}, read: true } })).toBeNull();
    expect(parseCtl({ t: 'rep', set: 1, movement: 'squat', rep: { n: 2, faults: [], sides: { kneeValgus: 'left' }, read: true } })).toBeNull();
    expect(parseCtl({ t: 'set_stop', set: -1 })).toBeNull();
    expect(parseCtl({ t: 'ping', a: Infinity })).toBeNull();
    expect(parseCtl(JSON.stringify({ t: 'end', pad: 'x'.repeat(20_000) }))).toBeNull();
  });
});
