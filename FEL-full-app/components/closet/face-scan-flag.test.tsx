// STORE-READY B1 (FACE-SCAN-FLAG): /closet's "Scan My Face" sits behind the server flag FACE_SCAN_ENABLED,
// default OFF. Flag off renders neither the button, its helper line, nor FaceScanCapture — and the capture
// module (tasks-vision + the Google model download) is loaded with next/dynamic only, so it does not exist
// in the bundle path until the flag is on. No jsdom here: a server render is the real first paint (the
// pattern of components/closet/*.test.tsx), and the wiring that cannot render is read from source.
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isFaceScanEnabled } from '@/lib/flags';
import { ClosetView } from '@/components/closet-view';

const render = (faceScan: boolean | undefined) =>
  renderToStaticMarkup(createElement(ClosetView as never, faceScan === undefined ? {} : ({ faceScan } as never)));

describe('B1 isFaceScanEnabled()', () => {
  const saved = process.env.FACE_SCAN_ENABLED;
  beforeEach(() => { delete process.env.FACE_SCAN_ENABLED; });
  afterEach(() => {
    if (saved === undefined) delete process.env.FACE_SCAN_ENABLED;
    else process.env.FACE_SCAN_ENABLED = saved;
  });

  it('is false for unset or an empty value, true for the truthy set', () => {
    expect(isFaceScanEnabled()).toBe(false);
    process.env.FACE_SCAN_ENABLED = '';
    expect(isFaceScanEnabled()).toBe(false);
    process.env.FACE_SCAN_ENABLED = '0';
    expect(isFaceScanEnabled()).toBe(false);
    for (const v of ['1', 'true', 'on', 'yes']) {
      process.env.FACE_SCAN_ENABLED = v;
      expect(isFaceScanEnabled(), v).toBe(true);
    }
  });
});

describe('B1 ClosetView face scan gating', () => {
  // ClosetView's first paint is a loading spinner (loading=true until the client hydrate effect runs), so the
  // button render itself is asserted from source below; the SSR render proves the flag-off default cannot leak it.
  it('flag unset (prop omitted, the default) renders no "Scan My Face" and no helper line', () => {
    const html = render(undefined);
    expect(html).not.toContain('Scan My Face');
    expect(html).not.toContain('Auto-build your avatar');
  });

  it('faceScan false renders neither the button nor FaceScanCapture', () => {
    const html = render(false);
    expect(html).not.toContain('Scan My Face');
    expect(html).not.toContain('Auto-build your avatar');
    expect(html).not.toContain('FaceScanCapture');
  });

  it('faceScan true: the button and helper line render only behind the prop (source)', () => {
    const closet = readFileSync('components/closet-view.tsx', 'utf8');
    // The button + helper line sit inside the `{faceScan ? (…)}` block of the Face tab.
    const block = closet.slice(closet.indexOf('{faceScan ? ('));
    expect(block).toContain('Scan My Face');
    expect(block).toContain('Auto-build your avatar from your camera or a photo');
    expect(closet).toContain('{faceScan && scanning && (');
  });
});

describe('B1 source guards (the module and the Google fetch exist only behind the flag)', () => {
  it('storage.googleapis.com/mediapipe-models appears ONLY in face-scan-capture.tsx', () => {
    const closet = readFileSync('components/closet-view.tsx', 'utf8');
    expect(closet).not.toContain('storage.googleapis.com/mediapipe-models');
    const capture = readFileSync('components/facescan/face-scan-capture.tsx', 'utf8');
    expect(capture).toContain('storage.googleapis.com/mediapipe-models');
  });

  it('closet-view.tsx no longer imports FaceScanCapture statically, and renders it only under the faceScan prop', () => {
    const closet = readFileSync('components/closet-view.tsx', 'utf8');
    expect(closet).not.toMatch(/^import \{ FaceScanCapture \}/m);
    expect(closet).toContain("dynamic(() => import('@/components/facescan/face-scan-capture')");
    expect(closet).toContain('{faceScan && scanning && (');
    expect(closet).toContain('faceScan?: boolean');
  });

  it('/closet passes the server flag; dev/studio stays flag-off (faceScan prop default false)', () => {
    const page = readFileSync('app/closet/page.tsx', 'utf8');
    expect(page).toContain('faceScan={isFaceScanEnabled()}');
    const studio = readFileSync('app/dev/studio/page.tsx', 'utf8');
    expect(studio).not.toContain('faceScan');
  });
});
