// THE SLAM PRESS, WIRED (HOTFIX 2026-09-24, BASELINE.md:244-245).
//
// The modes are Babylon scenes and are not run here. What they DO with a press is driven for real in core/slamPress.test.ts:
// the real InputBus (keyboard, pad, touch, Controller Link) through TakeoffEcho + SlamLatch (the contest) and TakeoffEcho +
// FirstPress (the duel), in each mode's onInput order. These pin that order in the mode files, so a refactor cannot quietly
// undo it:
//   · every input opens with TakeoffEcho.see (a new input: nothing it launches is older than it);
//   · launchDunk says WHO launched (the player's press, or the mode) and stamps TakeoffEcho.launched LAST, after its own work;
//   · the flight's A asks TakeoffEcho.of AFTER a same-event launch (A on the run) and BEFORE the slam rule, telling it whether a
//     slam would count now (the Space let go in the SLAM read is a slam press, as it always was);
//   · the duel's "HOLD to run — then tap jump" is true: A on the run takes off, as in the contest.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DUNK = readFileSync(path.join(__dirname, 'DunkMode.ts'), 'utf8');
const DUEL = readFileSync(path.join(__dirname, 'DunkDuelMode.ts'), 'utf8');

/** The body of `name(…) {` up to the next line that closes it at the same indent. */
function body(src: string, head: RegExp): string {
  const m = head.exec(src);
  if (!m) throw new Error(`no ${head}`);
  const indent = /^\s*/.exec(src.slice(src.lastIndexOf('\n', m.index) + 1))![0];
  const end = src.indexOf(`\n${indent}}`, m.index);
  return src.slice(m.index, end);
}
/** The last statement of a function body. */
const lastLine = (fn: string) => fn.trimEnd().split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).pop()!.trim();

