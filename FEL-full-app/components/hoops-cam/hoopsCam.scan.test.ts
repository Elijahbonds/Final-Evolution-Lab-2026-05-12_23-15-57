// The shot and dribble tracker, pinned on the source (BBS-01 / BBS-02; platform phase 9, 2026-11-03). A new camera surface
// keeps components/games/bodyPlay.scan.test.ts's rules (Z-P4-4) and says so in its own scan:
//   · nothing in the tracker can send anything (no fetch, beacon, socket, peer connection, event stream, image encode);
//   · the camera picture is shown only through SelfView: no <video> of its own, no showIn, the colour copy the ball
//     detector reads is never put on the page or encoded;
//   · no accuracy claim in any line it shows (owner): "accurate", "accuracy", "precise" never appear outside comments;
//   · the detector (lib/hoops-cam's ball and track readers) is reached only from the shots page: /train and /play/drills
//     do not import it, so it is not in their first load.
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

  it.each(TRACKER)('%s sends nothing', (rel) => {
    expect(read(rel)).not.toMatch(NETWORK);
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
  it('outside the tracker, only the shots page imports it', () => {
    const outside = sourceFiles(ROOT, ['app', 'components', 'lib'], fs, path)
      .filter((f) => !/\.test\.tsx?$/.test(f) && !TRACKER.includes(f) && importsTracker(read(f)));
    expect(outside).toEqual([]);
  });
  it('/train and /play/drills import none of it (so their first load never fetches it)', () => {
    for (const rel of ['app/train/page.tsx', 'app/play/drills/page.tsx', ...sourceFiles(ROOT, ['app/play/drills'], fs, path)]) {
      expect(importsTracker(read(rel)), rel).toBe(false);
    }
  });
});
