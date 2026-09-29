// Venice LOOK (DUNK-VENICE-ENV-RENDER) — the sky photo and the key light agree, and the photo sits where the camera looks.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { VENICE_SKY, VENICE_SUN, skyDirectionAtU, veniceSkyLayout, veniceSunPosition } from './veniceSurroundVisibility';

const PHOTO = { w: 1408, h: 704 };   // public/backdrops/venice-sky-sunset.jpg
/** The dunk camera: looks −z (u 0.25), vertical fov 0.9 rad at 16:9 → about ±40.7° either side of north. */
const HALF_FOV_DEG = (Math.atan(Math.tan(0.45) * (16 / 9)) * 180) / Math.PI;

describe('the Venice sunset sky', () => {
  it('ships the photo it names', () => {
    expect(existsSync(`public${VENICE_SKY.url}`)).toBe(true);
  });

  it('puts the photo\'s sun where the key light comes from', () => {
    const L = veniceSkyLayout(2048, 1024, PHOTO.w, PHOTO.h);
    const skyDir = skyDirectionAtU(L.uSun);
    const toSun = veniceSunPosition(); toSun.y = 0; toSun.normalize();
    expect(skyDir.x * toSun.x + skyDir.z * toSun.z).toBeGreaterThan(0.9999);
  });

  it('lays the sea line on the dome\'s equator — where the sea planes meet the dome wall', () => {
    const L = veniceSkyLayout(2048, 1024, PHOTO.w, PHOTO.h);
    expect(L.horizonY).toBe(512);
  });

  it('draws the band aspect-true and keeps it off the zenith', () => {
    const L = veniceSkyLayout(2048, 1024, PHOTO.w, PHOTO.h);
    const degPerPxWide = (VENICE_SKY.span * 360) / PHOTO.w;
    expect(L.elevDeg).toBeCloseTo(L.bandRows * degPerPxWide, 6);
    expect(((L.horizonY - L.topY) / 1024) * 180).toBeCloseTo(L.elevDeg, 6);
    expect(L.topY).toBeGreaterThan(0);
    expect(L.elevDeg).toBeLessThan(60);
  });

  it('leaves out the photo\'s top band — the arched red field the owner turned down as a sky', () => {
    expect(VENICE_SKY.photoTop).toBeGreaterThan(0.3);
    expect(VENICE_SKY.photoTop).toBeLessThan(VENICE_SKY.photoHorizon);
  });

  it('keeps the sun disc just out of the dunk camera\'s frame, with the photo across it', () => {
    const L = veniceSkyLayout(2048, 1024, PHOTO.w, PHOTO.h);
    const sunOff = (L.uSun - 0.25) * 360;                       // degrees right of the camera's forward (north)
    expect(sunOff).toBeGreaterThan(HALF_FOV_DEG);
    expect(sunOff).toBeLessThan(HALF_FOV_DEG + 25);
    const u0 = L.x0 / 2048, u1 = u0 + VENICE_SKY.span;
    expect(u0).toBeLessThan(0.25 - HALF_FOV_DEG / 360 + 0.05);   // the photo reaches the frame's left third
    expect(u1).toBeGreaterThan(0.25 + HALF_FOV_DEG / 360);
  });
});

describe('the golden-hour key light', () => {
  it('is a low sun, and it shines down', () => {
    expect(VENICE_SUN.elevationDeg).toBeGreaterThanOrEqual(15);
    expect(VENICE_SUN.elevationDeg).toBeLessThanOrEqual(35);
    const toSun = veniceSunPosition();
    expect(toSun.length()).toBeCloseTo(1, 6);
    expect(toSun.y).toBeGreaterThan(0);
  });

  it('comes off the ocean — west of north, where the beach and the sea are', () => {
    const toSun = veniceSunPosition();
    expect(toSun.x).toBeLessThan(0);   // west (−x): the sand and the sea
    expect(toSun.z).toBeLessThan(0);   // north (−z): in front of the camera, behind the hoop
  });
});