describe("DunkMode: the take-off's A is not the slam", () => {
  const onInput = body(DUNK, /^ {4}onInput\(ctx: ModeContext, e: FelInput\) \{/m);
  const launch = body(DUNK, /^ {2}function launchDunk\(ctx: ModeContext, cause: LaunchCause = 'auto'\): void \{/m);

  it('onInput opens every input to the echo before anything else can launch', () => {
    expect(onInput).toMatch(/^ {4}onInput\(ctx: ModeContext, e: FelInput\) \{\s*SoundKit\.unlock\(\);\s*slamEcho\.see\(\);/);
  });

  it('launchDunk clears the latch and stamps the launch LAST, with who launched it', () => {
    expect(launch).toMatch(/slamLatch\.clear\(\)/);
    expect(lastLine(launch)).toBe('slamEcho.launched(performance.now(), cause);');
    expect(launch.match(/slamEcho\.launched\(/g)).toHaveLength(1);
  });

  it("only the player's two presses launch as 'press' (A on the run, RUN let go); the line, beats, the bus and the watchdog are the mode's", () => {
    expect(DUNK.match(/launchDunk\(ctx, 'press'\)/g)).toHaveLength(2);
    expect(onInput).toMatch(/if \(e\.btn === 'A' && phase === 'charge'\) \{\s*if \(!runwayBeat\) launchDunk\(ctx, 'press'\);/);
    expect(onInput).toMatch(/if \(e\.value === 0\) launchDunk\(ctx, 'press'\);/);
    expect(DUNK.match(/launchDunk\(ctx0?!?\)/g)!.length).toBeGreaterThanOrEqual(4);   // the line, the beat's end, the bus, the watchdog
  });

  it("the echo is read after A on the run launches, knows when a slam would count, and gates the air dispatch and the window's slam", () => {
    const takeoff = onInput.indexOf("if (e.btn === 'A' && phase === 'charge') {");
    const read = onInput.indexOf("const echoA = phase === 'cinematic' ? slamEcho.of(e, performance.now(), slamCueOn) : null;");
    expect(takeoff).toBeGreaterThan(0);
    expect(read).toBeGreaterThan(takeoff);
    const calls = [...onInput.matchAll(/^.*\bairButton\(ctx, e.*$/gm)].map((m) => m[0]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/&& echoA !== 'space'\) airButton\(ctx, e, echoA !== null\)/);
    expect(onInput).toMatch(/e\.btn === 'A' && e\.pressed && qteWindowOpen && !lob\.live && !echoA\) \{ if \(phase === 'cinematic' && slamLatch\.press\(clipTime, true\) === 'spent'\)/);
    // slamCueOn is the SLAM read: the buffer's reach through the window's close
    expect(DUNK).toMatch(/slamCueOn = !lob\.live && clipTime >= openAt - holdSec && clipTime <= closeAt;/);
  });

  it("bufferSlam drops the take-off's own A before the first-press latch sees it", () => {
    const buf = body(DUNK, /^ {2}function bufferSlam\(takeoffEcho = false\): void \{/m);
    expect(buf.indexOf('if (takeoffEcho)')).toBeGreaterThan(0);
    expect(buf.indexOf('if (takeoffEcho)')).toBeLessThan(buf.indexOf('slamLatch.press(clipTime, false)'));
    const air = body(DUNK, /^ {2}function airButton\(ctx: ModeContext, e: FelInput, takeoffEcho = false\): void \{/m);
    expect(air.match(/bufferSlam\(/g)).toHaveLength(2);
    expect(air.match(/bufferSlam\(takeoffEcho\)/g)).toHaveLength(2);
  });

  it('the window opening judges the held press through the latch; the old loose state is gone', () => {
    expect(DUNK).toMatch(/const held = slamLatch\.open\(openAt, holdSec\);/);
    expect(DUNK).not.toMatch(/\bslamBufferAt\b/);
    expect(DUNK).not.toMatch(/\bslamCommitted\b/);
  });
});

describe('DunkDuelMode: the first press decides, the take-off is not it, and A on the run jumps', () => {
  const onInput = body(DUEL, /^ {4}onInput\(ctx: ModeContext, e: FelInput\) \{/m);
  const launch = body(DUEL, /^ {2}function launchDunk\(ctx: ModeContext, cause: LaunchCause = 'auto'\): void \{/m);

  it('onInput opens every input to the echo first; launchDunk clears the press and stamps the launch LAST', () => {
    expect(onInput).toMatch(/^ {4}onInput\(ctx: ModeContext, e: FelInput\) \{\s*SoundKit\.unlock\(\);\s*slamEcho\.see\(\);/);
    expect(launch).toMatch(/slamPress\.clear\(\);/);
    expect(lastLine(launch)).toMatch(/^slamEcho\.launched\(performance\.now\(\), cause\);/);
  });

  it('"HOLD to run — then tap jump" is true: A on the run launches (a press), before the flight reads the same A as the take-off', () => {
    expect(DUEL).toMatch(/HOLD to run — then tap jump/);
    const jump = onInput.indexOf("if (e.t === 'button' && e.btn === 'A' && e.pressed && phase === 'charge') launchDunk(ctx, 'press');");
    const flight = onInput.indexOf("if (e.t === 'button' && e.btn === 'A' && e.pressed && phase === 'cinematic') {");
    expect(jump).toBeGreaterThan(0);
    expect(flight).toBeGreaterThan(jump);
    expect(onInput).toMatch(/if \(e\.value === 0\) launchDunk\(ctx, 'press'\);/);
    expect(DUEL.match(/launchDunk\(ctx, 'press'\)/g)).toHaveLength(2);
    expect(DUEL.match(/launchDunk\(ctx\)/g)).toHaveLength(2);   // the line and the watchdog are the mode's own
  });

  it("the flight's A asks the echo (with the grace as the Space's slam line) before it reaches the one FirstPress", () => {
    expect(DUEL).toMatch(/const slamPress = new FirstPress\(\)/);
    expect(DUEL).toMatch(/const SLAM_FROM = EASTBAY_TIMING\.extend - CFG\.qteWindowSec \/ 2 - PRESS_GRACE;/);
    const echo = onInput.indexOf('const echo = slamEcho.of(e, performance.now(), clipTime >= SLAM_FROM);');
    const press = onInput.indexOf('slamPress.press(clipTime, ');
    expect(echo).toBeGreaterThan(0);
    expect(press).toBeGreaterThan(echo);
    expect(onInput.slice(echo, press)).toMatch(/if \(echo\) console\.info\([^\n]*\n\s*else \{/);
  });

  it('no press is judged on its own any more (every A was re-judged until one hit)', () => {
    expect(DUEL).not.toMatch(/\bjudgePress\(/);
    expect(DUEL).not.toMatch(/\bEarlyPress\b/);
  });
});
