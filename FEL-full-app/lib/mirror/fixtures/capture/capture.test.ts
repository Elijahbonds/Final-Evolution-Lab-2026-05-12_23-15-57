// MIRROR PHASE 3: the owner-led capture, end to end — a synthetic "captured" file through the ingest, every grader
// replayed against it (and against the repo's own fixtures), before/after tables, and never a threshold edited.
import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { CAPTURE_TAKES, captureTake } from '@/lib/pose/captureProtocol';
import { captureFixtureProblems } from '@/lib/pose/recordingsGuard';
import { THRESHOLDS } from '@/lib/screen/PROPOSED-thresholds';
import { SQUAT_THRESHOLDS } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { DEFAULT_THRESHOLDS } from '@/lib/babylon/nexus/neuro-mirror/rules/config';
import { LUNGE_THRESHOLDS } from '../../lungeAudit';
import { HINGE_THRESHOLDS } from '../../hingeAudit';
import { PUSHUP_THRESHOLDS } from '../../pushupAudit';
import { readFixture } from '../load';
import { toPoseFrames } from '../index';
import { ingestTakesFile, takeFrames, type CaptureFixture, type CapturedTake } from './format';
import { synthCaptureFile } from './synthCapture';
import { CHECKS, FLOOR_CHECK, Session } from './checks';
import { bestLine, buildReport, candidateLines, renderReport, thinTo30, type CaptureReport, type Tally } from './report';
import { readCaptured, reportPathOk, writeCaptured } from './load';

const APP = join(__dirname, '../../../..');
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const ingestOk = (raw: unknown, name = 'fel-capture-P2-iphone-2026-10-09-1530.json') => {
  const r = ingestTakesFile(clone(raw), name);
  if (!r.fixture) throw new Error(r.problems.join('\n'));
  return r;
};

let android: CaptureFixture, iphone: CaptureFixture, report: CaptureReport;
const check = (id: string) => report.checks.find((c) => c.id === id)!;

beforeAll(() => {
  android = ingestOk(synthCaptureFile({ person: 'P1', device: 'android-mid' })).fixture!;
  iphone = ingestOk(synthCaptureFile({ person: 'P2', device: 'iphone', noise: true, seed: 11 })).fixture!;
  report = buildReport([iphone, android]);
});

