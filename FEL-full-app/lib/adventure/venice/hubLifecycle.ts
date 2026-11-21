/**
 * VENICE HUB V2: whose teardown is it? (Cursor PR #635's finding, fixed inside the hub's own files.)
 *
 * THE RACE. The harness calls the mode's dispose() with no arguments, then disposes that run's scene. The hub kept one module-
 * wide set of live states and closed ALL of them in dispose(), and reset the page's globals (the walk-up card, the mini-map, the
 * probe seam). A slow first Venice load torn down after a second one had started (a quick back-and-forth, React's double mount)
 * therefore closed the NEWER scene's player, sound, life and court life, and blanked its card.
 *
 * THE FIX. Each state belongs to the scene that made it and is closed when THAT scene is disposed (scene.onDisposeObservable).
 * The page's globals belong to the CURRENT hub — the newest load, from the moment it begins — and only closing the current one
 * resets them. A load that finds its scene already disposed after its awaits stops there and touches no global.
 * Pure: no Babylon (a scene is any object).
 */

export class SceneScoped<S> {
  private readonly live = new Map<object, S>();
  private cur: object | null = null;

  /** A load begins on this scene: it is the current hub from now (an older one closing later must not reset the page). */
  begin(scene: object): void { this.cur = scene; }
  /** The load finished: its state is live. */
  open(scene: object, state: S): void { this.live.set(scene, state); }
  get(scene: object): S | undefined { return this.live.get(scene); }
  isCurrent(scene: object): boolean { return this.cur === scene; }
  /** The current hub's state, if its load has finished. */
  current(): S | null { return this.cur ? this.live.get(this.cur) ?? null : null; }
  /** Close this scene's state. `wasCurrent`: the page's globals were this hub's (reset them); `current`: the hub still running. */
  close(scene: object): { state: S | undefined; wasCurrent: boolean; current: S | null } {
    const state = this.live.get(scene);
    this.live.delete(scene);
    const wasCurrent = this.cur === scene;
    if (wasCurrent) this.cur = null;
    return { state, wasCurrent, current: this.current() };
  }
  /** Every scene still holding a state (the no-argument dispose() closes only those already disposed). */
  scenes(): object[] { return [...this.live.keys()]; }
}
