// look pass C1 (lane/look-world, 2026-11-24): the story's surface colours read as painted (story.gradeV2)
import { describe, expect, it } from 'vitest';
import { Color3, NullEngine, PBRMaterial, Scene, StandardMaterial } from '@babylonjs/core';
import { gradeStoryMaterial, gradeStoryScene, markGraded, storyLinear, STORY_GRADE_V2, tintScaleForMean, textureTintScale } from './grade';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';
import { buildHub } from './hub/hub';
import { buildWorld1 } from './ch1/world1';
import { buildStoryMap } from './story/storyMap';
import { buildStoryView } from './story/view';
import { HubGates } from '../story/gates';

describe('story.gradeV2 (look pass C1)', () => {
  it('the knob ships off: its default is the shipped constant and 0 is today', () => {
    const k = FEEL_KNOB_BY_ID.get('story.gradeV2')!;
    expect(k.def).toBe(STORY_GRADE_V2);
    expect(STORY_GRADE_V2).toBe(0);
    expect(k.min).toBe(0);
    expect(k.max).toBe(1);
  });

  it('a story surface reads its hex as sRGB: dark slate stays dark slate', () => {
    const scene = new Scene(new NullEngine());
    const m = new StandardMaterial('story_hub_ground_mat', scene);
    m.diffuseColor = Color3.FromHexString('#334155');
    expect(gradeStoryMaterial(m)).toBe(true);
    const want = storyLinear('#334155');
    expect(m.diffuseColor.r).toBeCloseTo(want.r, 6);
    expect(m.diffuseColor.b).toBeCloseTo(want.b, 6);
    expect(m.diffuseColor.r).toBeLessThan(0.05);   // 0.2 sRGB is ~0.03 of the light
    // once only
    expect(gradeStoryMaterial(m)).toBe(false);
    expect(m.diffuseColor.r).toBeCloseTo(want.r, 6);
    scene.dispose();
  });

  it('never touches what is not a story surface (the player, the creatures, the sky, a PBR part)', () => {
    const scene = new Scene(new NullEngine());
    const hero = new StandardMaterial('hero_skin', scene); hero.diffuseColor = new Color3(0.5, 0.4, 0.3);
    const sky = new StandardMaterial('bk_dome_mat', scene); sky.emissiveColor = new Color3(0.6, 0.7, 0.9);
    const pbr = new PBRMaterial('story_pbr', scene); pbr.albedoColor = new Color3(0.5, 0.5, 0.5);
    expect(gradeStoryScene(scene)).toBe(0);
    expect(hero.diffuseColor.r).toBe(0.5);
    expect(sky.emissiveColor.b).toBe(0.9);
    expect(pbr.albedoColor.r).toBe(0.5);
    scene.dispose();
  });

  it('grades the real story view: every story material, frozen ones refrozen', () => {
    const scene = new Scene(new NullEngine());
    const map = buildStoryMap([buildHub(), buildWorld1()]);
    const view = buildStoryView(scene, map, new HubGates(map));
    const ground = scene.getMaterialByName('story_hub_ground_mat') as StandardMaterial;
    ground.freeze();
    const n = gradeStoryScene(scene);
    expect(n).toBeGreaterThanOrEqual(6);   // the grounds, blocks and walls of both worlds, the gates
    expect(ground.isFrozen).toBe(true);
    expect(ground.diffuseColor.r).toBeCloseTo(storyLinear('#334155').r, 6);
    expect(gradeStoryScene(scene)).toBe(0);
    view.dispose();
    scene.dispose();
  });

  it('the textured tint scale: a map painted at mean m is brought back to m once lifted; unreadable = 1', () => {
    expect(tintScaleForMean(1)).toBeCloseTo(1, 6);
    expect(tintScaleForMean(0.5)).toBeCloseTo(Math.pow(0.5, 2.2) / 0.5, 6);
    expect(tintScaleForMean(0.5) * 0.5).toBeCloseTo(Math.pow(0.5, 2.2), 6);
    expect(tintScaleForMean(0)).toBe(1);
    expect(textureTintScale(null)).toBe(1);
  });

  it('a material made in linear already (the dressing with the grade on) is left alone by the scene pass: no double lift', () => {
    const scene = new Scene(new NullEngine());
    const m = new StandardMaterial('dress_w1_top', scene);
    m.diffuseColor = storyLinear('#ffffff').scale(0.25);
    markGraded(m);
    expect(gradeStoryScene(scene)).toBe(0);
    expect(m.diffuseColor.r).toBeCloseTo(0.25, 6);   // not 0.25^2.2 (World 1's grass went black that way)
    scene.dispose();
  });
});
