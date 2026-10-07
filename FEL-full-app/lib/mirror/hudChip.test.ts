// The Mirror's top-left chip names what is happening in THIS pattern (MIRROR-COACH P2, 2026-09-26). It read the guided
// squat's first stage, BREATHE, through the whole Movement Screen — the screen fell into the squat's arm of a ternary.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chipLabel, lungeChip, screenChip, shortCheckLabel } from './hudChip';
import { FULL_SCREEN, MODIFIED_SCREEN } from './screen';

const base = { phase: 'hold', jumpState: 'ready', squatStage: 'breathe' as const, lungeStage: 'left' as const, runner: null };

describe('the chip', () => {
  it('the Movement Screen shows its station — never the squat\'s BREATHE — on every station of both screens', () => {
    for (const [screen, stations] of [['modified', MODIFIED_SCREEN], ['full', FULL_SCREEN]] as const) {
      stations.forEach((st, i) => {
        for (const phase of ['positioning', 'holding', 'stationDone'] as const) {
          const label = chipLabel({ ...base, pattern: 'screen', runner: { screen, phase, stationIndex: i } });
          expect(label).toBe(`Station ${i + 1} of ${stations.length} · ${shortCheckLabel(st.checks[0].label)}`);
          expect(label.toLowerCase()).not.toBe('breathe');
          expect(label.length, label).toBeLessThanOrEqual(40);            // fits the chip on a phone
        }
      });
    }
  });

  it('the chip\'s cut of a label stops at its first comma or bracket', () => {
    expect(shortCheckLabel('Single-leg stance, 30 seconds a side')).toBe('Single-leg stance');
    expect(shortCheckLabel('Pelvic tilt (hands on the hip points)')).toBe('Pelvic tilt');
    expect(shortCheckLabel('Knee window')).toBe('Knee window');
  });

  it('before the first tick it says get set; a finished screen says so', () => {
    expect(chipLabel({ ...base, pattern: 'screen', runner: null })).toBe('Get set');
    expect(screenChip({ screen: 'full', phase: 'complete', stationIndex: 7 })).toBe('Screen complete');
  });

  it('the other patterns read as before: press/row its phase, the jump its state, the squat its stage', () => {
    expect(chipLabel({ ...base, pattern: 'pressRow', phase: 'pull' })).toBe('pull');
    expect(chipLabel({ ...base, pattern: 'jump', jumpState: 'ready' })).toBe('Jump when ready');
    expect(chipLabel({ ...base, pattern: 'jump', jumpState: 'airborne' })).toBe('Airborne');
    expect(chipLabel({ ...base, pattern: 'jump', jumpState: 'calibrating' })).toBe('Stand still');
    expect(chipLabel({ ...base, pattern: 'jump', jumpState: 'landing' })).toBe('landing');
    expect(chipLabel({ ...base, pattern: 'squat', squatStage: 'work' })).toBe('work');
  });

  // MIRROR-COACH P4 lane 1 (registry-and-lunge, 2026-09-25): the lunge names which leg's set is on, or the review.
  it('the lunge names which leg\'s set is on, or the review', () => {
    expect(chipLabel({ ...base, pattern: 'lunge', lungeStage: 'left' })).toBe('left leg');
    expect(chipLabel({ ...base, pattern: 'lunge', lungeStage: 'right' })).toBe('right leg');
    expect(chipLabel({ ...base, pattern: 'lunge', lungeStage: 'review' })).toBe('Review');
    // MIRROR-MOVES P2: the side-on sets — waiting to be side-on first, then the stage
    expect(chipLabel({ ...base, pattern: 'hinge', hingeStage: 'setup' })).toBe('Get side-on');
    expect(chipLabel({ ...base, pattern: 'hinge' })).toBe('Get side-on');
    expect(chipLabel({ ...base, pattern: 'pushup', pushupStage: 'work' })).toBe('work');
    expect(chipLabel({ ...base, pattern: 'hinge', hingeStage: 'review', pushupStage: 'check' })).toBe('review');
    expect(lungeChip('left')).toBe('left leg');
    expect(lungeChip('review')).toBe('Review');
  });
});

describe('the harness', () => {
  const h = readFileSync(new URL('../../app/play/mirror/_components/mirror-harness.tsx', import.meta.url), 'utf8');
  it('renders the chip from chipLabel, not a ternary that ends in squatStage', () => {
    // MIRROR-MOVES P2: the hinge's and the push-up's stages ride along
    expect(h).toContain('{chipLabel({ pattern, phase, jumpState, squatStage, lungeStage: lungeSession.stage, runner, hingeStage: hingeSession.stage, pushupStage: pushupSession.stage })}');
    expect(h).not.toMatch(/: pattern === 'jump' \? \(jumpState === 'ready'/);
  });

  it('a finished screen lets go of the camera: stop() in the effect that submits it', () => {
    const effect = h.slice(h.indexOf("if (pattern !== 'screen' || runner?.phase !== 'complete') return;"));
    const body = effect.slice(0, effect.indexOf('}, [pattern, runner, submitScreen, stop]);'));
    // MIRROR-COACH P3 (2026-09-26): the grades ride with the results, for the server's regrade
    expect(body).toContain('void submitScreen(runner.results, runner.screen, runner.grades);');
    expect(body).toMatch(/stop\(\);\s*setStatus\('idle'\);/);
  });

  // MIRROR-COACH P3 (2026-09-26): the screen grades — the wiring the graders depend on, as served
  it('the runner gets the whole pose frame and the camera\'s aspect; the retest line is protected; the card is mounted', () => {
    expect(h).toContain('runnerRef.current.tick(pose, pose.timestampMs)');       // z and visibility reach the graders
    expect(h).not.toContain('{ landmarks: pose.landmarks, present: pose.present },');
    expect(h).toMatch(/runnerRef\.current\?\.setAspect\(v\.videoWidth \/ v\.videoHeight\)/);
    expect(h).toContain("speak(st.say, { protect: st.phase === 'retest' })");
    // MIRROR-COACH P3 follow-up review (2026-09-28): after End the card is drawn from what End posted (endedWith)
    expect(h).toContain('<StationResults screen={runner.screen} stations={endedWith?.stations ?? runner.stations} />');
    expect(h).toContain('runnerRef.current?.skipRetest()');
    expect(h).toMatch(/grades,\s*\}\),/);                                        // the post carries the grades
  });

  // MIRROR-COACH P3 follow-up review (2026-09-28): End posts what was read, MARKED ended (the server does not pay it unless
  // every camera station was attempted); "What to work on" and the station cards show what End posted, not the last
  // runner state (which kept a pending retest's flag out); the breath questions are asked only when the breath was held
  it('End marks its post ended, and the cards and the breath questions follow what End posted', () => {
    const end = h.slice(h.indexOf('const endSession = useCallback(() => {'));
    const body = end.slice(0, end.indexOf('}, [endZoneSession, submitScreen]);'));
    expect(body).toContain('const soFar = runnerRef.current.readSoFar();');
    expect(body).toContain('setEndedWith({ grades: soFar.grades, stations: soFar.stations });');
    expect(body).toContain('void submitScreen(soFar.results, soFar.screen, soFar.grades, { ended: true });');
    expect(h).toContain('...(opts.ended ? { ended: true } : {}),');
    expect(h).toContain('<ScreenNextSteps screen={runner.screen} grades={endedWith?.grades ?? runner.grades} youth={youth} />');
    expect(h).toContain('asked={selfReportReached(runner.screen, endedWith?.stations ?? runner.stations)}');
    expect(h).toContain("setSavedScreenId(null); setEndedWith(null);");                // a new Start forgets the last End
  });
});
