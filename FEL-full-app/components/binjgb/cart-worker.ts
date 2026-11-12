// components/binjgb/cart-worker.ts — BINJGB-SHELF-1 load-your-own: the header check runs here, in a dedicated Worker with
// no DOM (Cyber OQ-2). A dedicated worker only hears from the page that made it (the "owning page" rule, L3); it still
// checks the message's shape. It answers with the bytes transferred back on a pass, and nothing but a reason on a fail.
import { validateCart } from '@/lib/binjgb/cart';

const scope = self as unknown as {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = (ev: MessageEvent) => {
  const data = ev.data as { buf?: unknown } | null;
  const buf = data && Object.prototype.toString.call(data.buf) === '[object ArrayBuffer]' ? (data.buf as ArrayBuffer) : null;
  if (!buf) { scope.postMessage({ ok: false, reason: 'bad-header' }); return; }
  const r = validateCart(buf);
  if (r.ok) scope.postMessage({ ok: true, buf }, [buf]);
  else scope.postMessage({ ok: false, reason: r.reason });
};