describe('the ingest: a recorder file into a session fixture', () => {
  it('takes a synthetic capture: numbers only, the guard passes it, the protocol\'s missing takes listed', () => {
    const r = ingestOk(synthCaptureFile({ person: 'P3', device: 'iphone' }));
    expect(captureFixtureProblems(r.fixture)).toEqual([]);
    expect(r.fixture!.capture).toEqual({ protocol: 'mirror-capture-1', person: 'P3', device: 'iphone', adult: true, consent: true });
    expect(r.missing).toContain('pressRow.good');   // no synthetic press/row body: a session to finish, not a refusal
    expect(r.missing).not.toContain('jump.kneesCaveInLanding');   // optional takes are never "missing"
    expect(r.fixture!.takes.map((t) => t.id)).toEqual(CAPTURE_TAKES.map((t) => t.id).filter((id) => r.fixture!.takes.some((t) => t.id === id)));
  });

  it('carries no free text: the notes, the time of day and the prompts are not in the fixture', () => {
    const raw = synthCaptureFile({ person: 'P1', device: 'iphone', only: ['stand.front', 'squat.good'] });
    raw.notes = 'Jordan, in the kitchen';
    const fx = ingestOk(raw).fixture!;
    const text = JSON.stringify(fx);
    expect(text).not.toMatch(/Jordan|kitchen|T15:30|recordedAt|prompt|notes/);
    expect(fx.recordedOn).toBe('2026-10-09');
  });

  it('keeps world points only where a grader reads them (the front stand and the jump)', () => {
    const fx = ingestOk(synthCaptureFile({ person: 'P1', device: 'iphone', only: ['stand.front', 'squat.good', 'jump.good'] })).fixture!;
    const hasWorld = (t: CapturedTake) => t.frames.some((f) => !!f.w);
    expect(fx.takes.filter(hasWorld).map((t) => t.id).sort()).toEqual(['jump.good', 'stand.front']);
  });

  it('refuses the whole file, with reasons, for anything the capture does not allow', () => {
    const raw = synthCaptureFile({ person: 'P2', device: 'android-mid', only: ['stand.front'] });
    const refused = (x: unknown, name?: string) => { const r = ingestTakesFile(clone(x), name); expect(r.fixture).toBeNull(); return r.problems.join(' | '); };
    expect(refused({ ...raw, capture: { ...(raw.capture as object), person: 'Jordan' } })).toMatch(/alias/);
    expect(refused({ ...raw, capture: { ...(raw.capture as object), consent: false } })).toMatch(/consent/);
    expect(refused({ ...raw, takes: [{ ...raw.takes[0], id: 'backflip' }] })).toMatch(/not in the capture protocol/);
    expect(refused(raw, 'take.mp4')).toMatch(/picture or a video/);
    expect(refused({ ...raw, still: 'data:video/mp4;base64,AAAA' })).toMatch(/embedded image or video/);
    expect(refused({ ...raw, origin: 'synthetic' })).toMatch(/owner-capture/);
    expect(refused({ ...raw, format: 'video/mp4' })).toMatch(/format/);
    const { capture: _c, ...noBlock } = raw;
    expect(refused({ ...noBlock })).toMatch(/no capture block/);
  });

  it('a minor is never ingested: no "adults only" statement, or a child, refuses the file', () => {
    const raw = synthCaptureFile({ person: 'P2', device: 'android-mid', only: ['stand.front'] });
    expect(ingestTakesFile(clone({ ...raw, capture: { ...(raw.capture as object), adult: false } })).problems.join()).toMatch(/no minors/);
    expect(ingestTakesFile(clone({ ...raw, child: true })).problems.join()).toMatch(/child must be false/);
  });

  it('writes one gzip file per session, the same bytes every time, and reads back only what the guard passes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fel-capture-'));
    const fx = ingestOk(synthCaptureFile({ person: 'P1', device: 'iphone', only: ['stand.front', 'stand.side', 'squat.good'] })).fixture!;
    const a = writeCaptured(fx, dir);
    const first = readFileSync(a);
    writeCaptured(fx, dir);
    expect(readFileSync(a).equals(first)).toBe(true);
    expect(a).toMatch(/P1-iphone-2026-10-09\.json\.gz$/);
    expect(readCaptured(dir)).toEqual([fx]);
    writeFileSync(join(dir, 'tampered.json.gz'), gzipSync(JSON.stringify({ ...fx, notes: 'Jordan' })));
    expect(() => readCaptured(dir)).toThrow(/unexpected key notes/);
  });
});

