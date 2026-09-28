// THE SEAM, pinned on the source (movement play P3, step 3, 2026-09-24).
//
// The harness is where the body meets a mode, and it cannot be unit-run here (a Babylon engine, a canvas, a scene).
// The pure parts it chains are gated on their own (BodySession, BodyFloor, the arbiter, bodyGate's replay of the same
// chain) and so is what it builds them from (bodySeamFor, held to every row by bodySeam.test); what this pins is the
// WIRING — the lines that make the harness the chain the gate replays, and the ones the zero-regression contract
// names:
//   Z3/Z5  runMode builds its profile, `drives`, floor and session with bodySeamFor and nothing else, and the body's
//          pause fires only while 'playing' (the step-3 review: breaking any of those passed every test);
//   Z4  a body event never retries a failed load or resumes a pause (only the hands-up intent starts or resumes);
//   the release comes first: every pause lets go of what the body holds while the mode is still 'playing';
//   every way into 'playing' begins the floor and the session (the step-2 review), and the body's wake starts the bed;
//   step 4b: a resume latches its press (and any the mode never saw), re-sends the sticks and triggers the pause changed,
//   and hands the mode the releases the pause ate — each on its own, while the run still plays;
//   Z9  QA grading is unchanged: the raw body events go to bodyLog, which summary() never reads;
//   the legacy mapper is frozen (three importers), and the result sink that posted to a missing route is gone.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';
import { QaTrace } from './QaTrace';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string): string => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const harness = read('lib/babylon/core/ModeHarness.ts');

/** The body of `function name(…) { … }` in the stripped harness, by brace depth. */
function fnBody(src: string, name: string): string {
  const at = src.search(new RegExp(`function ${name}\\(`));
  expect(at, `function ${name}`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error(`unbalanced ${name}`);
}

/** Every code file under the repo's source roots (tests included: a test that imports the mapper is an importer too). */
function codeFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|tsx|mts)$/.test(e.name)) out.push(rel);
    }
  };
  for (const d of ['lib', 'components', 'app', 'scripts', 'hooks', 'tests']) walk(d);
  return out;
}

