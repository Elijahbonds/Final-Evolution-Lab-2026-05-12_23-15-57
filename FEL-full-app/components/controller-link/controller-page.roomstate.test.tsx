// MUSIC-SUITE P6 phone-replay (2026-09-26) — THE PHONE SEES THE ROOM, on the page. The controller page serves every
// phone-controller mode, so the room state is opt-in (types.ts ModeControllerConfig.roomState; roomState.ts). Pinned here:
//   1. a config that did not opt in renders byte-for-byte the same with a state in hand as without one (every mode in the
//      registry), and dance / dunk still match the strings captured before P5 (controller-page.test.tsx has the history);
//   2. music_flip with NO state yet renders exactly its P5 page (nothing drawn until the host speaks);
//   3. music_flip with a state: the chips above the controls, the live bank / PLAY / REC lit — and only those;
//   4. music_perform (the PERFORM lanes page) shows the same chips; its lane buttons are never lit by the MPC's actions;
//   5. a lit button still sends exactly what it sent (lighting is drawing, never input).
// The 21-mode capture against the pre-P5 page is in the outbox (musicsuite/p6/phone-replay/controller-markup-proof.json).
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchemaControls } from './controller-page';
import { MODE_CONTROLLERS } from '@/lib/controller-link/schemas/registry';
import type { ControllerClient } from '@/lib/controller-link/client';
import type { ModeControllerConfig, RoomState } from '@/lib/controller-link/types';
import { roomStateOptIn } from '@/lib/controller-link/roomState';
import { phoneRoomState } from '@/lib/babylon/music/phonePad';
import { drive, findAll, type Found } from '@/tests/helpers/driveRender';

const MAIN = 'flex flex-1 flex-col justify-center gap-6 px-4 pb-8';
const page = (c: ModeControllerConfig, live?: RoomState | null): string =>
  renderToStaticMarkup(<main className={MAIN}>{live === undefined ? <SchemaControls config={c} client={null} /> : <SchemaControls config={c} client={null} live={live} />}</main>);

// captured before MUSIC-SUITE P5 from the page's own schema map (the same strings controller-page.test.tsx pins)
const BEFORE_DANCE = '<main class="flex flex-1 flex-col justify-center gap-6 px-4 pb-8"><div class="grid gap-3" style="grid-template-columns:repeat(2, minmax(0, 1fr))"><button class="rounded-xl py-8 text-lg font-bold active:brightness-125" style="background:#22d3ee33;color:#22d3ee;border:1px solid #22d3ee66">TAP</button></div></main>';
const BEFORE_DUNK = '<main class="flex flex-1 flex-col justify-center gap-6 px-4 pb-8"><div class="flex flex-col items-center gap-4 text-center"><p class="text-sm text-white/60">Tilt back to load your jump — release to launch</p><button class="rounded-lg bg-[#ffd75e] px-6 py-3 font-bold text-black">ENABLE MOTION</button></div><div class="mx-auto grid h-48 w-48 grid-cols-3 grid-rows-3 gap-1"><button style="grid-row:1;grid-column:2" class="rounded-lg bg-white/10 text-xl text-white/70 active:bg-white/25">▲</button><button style="grid-row:2;grid-column:1" class="rounded-lg bg-white/10 text-xl text-white/70 active:bg-white/25">◀</button><button style="grid-row:2;grid-column:3" class="rounded-lg bg-white/10 text-xl text-white/70 active:bg-white/25">▶</button><button style="grid-row:3;grid-column:2" class="rounded-lg bg-white/10 text-xl text-white/70 active:bg-white/25">▼</button></div><div class="grid gap-3" style="grid-template-columns:repeat(2, minmax(0, 1fr))"><button class="rounded-xl py-8 text-lg font-bold active:brightness-125" style="background:#22d3ee33;color:#22d3ee;border:1px solid #22d3ee66">RUN</button><button class="rounded-xl py-8 text-lg font-bold active:brightness-125" style="background:#ff6b3d33;color:#ff6b3d;border:1px solid #ff6b3d66">SLAM</button><button class="rounded-xl py-8 text-lg font-bold active:brightness-125" style="background:#a78bfa33;color:#a78bfa;border:1px solid #a78bfa66">STYLE</button></div></main>';

