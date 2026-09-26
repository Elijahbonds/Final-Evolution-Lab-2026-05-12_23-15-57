// MUSIC-SUITE P5 (2026-09-25), phone-mpc — the controller page serves EVERY phone-controller mode, so the Flip's MPC hints
// (types.ts ButtonSchemaHints: haptics / velocity / compact) had to be opt-in. This pins it:
//   1. a mode with no hint renders byte-for-byte what the page rendered before P5 (the two strings below were captured from
//      the page as it was, controller-page.tsx :86-100 then; the one-off capture of all 21 other modes is in the outbox,
//      musicsuite/p5/phone/controller-markup-proof.json);
//   2. a press on a hint-less button still calls the bare client.send(action) — one argument, no buzz;
//   3. the Flip's pads buzz and carry a velocity only once the phone has MEASURED one.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchemaControls } from './controller-page';
import { MODE_CONTROLLERS } from '@/lib/controller-link/schemas/registry';
import type { ControllerClient } from '@/lib/controller-link/client';
import type { ModeControllerConfig } from '@/lib/controller-link/types';
import { drive, findAll, type Found } from '@/tests/helpers/driveRender';

const MAIN = 'flex flex-1 flex-col justify-center gap-6 px-4 pb-8';
const page = (c: ModeControllerConfig): string => renderToStaticMarkup(<main className={MAIN}><SchemaControls config={c} client={null} /></main>);

// captured before MUSIC-SUITE P5 from the page's own schema map (see the header)
const BEFORE_DANCE = '<main class="flex flex-1 flex-col justify-center gap-6 px-4 pb-8"><div class="grid gap-3" style="grid-template-columns:repeat(2, minmax(0, 1fr))"><button class="rounded-xl py-8 text-lg font-bold active:brightness-125" style="background:#22d3ee33;color:#22d3ee;border:1px solid #22d3ee66">TAP</button></div></main>';
const BEFORE_DUNK = '<main class="flex flex-1 flex-col justify-center gap-6 px-4 pb-8"><div class="flex flex-col items-center gap-4 text-center"><p class="text-sm text-white/60">Tilt back to load your jump — release to launch</p><button class="rounded-lg bg-[#ffd75e] px-6 py-3 font-bold text-black">ENABLE MOTION</button></div><div class="mx-auto grid h-48 w-48 grid-cols-3 grid-rows-3 gap-1"><button style="grid-row:1;grid-column:2" class="rounded-lg bg-white/10 text-xl text-white/70 active:bg-white/25">▲</button><button style="grid-row:2;grid-column:1" class="rounded-lg bg-white/10 text-xl text-white/70 active:bg-white/25">◀</button><button style="grid-row:2;grid-column:3" class="rounded-lg bg-white/10 text-xl text-white/70 active:bg-white/25">▶</button><button style="grid-row:3;grid-column:2" class="rounded-lg bg-white/10 text-xl text-white/70 active:bg-white/25">▼</button></div><div class="grid gap-3" style="grid-template-columns:repeat(2, minmax(0, 1fr))"><button class="rounded-xl py-8 text-lg font-bold active:brightness-125" style="background:#22d3ee33;color:#22d3ee;border:1px solid #22d3ee66">RUN</button><button class="rounded-xl py-8 text-lg font-bold active:brightness-125" style="background:#ff6b3d33;color:#ff6b3d;border:1px solid #ff6b3d66">SLAM</button><button class="rounded-xl py-8 text-lg font-bold active:brightness-125" style="background:#a78bfa33;color:#a78bfa;border:1px solid #a78bfa66">STYLE</button></div></main>';

/** A client that records what was sent (the real one needs a data channel). */
function fakeClient(): { client: ControllerClient; sent: unknown[][] } {
  const sent: unknown[][] = [];
  return { sent, client: { send: (...args: unknown[]) => { sent.push(args); } } as unknown as ControllerClient };
}
/** Render the controls and hand back each button's own <button> element (ActionButton is a plain function of its props). */
function buttonsOf(c: ModeControllerConfig, client: ControllerClient): { label: string; el: Found }[] {
  const { tree } = drive(() => SchemaControls({ config: c, client }) as React.ReactElement);
  const comps = findAll(tree, (el) => typeof el.type === 'function' && !!el.props.spec && typeof el.props.color === 'string');   // ActionButton, not MotionPad
  return comps.map((c2) => {
    const el = (c2.type as (p: unknown) => React.ReactElement)(c2.props);
    return { label: String(c2.props.spec.label), el: { type: el.type, props: el.props as Record<string, any> } };   // eslint-disable-line @typescript-eslint/no-explicit-any
  });
}
const press = (b: { el: Found }, ev: Record<string, unknown> = { pointerType: 'touch', pressure: 0.5, width: 1, height: 1 }): void => b.el.props.onPointerDown(ev);

