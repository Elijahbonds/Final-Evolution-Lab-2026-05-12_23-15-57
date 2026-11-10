// The shot and dribble tracker, pinned on the source (BBS-01 / BBS-02; platform phase 9, 2026-11-03). A new camera surface
// keeps components/games/bodyPlay.scan.test.ts's rules (Z-P4-4) and says so in its own scan:
//   · nothing in the tracker can send anything (no fetch, beacon, socket, peer connection, event stream, image encode)
//     — EXCEPT, since BBS-04 (2026-11-03), two named sites, each pinned to what it may do: the session POSTs a finished
//     session's NUMBERS to /api/hoops-cam/sessions (the movement-save gate runs there), and the coach's charts GET
//     /api/coach/shots. Neither carries a picture (the VBT scan's CARRY / PIXEL rules, tests/vbt/no-picture.scan.test.ts);
//   · the camera picture is shown only through SelfView: no <video> of its own, no showIn, the colour copy the ball
//     detector reads is never put on the page or encoded;
//   · no accuracy claim in any line it shows (owner): "accurate", "accuracy", "precise" never appear outside comments;
//   · the detector (lib/hoops-cam's ball and track readers, the live session) is reached only from the shots page: /train
//     and /play/drills import nothing of the tracker, so it is not in their first load. BBS-04: the coach's team panel
//     imports the CHART (components/hoops-cam/coach-shots.tsx), which is checked, transitively, to reach no detector.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { sourceFiles, stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const NETWORK = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|RTCPeerConnection|\bEventSource\b|\bnew Image\s*\(|\.toDataURL\s*\(|\.toBlob\s*\(|\bnavigator\.share\b/;
const TRACKER = sourceFiles(ROOT, ['lib/hoops-cam', 'components/hoops-cam', 'app/train/shots'], fs, path).filter((f) => !/\.test\.tsx?$/.test(f));