/** A state that lights and says everything it can: bank B, PLAYING, REC on — plus every action any schema has, lit. */
const PLAYING_REC = phoneRoomState({ bank: 1, bankLabel: 'Pocket Bass', playing: true, recArm: true });
const allActions = (c: ModeControllerConfig): string[] => c.schemas.flatMap((s) => (s.kind === 'button' ? s.buttons.map((b) => b.action) : s.kind === 'dpad' ? [s.dpad.action] : [s.motion.action]));
const everything = (c: ModeControllerConfig): RoomState => ({ lit: allActions(c).slice(0, 16), chips: [{ text: 'LOUD', tone: '#ff0000', on: true }] });

/** Each <button>'s opening tag and label, in order. */
const tags = (html: string): { tag: string; label: string }[] => [...html.matchAll(/(<button[^>]*>)([^<]*)<\/button>/g)].map((m) => ({ tag: m[1], label: m[2] }));

afterEach(() => { vi.unstubAllGlobals(); });

describe('a config that did not opt in: a room state changes NOTHING on its page', () => {
  it('every other mode in the registry: identical markup with a state in hand (even one lighting all its actions) as without', () => {
    const others = Object.entries(MODE_CONTROLLERS).filter(([, c]) => !roomStateOptIn(c));
    expect(others.length).toBeGreaterThanOrEqual(21);
    for (const [id, c] of others) {
      const bare = page(c);
      expect(page(c, PLAYING_REC), id).toBe(bare);
      expect(page(c, everything(c)), id).toBe(bare);
      expect(page(c, null), id).toBe(bare);
      expect(bare, id).not.toMatch(/room-state|data-lit|aria-pressed/);
    }
  });
  it('dance and dunk still match the page as it was before P5, byte for byte, with a state in hand', () => {
    expect(page(MODE_CONTROLLERS.dance, everything(MODE_CONTROLLERS.dance))).toBe(BEFORE_DANCE);
    expect(page(MODE_CONTROLLERS.dunk, everything(MODE_CONTROLLERS.dunk))).toBe(BEFORE_DUNK);
  });
});

