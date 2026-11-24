// lane/physics-arena: the arena's 3v3 phases traced headless. npx tsx threes-trace.ts [hands 0/1]
import { makeWorld } from './harness';
(async () => {
  const B = await import('@babylonjs/core');
  await makeWorld().then((w) => w.dispose());
  const g = globalThis as unknown as { OffscreenCanvas?: unknown };
  g.OffscreenCanvas = class { width: number; height: number; constructor(w: number, h: number) { this.width = w; this.height = h; } getContext() { return new Proxy({} as Record<string | symbol, unknown>, { get: (t, k) => (k in t ? t[k] : () => ({})), set: (t, k, v) => { t[k] = v; return true; } }); } };
  process.on('unhandledRejection', () => {});
  const { setFeelUser, setFeelSession, setFeelOverride } = await import('../../../lib/feel-panel/feel');
  setFeelUser(true); setFeelSession(null); setFeelOverride('arena.physicsHands', Number(process.argv[2] ?? 1));
  const { PhysicsArena3v3Mode } = await import('../../../lib/babylon/modes/PhysicsArena3v3Mode');
  const engine = new B.NullEngine(); engine.getDeltaTime = () => 1000 / 60;
  const scene = new B.Scene(engine); const camera = new B.UniversalCamera('c', new B.Vector3(0, 3, 12), scene);
  let last = '';
  const dir = { mode: 'follow', suspended: false, stickWorldLatched: (x: number, y: number) => new B.Vector3(x, 0, -y), look: () => {}, update: () => {}, snapTo: () => {} };
  const ctx = { scene, camera, camDirector: dir, heroRef: { current: null }, objectiveRef: { current: null }, setHud: (u: Record<string, unknown>) => { const k = `${u.arenaPhase}|${u.arenaPoss}|${u.arenaBanner}|${u.arenaScore}`; if (k !== last) { last = k; console.log(k); } } } as never;
  await PhysicsArena3v3Mode.load(ctx);
  const { arena3v3Stats } = await import('../../../lib/babylon/modes/PhysicsArena3v3Mode');
  const ball = scene.getMeshByName('ball')!;
  for (let f = 0; f < 60 * 40; f++) {
    if (f % 60 === 0) PhysicsArena3v3Mode.onInput(ctx, { t: 'button', btn: 'B', pressed: true });
    PhysicsArena3v3Mode.update(ctx, 1 / 60);
    if (f % 30 === 0) console.log(`  f ${f} ball ${ball.position.x.toFixed(1)},${ball.position.y.toFixed(1)},${ball.position.z.toFixed(1)}`);
  }
  console.log(JSON.stringify(arena3v3Stats(scene)));
})();
