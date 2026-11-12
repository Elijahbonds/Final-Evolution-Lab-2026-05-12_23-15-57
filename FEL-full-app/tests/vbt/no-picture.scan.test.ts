// VBT: the camera picture stays on the phone (owner: "video never leaves the device"; Z-P4-4). Static, like
// components/games/bodyPlay.scan.test.ts: the VBT files never export a picture, never hand one to the network, never
// name a CDN; the measurement core sends nothing at all; the picture is shown only through SelfView; the plate's grey
// copy is drawn into a canvas that is never put on the page; and the only thing POSTed is a kept set's numbers.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const list = (dir: string) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.')).map((f) => `${dir}/${f}`);

const NETWORK = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|RTCPeerConnection|\bEventSource\b/;
const PIXEL = /\.toDataURL\s*\(|\.toBlob\s*\(|captureStream\s*\(|\bMediaRecorder\b/;
const CARRY = /(?:\bfetch\s*\(|sendBeacon\s*\(|\.send\s*\()[^;\n]{0,240}(?:toDataURL|toBlob|getImageData|captureStream|canvas|MediaStream|video\/|image\/|luma|Luma)/;
const CDN = /jsdelivr|googleapis|gstatic|unpkg|cdnjs|https?:\/\//i;

const CORE = list('lib/vbt').filter((f) => !/\/(server|store)\.ts$/.test(f));
const UI = list('components/vbt');

describe('the picture stays on the phone', () => {
  it('the scan reaches every VBT file', () => {
    for (const f of ['lib/vbt/plate.ts', 'lib/vbt/track.ts', 'lib/vbt/reps.ts', 'lib/vbt/live.ts', 'components/vbt/velocity-session.tsx', 'components/vbt/frame-grab.ts']) {
      expect([...CORE, ...UI], f).toContain(f);
    }
  });

  it.each([...CORE, ...UI, 'lib/vbt/server.ts', 'lib/vbt/store.ts', 'app/api/vbt/sets/route.ts', 'app/train/velocity/page.tsx'])('%s exports no picture and names no CDN', (rel) => {
    const src = read(rel);
    expect(src, rel).not.toMatch(PIXEL);
    expect(src, rel).not.toMatch(CARRY);
    expect(src, rel).not.toMatch(CDN);
  });

  it.each(CORE)('%s (the measurement core) sends nothing at all', (rel) => {
    expect(read(rel), rel).not.toMatch(NETWORK);
  });

  it('the grey copy for the plate is read, never shown or sent', () => {
    const src = read('components/vbt/frame-grab.ts');
    expect(src).not.toMatch(NETWORK);
    expect(src).not.toMatch(/appendChild|\.append\(|insertBefore|replaceChild/);
    expect(src).toContain("document.createElement('canvas')");
    expect(src).toContain('getImageData');
  });

  it('the session shows the camera only through SelfView, and POSTs only a kept set\'s numbers', () => {
    const src = read('components/vbt/velocity-session.tsx');
    expect(src).toContain('<SelfView');
    expect(src).not.toMatch(/<video\b|\.showIn\(|srcObject/);
    const posts = [...src.matchAll(/fetch\(api, \{ method: 'POST'[^\n]*body: JSON\.stringify\((\w+)\)/g)].map((m) => m[1]);
    expect(posts).toEqual(['s']);
    expect(src).toMatch(/const s: KeptSet = \{ \.\.\.set, warmup: !!band, band \};/);
  });
});
