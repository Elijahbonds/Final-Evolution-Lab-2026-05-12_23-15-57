// lib/binjgb/frameDoc.ts — BINJGB-SHELF-1 load-your-own: the document served at /play/gb-shelf/local-frame and run inside
// <iframe sandbox="allow-scripts"> (no allow-same-origin: an opaque 'null' origin, so no cookies, storage or session).
//
// It holds no game and fetches nothing: the shelf page hands it the picked file's bytes and the pinned wasm bytes in one
// transferred postMessage (wasmBinary, so binjgb never fetches; locateFile still points at the same-origin vendor path,
// G5). binjgb.js itself loads from the same-origin vendor path by a nonce'd script tag (strict-dynamic, G2).
//
// L3 inside the frame (Cyber 9caccc46 / 928a9bed):
//   receive — only event.origin === the app origin (and only from window.parent);
//   send    — window.parent.postMessage(msg, APP_ORIGIN): the exact app origin, never '*'.
// Keyboard: on the focused canvas only (G8). No audio in this draft (an AudioContext would start only after a tap).
// No storage of any kind here: the parent writes battery saves to fel_binjgb after its own L3 checks.
import { BINJGB_JS_PATH, BINJGB_VENDOR_PATH } from './vendor';
import { BUTTON, KEY_TO_BUTTON } from './input';
import { MSG } from './messages';
import { CONTROL_LABELS, SHELF_COPY } from './copy';

export interface FrameConfig {
  appOrigin: string;
  vendorPath: string;
  msg: typeof MSG;
  buttons: typeof BUTTON;
  keys: typeof KEY_TO_BUTTON;
}

/**
 * The frame's whole program, as a function expression over (window, config). Plain ES5-ish JS in a string so the page can
 * inline it under a nonce, and tests can run it against a fake window. It references nothing outside its two arguments.
 */
