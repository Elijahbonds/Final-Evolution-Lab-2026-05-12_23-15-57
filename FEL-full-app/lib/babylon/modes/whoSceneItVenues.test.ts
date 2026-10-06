// IMPROVE (2026-10-06): the venue shelf frees what a match will not ask (#17) and each venue keeps its own sky and fog (#1).
import { describe, expect, it } from 'vitest';
import { Color3, Color4 } from '@babylonjs/core';
import { applySceneEnv, captureSceneEnv, makeVenueShelf, type SceneEnvHost } from './whoSceneItVenues';

function shelfWithLog() {
  const disposed: string[] = [];
  const shelf = makeVenueShelf((id) => ({ root: { setEnabled() {} }, dispose: () => { disposed.push(id); } }));
  return { shelf, disposed };
}

describe('#17 the shelf keeps only what the match asks', () => {
  it('drop frees one venue; retain frees all but the listed', () => {
    const { shelf, disposed } = shelfWithLog();
    shelf.preload(['vault', 'a', 'b', 'c']);
    expect(shelf.drop('a')).toBe(true);
    expect(shelf.drop('a')).toBe(false);
    expect(disposed).toEqual(['a']);
    shelf.retain(['vault', 'c', 'd']);
    expect(disposed.sort()).toEqual(['a', 'b']);
    expect(shelf.ids().sort()).toEqual(['c', 'vault']);
    shelf.preload(['d']);
    expect(shelf.built()).toBe(5);                 // vault a b c, then d — a dropped venue is rebuilt only if asked again
  });
});

describe('#1 each venue keeps its own sky and fog', () => {
  const scene = (): SceneEnvHost => ({ clearColor: new Color4(0, 0, 0, 1), fogMode: 0, fogColor: new Color3(0, 0, 0), fogDensity: 0, fogStart: 0, fogEnd: 1000 });
  it('a later build does not leak into an earlier venue: showing it puts its own environment back', () => {
    const s = scene();
    // venue A builds
    s.clearColor = new Color4(0.1, 0.2, 0.3, 1); s.fogMode = 2; s.fogColor = new Color3(0.4, 0.5, 0.6); s.fogDensity = 0.008;
    const a = captureSceneEnv(s);
    // venue B builds over it (the shelf preloads everything at once)
    s.clearColor = new Color4(0.9, 0.9, 0.9, 1); s.fogColor = new Color3(1, 1, 1); s.fogDensity = 0.03;
    const b = captureSceneEnv(s);
    const clearObj = s.clearColor;
    applySceneEnv(s, a);
    expect(s.clearColor.asArray()).toEqual([0.1, 0.2, 0.3, 1]);
    expect(s.fogColor.asArray()).toEqual([0.4, 0.5, 0.6]);
    expect(s.fogDensity).toBe(0.008);
    expect(s.fogMode).toBe(2);
    expect(s.clearColor).toBe(clearObj);         // copied into the scene's own colour, no allocation per question
    applySceneEnv(s, b);
    expect(s.fogDensity).toBe(0.03);
    expect(a.clear.asArray()).toEqual([0.1, 0.2, 0.3, 1]);   // the capture is a copy, not the scene's live object
  });
});
