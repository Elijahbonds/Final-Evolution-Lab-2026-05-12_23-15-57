import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { APP_ICONS, APPLE_TOUCH_ICON_HREF, FEL_MANIFEST, MANIFEST_HREF, THEME_COLOR } from './manifest';
import { GET, dynamic } from '@/app/app.webmanifest/route';

const ROOT = path.resolve(__dirname, '../..');
/** Width and height from a PNG's IHDR chunk, and whether it really is a PNG. */
function png(rel: string): { w: number; h: number } {
  const b = readFileSync(path.join(ROOT, 'public', rel));
  expect(b.subarray(1, 4).toString('ascii'), rel).toBe('PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('the web app manifest (installable: Chrome and Android)', () => {
  it('has what an install needs: names, start_url, standalone, colours, a 192 and a 512, and a maskable icon', () => {
    expect(FEL_MANIFEST.name).toBe('Final Evolution Lab');
    expect(FEL_MANIFEST.short_name).toBe('FEL');
    expect(FEL_MANIFEST.short_name!.length).toBeLessThanOrEqual(12);   // fits under a home-screen icon
    expect(FEL_MANIFEST.start_url).toBe('/');
    expect(FEL_MANIFEST.scope).toBe('/');
    expect(FEL_MANIFEST.display).toBe('standalone');
    const icons = FEL_MANIFEST.icons ?? [];
    expect(icons.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
    expect(FEL_MANIFEST).not.toHaveProperty('orientation');   // the games choose their own
  });

  it('the colours are the theme\'s --fel-bg', () => {
    const theme = readFileSync(path.join(ROOT, 'app/theme.css'), 'utf8');
    expect(theme).toMatch(new RegExp(`--fel-bg:\\s*${THEME_COLOR}`, 'i'));
    expect(FEL_MANIFEST.background_color).toBe(THEME_COLOR);
    expect(FEL_MANIFEST.theme_color).toBe(THEME_COLOR);
  });

  it('every icon it names is a real PNG of the size it claims', () => {
    for (const i of APP_ICONS) {
      expect(existsSync(path.join(ROOT, 'public', i.src)), i.src).toBe(true);
      expect(png(i.src), i.src).toEqual({ w: i.size, h: i.size });
    }
    for (const i of FEL_MANIFEST.icons ?? []) expect(APP_ICONS.map((a) => a.src)).toContain(i.src);
    expect(png(APPLE_TOUCH_ICON_HREF)).toEqual({ w: 180, h: 180 });
  });

  it('is served at /app.webmanifest as static JSON with the manifest content type', async () => {
    expect(MANIFEST_HREF).toBe('/app.webmanifest');
    expect(dynamic).toBe('force-static');
    const res = GET();
    expect(res.headers.get('content-type')).toMatch(/^application\/manifest\+json/);
    expect(await res.json()).toEqual(JSON.parse(JSON.stringify(FEL_MANIFEST)));
  });

  it('no path Next would class as its own metadata route (anything starting /manifest)', () => {
    expect(MANIFEST_HREF.startsWith('/manifest')).toBe(false);
    expect(existsSync(path.join(ROOT, 'app/manifest.ts'))).toBe(false);
  });
});