export const FRAME_RUNTIME = String.raw`function (w, cfg) {
  'use strict';
  var d = w.document;
  var CPU_TICKS = 4194304, EVENT_NEW_FRAME = 1, EVENT_UNTIL_TICKS = 4, AUDIO_FRAMES = 4096, RATE = 44100, CURVE = 2;
  var B = cfg.buttons, KEYS = cfg.keys, M = cfg.msg;
  var mod = null, emu = 0, romPtr = 0, raf = 0, last = 0, keyBits = 0, padBits = 0, ctx = null, img = null, lastSave = 0;
  var canvas = d.getElementById('screen');

  function send(msg, transfer) { w.parent.postMessage(msg, cfg.appOrigin, transfer || []); }
  function fromApp(ev) { return ev.origin === cfg.appOrigin && ev.source === w.parent; }
  function isAb(v) { return Object.prototype.toString.call(v) === '[object ArrayBuffer]'; }

  function applyJoyp() {
    if (!mod || !emu) return;
    var bits = keyBits | padBits;
    mod._set_joyp_right(emu, bits & B.right ? 1 : 0);
    mod._set_joyp_left(emu, bits & B.left ? 1 : 0);
    mod._set_joyp_up(emu, bits & B.up ? 1 : 0);
    mod._set_joyp_down(emu, bits & B.down ? 1 : 0);
    mod._set_joyp_A(emu, bits & B.a ? 1 : 0);
    mod._set_joyp_B(emu, bits & B.b ? 1 : 0);
    mod._set_joyp_select(emu, bits & B.select ? 1 : 0);
    mod._set_joyp_start(emu, bits & B.start ? 1 : 0);
  }

  function withExtRam(cb) {
    var fd = mod._ext_ram_file_data_new(emu);
    var view = new Uint8Array(mod.HEAPU8.buffer, mod._get_file_data_ptr(fd), mod._get_file_data_size(fd));
    try { return cb(fd, view); } finally { mod._file_data_delete(fd); }
  }
  function loadBattery(ab) {
    withExtRam(function (fd, view) {
      if (view.byteLength === ab.byteLength) { view.set(new Uint8Array(ab)); mod._emulator_read_ext_ram(emu, fd); }
    });
  }
  function saveBattery() {
    var copy = withExtRam(function (fd, view) { mod._emulator_write_ext_ram(emu, fd); return view.slice().buffer; });
    if (copy && copy.byteLength > 0) send({ type: M.battery, bytes: copy }, [copy]);
  }

  function draw() {
    var fb = new Uint8Array(mod.HEAPU8.buffer, mod._get_frame_buffer_ptr(emu), mod._get_frame_buffer_size(emu));
    img.data.set(fb);
    ctx.putImageData(img, 0, 0);
  }
  function tick(now) {
    raf = w.requestAnimationFrame(tick);
    if (!last) { last = now; return; }
    var dt = Math.min((now - last) / 1000, 1 / 15);
    last = now;
    var until = mod._emulator_get_ticks_f64(emu) + dt * CPU_TICKS;
    for (var guard = 0; guard < 1000; guard++) {
      var ev = mod._emulator_run_until_f64(emu, until);
      if (ev & EVENT_NEW_FRAME) draw();
      if (ev & EVENT_UNTIL_TICKS) break;
    }
    if (mod._emulator_was_ext_ram_updated(emu) && now - lastSave > 1000) { lastSave = now; saveBattery(); }
  }

  function fit() {
    var s = Math.max(1, Math.floor(Math.min(w.innerWidth / 160, w.innerHeight / 144)));
    canvas.style.width = (160 * s) + 'px';
    canvas.style.height = (144 * s) + 'px';
    canvas.style.imageRendering = 'pixelated';
    d.body.style.margin = '0';
    d.body.style.background = '#000';
  }

  function start(m) {
    if (mod || typeof w.Binjgb !== 'function') { send({ type: M.failed }); return; }
    mod = {};
    w.Binjgb({ wasmBinary: m.wasm, locateFile: function (p) { return cfg.appOrigin + cfg.vendorPath + p; } }).then(function (module) {
      mod = module;
      var cart = new Uint8Array(m.cart);
      var size = (cart.byteLength + 0x7fff) & ~0x7fff;
      romPtr = mod._malloc(size);
      var heap = new Uint8Array(mod.HEAPU8.buffer, romPtr, size);
      heap.fill(0);
      heap.set(cart);
      emu = mod._emulator_new_simple(romPtr, size, RATE, AUDIO_FRAMES, CURVE);
      if (!emu) { send({ type: M.failed }); return; }
      if (m.battery) loadBattery(m.battery);
      ctx = canvas.getContext('2d');
      img = ctx.createImageData(160, 144);
      fit();
      canvas.focus();
      raf = w.requestAnimationFrame(tick);
      send({ type: M.started });
    }, function () { send({ type: M.failed }); });
  }

  // G8: keys on the focused canvas only; preventDefault only for the player's own keys.
  canvas.addEventListener('keydown', function (ev) {
    var b = KEYS[ev.code];
    if (!b) return;
    ev.preventDefault();
    keyBits |= B[b];
    applyJoyp();
  });
  canvas.addEventListener('keyup', function (ev) {
    var b = KEYS[ev.code];
    if (!b) return;
    ev.preventDefault();
    keyBits &= ~B[b];
    applyJoyp();
  });

  w.addEventListener('message', function (ev) {
    if (!fromApp(ev)) return;
    var m = ev.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === M.load && isAb(m.cart) && isAb(m.wasm) && (m.battery === null || isAb(m.battery))) start(m);
    else if (m.type === M.input && typeof m.buttons === 'number') { padBits = m.buttons & 255; applyJoyp(); }
  });
  w.addEventListener('pagehide', function () {
    if (raf) w.cancelAnimationFrame(raf);
    if (mod && emu) { mod._emulator_delete(emu); mod._free(romPtr); }
    mod = null; emu = 0;
  });
  send({ type: M.ready });
}`;

/** A nonce as middleware makes it (base64 of 16 random bytes). Anything else is refused. */
const NONCE_RE = /^[A-Za-z0-9+/]{16,}={0,2}$/;

/** JSON safe inside an inline <script> (no "</script>", no "<!--"). */
function inlineJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export function frameConfig(appOrigin: string): FrameConfig {
  return { appOrigin, vendorPath: BINJGB_VENDOR_PATH, msg: MSG, buttons: BUTTON, keys: KEY_TO_BUTTON };
}

/** The local frame's HTML, or null when the nonce or the origin is not one we made. */
export function frameDocument(nonce: string, appOrigin: string): string | null {
  if (!NONCE_RE.test(nonce)) return null;
  let origin: string;
  try { origin = new URL(appOrigin).origin; } catch { return null; }
  if (origin === 'null' || origin !== appOrigin) return null;
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer">',
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${SHELF_COPY.title}</title></head>`,
    `<body><canvas id="screen" width="160" height="144" tabindex="0" aria-label="${CONTROL_LABELS.screen}"></canvas>`,
    `<script nonce="${nonce}" src="${BINJGB_JS_PATH}"></script>`,
    `<script nonce="${nonce}">(${FRAME_RUNTIME})(window, ${inlineJson(frameConfig(origin))});</script>`,
    '</body></html>',
  ].join('\n');
}
