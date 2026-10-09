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
    // poseSource's own is the probe hook (behind the agent-run gate in production)
    expect(read('lib/input/poseSource.ts')).toMatch(/registerProdHookSync\(installBodyHook, removeBodyHook\)/);
    expect(read('lib/input/poseSource.ts')).toMatch(/start: \(opts\?: PoseSourceStartOptions\) => sharedPoseSource\(\)\.start\(opts\)/);
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

// MOVEMENT PLAY P8 (2026-09-26): the board games' READY stance line — after "All set", the stance asked for (with its ring),
// then REGULAR / GOOFY measured, or the square fallback (lib/move/rideStance, drawn from the session's stance view); the
// probe reads data-fel-body-stance. Nothing about the stance is stored or sent.
describe('the READY stance line (P8)', () => {
  it('the panel draws it from the session only once the check is ready, and marks the stance for the probe', () => {
    const src = read('components/games/body-play.tsx');
    expect(src).toContain('const stance = stanceLine(session.stance);');
    expect(src).toContain('data-fel-body-stance={ready && stance ? stance.id : undefined}');
    expect(src).toContain('{ready && stance?.ring != null && <HoldRing progress={stance.ring} />}');
    expect(src).toContain('{ready ? stance?.text ?? READY_LINE : space.say.text}');
    const words = read('lib/move/rideStance.ts');
    expect(words).not.toMatch(NETWORK);
    expect(words).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });
});

// BODY-PLAY-WORKS: the same rule on every body-play path, in every mode. The camera picture, a canvas of it, and the
// pose numbers are not fetch, beacon or socket arguments. The model and the wasm are named only as our own /pose files.
const PIXEL = /\.toDataURL\s*\(|\.toBlob\s*\(|captureStream\s*\(|sendBeacon\s*\(|\bnew\s+WebSocket\b|\bRTCPeerConnection\b/;
const CARRY = /(?:\bfetch\s*\(|sendBeacon\s*\(|\.send\s*\()[^;\n]{0,240}(?:toDataURL|toBlob|getImageData|captureStream|canvas|MediaStream|video\/|image\/)/;
const CDN = /jsdelivr|googleapis|gstatic|unpkg|cdnjs|https?:\/\//i;

function walkTs(dir: string): string[] {
  const out: string[] = [];
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkTs(rel));
    else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) out.push(rel);
  }
  return out;
}

/** Every mode's own file, from the registry's imports, so a new mode cannot skip this scan. */
function modeFiles(): string[] {
  const src = fs.readFileSync(path.join(ROOT, 'lib/babylon/modes/registry.ts'), 'utf8');
  const files = new Set<string>();
  for (const m of src.matchAll(/from '\.\/([^']+)'/g)) files.add(path.join('lib/babylon/modes', `${m[1]}.ts`));
  return [...files].sort();
}

const PIPELINE = [
  ...walkTs('lib/pose'),
  ...walkTs('lib/move'),
  ...walkTs('lib/input'),
  ...walkTs('components/dev/pose-recorder'),
  ...walkTs('lib/babylon/combat').filter((f) => /bodyFight|body-fight/i.test(f) || f.endsWith('bodyFight.ts') || f.includes('bodyFight')),
  'components/games/body-play.tsx',
  'components/games/body-control.tsx',
  'lib/babylon/core/BodySession.ts',
  'lib/babylon/core/bodySeam.ts',
  'lib/babylon/core/rideBody.ts',
  'lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter.ts',
].filter((f, i, a) => a.indexOf(f) === i).sort();

describe('every body-play path keeps the picture on the device', () => {
  it('the scan reaches the pose pipeline, the recorder, and every registered mode', () => {
    for (const f of ['lib/pose/PoseService.ts', 'lib/pose/assets.ts', 'lib/pose/BodyReader.ts', 'lib/move/bodyPlay.ts',
      'lib/input/poseSource.ts', 'components/games/body-play.tsx', 'lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter.ts']) {
      expect(PIPELINE, f).toContain(f);
    }
    const modes = modeFiles();
    expect(modes.length).toBeGreaterThan(20);
    expect(modes).toContain(path.join('lib/babylon/modes', 'DunkMode.ts'));
    expect(modes).toContain(path.join('lib/babylon/modes', 'KarateVSMode.ts'));
    expect(modes).toContain(path.join('lib/babylon/modes', 'SkateRunMode.ts'));
    expect(modes).toContain(path.join('lib/babylon/modes', 'OneVOneMode.ts'));
    for (const f of modes) expect(fs.existsSync(path.join(ROOT, f)), f).toBe(true);
  });

  it.each(PIPELINE)('%s sends no picture', (rel) => {
    const src = read(rel);
    expect(src.length).toBeGreaterThan(40);
    expect(src, rel).not.toMatch(PIXEL);
    expect(src, rel).not.toMatch(CARRY);
    expect(src, rel).not.toMatch(CDN);
    // assets.ts HEAD-probes our own /pose URL and sends no body. Every other file sends nothing at all.
    if (rel === 'lib/pose/assets.ts') {
      expect(src).toMatch(/fetch\(url, \{ method: 'HEAD' \}\)/);
      expect(src).not.toMatch(/\bbody\s*:/);
      return;
    }
    expect(src, rel).not.toMatch(NETWORK);
  });

  it('no mode file exports a picture or hands one to the network', () => {
    for (const rel of modeFiles()) {
      const src = read(rel);
      expect(src, rel).not.toMatch(PIXEL);
      expect(src, rel).not.toMatch(CARRY);
      expect(src, rel).not.toMatch(CDN);
    }
  });

  it('the model and the wasm are named only as our own /pose files', () => {
    const assets = read('lib/pose/assets.ts');
    expect(assets).toContain("LOCAL_WASM_BASE = '/pose/wasm'");
    expect(assets).toContain('/pose/models/pose_landmarker_${m}.task');
    expect(assets).toContain('return LOCAL_WASM_BASE');
    expect(assets).toContain('return localModelUrl(m)');
    expect(assets).not.toMatch(CDN);
    const adapter = read('lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter.ts');
    expect(adapter).toContain('this.assets.wasmBase()');
    expect(adapter).toContain('this.assets.poseModel(this.model)');
    expect(adapter).not.toMatch(CDN);
  });
});