describe('music_flip (the MPC page) opted in', () => {
  it('before the host has said anything: exactly the P5 page (no chips, nothing lit)', () => {
    expect(page(MODE_CONTROLLERS.music_flip, null)).toBe(page(MODE_CONTROLLERS.music_flip));
    expect(page(MODE_CONTROLLERS.music_flip)).not.toMatch(/room-state|data-lit/);
  });

  it('with a state: the chips come first, in the host\'s words; BANK B, PLAY and REC lit — nothing else', () => {
    const html = page(MODE_CONTROLLERS.music_flip, PLAYING_REC);
    const chips = /<div data-testid="room-state"[^>]*>(.*?)<\/div>/.exec(html);
    expect(chips).not.toBeNull();
    expect(html.indexOf('data-testid="room-state"')).toBeLessThan(html.indexOf('<button'));
    expect([...chips![1].matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(['BANK B · Pocket Bass', '▶ PLAYING', '● RECORDING']);
    expect(chips![0]).toContain('role="status"');
    expect(chips![0]).toContain('aria-live="polite"');
    const lit = tags(html).filter((b) => b.tag.includes('data-lit="true"')).map((b) => b.label);
    expect(lit).toEqual(['BANK B', '▶ PLAY', '● REC']);
    for (const b of tags(html).filter((x) => x.tag.includes('data-lit'))) expect(b.tag).toContain('aria-pressed="true"');
  });

  it('an unlit button is the P5 button, byte for byte; the lit one is filled and ringed in its own colour', () => {
    const before = tags(page(MODE_CONTROLLERS.music_flip));
    const after = tags(page(MODE_CONTROLLERS.music_flip, PLAYING_REC));
    expect(after.map((b) => b.label)).toEqual(before.map((b) => b.label));
    after.forEach((b, i) => {
      if (['BANK B', '▶ PLAY', '● REC'].includes(b.label)) expect(b.tag).not.toBe(before[i].tag);
      else expect(b.tag, b.label).toBe(before[i].tag);
    });
    const bankB = after.find((b) => b.label === 'BANK B')!.tag;
    expect(bankB).toContain('background:#e8d9c288');
    expect(bankB).toContain('box-shadow:0 0 0 2px #e8d9c2');
    expect(bankB).toContain('touch-action:manipulation');
  });

  it('stopped, REC off, bank A: only BANK A lit, and the chips say so', () => {
    const html = page(MODE_CONTROLLERS.music_flip, phoneRoomState({ bank: 0, bankLabel: null, playing: false, recArm: false }));
    expect(tags(html).filter((b) => b.tag.includes('data-lit')).map((b) => b.label)).toEqual(['BANK A']);
    expect(html).toContain('>BANK A · empty</span>');
    expect(html).toContain('>■ STOPPED</span>');
    expect(html).toContain('>○ REC OFF</span>');
  });

  it('a chip\'s colour is only ever the #hex the state carried (the page adds no other)', () => {
    const html = page(MODE_CONTROLLERS.music_flip, { lit: [], chips: [{ text: 'X', tone: '#123456', on: true }, { text: 'Y' }] });
    expect(html).toContain('style="color:#07090d;background:#123456;border:1px solid #123456"');
    expect(html).toContain('style="color:#e8d9c2;background:transparent;border:1px solid #e8d9c266"');
  });
});

describe('music_perform (PERFORM\'s lanes page) opted in too', () => {
  it('the same chips over the lanes; the MPC\'s actions light nothing here', () => {
    if (!MODE_CONTROLLERS.music_perform) return;   // (the PERFORM lanes lane adds the page; nothing to pin without it)
    const html = page(MODE_CONTROLLERS.music_perform, PLAYING_REC);
    expect(html).toContain('data-testid="room-state"');
    expect(html).not.toContain('data-lit');
    expect(page(MODE_CONTROLLERS.music_perform, null)).toBe(page(MODE_CONTROLLERS.music_perform));
  });
});

describe('lighting is drawing, never input', () => {
  it('a press on a lit BANK B / PLAY still sends the bare action, once, with its buzz', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    const sent: unknown[][] = [];
    const client = { send: (...a: unknown[]) => { sent.push(a); } } as unknown as ControllerClient;
    const { tree } = drive(() => SchemaControls({ config: MODE_CONTROLLERS.music_flip, client, live: PLAYING_REC }) as React.ReactElement);
    const comps = findAll(tree, (el) => typeof el.type === 'function' && !!el.props.spec && typeof el.props.color === 'string');
    const btn = (label: string): Found => {
      const c = comps.find((x) => x.props.spec.label === label)!;
      expect(c.props.lit).toBe(true);
      const el = (c.type as (p: unknown) => React.ReactElement)(c.props);
      return { type: el.type, props: el.props as Record<string, any> };   // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    btn('BANK B').props.onPointerDown({ pointerType: 'touch', pressure: 0.5, width: 1, height: 1 });
    btn('▶ PLAY').props.onPointerDown({ pointerType: 'touch', pressure: 0.5, width: 1, height: 1 });
    expect(sent).toEqual([['bank_B'], ['play']]);
    expect(vibrate).toHaveBeenCalledTimes(2);
    // and the pads are handed no `lit` at all beyond false (never on): their press is P5's
    expect(comps.filter((x) => /^pad_/.test(x.props.spec.action)).every((x) => x.props.lit === false)).toBe(true);
  });
});
