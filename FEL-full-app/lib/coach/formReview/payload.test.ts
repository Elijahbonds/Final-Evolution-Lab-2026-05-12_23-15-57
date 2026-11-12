// COACH-VIDEO-REVIEW (2026-10-24): what leaves the phone — pose data only, by construction — and what the server lets in.
import { describe, expect, it } from 'vitest';
import { buildSubmission, decodeTrack, MAX_SUBMISSION_BYTES, MAX_TRACKED_REPS, parseSubmission, TRACK_FPS, TRACK_JOINTS, trackedReps } from './payload';
import { readSet } from './reader';
import { flagsFor, scoreReps } from './score';
import { chain } from '@/tests/helpers/formReviewSets';

const frames = chain(['squat_clean', 'squat_knee_in_left', 'squat_clean', 'squat_knees_in_both', 'squat_clean', 'squat_knee_in_right', 'squat_clean']);
const reps = scoreReps('squat', readSet('squat', frames));
const flags = flagsFor('squat', reps);
const sub = buildSubmission({ programId: 'prog_1', sessionExerciseId: 'slot_1', movement: 'squat', aspect: 4 / 3, frames, reps, flags });

/** Every key anywhere in a JSON value. */
function keysOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) keysOf(x, out);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysOf(x, out); }
  return out;
}
/** Every string anywhere in a JSON value. */
function stringsOf(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) stringsOf(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) stringsOf(x, out);
  return out;
}

describe('the submission the phone builds', () => {
  it('holds the reps, their faults and a few keypoint tracks — and no video, image or audio', () => {
    const body = JSON.stringify(sub);
    expect([...keysOf(sub)].sort()).toEqual(['aspect', 'dt', 'durationMs', 'endMs', 'faults', 'frames', 'kneeValgus', 'movement', 'n', 'programId', 'read', 'rep', 'reps', 'sessionExerciseId', 'sides', 'startMs', 't0', 'tracks', 'v']);
    // the only strings are ids, the movement, fault ids and sides — nothing long enough to be media
    expect(Math.max(...stringsOf(sub).map((s) => s.length))).toBeLessThanOrEqual(16);
    expect(body).not.toMatch(/data:|base64|blob:|video|image|audio|webm|mp4/i);
    expect(body.length).toBeLessThan(MAX_SUBMISSION_BYTES);
  });

  it('tracks only the flagged reps (worst first) and the best rep, at TRACK_FPS, 17 joints a frame', () => {
    expect(sub.tracks.map((t) => t.rep)).toEqual(trackedReps(reps, flags).sort((a, b) => a - b));
    expect(trackedReps(reps, flags)).toEqual([2, 4, 6, 1]);   // 2 and 4 tie (one knee fault each): the first is the worst
    expect(sub.tracks.length).toBeLessThanOrEqual(MAX_TRACKED_REPS);
    for (const t of sub.tracks) {
      expect(t.dt).toBe(Math.round(1000 / TRACK_FPS));
      expect(t.frames.every((f) => f.length === 0 || f.length === TRACK_JOINTS.length * 3)).toBe(true);
    }
  });

  it('measures about a kilobyte a second of tracked rep', () => {
    const trackedSeconds = sub.tracks.reduce((a, t) => a + (t.frames.length * t.dt) / 1000, 0);
    const bytes = JSON.stringify(sub.tracks).length;
    expect(bytes / trackedSeconds).toBeLessThan(4000);
  });

  it('decodes back to the landmarks it came from, to a thousandth of the frame', () => {
    const t = sub.tracks.find((x) => x.rep === 2)!;
    const img = decodeTrack(t)[0];
    const src = frames.find((f) => Math.abs(f.t - (frames[0].t + t.t0)) < 20)!;
    for (const j of TRACK_JOINTS) {
      expect(Math.abs(img[j].x - src.image[j].x)).toBeLessThanOrEqual(0.0006);
      expect(Math.abs(img[j].y - src.image[j].y)).toBeLessThanOrEqual(0.0006);
    }
    expect(img[7].v).toBe(0);   // an ear is not kept, so nothing draws it
  });
});

describe('the server\'s door (parseSubmission)', () => {
  const ok = () => JSON.parse(JSON.stringify(sub));

  it('accepts exactly what the phone builds', () => {
    const r = parseSubmission(ok());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(sub);
  });

  it('refuses any field outside the pose shape — a video, a clip, an image, at any level', () => {
    expect(parseSubmission({ ...ok(), video: 'data:video/mp4;base64,AAAA' })).toEqual({ ok: false, error: 'unexpected_field' });
    expect(parseSubmission({ ...ok(), clip: { url: 'https://x' } })).toEqual({ ok: false, error: 'unexpected_field' });
    const r1 = ok(); r1.reps[0].thumbnail = 'x'; expect(parseSubmission(r1)).toEqual({ ok: false, error: 'unexpected_field' });
    const r2 = ok(); r2.tracks[0].image = 'x'; expect(parseSubmission(r2)).toEqual({ ok: false, error: 'unexpected_field' });
  });

  it('refuses a track that is not numbers in range', () => {
    const a = ok(); a.tracks[0].frames[0] = ['AAAA']; expect(parseSubmission(a).ok).toBe(false);
    const b = ok(); b.tracks[0].frames[0][0] = 99_999; expect(parseSubmission(b).ok).toBe(false);
    const c = ok(); c.tracks[0].frames[0] = [1, 2, 3]; expect(parseSubmission(c).ok).toBe(false);
    const d = ok(); d.tracks.push({ ...d.tracks[0] }); expect(parseSubmission(d)).toEqual({ ok: false, error: 'bad_tracks' });
  });

  it('refuses faults that are not the movement\'s, a side for a fault not there, and faults on an unread rep', () => {
    const a = ok(); a.reps[0].faults = ['bodyLine']; expect(parseSubmission(a)).toEqual({ ok: false, error: 'bad_faults' });
    const b = ok(); b.reps[0].sides = { heelRise: 'left' }; expect(parseSubmission(b)).toEqual({ ok: false, error: 'bad_faults' });
    const c = ok(); c.reps[1].read = false; expect(parseSubmission(c)).toEqual({ ok: false, error: 'bad_faults' });
  });

  it('refuses a bad id, movement, rep order or size', () => {
    expect(parseSubmission({ ...ok(), programId: "x'; DROP" })).toEqual({ ok: false, error: 'bad_program' });
    expect(parseSubmission({ ...ok(), movement: 'bench' })).toEqual({ ok: false, error: 'bad_movement' });
    const a = ok(); a.reps[1].n = 5; expect(parseSubmission(a)).toEqual({ ok: false, error: 'bad_reps' });
    expect(parseSubmission(ok(), MAX_SUBMISSION_BYTES + 1)).toEqual({ ok: false, error: 'too_large' });
    expect(parseSubmission(null)).toEqual({ ok: false, error: 'bad_body' });
  });
});
