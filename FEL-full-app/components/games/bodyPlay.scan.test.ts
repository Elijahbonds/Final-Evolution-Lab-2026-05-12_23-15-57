// BODY PLAY, pinned on the source and the markup (movement play P4, 2026-09-25).
//
// The camera picture never leaves the browser, and the READY choice is the only way the camera starts. What is pinned:
//   Z-P4-4  nothing in the body-play files can send anything — no fetch, beacon, socket, peer connection or event
//           stream (VoiceKit's same-origin fetch of the Coach's rendered lines is VoiceKit's, reached by import); the
//           self-view is shown only through SelfView, mirrored by CSS with its overlay inside the flip;
//   the panel says what is and is not sent, in plain words;
//   Z-P4-6  the Body button starts no camera by itself: it runs the READY choice's shortcut (bodyPlay.button), whose
//           action table never begins on a game that does not offer body play (bodyPlayChoice.test), and it takes the
//           camera nowhere else; nothing else in the app starts the shared source but the body-play store.
// The markup is React's own (renderToStaticMarkup, in node): the server snapshot is body play off.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sourceFiles, stripComments } from '@/lib/testing/sourceScan';
import { SelfView, SpaceCheckPanel, PRIVACY_LINE, CAMERA_NOTE, checkReadyLine } from './body-play';
import { CALIBRATING_LINE } from './paused-layer';
import { BODY_PLAY_OFF, type BodyPlayView } from '@/lib/move/bodyPlay';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const BODY_PLAY_FILES = [
  'components/games/body-play.tsx', 'lib/move/spaceCheck.ts', 'lib/move/bodyPlay.ts', 'lib/move/bodyPlayChoice.ts',
  'lib/move/spaceVoice.ts', 'lib/move/luma.ts',
];
const NETWORK = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|RTCPeerConnection|\bEventSource\b|\bnew Image\s*\(|\.toDataURL\s*\(|\.toBlob\s*\(/;

describe('the camera picture stays on the page (Z-P4-4)', () => {
  it.each(BODY_PLAY_FILES)('%s sends nothing', (rel) => {
    const src = read(rel);
    expect(src.length).toBeGreaterThan(500);
    expect(src).not.toMatch(NETWORK);
  });

  it('the self-view is shown in one place: SelfView', () => {
    const files = sourceFiles(ROOT, ['components', 'app', 'lib'], fs, path).filter((f) => !/\.test\.tsx?$/.test(f));
    const callers = files.filter((f) => /\.showIn\(/.test(read(f)));
    expect(callers).toEqual([path.join('components', 'games', 'body-play.tsx')]);
    const src = read('components/games/body-play.tsx');
    const selfView = src.slice(src.indexOf('export function SelfView('), src.indexOf('// ── the check panel'));
    expect(selfView).toContain('svc.showIn(el)');
    expect([...src.matchAll(/\.showIn\(/g)]).toHaveLength(1);
  });

  it('SelfView flips its whole box by CSS, and draws the overlay inside the flip', () => {
    const html = renderToStaticMarkup(createElement(SelfView, { overlay: createElement('i', { id: 'probe-overlay' }) }));
    expect(html).toMatch(/^<div data-fel-selfview="mirrored"/);
    const flip = html.indexOf('transform:scaleX(-1)');
    expect(flip).toBeGreaterThan(0);
    expect(html.indexOf('id="probe-overlay"')).toBeGreaterThan(flip);
    // plain (not mirrored) on request, and never flipped then
    expect(renderToStaticMarkup(createElement(SelfView, { mirrored: false }))).not.toContain('scaleX(-1)');
  });
});

describe('the panel says what is and is not sent', () => {
  it('the privacy line: the picture never leaves or is saved; only the game result is', () => {
    expect(PRIVACY_LINE).toBe('Your camera picture stays on this device. It is never sent or saved. Only your game result is saved, as in every game.');
    expect(CAMERA_NOTE).toBe('Uses your camera. The picture stays on this device.');
    const html = renderToStaticMarkup(createElement(SpaceCheckPanel, { onStart: () => {}, variant: 'ready' }));
    expect(html).toContain(PRIVACY_LINE);
    expect(html).toContain('TAP TO START');              // hybrid: the pad and touch still start the game
    expect(html).toContain('Camera off');
    // over a pause its start resumes, and the pinned pause headline stays paused-layer.tsx's alone
    const paused = renderToStaticMarkup(createElement(SpaceCheckPanel, { onStart: () => {}, variant: 'paused' }));
    expect(paused).toContain('RESUME');
    expect(paused).not.toContain('z-20');
  });
});

describe('the camera starts only through the READY choice (Z-P4-6)', () => {
  it('the Body button runs the choice\'s shortcut, and starts no camera of its own', () => {
    const src = read('components/games/body-control.tsx');
    expect(src).toContain('void bodyPlay.button();');
    expect(src).toContain('bodyButtonAction(sessionStore.view(), on)');
    expect(src).toContain('bodyPlay.again()');
    expect(src).not.toMatch(/\.start\(/);
    expect(src).not.toMatch(/\.recalibrate\(/);
  });

  it('nothing else starts the shared source: only the body-play store (and the dev probe hook)', () => {
    const files = sourceFiles(ROOT, ['components', 'app', 'lib'], fs, path).filter((f) => !/\.test\.tsx?$/.test(f));
    const starters = files.filter((f) => /sharedPoseSource\(\)\s*\.start\(|\bsource\.start\(/.test(read(f))).sort();
    expect(starters).toEqual([path.join('lib', 'input', 'poseSource.ts'), path.join('lib', 'move', 'bodyPlay.ts')].sort());
    // poseSource's own is the probe hook (behind the feed's gate)
    expect(read('lib/input/poseSource.ts')).toMatch(/feedHookAllowed\([\s\S]*start: \(opts\?: PoseSourceStartOptions\) => sharedPoseSource\(\)\.start\(opts\)/);
  });
});

// The review (2026-09-25): two things the READY screen and the corner got wrong around the check.
describe('around the check', () => {
  it('hidden to its chip, the READY card says the check\'s own words, never P3\'s "stand still … then raise both hands"', () => {
    const view = (v: Partial<BodyPlayView>): BodyPlayView => ({ ...BODY_PLAY_OFF, ...v });
    const space = { oneLine: 'Arms overhead' } as BodyPlayView['space'];
    expect(checkReadyLine(view({ stage: 'checking', space }))).toEqual({ text: 'Arms overhead', ring: false, shown: true });
    const asking = checkReadyLine(view({ stage: 'starting', camera: { ...BODY_PLAY_OFF.camera, state: 'requesting' } }))!;
    expect(asking.text).toMatch(/Allow the camera/);
    expect(asking.text).not.toBe(CALIBRATING_LINE);
    // set (the hands-up START works), off and error: P3's line, which reads the session
    for (const stage of ['set', 'off', 'error'] as const) expect(checkReadyLine(view({ stage, space }))).toBeNull();
    const splash = read('components/games/boot-splash.tsx');
    expect(splash).toContain("props.phase === 'ready' && <BodyPlayReadyLine />");
    expect(splash).not.toMatch(/<BodyReadyLine\b/);
  });

  it('the buttons that stay on screen after a click let go of the focus (Space, the jump key, would click them again)', () => {
    const control = read('components/games/body-control.tsx');
    expect(control).toContain('onClick={(e) => { e.currentTarget.blur(); toggle(); }}');
    expect(control).toContain('onClick={(e) => { e.currentTarget.blur(); bodyPlay.again(); }}');
    expect(control).toMatch(/onClick=\{\(e\) => \{ e\.currentTarget\.blur\(\); bodyPlay\.end\(/);
    expect(read('components/games/body-play.tsx')).toContain('aria-label="Move your self-view" onClick={(e) => { e.currentTarget.blur(); next(); }}');
  });
});
