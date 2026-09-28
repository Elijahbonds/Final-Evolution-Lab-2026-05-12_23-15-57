// The Mirror's landmark fixtures through the Mirror's REAL code — the baseline later phases prove against
// (MIRROR-COACH P1, 2026-09-25).
//
// Four layers, each catching a different lie:
//   1. THE FILES ARE WHAT build.ts MAKES. lib/mirror/fixtures/*.json are regenerated here and compared, so a fixture
//      cannot drift from its builder (or be hand-edited into agreeing with an audit).
//   2. THE CAMERA IS THE APP'S CAMERA. Front fixtures put the subject's left shoulder on the image's right (not
//      mirrored — lib/pose/landmarks.ts:9-10), back fixtures the reverse, side fixtures stack the shoulders.
//   3. THE BASELINE. Every fixture through the live squat audit (+ cue engine + stage step), the unmounted lunge audit,
//      the framing check in all three views, and both movement screens walked end to end, compared with what was
//      recorded in lib/mirror/fixtures/baseline.json. A change in what the Mirror says about any fixture fails here with
//      the fixture's name; re-record with the probe (below) and say in your report what changed and why.
//   4. INVARIANTS A RE-RECORD MUST NEVER ACCEPT. The knee read's sign on both legs, a knee cue only where a knee caves
//      (it was "the silent knee cue" until MIRROR-COACH P2 switched it on, 2026-09-26), and an
//      ungraded screen that never scores, pays or reads as clear — asserted directly, so re-recording cannot launder a
//      regression into the baseline.
//
// Re-record: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-baseline.mts --write
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, MIRROR_INDEX } from '@/lib/pose/landmarks';
import { VALGUS_CUE_VERIFIED } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { emptyDraftLine } from '@/components/coach/screen-prescriptions';
import { FIXTURES, FIXTURE_CAMERA, FIXTURE_NAMES } from './fixtures/build';
import { fixtureFile, toAdapterFrames, type MirrorFixture } from './fixtures/index';
import { BASELINE_PATH, readFixture } from './fixtures/load';
import { measureSquat, recordBaseline, type MirrorBaseline } from './fixtures/measure';
import { NOT_GRADED_LINE } from './screen';

const disk = new Map<string, MirrorFixture>(FIXTURE_NAMES.map((n) => [n, readFixture(n)]));
const load = (n: string) => disk.get(n)!;
const recorded = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as MirrorBaseline;
const now = recordBaseline(FIXTURE_NAMES, load);
const RERECORD = 'the Mirror now reads this differently from lib/mirror/fixtures/baseline.json — if that is the change you meant, re-record (scripts/probes/_mirror-baseline.mts --write) and say what changed in your report';

describe('1. the fixture files are what build.ts makes', () => {
  it('there is one file per fixture, and nothing else is listed', () => {
    expect(FIXTURE_NAMES.length).toBe(17);
    expect(new Set(FIXTURE_NAMES).size).toBe(FIXTURE_NAMES.length);
  });
  for (const name of FIXTURE_NAMES) {
    it(name, () => {
      const file = load(name), built = fixtureFile(name);
      expect(file.truth).toEqual(built.truth);
      // the camera is pinned in build.ts (FIXTURE_CAMERA), not read from lib/pose/synth.ts, another lane's file
      expect(file.camera).toEqual({ ...FIXTURE_CAMERA });
      expect({ pattern: file.pattern, view: file.view, fps: file.fps, frames: file.frames.length })
        .toEqual({ pattern: built.pattern, view: built.view, fps: built.fps, frames: built.frames.length });
      // landmarks agree to the file's precision (a last-bit difference in Math.sin between node versions can flip one
      // rounding step, never more)
      let worst = 0;
      file.frames.forEach((f, i) => {
        expect(f.present).toBe(built.frames[i].present);
        expect(Math.abs(f.t - built.frames[i].t)).toBeLessThan(1e-2);
        f.lm.forEach((row, k) => row.forEach((v, c) => { worst = Math.max(worst, Math.abs(v - built.frames[i].lm[k][c]) / (c === 3 ? 100 : 1)); }));
      });
      expect(worst).toBeLessThan(2e-4);
    });
  }
});

