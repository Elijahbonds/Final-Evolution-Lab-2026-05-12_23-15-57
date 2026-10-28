// gameplay-clean (routed from dunk-flagship P5): a body dunk in the DUEL is not launched by an idle pad.
// The body's RUN reaches DunkDuelMode from onBody, past the bus's arbiter; a seated pad re-sends its trigger every frame. The
// old charge read each event's own value, so the idle pad's 0 one frame after the jog started the run was "RUN let go".
// Replayed here on a synthetic jog + jump (the dunkBody test's own stream), with the idle pad's 0 between every body packet.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RunPull } from './dunkDuelRules';
import { dunkBodyReplay } from '@/lib/move/dunkBody';
import { restPose, synthesize } from '@/lib/pose/synth';
import { hold, jogBeat, script, scriptedJump, type Beat } from '@/lib/pose/streamKit';

const R = restPose();
const frames = synthesize(script([hold(R, 1.2), jogBeat(R, 1.35, 2.6, 0.22), [scriptedJump(R, 3.2, 0.28, 0.12, false).end, scriptedJump(R, 3.2, 0.28, 0.12, false).pose] as Beat]), { seed: 17, noise: false, fps: 30 }).frames;
const body = dunkBodyReplay(frames).events.filter((x) => x.e.t === 'trigger' && x.e.side === 'R').map((x) => x.e as { t: 'trigger'; side: 'R'; value: number; src?: string });

/** The duel's charge, as the mode runs it: RUN pulled starts the run; at 0 while charging, the take-off. */
function charge(stream: { value: number; src?: string }[], fold: (e: { value: number; src?: string }) => number): { started: boolean; launchedAt: number | null } {
  let started = false, launchedAt: number | null = null;
  stream.forEach((e, i) => {
    if (launchedAt !== null) return;
    const rt = fold(e);
    if (!started && rt > 0.02) started = true;
    else if (started && rt === 0) launchedAt = i;
  });
  return { started, launchedAt };
}

describe('the duel\'s RUN with a body and an idle pad', () => {
  it('the synthetic jog does pull RUN (the stream is a real run)', () => {
    expect(body.some((e) => e.value > 0.02)).toBe(true);
  });

  it('before: each event\'s own value — the idle pad\'s 0 launched on the first step', () => {
    const withPad = body.flatMap((e) => [e, { value: 0 }]);   // the pad's re-sent 0 after every body packet
    const firstPull = withPad.findIndex((e) => e.value > 0.02);
    const old = charge(withPad, (e) => e.value);
    expect(old.launchedAt).toBe(firstPull + 1);
  });

  it('after: the fold — no launch until the body lets RUN go (its take-off), whatever the pad re-sends', () => {
    const withPad = body.flatMap((e) => [e, { value: 0 }]);
    const pull = new RunPull();
    const now = charge(withPad, (e) => pull.take(e));
    const bodyOnly = charge(body, (e) => e.value);
    expect(now.started).toBe(true);
    // the same body event releases it as on a body-only stream (each body event is followed by one pad event here)
    expect(now.launchedAt === null ? null : (now.launchedAt) / 2).toBe(bodyOnly.launchedAt);
  });

  it('pad-only, the pull is exactly the pad\'s; the take-off hands RUN back to the hand', () => {
    const pull = new RunPull();
    expect(pull.take({ value: 0.7 })).toBe(0.7);
    expect(pull.take({ value: 0 })).toBe(0);
    pull.take({ value: 0.9, src: 'body' });
    expect(pull.take({ value: 0 })).toBe(0.9);
    pull.endBody();
    expect(pull.value).toBe(0);
  });

  it('the mode folds through it (no charge reads an event\'s own value)', () => {
    const src = readFileSync(join(__dirname, 'DunkDuelMode.ts'), 'utf8');
    expect(src).toMatch(/const rt = runPull\.take\(e\);/);
    expect(src).not.toMatch(/if \(e\.value === 0\) launchDunk/);
    expect(src.match(/runPull\.endBody\(\)/g)?.length).toBeGreaterThanOrEqual(2);   // a new attempt, and the take-off
  });
});
