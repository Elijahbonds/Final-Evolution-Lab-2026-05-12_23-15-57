// The skeleton-only view, rendered (MIRROR-COACH P9, 2026-09-30). A server render is the stage's first paint, so it is
// pinned here without a DOM: in the skeleton view the stage paints NO camera image. The <video> element itself stays
// mounted as the pose model's frame source (render/overlay-compositor.ts reads frames from it; unmounting it would end
// the session — lib/mirror/skeletonView.ts), hidden at opacity 0 and out of the accessibility tree.
import { describe, expect, it } from 'vitest';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { CameraImage, SkeletonToggle } from './skeleton-view';
import { MirrorHarness } from '@/app/play/mirror/_components/mirror-harness';

const videoTags = (html: string) => html.match(/<video\b[^>]*>/g) ?? [];

describe('the camera layer', () => {
  it('the camera view paints the picture', () => {
    const [tag, ...rest] = videoTags(renderToStaticMarkup(createElement(CameraImage, { skeletonOnly: false, ref: createRef<HTMLVideoElement>() })));
    expect(rest).toEqual([]);
    expect(tag).toContain('data-camera-image="on"');
    expect(tag).toContain('opacity-100');
    expect(tag).not.toContain('aria-hidden');
  });

  it('the skeleton view renders without the camera image: the element is there for the pose model, painted at opacity 0, hidden from assistive tech', () => {
    const [tag, ...rest] = videoTags(renderToStaticMarkup(createElement(CameraImage, { skeletonOnly: true })));
    expect(rest).toEqual([]);
    expect(tag).toContain('data-camera-image="off"');
    expect(tag).toContain('opacity-0');
    expect(tag).not.toContain('opacity-100');
    expect(tag).toContain('aria-hidden="true"');
    // not display:none / hidden — a video that is not rendered is not decoded on some mobile browsers (skeletonView.ts)
    expect(tag).not.toMatch(/\bhidden\b(?!=)|display:\s*none/);
    expect(tag).toContain('playsInline'.toLowerCase());
    expect(tag).toContain('muted');
  });
});

describe('the switch', () => {
  it('pressed means skeleton only, and its name says what pressing it does', () => {
    const off = renderToStaticMarkup(createElement(SkeletonToggle, { skeletonOnly: false, onToggle: () => {} }));
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('aria-label="Skeleton only: hide the camera picture"');
    const on = renderToStaticMarkup(createElement(SkeletonToggle, { skeletonOnly: true, onToggle: () => {} }));
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('aria-label="Show the camera picture"');
  });
});

describe('the harness uses them', () => {
  it('the real Mirror renders one camera element, through CameraImage (camera view by default), and the switch beside Start', () => {
    const html = renderToStaticMarkup(createElement(MirrorHarness, { youth: null }));
    const tags = videoTags(html);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('data-camera-image="on"');           // first paint: the preference is read after mount
    expect(html).toContain('data-skeleton-toggle');
    expect(html).toContain('Start session');
  });

  it('the harness keeps the preference in the browser: read after mount, written on toggle, never posted', () => {
    const h = readFileSync('app/play/mirror/_components/mirror-harness.tsx', 'utf8');
    expect(h).toContain('<CameraImage ref={videoRef} skeletonOnly={skeletonOnly} />');
    const code = h.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/<video\b/);                           // the only camera element is CameraImage's (comments aside)
    expect(h).toContain('useEffect(() => { setSkeletonOnly(readSkeletonOnly()); }, []);');
    const toggle = h.slice(h.indexOf('const toggleSkeletonOnly'), h.indexOf('}, [skeletonOnly]);'));
    expect(toggle).toContain('writeSkeletonOnly(next)');
    expect(toggle).not.toMatch(/fetch|mirrorSave|\/api\//);
    // the side effect is outside the state updater (the P1 lesson: an updater may run twice)
    expect(toggle).not.toMatch(/setSkeletonOnly\(\(/);
    expect((h.match(/<SkeletonToggle /g) ?? []).length).toBe(2);   // before Start and while live
  });
});

// MIRROR-COACH P9 fix (2026-09-30, code review): "the numbers still read" had no test — stageLayers() returns constants,
// and the probe mounted only the camera layer. What makes it true is structural: in the harness, the switch reaches the
// camera element and nothing else, so the skeleton canvas, the 3-D overlay canvas, the rep count, the zone checks and the
// coach's bubble render the same in both views. This holds that on the source (comments stripped) and on a real render.
describe('the skeleton view changes the camera picture and nothing else (the numbers still read)', () => {
  const h = readFileSync('app/play/mirror/_components/mirror-harness.tsx', 'utf8');
  const code = h.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:])\/\/.*$/gm, '$1');

  it('the switch is read in exactly six places: its state, its effect, its toggle, the camera element and the two switches', () => {
    const uses = code.split('\n').filter((l) => /\bskeletonOnly\b/.test(l)).map((l) => l.trim());
    expect(uses).toEqual([
      'const [skeletonOnly, setSkeletonOnly] = useState(false);',
      'const next = !skeletonOnly;',
      '}, [skeletonOnly]);',
      '<CameraImage ref={videoRef} skeletonOnly={skeletonOnly} />',
      '<SkeletonToggle skeletonOnly={skeletonOnly} onToggle={toggleSkeletonOnly} />',
      '<SkeletonToggle skeletonOnly={skeletonOnly} onToggle={toggleSkeletonOnly} />',
    ]);
    // (the read-after-mount effect names the setter, not the value)
    expect(code).toContain('setSkeletonOnly(readSkeletonOnly())');
  });

  it('the skeleton canvas sits beside the camera element, not inside it, and paints from the pose stream, not the video', () => {
    const cam = code.indexOf('<CameraImage ref={videoRef} skeletonOnly={skeletonOnly} />');
    const canvas = code.indexOf('<canvas ref={skeletonRef}');
    expect(cam).toBeGreaterThan(-1);
    expect(canvas).toBeGreaterThan(cam);
    // the painter reads landmarks off the pose frame — never the <video> (videoRef) — so it paints over an unpainted picture
    const from = code.indexOf('const paintSkeleton = useCallback(');
    const painter = code.slice(from, code.indexOf('}, []);', from));
    expect(painter.length).toBeGreaterThan(200);
    expect(painter).toContain('pose.landmarks');
    expect(painter).not.toMatch(/videoRef|drawImage/);
  });

  it('a real render has the skeleton canvas and the overlay canvas; the only element the switch changes is the camera', () => {
    const html = renderToStaticMarkup(createElement(MirrorHarness, { youth: null }));
    expect((html.match(/<canvas\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
    const cameraOn = videoTags(html)[0];
    const cameraOff = videoTags(renderToStaticMarkup(createElement(CameraImage, { skeletonOnly: true })))[0];
    // swapping the one camera tag for its skeleton-view tag is the whole difference between the two views' markup
    expect(cameraOn).toContain('data-camera-image="on"');
    expect(cameraOff).toContain('data-camera-image="off"');
    expect(html.replace(cameraOn, '')).not.toMatch(/data-camera-image/);
  });
});