describe('2. the fixtures are filmed by the app\'s camera, the way each says', () => {
  for (const def of FIXTURES) {
    it(`${def.name} (${def.view})`, () => {
      const f0 = load(def.name).frames[0].lm;
      const ls = f0[LEFT_SHOULDER], rs = f0[RIGHT_SHOULDER], lh = f0[LEFT_HIP], rh = f0[RIGHT_HIP];
      if (def.view === 'front') expect(ls[0]).toBeGreaterThan(rs[0]);             // not mirrored: left on the image's right
      if (def.view === 'back') expect(ls[0]).toBeLessThan(rs[0]);
      if (def.view === 'side') {
        // shoulders and hips (nearly) stacked — off the image's centre, perspective parts them a little…
        expect(Math.abs(ls[0] - rs[0])).toBeLessThan(0.03);
        expect(Math.abs(lh[0] - rh[0])).toBeLessThan(0.03);
        expect(ls[2]).toBeLessThan(rs[2]);                                      // …the LEFT one nearer the lens
      }
    });
  }
});

describe('3. BASELINE: what the real Mirror code says about every fixture', () => {
  it('the recorded baseline covers every fixture and both screens', () => {
    expect(recorded.format).toBe('fel-mirror-baseline/1');
    expect(Object.keys(recorded.fixtures).sort()).toEqual([...FIXTURE_NAMES].sort());
    expect(Object.keys(recorded.screens).sort()).toEqual(['full', 'modified']);
  });
  for (const name of FIXTURE_NAMES) {
    it(name, () => { expect(now.fixtures[name], `${name}: ${RERECORD}`).toEqual(recorded.fixtures[name]); });
  }
  for (const screen of ['modified', 'full'] as const) {
    it(`the ${screen} screen, walked end to end`, () => { expect(now.screens[screen], `${screen} screen: ${RERECORD}`).toEqual(recorded.screens[screen]); });
  }
});