describe('the harness reads the body (plan §4.4)', () => {
  it('builds the seam with bodySeamFor, and nothing by hand (Z3, Z5: the row and `drives` are decided there, and tested there)', () => {
    // the step-3 review: `const drives = true` (a dunk paused for a pad player's body walking off) or every mode on
    // skateboard's row (the body pressing POP in a quiz) passed every test while the harness built these itself
    expect(harness).toMatch(/const seam = bodySeamFor\(def\);\s*const store = sessionStore\.mount\(seam\.card\);/);
    expect(harness).toMatch(/const \{ claimed, floor, session, evidence \} = seam;/);
    for (const byHand of [/new BodyFloor\(/, /new BodySession\(/, /new EvidenceCounter\(/, /resolveBodyProfile\(/, /cardLines\(/, /\.bindings\b/]) {
      expect(harness).not.toMatch(byHand);
    }
    // the card comes down again if the mount never finishes (a throw before the disposer is handed back)
    expect(fnBody(harness, 'runMode')).toMatch(/try \{\s*return await mountMode\(def, opts, seam, store\);\s*\} catch \(e\) \{\s*store\.unmount\(\);\s*throw e;\s*\}/);
  });

  it('subscribes the body channel: the session judges every frame, the floor presses only while playing, and it unsubscribes first at teardown', () => {
    const on = harness.slice(harness.indexOf('input.onBody('));
    expect(on.length).toBeGreaterThan(0);
    expect(on).toMatch(/^input\.onBody\(\(p\) => \{\s*const now = performance\.now\(\);\s*const s = session\.step\(phase, p, now\);\s*applyBody\(s\);\s*if \(p\.final\) releaseBody\(\);\s*if \(phase === 'playing'\) \{\s*for \(const e of floor\.step\(p, now, s\.latched\)\) input\.emitBody\(e\);/);
    // the raw events go to QA's bodyLog; a claimed kind goes to the mode's onBody — never while the START latch holds
    // (P7) — and counts as play only when the mode took it (onBody did not return false: a menu is not play)
    expect(on).toMatch(/qa\?\.body\(ev\.kind, now - ev\.t\);\s*if \(def\.onBody && claimed\.has\(ev\.kind\) && !s\.latched\) \{\s*if \(def\.onBody\(ctx, ev, viewOf\(p\)\) !== false\) \{ qa\?\.press\(`body:\$\{ev\.kind\}`\); store\.count\('body'\); session\.noteInput\('body', now\); \}/);
    expect(on).toMatch(/store\.setBody\(s\.presence, s\.handsUp01\);\s*\}\);/);
    // the render loop ticks the session and the floor's pulses in every phase, before the mode's update — and writes the
    // tick's presence (the step-4a review: a stalled camera's last 'present' stayed on the pause line and the Body card)
    const loop = harness.slice(harness.indexOf('engine.runRenderLoop('));
    expect(loop).toMatch(/const bodyTick = session\.tick\(phase, bodyNow, input\.lastBodyAt\(\)\);\s*applyBody\(bodyTick\);\s*store\.setBody\(bodyTick\.presence, bodyTick\.handsUp01\);\s*for \(const e of floor\.tick\(bodyNow\)\) input\.emitBody\(e\);[\s\S]*?if \(phase === 'playing'\) \{\s*if \(qa\) qaSampleAnim\(\);\s*def\.update/);
    // teardown: no more frames, the card goes, then the input as before
    expect(harness).toMatch(/unBody\(\);\s*store\.unmount\(\);\s*unsub\?\.\(\);\s*input\.stop\(\);/);
    // ctx.body() is the latest packet as a view, or null
    expect(harness).toContain('body() { const p = input.body(); return p ? viewOf(p) : null; },');
  });

  it('a body event never retries a failed load or resumes a pause (Z4): both guards reject src:\'body\'', () => {
    expect(harness).toContain("if (phase === 'error' && e.t === 'button' && e.pressed && e.src !== 'body') { void attemptLoad(); return; }");
    expect(harness).toContain("if (phase === 'paused' && e.t === 'button' && e.pressed && e.src !== 'body') { resume(e); return; }");
    // the READY gate is the pinned line (StartWake.test), and isWakeInput refuses every body event
    expect(harness).toMatch(/phase === 'ready' && isWakeInput\(e\)/);
    expect(read('lib/babylon/core/StartWake.ts')).toMatch(/if \(e\.src === 'body'\) return false;/);
  });

  it('every phase is written to the session store (movement play P4: the body-play store and the Body button read it)', () => {
    const at = harness.indexOf('const setPhase = (p: ModePhase');
    expect(at).toBeGreaterThan(0);
    const body = harness.slice(at, harness.indexOf('\n  };', at));
    expect(body).toMatch(/\n\s*store\.setPhase\(p\);/);
    // before the host hears it (onPhase), so a host re-rendering on the phase reads the store already moved
    expect(body.indexOf('store.setPhase(p)')).toBeLessThan(body.indexOf('opts.onPhase?.(p, detail)'));
    // and nothing else writes the phase
    expect([...harness.matchAll(/store\.setPhase\(/g)]).toHaveLength(1);
  });

  it('releaseBody() comes before every setPhase(\'paused\'): the mode sees its axes at 0 while it is still playing', () => {
    const pauses = [...harness.matchAll(/setPhase\('paused'\)/g)];
    expect(pauses.length).toBe(2);                     // the START press, and the body-lost / stalled pause
    for (const m of pauses) {
      const before = harness.slice(Math.max(0, m.index! - 40), m.index);
      expect(before, harness.slice(m.index! - 120, m.index! + 40)).toMatch(/releaseBody\(\); $/);
    }
    // and the START press's pause is recorded as the input's (the paused layer's line reads it, step 4)
    expect(harness).toContain("{ releaseBody(); setPhase('paused'); store.setPause('input'); return; }");
    expect(fnBody(harness, 'applyBody')).toMatch(/if \(s\.release\) releaseBody\(\);\s*for \(const it of s\.intents\)/);   // releases FIRST
    // the body's pause only ever pauses a game that is playing (a late intent never pauses READY, PAUSED or an end card)
    expect(fnBody(harness, 'applyBody')).toMatch(/if \(\(it === 'pause-lost' \|\| it === 'pause-stall'\) && phase === 'playing'\) \{\s*releaseBody\(\); setPhase\('paused'\); store\.setPause\(it === 'pause-lost' \? 'body-lost' : 'stall'\);/);
  });

  it('every way into playing begins the floor and the session; the body\'s wake starts the audio bed (firstInput)', () => {
    const wake = fnBody(harness, 'wake'), resume = fnBody(harness, 'resume'), apply = fnBody(harness, 'applyBody');
    expect(wake).toMatch(/floor\.begin\(\); session\.begin\(performance\.now\(\), by\);/);
    // a new run, a new play record: the store's and the counter's crossings both start over (a trigger held across the
    // wake is not counted again, nor a stick left armed from the run before)
    expect(wake).toMatch(/store\.beginRun\(def\.modeId\);\s*evidence\.reset\(\);/);
    expect(resume).toMatch(/floor\.begin\(\); session\.begin\(performance\.now\(\), e \? 'external' : 'body'\);/);
    expect(resume).toMatch(/store\.setPause\(null\);/);
    // the only callers that change the phase to 'playing' are wake() and resume() (plus setPhase itself)
    expect([...harness.matchAll(/setPhase\('playing'\)/g)]).toHaveLength(2);
    expect(apply).toMatch(/if \(it === 'wake' && phase === 'ready'\) \{ firstInput\(\); wake\('body'\); \}/);
    expect(apply).toMatch(/if \(it === 'resume' && phase === 'paused'\) resume\(null\);/);
    // M43's unlock + ambient bed is one function, and every input still runs it first
    expect(fnBody(harness, 'firstInput')).toMatch(/SoundKit\.unlock\(\);[\s\S]*SoundKit\.startAmbient\(bed\);/);
    expect(harness).toMatch(/unsub = input\.on\(\(e\) => \{\s*firstInput\(\);/);
    // the play evidence is counted from every source, after the wake latch, before the mode sees the event
    expect(harness).toMatch(/if \(!wakeLatch\.pass\(e, now\)\) return;\s*const c = evidence\.count\(e, now\);\s*if \(c\) \{ store\.count\(c\); session\.noteInput\(c, now\); \}/);
  });

  // step 4b (2026-09-24): resume and wake hygiene — the resume is a wake in the middle of a run, and gets the wake's care
  it('step 4b: a button resume arms the wake latch (its release never reaches the mode unpaired), and the pause keeps a ledger', () => {
    const resume = fnBody(harness, 'resume');
    expect(resume).toMatch(/if \(e\?\.t === 'button'\) wakeLatch\.wake\(e, performance\.now\(\), true\);/);
    // armed once the game is playing again — the latch only judges what arrives in 'playing'
    expect(resume.indexOf('wakeLatch.wake(')).toBeGreaterThan(resume.indexOf("setPhase('playing')"));
    // the ledger: what a pause drops goes in (the resuming press excepted: the latch has it), and it knows what is down
    // for the mode from exactly what the mode is handed — after the latch, right before onInput
    expect(harness).toMatch(/if \(phase === 'paused' && e\.t === 'button' && e\.pressed && e\.src !== 'body'\) \{ resume\(e\); return; \}\s*if \(phase === 'paused'\) \{ pauseLedger\.drop\(e\); return; \}/);
    expect(harness).toMatch(/pauseLedger\.saw\(e\);\s*def\.onInput\(ctx, e\);\s*\}\s*\}\);/);
  });

  it('step 4b: the resume re-sends the sticks and triggers the pause changed (input.resync) and hands the mode the releases it ate', () => {
    const resume = fnBody(harness, 'resume');
    // after the floor and the session begin, so the re-sent values are input the game received like any other; the
    // ledger's releases straight to onInput, past the latch that now holds the resuming press
    expect(resume).toMatch(/floor\.begin\(\); session\.begin\([^;]*\);[\s\S]*input\.resync\(\(r\) => pauseLedger\.changed\(r\)\);\s*pauseLedger\.replay\(/);
    // the review (2026-09-24): only what the pause CHANGED is re-sent — an unasked trigger 0 read as Shift and F let go
    // on a keyboard (the behaviour: InputBus.body's step-4b block); the resume's alone (the READY wake forwards the
    // waking push itself: WakeLatch.wake → true)
    expect([...harness.matchAll(/input\.resync\(/g)]).toHaveLength(1);
    expect(harness).not.toMatch(/input\.resync\(\)/);
    // the review: a press the mode never saw (a d-pad pressed during the pause) is latched with the resuming one
    expect(resume).toMatch(/wakeLatch\.wake\(e, performance\.now\(\), true\);\s*wakeLatch\.hold\(pauseLedger\.heldUnseen\(\)\);\s*input\.resync\(/);
    // the review: each owed release only while the run still plays (a re-sent value can end it), each on its own
    expect(resume).toMatch(/pauseLedger\.replay\(\(r\) => \{\s*if \(phase !== 'playing'\) return;\s*try \{ def\.onInput\(ctx, r\); \} catch \(err\) \{ console\.error\([^;]*\); \}\s*\}\);\s*$/);
    // a new run owes nothing from the one before (a retried load wakes again)
    expect(fnBody(harness, 'wake')).toMatch(/pauseLedger\.reset\(\);/);
  });

  it('the result sink is the host\'s: defaultResultSink is gone from the tree and resultSink is required', () => {
    const left = codeFiles().filter((f) => !f.endsWith('bodySeam.scan.test.ts') && /defaultResultSink/.test(read(f)));
    expect(left).toEqual([]);
    expect(harness).toMatch(/\n  resultSink: ResultSink;/);
    expect(harness).toContain('opts.resultSink(result);');
  });

  it('the P1 mapper is frozen: poseControl is imported only by the baseline, its script and its own tests', () => {
    const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)['"][^'"]*\/poseControl(?:\.ts)?['"]/;
    const importers = codeFiles().filter((f) => IMPORT.test(read(f))).sort();
    expect(importers).toEqual([
      path.join('lib', 'input', 'poseControl.test.ts'),
      path.join('lib', 'pose', 'baseline.ts'),
      path.join('scripts', 'body', 'baseline.mts'),
    ]);
    expect(fs.readFileSync(path.join(ROOT, 'lib/input/poseControl.ts'), 'utf8')).toMatch(/FROZEN — the P1 baseline mapper/);
  });

  it('the Body card: a bound mode shows when stepping out pauses (only while the body plays, Z5)', () => {
    expect(read('components/games/body-control.tsx')).toMatch(/const notes = \[PAUSE_NOTE, \.\.\.costNotes\(view\)\];/);
  });

  it('the live probe reads READY as the dev runner prints it: the ModePhase, never the ready marker\'s word', () => {
    // the step-3 review: the probe compared the runner's 'ready' with 'loaded' (fel-ready's word for the same phase),
    // so its first check — READY held on a still stand — failed whatever the game did
    expect(read('app/dev/mode/[key]/loader.tsx')).toMatch(/DEV · <span[^>]*>\{modeKey\}<\/span> · \{phase\}/);
    const probe = read('scripts/probes/_body-seam-live.mts');
    expect(probe).toMatch(/keptOnStand: phaseAt\(t, upAt\) === 'ready'/);
    expect(probe).toMatch(/let ph = 'ready';/);
    expect(probe).not.toMatch(/phaseAt\([^)]*\) === 'loaded'/);
    // the owner's call-5 cut line covers both bound-on-probation modes, and both are in the default run
    expect(probe).toMatch(/const CUT_LINE = new Set\(\['freerun', 'mixedcombat'\]\);/);
    expect(probe).toMatch(/'skateboard,karate_vs,sprint,freerun,mixedcombat,dunk,onevone,brainbrawl,who_scene_it'/);
  });

  it('QA grading never reads the body log (Z9): raw body events stay out of the graded timeline', () => {
    const qa = read('lib/babylon/core/QaTrace.ts');
    expect(fnBody(qa.replace(/summary\(windowMs = 450, from = 0\): QaSummary \{/, 'function summary() {'), 'summary')).not.toMatch(/bodyLog/);
    let t = 0;
    const q = new QaTrace(() => t);
    q.press('A'); t = 50; q.juice('banner');
    const graded = q.summary();
    t = 100; q.body('takeoff', 135); q.body('step', 80);
    expect(q.events).toHaveLength(2);
    expect(q.bodyLog).toEqual([{ t: 100, kind: 'takeoff', lagMs: 135 }, { t: 100, kind: 'step', lagMs: 80 }]);
    expect(q.summary()).toEqual(graded);
    q.reset();
    expect(q.bodyLog).toEqual([]);
  });
});
