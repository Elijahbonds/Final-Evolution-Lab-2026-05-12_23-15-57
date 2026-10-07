// The owner-led capture: ingest the recorder's files, then replay every grader against them (MIRROR PHASE 3).
//
//   npx tsx scripts/mirror-capture.ts ingest ~/Downloads/fel-capture-P2-android-mid-2026-10-09-1530.json [more…] [--out <dir>]
//       Checks each file (numbers only, adults only, consent stated, an alias not a name, every take in the protocol;
//       lib/pose/recordingsGuard.ts) and writes one fixture per session to lib/mirror/fixtures/captured/ (or --out).
//       A refused file is not written; the reasons are printed. Nothing else is touched.
//
//   npx tsx scripts/mirror-capture.ts report [--dir <dir>] [--out <report.md>] [--json <report.json>]
//       Replays every grader against the fixtures and prints the before/after tables (lib/mirror/fixtures/capture/
//       report.ts). It NEVER edits a threshold: --out and --json only take a .md / .json path outside lib/, and the
//       owner signs a TUNED value off by hand (docs/MIRROR-ASSESS-THRESHOLDS.md).
//
//   npx tsx scripts/mirror-capture.ts demo --out <dir>
//       A dry run before the real capture: writes two SYNTHETIC recorder files (P1 on each phone, built from the app's
//       own synthetic bodies; no person) to <dir>, outside lib/, to put through ingest --out <another dir> and report.
//
// Run from FEL-full-app. docs/MIRROR-CAPTURE-PROTOCOL.md is the owner's walk-through.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { CAPTURE_DEVICES, captureFileName } from '@/lib/pose/captureProtocol';
import { synthCaptureFile } from '@/lib/mirror/fixtures/capture/synthCapture';
import { ingestTakesFile } from '@/lib/mirror/fixtures/capture/format';
import { CAPTURED_DIR, readCaptured, reportPathOk, writeCaptured } from '@/lib/mirror/fixtures/capture/load';
import { buildReport, renderReport } from '@/lib/mirror/fixtures/capture/report';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name: string): string | null => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : null; };
const positional = args.slice(1).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));

function ingest(): number {
  const out = flag('--out') ?? CAPTURED_DIR;
  if (!positional.length) { console.error('usage: mirror-capture.ts ingest <file.json>… [--out <dir>]'); return 2; }
  let bad = 0;
  for (const file of positional) {
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`✗ ${file}: not readable JSON (${(e as Error).message})`); bad++; continue; }
    const r = ingestTakesFile(raw, basename(file));
    if (!r.fixture) { console.error(`✗ ${file}: refused\n  - ${r.problems.join('\n  - ')}`); bad++; continue; }
    const path = writeCaptured(r.fixture, out);
    const frames = r.fixture.takes.reduce((n, t) => n + t.frames.length, 0);
    console.log(`✓ ${file} → ${relative(process.cwd(), path)} (${r.fixture.takes.length} takes, ${frames} frames)`);
    if (r.missing.length) console.log(`  still to record: ${r.missing.join(', ')}`);
  }
  return bad ? 1 : 0;
}

function report(): number {
  const dir = flag('--dir') ?? CAPTURED_DIR;
  const fixtures = readCaptured(dir);
  if (!fixtures.length) { console.error(`no captured fixtures in ${dir}: run "ingest" first (docs/MIRROR-CAPTURE-PROTOCOL.md)`); return 2; }
  const r = buildReport(fixtures);
  const md = renderReport(r, new Date().toISOString().slice(0, 10));
  const out = flag('--out'), json = flag('--json');
  if (out && !reportPathOk(out, '.md')) { console.error('--out must be a .md path outside lib/'); return 2; }
  if (json && !reportPathOk(json, '.json')) { console.error('--json must be a .json path outside lib/'); return 2; }
  if (out) writeFileSync(out, md);
  if (json) writeFileSync(json, JSON.stringify(r, null, 1));
  console.log(md);
  return 0;
}

function demo(): number {
  const out = flag('--out');
  if (!out || !reportPathOk(join(out, 'x.json'), '.json')) { console.error('usage: mirror-capture.ts demo --out <dir outside lib/>'); return 2; }
  mkdirSync(out, { recursive: true });
  for (const device of CAPTURE_DEVICES) {
    const path = join(out, captureFileName('P1', device, new Date(2026, 9, 9, 15, 30)));
    writeFileSync(path, JSON.stringify(synthCaptureFile({ person: 'P1', device, noise: device === 'iphone' })));
    console.log(`synthetic (no person): ${path}`);
  }
  return 0;
}

const code = cmd === 'demo' ? demo() : cmd === 'ingest' ? ingest() : cmd === 'report' ? report()
  : (console.error('usage: mirror-capture.ts ingest <file.json>… [--out <dir>] | report [--dir <dir>] [--out <report.md>] [--json <report.json>] | demo --out <dir>'), 2);
process.exit(code);
