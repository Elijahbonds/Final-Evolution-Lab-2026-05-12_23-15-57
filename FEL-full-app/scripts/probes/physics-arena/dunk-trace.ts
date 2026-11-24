// lane/physics-arena: one dunk traced frame by frame (the ball, the body, the state), headless. npx tsx dunk-trace.ts [leaveAt] [deg]
import { makeWorld } from './harness';
void makeWorld;   // loads the Havok WASM for node
(async () => {
  const B = await import('@babylonjs/core');
  await makeWorld().then((w) => w.dispose());
  const { PhysicsArenaMode, arenaSeam } = await import('../../../lib/babylon/modes/PhysicsArenaMode');
  const g = globalThis as unknown as { OffscreenCanvas?: unknown };
  g.OffscreenCanvas = class { width: number; height: number; constructor(w: number, h: number) { this.width = w; this.height = h; } getContext() { return new Proxy({} as Record<string | symbol, unknown>, { get: (t, k) => (k in t ? t[k] : () => ({})), set: (t, k, v) => { t[k] = v; return true; } }); } };
  process.on('unhandledRejection', () => {});
  const engine = new B.NullEngine(); engine.getDeltaTime = () => 1000 / 60;
  const scene = new B.Scene(engine);
  const camera = new B.UniversalCamera('c', new B.Vector3(0, 3, 12), scene);
  const dir = { mode: 'follow', suspended: false, stickWorldLatched: (x: number, y: number) => new B.Vector3(x, 0, -y), look: () => {}, update: () => {}, snapTo: () => {} };
  const ctx = { scene, camera, camDirector: dir, heroRef: { current: null }, objectiveRef: { current: null }, setHud: () => {} } as never;
  await PhysicsArenaMode.load(ctx);
  const seam = arenaSeam(scene) as unknown as { place: (x: number, z: number) => void; quiet: (on: boolean) => void; state: () => Record<string, unknown> };
  seam.quiet(true);
  const leaveAt = Number(process.argv[2] ?? 1.75), deg = Number(process.argv[3] ?? 0);
  const a = (deg * Math.PI) / 180;
  seam.place(Math.sin(a) * 5.5, -0.6 + Math.cos(a) * 5.5);
  for (let f = 0; f < 30; f++) PhysicsArenaMode.update(ctx, 1 / 60);
  PhysicsArenaMode.onInput(ctx, { t: 'button', btn: 'R1', pressed: true });
  const me = scene.getTransformNodeByName('arena_me_body')!, ball = scene.getMeshByName('ball')!;
  let pressed = false;
  for (let f = 0; f < 150; f++) {
    const dx = -me.position.x, dz = -0.6 - me.position.z, d = Math.hypot(dx, dz);
    if (!pressed) PhysicsArenaMode.onInput(ctx, { t: 'stick', side: 'L', x: dx / d, y: -dz / d });
    if (!pressed && d < leaveAt) { PhysicsArenaMode.onInput(ctx, { t: 'button', btn: 'X', pressed: true }); pressed = true; console.log('PRESS'); }
    PhysicsArenaMode.update(ctx, 1 / 60);
    const st = seam.state() as { ball: string; phase: string };
    if (pressed && f % 2 === 0) console.log(`f ${f} body d ${d.toFixed(2)} y ${me.position.y.toFixed(2)} ball y ${ball.position.y.toFixed(2)} r ${Math.hypot(ball.position.x, ball.position.z + 0.6).toFixed(2)} z ${ball.position.z.toFixed(2)} ${st.ball} ${st.phase}`);
  }
})();
