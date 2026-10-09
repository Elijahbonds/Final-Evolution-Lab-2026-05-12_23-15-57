// QA P1-23: the camera surfaces show the steps. Prove It's one-line camera-off gate reads cameraHelpText. The Mirror
// (MIRROR-FIRST rebuilt its camera into use-mirror-camera.ts / lib/mirror/liveCamera.ts, the mirror lanes' files) and body
// play (the movement lane's body-play.tsx) render CameraHelpPanel through routed patches, not this branch.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CameraHelpPanel } from './camera-help-panel';
import { cameraHelp } from '@/lib/camera/cameraHelp';

const read = (f: string) => readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const err = (name: string) => Object.assign(new Error(name), { name });

describe('the camera help panel', () => {
  it('title, numbered steps and Try again', () => {
    const m = renderToStaticMarkup(createElement(CameraHelpPanel, { help: cameraHelp(err('NotReadableError')), onRetry: () => {} }));
    expect(m).toContain('data-camera-help="busy"');
    expect(m).toContain('The camera is in use');
    expect(m.match(/<li>/g)).toHaveLength(3);
    expect(m).toMatch(/>Try again<\/button>/);
    expect(m).not.toMatch(/buttons instead/);
  });
  it('offers the buttons where the mode has them', () => {
    const m = renderToStaticMarkup(createElement(CameraHelpPanel, { help: cameraHelp(err('NotAllowedError'), { buttons: true }), onButtons: () => {} }));
    expect(m).toMatch(/>Play with buttons instead<\/button>/);
  });
});

describe('the surfaces use it', () => {
  it('Prove It: the camera-off gate carries the steps', () => {
    const src = read('app/play/dunkduel/_components/prove-it.tsx');
    expect(src).toContain('setError(`Prove It measures your dunk through the camera. ${cameraHelpText(cameraHelp(e, { secure: !insecure }))}`);');
    expect(src).not.toContain('No usable camera on this device.');
  });
});
