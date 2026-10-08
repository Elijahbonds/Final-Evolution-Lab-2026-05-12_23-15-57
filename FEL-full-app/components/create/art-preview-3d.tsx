'use client';
// components/create/art-preview-3d.tsx — CREATE HUB step 3 for art: the painted texture on the surface it is for, in a
// small Babylon scene (a board deck, a court floor, a jersey, or a UI panel). Its own engine on its own canvas, disposed
// on unmount; one draw per frame only while visible. Loaded with next/dynamic (ssr: false).

import React, { useEffect, useRef } from 'react';
import {
  ArcRotateCamera, Color3, Color4, Engine, HemisphericLight, DirectionalLight, MeshBuilder, Scene, StandardMaterial, Texture, Vector3,
} from '@babylonjs/core';

type Surface = 'court' | 'board' | 'kit' | 'ui';

export default function ArtPreview3D({ image, surface }: { image: string; surface: Surface }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let engine: Engine;
    try { engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false }); } catch { return; }
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.04, 0.04, 0.05, 1);
    const cam = new ArcRotateCamera('cam', -Math.PI / 2.4, Math.PI / 3, surface === 'court' ? 9 : 4.2, Vector3.Zero(), scene);
    cam.attachControl(canvas, true);
    cam.lowerRadiusLimit = 2; cam.upperRadiusLimit = 14; cam.wheelPrecision = 40;
    new HemisphericLight('h', new Vector3(0, 1, 0), scene).intensity = 0.8;
    const sun = new DirectionalLight('d', new Vector3(-0.4, -1, 0.6), scene); sun.intensity = 0.6;

    const mat = new StandardMaterial('art', scene);
    const tex = new Texture(image, scene, false, true);
    mat.diffuseTexture = tex;
    mat.specularColor = new Color3(0.1, 0.1, 0.1);

    if (surface === 'board') {
      // the deck: a long rounded slab, painted on top (named like the game's deck mesh, deckMesh.ts deck_slab)
      const deck = MeshBuilder.CreateBox('deck_slab', { width: 0.8, height: 0.06, depth: 3.1 }, scene);
      deck.material = mat;
      const wheels = new StandardMaterial('w', scene); wheels.diffuseColor = new Color3(0.9, 0.9, 0.85);
      for (const z of [-1.05, 1.05]) for (const x of [-0.32, 0.32]) {
        const w = MeshBuilder.CreateCylinder('wheel', { diameter: 0.22, height: 0.12 }, scene);
        w.rotation.z = Math.PI / 2; w.position.set(x, -0.14, z); w.material = wheels;
      }
      cam.target = new Vector3(0, 0, 0);
    } else if (surface === 'court') {
      const floor = MeshBuilder.CreateGround('court_floor', { width: 8, height: 8 }, scene);
      floor.material = mat;
      const hoopMat = new StandardMaterial('hoop', scene); hoopMat.diffuseColor = new Color3(0.9, 0.35, 0.1);
      const rim = MeshBuilder.CreateTorus('rim', { diameter: 0.6, thickness: 0.04 }, scene);
      rim.position.set(0, 2.6, -3.4); rim.material = hoopMat;
    } else if (surface === 'kit') {
      // a jersey stand-in: a short wide cylinder torso with the paint wrapped round it
      const torso = MeshBuilder.CreateCylinder('jersey_mesh', { diameterTop: 1.3, diameterBottom: 1.1, height: 1.6, tessellation: 32 }, scene);
      torso.material = mat;
    } else {
      const panel = MeshBuilder.CreatePlane('ui_panel', { width: 2.4, height: 2.4 }, scene);
      panel.material = mat; mat.emissiveColor = new Color3(0.4, 0.4, 0.4);
      cam.alpha = -Math.PI / 2; cam.beta = Math.PI / 2;
    }
    let visible = true;
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; }) : null;
    io?.observe(canvas);
    engine.runRenderLoop(() => { if (!visible) return; if (surface !== 'ui') cam.alpha += 0.002; scene.render(); });
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); io?.disconnect(); engine.stopRenderLoop(); scene.dispose(); engine.dispose(); };
  }, [image, surface]);
  return <canvas ref={ref} className="h-72 w-full touch-none rounded-xl bg-black" aria-label={`Your art on a ${surface}`} />;
}
