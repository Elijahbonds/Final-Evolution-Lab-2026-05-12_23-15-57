// lib/binjgb/messages.ts — BINJGB-SHELF-1 load-your-own: the postMessage protocol between the shelf page and the
// sandboxed local frame, with Cyber's L3 receive rules and the L3-SEND scoped exception (reviews 9caccc46 / 928a9bed).
//
// The frame is <iframe sandbox="allow-scripts"> with NO allow-same-origin, so its origin is the opaque 'null'.
//   Parent receive: only event.source === iframe.contentWindow AND event.origin === 'null' (acceptFromLocalFrame).
//   Parent send:    targetOrigin '*' ONLY to the app-created local frame's contentWindow, read immediately before the
//                   call, and only while the sandbox still lacks allow-same-origin (postToLocalFrame). Never to
//                   window.parent / opener / top or any other Window; never a broadcast. Cart bytes on the transfer list.
//   Frame receive:  only the app origin (and only its parent) — lib/binjgb/frameDoc.ts.
//   Frame send:     window.parent.postMessage(msg, APP_ORIGIN) with the exact origin, never '*' — frameDoc.ts.
import { BATTERY_MAX_BYTES } from './savesDb';

export const LOCAL_FRAME_PATH = '/play/gb-shelf/local-frame';
/** The frame's sandbox: scripts only. Adding allow-same-origin would make the frame same-origin; it never happens. */
export const LOCAL_FRAME_SANDBOX = 'allow-scripts';

export const MSG = {
  ready: 'fel-binjgb:ready',
  started: 'fel-binjgb:started',
  failed: 'fel-binjgb:failed',
  battery: 'fel-binjgb:battery',
  load: 'fel-binjgb:load',
  input: 'fel-binjgb:input',
} as const;

export type FrameToParent =
  | { type: typeof MSG.ready }
  | { type: typeof MSG.started }
  | { type: typeof MSG.failed }
  | { type: typeof MSG.battery; bytes: ArrayBuffer };

export type ParentToFrame =
  | { type: typeof MSG.load; cart: ArrayBuffer; wasm: ArrayBuffer; battery: ArrayBuffer | null }
  | { type: typeof MSG.input; buttons: number };

const isAb = (v: unknown): v is ArrayBuffer => Object.prototype.toString.call(v) === '[object ArrayBuffer]';

/** The shape check for a frame → parent message (after the origin/source checks). */
export function parseFrameMessage(data: unknown): FrameToParent | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as { type?: unknown; bytes?: unknown };
  if (m.type === MSG.ready || m.type === MSG.started || m.type === MSG.failed) return { type: m.type };
  if (m.type === MSG.battery && isAb(m.bytes) && m.bytes.byteLength > 0 && m.bytes.byteLength <= BATTERY_MAX_BYTES) {
    return { type: MSG.battery, bytes: m.bytes };
  }
  return null;
}

/** L3 receive (parent): only our frame's window, only the opaque origin. Anything else is ignored. */
export function acceptFromLocalFrame(
  event: { source: unknown; origin: string; data: unknown },
  iframe: { contentWindow: unknown } | null | undefined,
): FrameToParent | null {
  const w = iframe?.contentWindow;
  if (!w || event.source !== w) return null;
  if (event.origin !== 'null') return null;
  return parseFrameMessage(event.data);
}

export interface LocalFrameLike {
  readonly contentWindow: { postMessage(message: unknown, targetOrigin: string, transfer?: Transferable[]): void } | null;
  readonly sandbox: { contains(token: string): boolean };
  getAttribute(name: string): string | null;
}

/**
 * L3-SEND: the ONLY place the parent posts with targetOrigin '*'. Refuses (returns false, posts nothing) unless the
 * element is the app-created local frame (its src is LOCAL_FRAME_PATH and it is marked data-fel-local-frame), its
 * sandbox has allow-scripts and still lacks allow-same-origin, and — for a load — the cart and wasm buffers are on the
 * transfer list. contentWindow is read here, immediately before the call.
 */
export function postToLocalFrame(iframe: LocalFrameLike | null | undefined, msg: ParentToFrame, transfer: Transferable[] = []): boolean {
  if (!iframe) return false;
  if (iframe.getAttribute('src') !== LOCAL_FRAME_PATH || iframe.getAttribute('data-fel-local-frame') !== '1') return false;
  if (!iframe.sandbox.contains('allow-scripts') || iframe.sandbox.contains('allow-same-origin')) return false;
  if (msg.type === MSG.load && (!transfer.includes(msg.cart) || !transfer.includes(msg.wasm))) return false;
  const w = iframe.contentWindow;
  if (!w) return false;
  w.postMessage(msg, '*', transfer);
  return true;
}
