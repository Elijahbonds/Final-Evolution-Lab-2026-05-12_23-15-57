'use client';

// The dev hair stage's client half (2026-10-07, the hair expansion): see page.tsx. Not shipped (the page 404s outside
// `next dev`); nothing here is imported by the app.

import { useEffect, useRef, useState } from 'react';

interface Look { sex: 'male' | 'female'; style: string; hair?: string; skin?: string; extras?: Record<string, unknown>; yaw?: number; dist?: number; ty?: number }

export function HairSheet() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState('loading');
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void (async () => {
      const B = await import('@babylonjs/core');
      await import('@babylonjs/loaders/glTF');
      const { applyIdentity, identityFrom } = await import('@/lib/babylon/core/playerIdentity');
      const { defaultFace } = await import('@/lib/closet/wearable-catalog');
      const { emptyCreatorDoc } = await import('@/lib/creator/look/doc');
      if (disposed || !ref.current) return;
      const engine = new B.Engine(ref.current, true, { preserveDrawingBuffer: true, antialias: true });
      const scene = new B.Scene(engine);
      scene.metadata = { felTier: 'desktop' };
      scene.clearColor = new B.Color4(0.16, 0.17, 0.2, 1);
      const cam = new B.ArcRotateCamera('cam', Math.PI / 2, 1.45, 0.9, new B.Vector3(0, 1.5, 0), scene);
      cam.fov = 0.6; cam.minZ = 0.01;
      const hemi = new B.HemisphericLight('h', new B.Vector3(0, 1, 0), scene); hemi.intensity = 0.85; hemi.groundColor = new B.Color3(0.35, 0.33, 0.32);
      const dir = new B.DirectionalLight('d', new B.Vector3(-0.4, -0.6, -0.8), scene); dir.intensity = 2.2;
      const kits: Record<string, import('@babylonjs/core').AssetContainer> = {};
      let cur: import('@babylonjs/core').TransformNode | null = null;
      let n = 0;
      const show = async (o: Look) => {
        cur?.dispose(false, false);
        kits[o.sex] ??= await B.SceneLoader.LoadAssetContainerAsync('/models/candidates/', `fel-kit-${o.sex}.glb`, scene);
        const inst = kits[o.sex].instantiateModelsToScene((x) => `${x}_h${++n}`, false, { doNotInstantiate: true });
        for (const g of inst.animationGroups) g.stop();
        const root = inst.rootNodes[0] as import('@babylonjs/core').TransformNode;
        const spawn = { id: `h${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as never;
        const base = { ...defaultFace(), hairStyle: o.style, hairColor: o.hair ?? '#2B1B0E', skinTone: o.skin ?? '#8D5524' };
        const equipped = { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' };
        const slot = { id: 'w1', label: 'W', body: o.sex, base, doc: { ...emptyCreatorDoc(), ...(o.extras ? { hair: o.extras } : {}) }, equipped };
        const id = identityFrom({ look: { face: { ...base, creatorSlots: [slot], activeSlot: 'w1' }, equipped } } as never,
          { body: o.sex === 'female' ? 'kit-female' : 'kit-male', frame: { heightScale: 100, buildScale: 100 }, scanOwned: false } as never, null);
        applyIdentity(spawn, id);
        const q0 = root.rotationQuaternion ?? B.Quaternion.Identity();
        root.rotationQuaternion = B.Quaternion.RotationAxis(B.Vector3.Up(), o.yaw ?? 0).multiply(q0);
        cur = root;
        cam.target.set(0, o.ty ?? (o.sex === 'female' ? 1.42 : 1.5), 0); cam.radius = o.dist ?? 0.9;
        await Promise.race([scene.whenReadyAsync(), new Promise((r) => setTimeout(r, 8000))]);
        for (let i = 0; i < 3; i++) { scene.render(); await new Promise((r) => requestAnimationFrame(r)); }
        return (root.metadata as { felHair?: unknown } | null)?.felHair ?? null;
      };
      (window as unknown as { felHair: unknown }).felHair = { show, snap: () => ref.current!.toDataURL('image/png') };
      setState('ready');
      cleanup = () => { engine.dispose(); };
    })();
    return () => { disposed = true; cleanup(); };
  }, []);
  return (
    <div className="flex min-h-screen items-start justify-center bg-[#111] p-2 text-white">
      <canvas ref={ref} width={420} height={460} style={{ width: 420, height: 460 }} data-state={state} />
    </div>
  );
}
