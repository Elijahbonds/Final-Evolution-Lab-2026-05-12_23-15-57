import { describe, expect, it } from 'vitest';
import { whoSceneItStageBox } from './whoSceneItFrame';
import { makeVenueShelf } from './whoSceneItVenues';

describe('Who Scene It — the stage fits, and a venue is built once', () => {
  it('fits a 1920×1080 desktop and a 390×844 phone', () => {
    const desk = whoSceneItStageBox(1920, 1080);
    expect(desk.fits).toBe(true);
    expect(desk.width).toBeLessThanOrEqual(1200);
    expect(desk.height).toBeLessThanOrEqual(1080);
    expect(desk.width / desk.height).toBeCloseTo(1.6, 2);

    const phone = whoSceneItStageBox(390, 844);
    expect(phone.fits).toBe(true);
    expect(phone.width).toBeLessThanOrEqual(390);
    expect(phone.height).toBeLessThan(844);
    expect(phone.width / phone.height).toBeCloseTo(1.6, 2);
  });

  it('showing a venue again does not mount it again', () => {
    const live: { id: string; on: boolean }[] = [];
    const shelf = makeVenueShelf((id: string) => {
      const node = { id, on: false };
      live.push(node);
      return { root: { setEnabled(on: boolean) { node.on = on; } }, dispose() { node.on = false; } };
    });
    shelf.preload(['court', 'gym', 'dojo']);
    expect(shelf.built()).toBe(3);
    shelf.show('gym');
    shelf.show('court');
    shelf.show('gym');
    expect(shelf.built()).toBe(3);
    expect(live.filter((n) => n.on).map((n) => n.id)).toEqual(['gym']);
  });
});
