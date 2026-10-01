// A question used to dispose its venue and mount the next one from scratch. The first frames of every
// swap paid that build. A shelf mounts each venue once, hides the ones that are not on screen, and
// shows the one the card is asking about.

export interface ShelfNode {
  setEnabled(on: boolean): void;
}

export interface Shelved {
  root: ShelfNode;
  dispose(): void;
}

export function makeVenueShelf<T extends Shelved>(mount: (id: string) => T | null) {
  const cache = new Map<string, T>();
  let built = 0;
  return {
    /** How many venues were constructed. Showing one that is already on the shelf does not increase this. */
    built: () => built,
    has: (id: string) => cache.has(id),
    ensure(id: string): T | null {
      const hit = cache.get(id);
      if (hit) return hit;
      const v = mount(id);
      if (!v) return null;
      cache.set(id, v);
      built += 1;
      return v;
    },
    preload(ids: readonly string[]): void {
      for (const id of ids) this.ensure(id);
    },
    show(id: string): T | null {
      const v = this.ensure(id);
      for (const [k, h] of cache) h.root.setEnabled(k === id);
      return v;
    },
    dispose(): void {
      for (const h of cache.values()) h.dispose();
      cache.clear();
    },
  };
}
