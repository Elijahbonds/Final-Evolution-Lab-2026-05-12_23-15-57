// A recording 2-D context for the combat visuals' tests (node has no canvas). Every method records its call and returns a
// stub gradient where a gradient is wanted; every property set is accepted. `installOffscreenShim` gives Babylon's
// DynamicTexture a surface to paint on under NullEngine.

export interface Call { fn: string; args: unknown[] }
export interface RecCtx { calls: Call[]; [k: string]: unknown }

export function recordingCtx(): RecCtx & CanvasRenderingContext2D {
  const calls: Call[] = [];
  const grad = { addColorStop(...a: unknown[]) { calls.push({ fn: 'addColorStop', args: a }); } };
  const target: Record<string, unknown> = { calls };
  return new Proxy(target, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === 'canvas') return { width: 0, height: 0 };
      return (...args: unknown[]) => { calls.push({ fn: k, args }); return k.startsWith('create') ? grad : undefined; };
    },
    set(t, k: string, v) { t[k] = v; calls.push({ fn: `set:${k}`, args: [v] }); return true; },
  }) as unknown as RecCtx & CanvasRenderingContext2D;
}

export function installOffscreenShim(): void {
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class {
    width: number; height: number;
    constructor(w: number, h: number) { this.width = w; this.height = h; }
    getContext(): unknown { return recordingCtx(); }
  };
}

/** Every number in every recorded call is finite — a painter that divided by zero would draw NaN and a texture of nothing. */
export function allFinite(calls: Call[]): boolean {
  return calls.every((c) => c.args.every((a) => typeof a !== 'number' || Number.isFinite(a)));
}
