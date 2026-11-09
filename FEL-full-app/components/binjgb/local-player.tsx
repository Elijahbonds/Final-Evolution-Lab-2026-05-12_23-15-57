'use client';

// components/binjgb/local-player.tsx — BINJGB-SHELF-1 load-your-own (spec §3.5; Cyber L1/L2/L3). Rendered ONLY when the
// server decided the picker may exist (both flags on AND a verified adult): the shelf page omits it otherwise.
//
// The file never leaves this device: no upload, no fetch of the file, no server cache, no storage of its bytes or its
// name, nothing about it in analytics beyond { source: 'local' }. The single network read here is the pinned, same-origin
// wasm (/vendor/binjgb/binjgb.wasm), hash-checked before use.
//
//   1. checkFileMeta on File.size / File.name — over 8,388,608 bytes, or not .gb / .gbc → rejected before any read.
//   2. Bytes into memory, then the header check in a Worker (no DOM). A fail → dropped; no partial load.
//   3. A local-only sha256 keys the battery save (fel_binjgb); it is never sent anywhere.
//   4. The sandboxed frame (allow-scripts only) gets cart + wasm (+ battery) in ONE transferred postMessage.
import { useCallback, useEffect, useRef, useState } from 'react';
import { checkFileMeta, LOCAL_FILE_ACCEPT, type CartReject } from '@/lib/binjgb/cart';
import { CONTROL_LABELS, PICKED_NAME_MAX, PICKER_COPY, PLAYER_CONTROLS_COPY, SAVES_COPY, SHELF_COPY } from '@/lib/binjgb/copy';
import { BUTTON, gamepadBits, shouldPollGamepad, type ButtonName } from '@/lib/binjgb/input';
import { acceptFromLocalFrame, LOCAL_FRAME_PATH, LOCAL_FRAME_SANDBOX, MSG, postToLocalFrame } from '@/lib/binjgb/messages';
import { readBattery, writeBattery } from '@/lib/binjgb/savesDb';
import { BINJGB_WASM_PATH, BINJGB_WASM_SHA256 } from '@/lib/binjgb/vendor';
import { track } from '@/lib/analytics';

type Phase = 'idle' | 'checking' | 'loading' | 'playing';
type Pending = { cart: ArrayBuffer; wasm: ArrayBuffer; battery: ArrayBuffer | null };

const isAb = (v: unknown): v is ArrayBuffer => Object.prototype.toString.call(v) === '[object ArrayBuffer]';

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The pinned engine, same-origin only, refused unless its sha256 is the pinned one (G3). */
async function loadPinnedWasm(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(BINJGB_WASM_PATH, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return (await sha256Hex(buf)) === BINJGB_WASM_SHA256 ? buf : null;
  } catch {
    return null;
  }
}

/** Header check in a dedicated Worker. Only this worker's own replies are read (the owning-page bridge). */
function validateInWorker(buf: ArrayBuffer): Promise<{ ok: true; buf: ArrayBuffer } | { ok: false; reason: CartReject }> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./cart-worker.ts', import.meta.url));
    } catch {
      resolve({ ok: false, reason: 'bad-header' });
      return;
    }
    worker.onmessage = (ev: MessageEvent) => {
      worker.terminate();
      const d = ev.data as { ok?: unknown; buf?: unknown; reason?: unknown } | null;
      if (d && d.ok === true && isAb(d.buf)) resolve({ ok: true, buf: d.buf });
      else resolve({ ok: false, reason: (typeof d?.reason === 'string' ? d.reason : 'bad-header') as CartReject });
    };
    worker.onerror = () => { worker.terminate(); resolve({ ok: false, reason: 'bad-header' }); };
    worker.postMessage({ buf }, [buf]);
  });
}

function rejectCopy(reason: CartReject): string {
  if (reason === 'too-big') return PICKER_COPY.tooBig;
  if (reason === 'wrong-type' || reason === 'archive') return PICKER_COPY.wrongType;
  return PICKER_COPY.unreadable;
}

const PAD: ButtonName[] = ['up', 'down', 'left', 'right', 'select', 'start', 'b', 'a'];