describe('4. invariants a re-record must never accept', () => {
  const squats = FIXTURES.filter((f) => f.pattern === 'squat').map((f) => f.name);

  it('the knee read flags a caving knee on the side that caves, and only there', () => {
    for (const name of squats) {
      const t = load(name).truth, s = now.fixtures[name].squat;
      const flagged = (s.faultFrames.kneeValgus ?? 0) > 0;
      expect(flagged, name).toBe(t.kneeCaves === true);
      if (t.kneeCavesLeft) expect(s.worstInward!.left, name).toBeGreaterThanOrEqual(0.35);
      else expect(s.worstInward!.left, name).toBeLessThan(0.35);
      if (t.kneeCavesRight) expect(s.worstInward!.right, name).toBeGreaterThanOrEqual(0.35);
      else expect(s.worstInward!.right, name).toBeLessThan(0.35);
    }
  });

  it('a knee pushed OUT reads outward (negative), never as caving', () => {
    for (const name of squats) {
      const t = load(name).truth, s = now.fixtures[name].squat;
      if ((t.kneeInwardCmLeft as number) <= -3) expect(s.leastInward!.left, name).toBeLessThan(-0.35);
      if ((t.kneeInwardCmRight as number) <= -3) expect(s.leastInward!.right, name).toBeLessThan(-0.35);
      if (t.kneePushedOut) expect(s.faultFrames.kneeValgus ?? 0, name).toBe(0);
    }
  });

  it('on a mirrored (selfie) stream the read keeps its sign; only the leg LABELS trade places', () => {
    // A mirrored camera flips the image; MediaPipe still labels a frontal body's image-right shoulder "left", so its
    // output is x flipped AND the labels swapped (rules/__fixtures__/synthSquat.ts mirrorFrame). The caving knee is then
    // labelled the other leg — but it must still read INWARD, and a straight knee must still read straight.
    const fx = load('squat_knee_in_left');
    const mirrored = { frames: fx.frames.map((f) => ({ ...f, lm: f.lm.map((_, i) => { const r = f.lm[MIRROR_INDEX[i]]; return [1 - r[0], r[1], r[2], r[3]]; }) })) };
    const got = measureSquat(toAdapterFrames(mirrored)), was = now.fixtures.squat_knee_in_left.squat;
    expect(got.worstInward).toEqual({ left: was.worstInward!.right, right: was.worstInward!.left });
    expect(got.faultFrames.kneeValgus).toBe(was.faultFrames.kneeValgus);
  });

  // MIRROR-COACH P2 (2026-09-26): P1's invariant here was "while the knee is unverified, the coach never says a word about
  // it". The owner switched the cue on from the synthetic proof (DECISIONS-2 #19); the invariant a re-record must never
  // accept is now the one that matters with it on — the coach speaks about the knee ONLY on a squat whose knee caves.
  // (The lunge fixtures go through the squat audit too, as a measurement — the lunge is not mounted; the one whose front
  // knee caves is flagged and cued there as well, which the baseline records.)
  it('the knee cue speaks only where a squat\'s knee really caves — never on a knee pushed out, a clean squat, or a stance', () => {
    expect(VALGUS_CUE_VERIFIED).toBe(true);
    for (const name of FIXTURE_NAMES) {
      const t = load(name).truth, s = now.fixtures[name].squat;
      const said = s.coach.filter((c) => c.fault === 'kneeValgus');
      if (squats.includes(name) && t.kneeCaves === true) {
        expect(said.length, name).toBeGreaterThan(0);
        expect(said[0].text, name).toMatch(/^Knees out/);
        expect(s.shown, name).toContain('kneeValgus');
      } else if (squats.includes(name) || /^(stand|single_leg|seated|hinge|pushup)/.test(name)) {
        expect(said, name).toEqual([]);
        expect(s.shown, name).not.toContain('kneeValgus');
      }
    }
  });

  // MIRROR-COACH P1 review (2026-09-25): the baseline recorded both screens stalled at 'profile' — a body exactly
  // side-on never passed the side check (framing.ts read side-on from shoulder/hip ratio, which a stacked pair of
  // hips turned into 1) — and filed it (F1) without fixing it.
  it('the framing check knows which way each fixture faces', () => {
    const passes = (name: string, view: 'front' | 'side' | 'back') => now.fixtures[name].framing[view];
    for (const name of ['stand_side', 'hinge_side']) {
      expect(passes(name, 'side').worst.turned ?? 0, `${name} side`).toBe(0);
      expect(passes(name, 'front').worst.turned, `${name} front`).toBe(passes(name, 'front').frames);
      expect(passes(name, 'back').worst.turned, `${name} back`).toBe(passes(name, 'back').frames);
    }
    expect(passes('stand_side', 'side').ok).toBe(passes('stand_side', 'side').frames);
    expect(passes('stand_front', 'front').ok).toBe(passes('stand_front', 'front').frames);
    expect(passes('stand_front', 'side').worst.turned).toBe(passes('stand_front', 'side').frames);
    expect(passes('stand_back', 'back').ok).toBe(passes('stand_back', 'back').frames);
    expect(passes('stand_back', 'side').worst.turned).toBe(passes('stand_back', 'side').frames);
  });

  it('an athlete doing what each cue says gets through both screens — no station stalls, no turn line to a body already turned', () => {
    for (const screen of ['modified', 'full'] as const) {
      const r = now.screens[screen];
      expect(r.completed, screen).toBe(true);
      expect(r.stalledAt, screen).toBeNull();
      for (const st of r.stations) {
        expect(st.seconds, `${screen} ${st.id}`).not.toBeNull();
        expect(st.firstSay, `${screen} ${st.id}`).not.toMatch(/hinge/i);
      }
    }
  });

  it('a screen with nothing recorded is never scored, never paid, stored as ungraded, and never "clear" to a coach', () => {
    for (const screen of ['modified', 'full'] as const) {
      const r = now.screens[screen];
      if (r.resultsRecorded > 0) continue;              // phase 3's graders record results; then this case is not this one
      const o = r.onComplete;
      expect(o.summary.graded).toBe(false);
      expect(o.summary.score).toBeNull();
      expect(o.summary.triage).toBe('notGraded');
      expect(o.reward.pay).toBe(false);
      expect(o.reward.message).toBe(NOT_GRADED_LINE);
      expect(o.stored.graded).toBe(false);
      expect(o.prescribeReason).toBe('ungraded_screen');
      expect(emptyDraftLine(o.prescribeReason ?? undefined)).not.toMatch(/came back clear/i);
      expect(o.athletePanel).toBe(NOT_GRADED_LINE);
    }
  });
});
