'use client';

// ModelViewer — one body on a lit stage. Spawns through CharacterLibrary so Gate 0, the clip registration, the rest-pose
// solve and the identity layer all run exactly as they do in a mode; publishes `window.__FEL_MODEL` for the sheet probe:
//   { ready, url, report: { conforms, notes, joints, height, clipCount }, play(clip), turn(deg), elbows() }
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArcRotateCamera, Color4, Engine, MeshBuilder, Scene, SceneLoader, Vector3, type AbstractMesh, type TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CharacterLibrary, type SpawnedCharacter } from '@/lib/babylon/core/CharacterLibrary';
import { mountLightRig } from '@/lib/babylon/scene/LightRig';
import { VenueKit } from '@/lib/babylon/visual/VenueKit';

export function ModelViewer() {
  const params = useSearchParams();
  const url = params?.get('url') ?? '/models/athletes/flint.glb';
  const clip = params?.get('clip') ?? 'idle_stand';
  const yaw = Number(params?.get('yaw') ?? 0);
  const isStatic = params?.get('static') === '1';   // a prop / vehicle body: no rig, no Gate 0 — loaded as meshes, measured and framed
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [msg, setMsg] = useState('loading');
  const mountedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mountedRef.current) return;
    mountedRef.current = true;
    let disposed = false;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.06, 0.07, 0.09, 1);
    (scene.metadata ??= {}).felTier = 'desktop';
    scene.metadata.felModeId = 'model-viewer';
    // the bodies face −z (the first frames showed every back): the camera sits on −z looking at the face
    const camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 2.35, 4.2, new Vector3(0, 0.95, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 1.5; camera.upperRadiusLimit = 12;
    mountLightRig(scene, 'goldenHour', 'desktop');
    const floor = MeshBuilder.CreateGround('stage', { width: 8, height: 8 }, scene);
    floor.material = VenueKit.paint(scene, 'stage_mat', '#2a2f3a', 0.1, 0.8);
    floor.receiveShadows = true;
    let body: SpawnedCharacter | null = null;
    const w = window as unknown as { __FEL_MODEL?: Record<string, unknown> };
    w.__FEL_MODEL = { ready: false, url };
    const elbows = () => {
      if (!body) return null;
      const under = body.root.getDescendants(false);
      const by = (b: string) => under.find((n) => n.name === b || new RegExp('(^|[:_])' + b + '(_c\\d+)?$').test(n.name)) as TransformNode | undefined;
      const ang = (a?: { getAbsolutePosition(): Vector3 }, b?: { getAbsolutePosition(): Vector3 }, c?: { getAbsolutePosition(): Vector3 }) => {
        if (!a || !b || !c) return null;
        const p1 = a.getAbsolutePosition(), p2 = b.getAbsolutePosition(), p3 = c.getAbsolutePosition();
        const u = p1.subtract(p2), v = p3.subtract(p2), d = u.length() * v.length();
        return d < 1e-6 ? null : Math.round((Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(u, v) / d))) * 180) / Math.PI);
      };
      return { eL: ang(by('LeftArm'), by('LeftForeArm'), by('LeftHand')), eR: ang(by('RightArm'), by('RightForeArm'), by('RightHand')) };
    };
    (async () => {
      try {
        if (isStatic) {
          const i = url.lastIndexOf('/');
          const res = await SceneLoader.ImportMeshAsync('', url.slice(0, i + 1), url.slice(i + 1), scene);
          const meshes = res.meshes as AbstractMesh[];
          const root = meshes.find((m) => !m.parent) ?? meshes[0];
          root.rotation.y = (yaw * Math.PI) / 180;
          let mn = new Vector3(1e9, 1e9, 1e9), mx = new Vector3(-1e9, -1e9, -1e9);
          for (const m of meshes) { const b = m.getHierarchyBoundingVectors(true); mn = Vector3.Minimize(mn, b.min); mx = Vector3.Maximize(mx, b.max); }
          const size = mx.subtract(mn);
          camera.setTarget(new Vector3(0, size.y / 2, 0)); camera.radius = Math.max(size.x, size.y, size.z) * 2.2;
          const report = { conforms: true, joints: 0, height: +size.y.toFixed(2), width: +size.x.toFixed(2), depth: +size.z.toFixed(2), clipCount: 0, meshes: meshes.length, verts: meshes.reduce((n, m) => n + m.getTotalVertices(), 0), minY: +mn.y.toFixed(2) };
          w.__FEL_MODEL = { ready: true, url, report, elbows: () => null, play: () => false, turn: (deg: number) => { root.rotation.y = (deg * Math.PI) / 180; }, clips: () => [] };
          setMsg(`ready · static · ${report.width} × ${report.height} × ${report.depth} m · ${report.verts} verts · ${report.meshes} meshes`);
          return;
        }
        body = await CharacterLibrary.spawn(scene, url, { position: new Vector3(0, 0, 0), yawRad: (yaw * Math.PI) / 180, startClip: clip, modeId: 'model-viewer', role: 'opponent' });
        if (disposed) { body.dispose(); return; }
        const sk = body.skeleton;
        const bounds = body.root.getHierarchyBoundingVectors(true);
        const report = {
          conforms: true, joints: sk.bones.length, boneNames: sk.bones.map((b) => b.name),
          height: +(bounds.max.y - bounds.min.y).toFixed(2), width: +(bounds.max.x - bounds.min.x).toFixed(2),
          clipCount: body.animator.clipNames.size, meshes: body.meshes.length,
          verts: body.meshes.reduce((s, m) => s + (m.getTotalVertices?.() ?? 0), 0),
        };
        w.__FEL_MODEL = {
          ready: true, url, report, elbows,
          play: (name: string) => { body?.animator.play(name, { loop: true }); return body?.animator.clipNames.has(name) ?? false; },
          turn: (deg: number) => { if (body) body.root.rotation.y = (deg * Math.PI) / 180; },
          clips: () => Array.from(body?.animator.clipNames ?? []),
        };
        setMsg(`ready · ${report.joints} joints · ${report.height} m · ${report.clipCount} clips · ${report.verts} verts`);
      } catch (e) {
        const err = String((e as Error)?.message ?? e);
        w.__FEL_MODEL = { ready: true, url, error: err, report: { conforms: false, notes: [err] } };
        setMsg(`FAILED · ${err}`);
      }
    })();
    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => { disposed = true; mountedRef.current = false; window.removeEventListener('resize', onResize); body?.dispose(); scene.dispose(); engine.dispose(); };
  }, [url, clip, yaw]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black font-mono text-xs text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none outline-none" />
      <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[60%] rounded bg-black/70 p-2">
        <p className="text-white/60">DEV · model · <span className="text-[#00E5FF]">{url}</span> · {clip}</p>
        <p className="mt-1 text-[10px] text-white/50" id="fel-model-msg">{msg}</p>
      </div>
    </div>
  );
}