afterEach(() => { vi.unstubAllGlobals(); });

describe('controller page: a schema without hints renders exactly as before P5', () => {
  it('dance (one button) and dunk (motion + d-pad + a hold button) — byte for byte', () => {
    expect(page(MODE_CONTROLLERS.dance)).toBe(BEFORE_DANCE);
    expect(page(MODE_CONTROLLERS.dunk)).toBe(BEFORE_DUNK);
  });

  it('no other mode picks up a hint\'s markup (no select-none, touch-action, compact row, or feel line)', () => {
    for (const [id, c] of Object.entries(MODE_CONTROLLERS)) {
      if (id === 'music_flip') continue;
      const html = page(c);
      expect(html, id).not.toMatch(/select-none|touch-action|py-3 text-sm|data-testid="pad-feel"/);
      // and the same schemas with every hint explicitly OFF render the same
      const off: ModeControllerConfig = { ...c, schemas: c.schemas.map((s) => (s.kind === 'button' ? { ...s, haptics: false, velocity: false, compact: false } : s)) };
      expect(page(off), id).toBe(html);
    }
  });

  it('a hint-less press sends the bare action (one argument) and never buzzes', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    const { client, sent } = fakeClient();
    const bs = buttonsOf(MODE_CONTROLLERS.dunk, client);
    press(bs.find((b) => b.label === 'SLAM')!, { pointerType: 'touch', pressure: 0.9, width: 40, height: 40 });
    press(bs.find((b) => b.label === 'RUN')!);
    expect(sent).toEqual([['A'], ['charge:down']]);
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe('controller page: the Flip asked for an MPC', () => {
  it('BANK A–D above the 16 pads, PLAY / STOP / REC below; the pad markup is touch-safe', () => {
    const html = page(MODE_CONTROLLERS.music_flip);
    const labels = [...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);
    expect(labels).toEqual(['BANK A', 'BANK B', 'BANK C', 'BANK D', ...Array.from({ length: 16 }, (_, i) => String(i + 1)), '▶ PLAY', '■ STOP', '● REC']);
    expect(html).toContain('touch-action:manipulation');
  });

  it('a pad buzzes once per hit where the phone can, and sends a velocity only once one has been MEASURED', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    const { client, sent } = fakeClient();
    const bs = buttonsOf(MODE_CONTROLLERS.music_flip, client);
    const pad = (n: number) => bs.find((b) => b.label === String(n))!;
    press(pad(1), { pointerType: 'touch', pressure: 0.5, width: 1, height: 1 });    // nothing measured yet
    press(pad(2), { pointerType: 'touch', pressure: 0.25, width: 1, height: 1 });   // pressure varies now: measured
    press(pad(3), { pointerType: 'touch', pressure: 0.81, width: 1, height: 1 });
    expect(sent).toEqual([['pad_0'], ['pad_1', { v: 0.5, via: 'force' }], ['pad_2', { v: 0.9, via: 'force' }]]);
    expect(vibrate).toHaveBeenCalledTimes(3);
    expect(vibrate).toHaveBeenCalledWith(12);
  });

  it('a phone that reports no pressure and no contact size stays at the fixed level (never an invented number)', () => {
    vi.stubGlobal('navigator', {});   // iOS Safari: no vibrate
    const { client, sent } = fakeClient();
    const bs = buttonsOf(MODE_CONTROLLERS.music_flip, client);
    for (let i = 1; i <= 8; i++) press(bs.find((b) => b.label === String(i))!, { pointerType: 'touch', pressure: 0.5, width: 1, height: 1 });
    expect(sent).toEqual(Array.from({ length: 8 }, (_, i) => [`pad_${i}`]));
  });

  it('transport and bank buttons send their actions bare (no velocity) and buzz', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    const { client, sent } = fakeClient();
    const bs = buttonsOf(MODE_CONTROLLERS.music_flip, client);
    for (const l of ['BANK B', '▶ PLAY', '● REC', '■ STOP']) press(bs.find((b) => b.label === l)!, { pointerType: 'touch', pressure: 0.9, width: 30, height: 30 });
    expect(sent).toEqual([['bank_B'], ['play'], ['rec'], ['stop']]);
    expect(vibrate).toHaveBeenCalledTimes(4);
  });
});