describe('the replay report on a synthetic capture (two phones)', () => {
  it('reports every check, and at PROPOSED each one catches its synthetic fault with no false alarm on good takes', () => {
    expect(report.checks.map((c) => c.id)).toEqual(CHECKS.map((c) => c.id));
    const caught = ['t1.valgus', 't1.trunkTibia', 't1.shoulderFlex', 't1.heelRiseReps', 't2.tibia', 't2.heelLiftRejected', 't3.fppa', 't3.pelvicDrop',
      't3.trunkLean', 't5.landingFlex', 't5.landingValgus', 't5.armSwing', 'mirror.squat.kneeValgus', 'mirror.lunge.kneeIn', 'mirror.lunge.shallow',
      'mirror.hinge.hingeRatio', 'mirror.hinge.dowelLine', 'mirror.pushup.bodyLine', 'mirror.pushup.depth', 'pose.confidenceFloor'];
    for (const id of caught) {
      const t = check(id).proposed.overall;
      expect(t.faultRead, id).toBeGreaterThan(0);
      expect(t.caught, id).toBe(t.faultRead);
      expect(t.goodRead, id).toBeGreaterThan(0);
      // FINDING (2026-10-07, measured, reported, not changed: lib/mirror/lungeAudit.ts is the mirror-moves lane's): under
      // the synth's landmark jitter a CLEAN lunge's worst knee read is 0.31–0.50 hip half-widths (seeds 3, 5, 11), past
      // kneeInWarn 0.30 — the lunge has no persistence gate (the squat's valgusPersistFrames). So for this one check
      // only the clean (unjittered) phone is held to zero false alarms; the jittered one is the report's to show.
      const fa = id === 'mirror.lunge.kneeIn' ? check(id).proposed.byDevice['android-mid'].falseAlarms : t.falseAlarms;
      expect(fa, id).toBe(0);
    }
  });

  it('shows the lunge knee line\'s jitter false alarms (the finding above) and suggests a line between them and the fault', () => {
    const c = check('mirror.lunge.kneeIn');
    expect(c.proposed.byDevice.iphone.falseAlarms).toBeGreaterThan(0);
    expect(c.suggestion.verdict).toBe('change');
    if (c.suggestion.verdict === 'change') expect(c.suggestion.overall).toMatchObject({ falseAlarms: 0 });
  });

  it('splits every tally by phone', () => {
    const t = check('t1.valgus').proposed.byDevice;
    expect(Object.keys(t).sort()).toEqual(['android-mid', 'iphone']);
    expect(t['android-mid'].faultRead + t.iphone.faultRead).toBe(check('t1.valgus').proposed.overall.faultRead);
  });

  it('the confidence floor fires on the dim and far takes, and on nothing else (every good AND fault take of every movement)', () => {
    const f = check('pose.confidenceFloor');
    expect(f.rows.filter((r) => r.flagged).map((r) => r.take).sort()).toEqual(['light.dim', 'light.dim', 'light.far', 'light.far']);
    expect(f.proposed.overall.goodRead).toBeGreaterThan(60);
  });

  it('an "exact" check re-grades exactly: its value against its own line gives the shipped grader\'s verdict on every take', () => {
    for (const c of report.checks.filter((x) => x.mode === 'exact')) {
      for (const r of c.rows.filter((x) => x.value !== null && x.flagged !== null)) {
        const op = c.threshold.op, v = r.value!, at = c.threshold.value;
        const byLine = op === '<' ? v < at : op === '<=' ? v <= at : op === '>' ? v > at : v >= at;
        expect(byLine, `${c.id} ${r.session} ${r.take}`).toBe(r.flagged);
      }
    }
  });

  it('counts reps on good takes for every grader that counts them', () => {
    const graders = report.reps.map((r) => r.grader);
    for (const g of ['Quick Screen T1 (front)', 'Quick Screen T1 (side)', 'Quick Screen T2', 'Quick Screen T3', 'Quick Screen T5', 'Mirror jump (DunkTracker)', 'Mirror push-up']) {
      expect(graders, g).toContain(g);
    }
    const t5 = report.reps.find((r) => r.grader === 'Quick Screen T5')!.byDevice.iphone;
    expect(t5).toEqual({ counted: 3, asked: 3 });
  });

  it('the jump at the captured 60 fps clears the 50 Hz gate and scores landing timing; the same take at 30 Hz cannot', () => {
    const good = report.jumpRate.find((j) => j.session === 'P2 · iphone' && j.take === 'jump.good')!;
    expect(good.native.hz).toBeGreaterThan(55);
    expect(good.native.fpsLow).toBe(false);
    expect(good.native.symScored).toBeGreaterThan(0);
    expect(good.at30.hz).toBeLessThan(31);
    expect(good.at30.fpsLow).toBe(true);
    expect(good.at30.symScored).toBe(0);
    const droid = report.jumpRate.find((j) => j.session === 'P1 · android-mid' && j.take === 'jump.good')!;
    expect(droid.native.fpsLow).toBe(true);
  });

  it('the frame-rate log says what the high-rate trial would do on each phone', () => {
    expect(report.rateLog.find((r) => r.session === 'P1 · android-mid')!.trial).toMatch(/^fallback/);
    expect(report.rateLog.find((r) => r.session === 'P2 · iphone')!.trial).toMatch(/^hold/);
  });

  it('renders the before/after tables, the same text every time from the same fixtures', () => {
    const md = renderReport(report, '2026-10-09');
    expect(md).toMatch(/## Before \/ after, per check/);
    expect(md).toMatch(/\| `t1\.valgus` \| `t1\.valgus` \(> · hip half-widths\) \| 0\.8 \|/);
    expect(md).toMatch(/Nothing in this report changes a threshold/);
    expect(md).toMatch(/## The jump: the captured rate against the same take at 30 Hz/);
    expect(renderReport(buildReport([android, iphone]), '2026-10-09')).toBe(md);
  });
});

describe('the suggestion (pure)', () => {
  const tally = (rows: { role: 'good' | 'fault'; v: number }[], op: '>' | '<', c: number): Tally => {
    const t: Tally = { goodRead: 0, falseAlarms: 0, faultRead: 0, caught: 0, unread: 0 };
    for (const r of rows) {
      const f = op === '>' ? r.v > c : r.v < c;
      if (r.role === 'good') { t.goodRead++; if (f) t.falseAlarms++; } else { t.faultRead++; if (f) t.caught++; }
    }
    return t;
  };

  it('moves the line to where it separates the labelled takes, and says how it does there', () => {
    // a knee line at 20° misses faults that read 14–18°, while good takes read 3–9°
    const rows = [3, 5, 9, 6].map((v) => ({ role: 'good' as const, v })).concat([14, 16, 18, 25].map((v) => ({ role: 'fault' as const, v })));
    const cands = candidateLines('exact', 20, rows.map((r) => r.v));
    const best = bestLine(20, cands, (c) => tally(rows, '>', c));
    expect(best.value).toBe(11.5);   // the midpoint nearest 20 among the lines that catch all four with no false alarm
    expect(best.tally).toMatchObject({ caught: 4, falseAlarms: 0 });
  });

  it('keeps the PROPOSED value when it already separates best', () => {
    const rows = [3, 5].map((v) => ({ role: 'good' as const, v })).concat([25, 30].map((v) => ({ role: 'fault' as const, v })));
    expect(bestLine(20, candidateLines('exact', 20, rows.map((r) => r.v)), (c) => tally(rows, '>', c)).value).toBe(20);
  });

  it('a tie goes to the line nearest the PROPOSED value', () => {
    // good 3 and 12, faults 10 and 20: a line at 6.5 and one at 16 separate them equally well (catch − false alarms)
    const rows = [{ role: 'good' as const, v: 3 }, { role: 'fault' as const, v: 10 }, { role: 'good' as const, v: 12 }, { role: 'fault' as const, v: 20 }];
    const best = bestLine(25, candidateLines('exact', 25, rows.map((r) => r.v)), (c) => tally(rows, '>', c));
    expect(best.value).toBe(16);
  });

  it('a re-run check tries multiples of the PROPOSED value', () => {
    expect(candidateLines('rerun', 0.5, [])).toEqual([0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.625, 0.75, 0.875, 1]);
  });
});

describe('the replay harness on the repo\'s own fixtures (lib/mirror/fixtures)', () => {
  const asTake = (id: string, fixture: string): CapturedTake => {
    const spec = captureTake(id)!;
    const fx = readFixture(fixture);
    return {
      id, movement: spec.movement, label: spec.label, view: spec.view, ...(spec.side ? { side: spec.side } : {}), reps: spec.reps,
      video: { width: fx.camera.width, height: fx.camera.height }, clock: 'capture', detectFps: 30, inferMs: 0, highRate: false, goT: 0,
      frames: fx.frames.map((f) => ({ t: f.t, lm: f.present ? f.lm : [] })),
    };
  };
  const fixture: CaptureFixture = {
    format: 'fel-mirror-capture/1', origin: 'owner-capture', child: false,
    capture: { protocol: 'mirror-capture-1', person: 'P1', device: 'iphone', adult: true, consent: true },
    device: 'fixtures', model: 'synthetic', recordedOn: '2026-09-25',
    takes: [
      asTake('stand.front', 'stand_front'), asTake('stand.side', 'stand_side'),
      asTake('squat.good', 'squat_clean'), asTake('squat.kneesCaveIn', 'squat_knees_in_both'),
      asTake('lunge.left.good', 'lunge_left_front'), asTake('hinge.good', 'hinge_side'), asTake('pushup.good', 'pushup_side'),
    ],
  };
  let r: CaptureReport;
  beforeAll(() => { r = buildReport([fixture]); });

  it('passes the guard as a capture fixture would', () => {
    expect(captureFixtureProblems(fixture)).toEqual([]);
  });

  it('the Mirror squat catches squat_knees_in_both and leaves squat_clean\'s knees alone; the floor says nothing on any of them', () => {
    const k = r.checks.find((c) => c.id === 'mirror.squat.kneeValgus')!;
    expect(k.proposed.overall).toMatchObject({ goodRead: 1, falseAlarms: 0, faultRead: 1, caught: 1 });
    expect(r.checks.find((c) => c.id === 'pose.confidenceFloor')!.proposed.overall).toMatchObject({ falseAlarms: 0 });
    expect(r.checks.find((c) => c.id === 'mirror.hinge.hingeRatio')!.proposed.overall).toMatchObject({ goodRead: 1, falseAlarms: 0 });
    expect(r.checks.find((c) => c.id === 'mirror.pushup.bodyLine')!.proposed.overall).toMatchObject({ goodRead: 1, falseAlarms: 0 });
  });

  it('a re-run at the PROPOSED value gives the shipped grader\'s own verdict (the squat audit, the floor)', () => {
    const s = new Session(fixture);
    for (const c of CHECKS.filter((x) => x.mode === 'rerun' && (x.movement === 'squat' || x === FLOOR_CHECK))) {
      for (const take of fixture.takes.filter((t) => c.movement === '*' || t.movement === c.movement)) {
        const shipped = c.read(take, s).flagged;
        if (shipped === null) continue;
        expect(c.rerun!(take, s, c.threshold.value), `${c.id} ${take.id}`).toBe(shipped);
      }
    }
  });

  it('the fixture frames come back as the same PoseFrames the graders read', () => {
    const tk = fixture.takes.find((t) => t.id === 'squat.good')!;
    expect(takeFrames(tk).map((f) => f.image.length)).toEqual(toPoseFrames(readFixture('squat_clean')).map((f) => f.image.length));
  });
});

describe('it never edits a threshold', () => {
  it('no threshold object is changed by a whole replay (candidates are copies)', () => {
    const before = clone({ THRESHOLDS, SQUAT_THRESHOLDS, DEFAULT_THRESHOLDS, LUNGE_THRESHOLDS, HINGE_THRESHOLDS, PUSHUP_THRESHOLDS });
    buildReport([android]);
    expect(clone({ THRESHOLDS, SQUAT_THRESHOLDS, DEFAULT_THRESHOLDS, LUNGE_THRESHOLDS, HINGE_THRESHOLDS, PUSHUP_THRESHOLDS })).toEqual(before);
  });

  it('the report, the checks and the ingest touch no file system; the script writes only the fixtures and the report', () => {
    for (const f of ['report.ts', 'checks.ts', 'format.ts', 'synthCapture.ts']) {
      expect(readFileSync(join(__dirname, f), 'utf8'), f).not.toMatch(/node:fs|writeFile|require\(['"]fs/);
    }
    const script = readFileSync(join(APP, 'scripts/mirror-capture.ts'), 'utf8');
    expect([...script.matchAll(/writeFileSync\(([^,]+),/g)].map((m) => m[1].trim()).sort()).toEqual(['json', 'out']);
    expect(script).toMatch(/reportPathOk\(out, '\.md'\)/);
    expect(script).toMatch(/reportPathOk\(json, '\.json'\)/);
  });

  it('a report can never be written onto lib/ or scripts/, nor as anything but .md / .json', () => {
    expect(reportPathOk('/tmp/report.md', '.md')).toBe(true);
    expect(reportPathOk('docs/capture-report.md', '.md')).toBe(true);
    expect(reportPathOk('lib/screen/PROPOSED-thresholds.ts', '.md')).toBe(false);
    expect(reportPathOk('lib/screen/report.md', '.md')).toBe(false);
    expect(reportPathOk('scripts/x.json', '.json')).toBe(false);
    expect(reportPathOk('/tmp/report.ts', '.md')).toBe(false);
  });

  it('end to end through the script: ingest, report, and every threshold file byte-identical after', () => {
    const files = ['lib/screen/PROPOSED-thresholds.ts', 'lib/babylon/nexus/neuro-mirror/rules/squat-audit.ts', 'lib/babylon/nexus/neuro-mirror/rules/config.ts',
      'lib/mirror/lungeAudit.ts', 'lib/mirror/hingeAudit.ts', 'lib/mirror/pushupAudit.ts', 'lib/mirror/squatPattern.ts', 'lib/pose/confidenceFloor.ts', 'lib/pose/modelChoice.ts'];
    const hash = () => files.map((f) => createHash('sha256').update(readFileSync(join(APP, f))).digest('hex'));
    const before = hash();
    const dir = mkdtempSync(join(tmpdir(), 'fel-capture-cli-'));
    const raw = join(dir, 'fel-capture-P1-iphone-2026-10-09-1530.json');
    writeFileSync(raw, JSON.stringify(synthCaptureFile({ person: 'P1', device: 'iphone', only: ['stand.front', 'stand.side', 't1.front.good', 't1.front.kneesCaveIn', 'light.dim'] })));
    const fixtures = join(dir, 'fixtures');
    const tsx = join(APP, 'node_modules/.bin/tsx');
    const out1 = execFileSync(tsx, ['scripts/mirror-capture.ts', 'ingest', raw, '--out', fixtures], { cwd: APP, encoding: 'utf8' });
    expect(out1).toMatch(/✓ .* → .*P1-iphone-2026-10-09\.json\.gz \(5 takes/);
    expect(readdirSync(fixtures)).toEqual(['P1-iphone-2026-10-09.json.gz']);
    const md = join(dir, 'report.md');
    execFileSync(tsx, ['scripts/mirror-capture.ts', 'report', '--dir', fixtures, '--out', md], { cwd: APP, encoding: 'utf8' });
    expect(readFileSync(md, 'utf8')).toMatch(/\| `t1\.valgus` .* \| 100% \(1\/1\) \|/);
    let refused = '';
    // aimed at a lib/ folder inside the temp dir, so even a broken guard could never write into the repo
    const libOut = join(dir, 'lib', 'PROPOSED-thresholds.md');
    try { execFileSync(tsx, ['scripts/mirror-capture.ts', 'report', '--dir', fixtures, '--out', libOut], { cwd: APP, encoding: 'utf8', stdio: 'pipe' }); } catch (e) { refused = String((e as { stderr?: string }).stderr); }
    expect(refused).toMatch(/--out must be a \.md path outside lib/);
    expect(hash()).toEqual(before);
  });
});
