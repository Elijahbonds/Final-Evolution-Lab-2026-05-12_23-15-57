// hoops-builder phase B: the browser half of the height-look rig (height-look.mts). Two bodies through the REAL spawn path on a scene
// stamped as the 1v1 (felModeId 'onevone': identity applies at the standard frame, as in the game), then the modes' own call:
// applyProportions(spawn, { heightScale: ratedLookScale(run), buildScale: 1 }). Left a Guard, right a Big.
import { ArcRotateCamera, Color4, Engine, MeshBuilder, Scene, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CharacterLibrary, type SpawnedCharacter } from '@/lib/babylon/core/CharacterLibrary';
import { applyIdentity, applyProportions, type PlayerIdentity } from '@/lib/babylon/core/playerIdentity';
import { urlForHeroBody } from '@/lib/babylon/core/heroBody';
import { mountLightRig } from '@/lib/babylon/scene/LightRig';
import { SPORT_CLIP } from '@/lib/babylon/anim/clipRegistry';
import { defaultFace, defaultJersey } from '@/lib/closet/wearable-catalog';
import { ratedLookScale, type RatedRun } from '@/lib/babylon/hoops/ratedPlay';
import { TODAY_TUNING } from '@/lib/babylon/hoops/ratings';

let engine: Engine; let scene: Scene;
const bodies: SpawnedCharacter[] = [];

function identity(jersey: string): PlayerIdentity {
  return {
    proportions: null, face: defaultFace(), palette: { jersey, shorts: '#1C2622', shoes: '#EDE8DC', accent: '#E0B441' },
    jersey: defaultJersey(), wardrobe: {} as PlayerIdentity['wardrobe'], custom: true, body: 'kit-male', accessories: [], creator: null, wornParts: [],
  };
}

async function init(w: number, h: number): Promise<void> {
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.style.cssText = `width:${w}px;height:${h}px;display:block`;
  document.getElementById('stage')!.appendChild(c);
  engine = new Engine(c, true, { preserveDrawingBuffer: true, alpha: false, adaptToDeviceRatio: false });
  scene = new Scene(engine);
  (scene.metadata ??= {}).felTier = 'desktop';
  scene.metadata.felModeId = 'onevone';
  const cam = new ArcRotateCamera('cam', -Math.PI / 2, 1.5, 5.2, new Vector3(0, 1.0, 0), scene);
  cam.fov = 0.6; cam.minZ = 0.1;
  scene.activeCamera = cam;
  mountLightRig(scene, 'goldenHour', 'desktop');
  scene.clearColor = new Color4(0.06, 0.07, 0.09, 1);
  const floor = MeshBuilder.CreateGround('floor', { width: 8, height: 4 }, scene);
  const fm = new StandardMaterial('floorMat', scene); fm.diffuseColor = new Color3(0.32, 0.22, 0.14); floor.material = fm;
  // a line at the standard (6'4") body's top (1.772 m, measured by this rig), at the bodies' own depth: the same for both pictures
  const line = MeshBuilder.CreateBox('ref', { width: 3.4, height: 0.006, depth: 0.006 }, scene); line.position.set(0, 1.772, 0);
  const lm = new StandardMaterial('refMat', scene); lm.emissiveColor = new Color3(1, 1, 1); lm.disableLighting = true; line.material = lm;
  engine.runRenderLoop(() => scene.render());
}

/** One body at x, as the 1v1 spawns its hero, then drawn at this run's playing height. Returns the scale applied. */
async function spawn(x: number, jersey: string, heightIn: number, rated: boolean): Promise<number> {
  const s = await CharacterLibrary.spawn(scene, urlForHeroBody('kit-male'), { identity: false, role: 'player', position: new Vector3(x, 0, 0), yawRad: Math.PI, startClip: SPORT_CLIP.idle });
  applyIdentity(s, identity(jersey));
  const run: RatedRun = { tuning: TODAY_TUNING, heightIn, why: rated ? 'rated' : 'ratingFree' };
  const k = ratedLookScale(run);
  if (k !== 1) applyProportions(s, { heightScale: k, buildScale: 1 });
  bodies.push(s);
  return k;
}
function heights(): number[] {
  return bodies.map((b) => { b.root.computeWorldMatrix(true); let top = 0; for (const m of b.root.getChildMeshes(false)) { m.computeWorldMatrix(true); top = Math.max(top, m.getBoundingInfo().boundingBox.maximumWorld.y); } return Math.round(top * 1000) / 1000; });
}
(window as unknown as { __HL: unknown }).__HL = { ready: true, init, spawn, heights };