describe('the tracker keeps the picture on the phone (Z-P4-4)', () => {
  it('finds the tracker\'s files', () => {
    expect(TRACKER.length).toBeGreaterThanOrEqual(15);
    expect(TRACKER).toContain(path.join('components', 'hoops-cam', 'shot-session.tsx'));
    expect(TRACKER).toContain(path.join('app', 'train', 'shots', 'page.tsx'));
  });

  // BBS-04: the two sites that may talk to the server, and exactly what each may say
  const SENDS: Record<string, (src: string) => void> = {
    [path.join('components', 'hoops-cam', 'shot-session.tsx')]: (src) => {
      const calls = src.match(/\bfetch\s*\(/g) ?? [];
      expect(calls).toHaveLength(1);
      // one POST, to the sessions route, of the finished session (cleanSession's numbers on the server side)
      expect(src).toMatch(/fetch\(HOOPS_SESSIONS_API, \{ method: 'POST', headers: \{ 'content-type': 'application\/json' \}, body: JSON\.stringify\(session\) \}\)/);
      expect(src).toContain("HOOPS_SESSIONS_API = '/api/hoops-cam/sessions'");
    },
    [path.join('components', 'hoops-cam', 'coach-shots.tsx')]: (src) => {
      // reads only: no method, no body
      expect(src).toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/method\s*:|body\s*:/);
    },
  };
  const PIXEL = /\.toDataURL\s*\(|\.toBlob\s*\(|captureStream\s*\(|\bMediaRecorder\b/;
  const CARRY = /(?:\bfetch\s*\(|sendBeacon\s*\(|\.send\s*\()[^;\n]{0,240}(?:toDataURL|toBlob|getImageData|captureStream|canvas|MediaStream|video\/|image\/|grab|Grab|rgb)/;

  it('control: the two send sites are tracker files, and a third fetch would be caught', () => {
    for (const f of Object.keys(SENDS)) expect(TRACKER).toContain(f);
    expect('await fetch("/api/x", { method: "POST", body })').toMatch(NETWORK);
    expect('fetch(url, { body: canvas.toDataURL() })').toMatch(CARRY);
  });

  it.each(TRACKER)('%s sends nothing (or only what its named site may)', (rel) => {
    const src = read(rel);
    if (SENDS[rel]) SENDS[rel](src);
    else expect(src).not.toMatch(NETWORK);
    expect(src, rel).not.toMatch(CARRY);
    expect(src, rel).not.toMatch(PIXEL);
  });

  it('the picture is shown only through SelfView: no video of its own, no showIn', () => {
    for (const rel of TRACKER) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/<video\b|\.showIn\(|srcObject/);
    }
    expect(read('components/hoops-cam/shot-session.tsx')).toMatch(/<SelfView\b/);
  });

  it('the colour copy the detector reads is an offscreen canvas: never put on the page, never encoded', () => {
    const grab = read('components/hoops-cam/frame-grab.ts');
    expect(grab).toContain("document.createElement('canvas')");
    expect(grab).not.toMatch(/appendChild|append\(|insertBefore|replaceChildren|toDataURL|toBlob|transferToImageBitmap/);
  });
});

describe('no accuracy claim (owner)', () => {
  const SHOWN = [...TRACKER.filter((f) => /^(components|app)/.test(f)), path.join('lib', 'hoops-cam', 'copy.ts')];
  it.each(SHOWN)('%s says nothing about accuracy', (rel) => {
    expect(read(rel)).not.toMatch(/accura|precis(e|ion)|guarantee/i);
  });
});

describe('the detector loads only on the shots page', () => {
  const importsTracker = (src: string) => /from\s+['"](@\/lib\/hoops-cam\/|@\/components\/hoops-cam\/|\.\.?\/(?:.*\/)?hoops-cam\/)/.test(src);
  // BBS-04: the old rule here was "outside the tracker, nothing imports any of it". Its reason was the detector's weight
  // on other pages' first load; the coach's team panel now needs the CHART. So the rule is now on the detector itself:
  // outside the tracker, a file may import only the chart side (DETECTOR_FREE), and that side reaches no detector module,
  // followed import by import.
  const DETECTOR = /^(lib\/hoops-cam\/(ball|track|live|dribble|shots|rim|frame|scene|bench)|components\/hoops-cam\/(shot-session|frame-grab))$/;
  const DETECTOR_FREE = ['components/hoops-cam/coach-shots', 'lib/hoops-cam/server', 'lib/hoops-cam/store', 'lib/hoops-cam/coach'];
  // a type-only import is erased at build: it loads nothing (spot.ts takes the Rim type from rim.ts)
  const specs = (src: string, from: string): string[] => [...src.replace(/import\s+type\s[^;]*?from\s*['"][^'"]+['"]/g, '').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
    .map((sp) => (sp.startsWith('@/') ? sp.slice(2) : sp.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(from), sp)) : ''))
    .filter((sp) => /^(lib|components)\/hoops-cam\//.test(sp));
  const file = (mod: string) => ['.ts', '.tsx'].map((x) => mod + x).find((f) => fs.existsSync(path.join(ROOT, f)));
  function reach(mod: string, seen = new Set<string>()): Set<string> {
    if (seen.has(mod)) return seen;
    seen.add(mod);
    const f = file(mod);
    if (f) for (const next of specs(read(f), f)) reach(next, seen);
    return seen;
  }
  it('control: the walk follows imports (not type-only ones), and the shots session does reach the detector', () => {
    expect([...reach('components/hoops-cam/shot-session')].some((m) => DETECTOR.test(m))).toBe(true);
    expect(specs("import type { Rim } from './rim';\nimport { x } from './spot';", 'lib/hoops-cam/a.ts')).toEqual(['lib/hoops-cam/spot']);
    expect(reach('components/hoops-cam/coach-shots').has('components/hoops-cam/shot-chart')).toBe(true);
  });
  it('the chart side reaches no detector module', () => {
    for (const m of DETECTOR_FREE) expect([...reach(m)].filter((x) => DETECTOR.test(x)), m).toEqual([]);
  });
  it('outside the tracker, only the chart side is imported (the team panel, the coach page, the routes)', () => {
    const outside = sourceFiles(ROOT, ['app', 'components', 'lib'], fs, path)
      .filter((f) => !/\.test\.tsx?$/.test(f) && !TRACKER.includes(f) && importsTracker(read(f)));
    const bad = outside.filter((f) => specs(read(f), f.split(path.sep).join('/')).some((m) => !DETECTOR_FREE.includes(m)));
    expect(bad).toEqual([]);
    expect(outside.map((f) => f.split(path.sep).join('/')).sort()).toEqual(['app/api/coach/shots/route.ts', 'app/api/hoops-cam/sessions/route.ts', 'app/coach/shots/page.tsx', 'components/groups/group-screen.tsx']);
  });
  it('/train and /play/drills import none of it (so their first load never fetches it)', () => {
    for (const rel of ['app/train/page.tsx', 'app/play/drills/page.tsx', ...sourceFiles(ROOT, ['app/play/drills'], fs, path)]) {
      expect(importsTracker(read(rel)), rel).toBe(false);
    }
  });
});