export function LocalPlayer() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const pending = useRef<Pending | null>(null);
  const gameKey = useRef<string | null>(null);
  const touchBits = useRef(0);
  const sentBits = useRef(-1);
  const [phase, setPhase] = useState<Phase>('idle');
  const [mounted, setMounted] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const stop = useCallback(() => {
    pending.current = null;
    gameKey.current = null;
    sentBits.current = -1;
    setMounted(false);
    setPhase('idle');
  }, []);

  const sendInput = useCallback((bits: number) => {
    if (bits === sentBits.current) return;
    if (postToLocalFrame(frameRef.current, { type: MSG.input, buttons: bits })) sentBits.current = bits;
  }, []);

  // L3 receive: only our frame's window, only the opaque 'null' origin.
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const m = acceptFromLocalFrame(ev, frameRef.current);
      if (!m) return;
      if (m.type === MSG.ready) {
        const p = pending.current;
        pending.current = null;
        if (!p) return;
        const transfer = p.battery ? [p.cart, p.wasm, p.battery] : [p.cart, p.wasm];
        if (!postToLocalFrame(frameRef.current, { type: MSG.load, cart: p.cart, wasm: p.wasm, battery: p.battery }, transfer)) {
          setError(SHELF_COPY.wasmFail);
          stop();
        }
      } else if (m.type === MSG.started) {
        setPhase('playing');
        track('homebrew_local_play', { source: 'local' });   // G9 / T-LOCAL-ANALYTICS: nothing else, ever
      } else if (m.type === MSG.failed) {
        setError(SHELF_COPY.wasmFail);
        stop();
      } else if (m.type === MSG.battery && gameKey.current) {
        void writeBattery(gameKey.current, m.bytes).then((r) => { if (!r.ok && r.reason === 'quota') setSaveNote(SAVES_COPY.quota); });
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [stop]);

  // G8: pads are read only while the page is visible and the player is on screen.
  useEffect(() => {
    if (phase !== 'playing' || !frameRef.current) return;
    let onScreen = false;
    let raf = 0;
    const io = new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); });
    io.observe(frameRef.current);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      let bits = touchBits.current;
      if (shouldPollGamepad(document.visibilityState, onScreen) && typeof navigator.getGamepads === 'function') {
        for (const pad of navigator.getGamepads()) bits |= gamepadBits(pad);
      }
      sendInput(bits);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [phase, sendInput]);

  async function onPick(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0] ?? null;
    ev.target.value = '';   // the input keeps no reference to the file
    if (!file) return;
    stop();
    setError(null);
    setSaveNote(null);
    const meta = checkFileMeta(file);   // size and type BEFORE any read (L2)
    if (!meta.ok) { setPicked(null); setError(rejectCopy(meta.reason)); return; }
    setPicked(file.name.slice(0, PICKED_NAME_MAX));
    setPhase('checking');
    const checked = await validateInWorker(await file.arrayBuffer());
    if (!checked.ok) { setPhase('idle'); setError(rejectCopy(checked.reason)); return; }
    const cart = checked.buf;
    const [key, wasm] = await Promise.all([sha256Hex(cart), loadPinnedWasm()]);
    if (!wasm) { setPhase('idle'); setError(SHELF_COPY.wasmFail); return; }
    gameKey.current = key;   // local only: keys the battery save, never sent anywhere
    pending.current = { cart, wasm, battery: await readBattery(key) };
    setPhase('loading');
    setMounted(true);
  }

  const press = (b: ButtonName, down: boolean) => {
    touchBits.current = down ? touchBits.current | BUTTON[b] : touchBits.current & ~BUTTON[b];
  };

  return (
    <section aria-labelledby="gb-local-title" className="mt-6 fel-card rounded-xl p-4">
      <h2 id="gb-local-title" className="text-sm font-semibold text-white">{PICKER_COPY.button}</h2>
      {/* G-FILE item 8: the disclaimer comes before the chooser. */}
      <p className="mt-2 text-xs text-white/60" data-gb-disclaimer>{PICKER_COPY.disclaimer}</p>
      <p className="mt-2 text-xs text-white/50">{PICKER_COPY.helper}</p>
      <input ref={inputRef} type="file" accept={LOCAL_FILE_ACCEPT} className="sr-only" onChange={onPick} data-gb-local-input />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-lg bg-[#00E5FF] px-3 py-2 text-xs font-bold text-black" onClick={() => inputRef.current?.click()}>
          {PICKER_COPY.button}
        </button>
        {mounted ? (
          <>
            <button type="button" className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/80" onClick={stop}>{PLAYER_CONTROLS_COPY.stop}</button>
            <button type="button" className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/80"
              onClick={() => { void frameRef.current?.requestFullscreen?.(); }}>{PLAYER_CONTROLS_COPY.fullscreen}</button>
          </>
        ) : null}
      </div>
      {picked ? <p className="mt-2 text-xs text-white/60">{PICKER_COPY.picked}: <span className="text-white/80">{picked}</span></p> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-[#FFB020]">{error}</p> : null}
      {saveNote ? <p role="status" className="mt-2 text-xs text-[#FFB020]">{saveNote}</p> : null}
      {mounted ? (
        <div className="mt-4">
          <iframe ref={frameRef} src={LOCAL_FRAME_PATH} sandbox={LOCAL_FRAME_SANDBOX} data-fel-local-frame="1"
            referrerPolicy="no-referrer" title={CONTROL_LABELS.frame}
            className="aspect-[10/9] w-full max-w-[480px] rounded-lg border border-white/10 bg-black" />
          {/* Touch controls for a 390px phone; their state is posted into the frame with the pads'. */}
          <div className="mt-3 grid max-w-[390px] grid-cols-4 gap-2">
            {PAD.map((b) => (
              <button key={b} type="button" aria-label={CONTROL_LABELS[b]}
                className="rounded-lg border border-white/15 py-3 text-xs font-bold text-white/80 active:bg-white/10 touch-none select-none"
                onPointerDown={() => press(b, true)} onPointerUp={() => press(b, false)} onPointerLeave={() => press(b, false)} onPointerCancel={() => press(b, false)}>
                {CONTROL_LABELS[b]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
