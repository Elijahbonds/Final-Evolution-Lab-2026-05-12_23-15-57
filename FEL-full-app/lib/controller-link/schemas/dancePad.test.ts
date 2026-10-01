// MUSIC-SUITE P9 (2026-09-29): the Cypher's phone DANCE PAD (owner decision #16: "dance gets a 4-move pad + song pick") —
// registry.ts dance_pad. Its four buttons are the freestyle pad's four moves (named and coloured from their sources, so
// they cannot drift), hold buttons (a freeze hold ends on the release), P5's opt-in buzz and nothing else; the d-pad is the
// song pick; and what a phone sends reaches the room as a pad's own face buttons and d-pad (modeBridge → the room's input
// edges). The other entries are pinned unchanged by controller-page.test.tsx and padFeel.test.ts.
import { describe, expect, it } from 'vitest';
import { MODE_CONTROLLERS, controllerConfigFor } from './registry';
import { hintsOf } from './padFeel';
import { FREESTYLE_PAD, type PadButton } from '@/lib/babylon/dance/chart';
import { danceMove } from '@/lib/babylon/dance/moves';
import { FAMILY_COLOR } from '@/lib/babylon/core/danceTracks';
import { toInputBus } from '../modeBridge';
import type { InputBus, FelInput } from '@/lib/babylon/core/InputBus';
import { pressEdge } from '@/lib/babylon/dance/freestyle';
import type { TriggerLatch } from '@/lib/babylon/audio/SongClock';
import { roomStateOptIn } from '../roomState';
import type { ButtonSpec, SchemaSpec } from '../types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DancePhonePad, DANCE_PAD_CONFIG, dancePadOffered, padRttMs } from '@/lib/babylon/dance/ui/DancePhonePad';
import { phonePadLink, phonePressBackdateSec } from '@/lib/babylon/dance/phonePadLink';
import { MAX_ONE_WAY_MS } from '@/lib/babylon/music/phonePad';
import { MODE_VERBS } from '@/lib/babylon/ui/modeVerbs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAD = MODE_CONTROLLERS.dance_pad;
const buttons = (): ButtonSpec[] => (PAD.schemas.find((s) => s.kind === 'button') as Extract<SchemaSpec, { kind: 'button' }>).buttons;

describe('registry.ts dance_pad', () => {
  it('a one-phone page of its own; the TV stage\'s `dance` page is still the one TAP', () => {
    expect(controllerConfigFor('dance_pad')).toBe(PAD);
    expect(PAD).toMatchObject({ modeId: 'dance_pad', maxPlayers: 1, askName: false });
    expect(MODE_CONTROLLERS.dance.schemas).toEqual([{ kind: 'button', buttons: [{ action: 'A', label: 'TAP' }] }]);
  });
  it('four move buttons A / B / X / Y: each named for its freestyle move, in its family\'s lane colour, a HOLD button', () => {
    const b = buttons();
    expect(b.map((x) => x.action)).toEqual(['A', 'B', 'X', 'Y']);
    for (const x of b) {
      const move = danceMove(FREESTYLE_PAD[x.action as PadButton])!;
      expect(x.label, x.action).toBe(move.name.toUpperCase());
      expect(x.color, x.action).toBe(FAMILY_COLOR[move.category]);
      expect(x.hold, x.action).toBe(true);
    }
    expect(new Set(b.map((x) => x.color)).size).toBe(4);   // four instruments, four colours
  });
  it('the song pick is the d-pad, forwarded as the pick screen\'s own d-pad', () => {
    expect(PAD.schemas.filter((s) => s.kind === 'dpad')).toEqual([{ kind: 'dpad', dpad: { action: 'dpad' } }]);
  });
  it('P5\'s opt-in hints: the buzz, and only the buzz; no room state', () => {
    expect(hintsOf(PAD.schemas)).toEqual({ haptics: true });
    expect(roomStateOptIn(PAD)).toBe(false);
  });
});

describe('what a phone sends reaches the room as a pad would', () => {
  const drive = (actions: [string, unknown?][]): FelInput[] => {
    const got: FelInput[] = [];
    const sink = toInputBus({ emit: (e: FelInput) => { got.push(e); } } as unknown as InputBus);
    for (const [a, p] of actions) sink({ a, p, t: 0 });
    return got;
  };
  it('a move button is a real press and a real release (a freeze hold can end on it); the d-pad is the d-pad', () => {
    expect(drive([['A:down'], ['A:up'], ['Y:down'], ['Y:up']])).toEqual([
      { t: 'button', btn: 'A', pressed: true }, { t: 'button', btn: 'A', pressed: false },
      { t: 'button', btn: 'Y', pressed: true }, { t: 'button', btn: 'Y', pressed: false },
    ]);
    expect(drive([['dpad', { dir: 'right', pressed: true }], ['dpad', { dir: 'up', pressed: true }]])).toEqual([
      { t: 'dpad', dir: 'right', pressed: true }, { t: 'dpad', dir: 'up', pressed: true },
    ]);
  });
  it('the room\'s input edges read them exactly as a pad\'s face buttons: a press from the key, then its release', () => {
    let latch: TriggerLatch = 'up';
    const edges = drive([['A:down'], ['A:up'], ['X:down'], ['X:up'], ['dpad', { dir: 'left', pressed: true }]]).map((e) => {
      const r = pressEdge(latch, e); latch = r.latch; return [r.down, r.up];
    });
    expect(edges).toEqual([['A', null], [null, 'A'], ['X', null], [null, 'X'], [null, null]]);
  });
});

describe('the room offers the pad (lib/babylon/dance/ui/DancePhonePad.tsx, mounted by the dance room\'s host)', () => {
  it('serves registry.ts dance_pad, and renders the shared pairing badge — lazy: no room until it is tapped', () => {
    expect(DANCE_PAD_CONFIG).toBe(PAD);
    const html = renderToStaticMarkup(createElement(DancePhonePad, { bus: { emit: () => {} } as unknown as InputBus, playing: false }));
    expect(html).toContain('data-testid="host-lobby-badge"');
    expect(html).toContain('CONNECT A CONTROLLER');
    expect(html).not.toMatch(/ · [A-Z0-9]{4,8}</);   // no room code: nothing opened on render
  });
});

// ── MUSIC-SUITE P9 FIX PASS (2026-09-29) ─────────────────────────────────────────────────────────────────────────────
describe('P9 FIX PASS: the touch rig is the same four-move pad', () => {
  it('A / B / X / Y on the touch overlay are the freestyle pad\'s moves, labelled as the phone labels them, each its own button', () => {
    const cfg = MODE_VERBS.dance;
    (['A', 'B', 'X', 'Y'] as PadButton[]).forEach((k, i) => {
      const b = cfg.buttons[i];
      expect(b.emit, k).toEqual({ t: 'button', btn: k, pressed: true });
      expect(b.hold, k).toBeFalsy();                                           // a plain button: press AND release both fire
      expect(b.label, k).toBe(danceMove(FREESTYLE_PAD[k])!.name.toUpperCase());
      expect(b.label, k).toBe(buttons().find((x) => x.action === k)!.label);  // the phone pad's own words
    });
  });
});

describe('P9 FIX PASS: a phone press is corrected like PERFORM\'s in free play — and never offered in the Arena', () => {
  it('phonePressBackdateSec: half the round trip, capped as PERFORM caps it; nothing in an Arena run or with no measurement', () => {
    expect(phonePressBackdateSec(60, false)).toBeCloseTo(0.03, 9);
    expect(phonePressBackdateSec(400, false)).toBeCloseTo(MAX_ONE_WAY_MS / 1000, 9);
    expect(phonePressBackdateSec(60, true)).toBe(0);
    expect(phonePressBackdateSec(null, false)).toBe(0);
    expect(phonePressBackdateSec(Number.NaN, false)).toBe(0);
  });

  it('deliver marks exactly the synchronous emit as the phone\'s (and restores what was there), with its round trip', () => {
    const seen: ({ rttMs: number | null } | null)[] = [];
    expect(phonePadLink.current()).toBeNull();
    phonePadLink.deliver(48, () => { seen.push(phonePadLink.current()); phonePadLink.deliver(null, () => seen.push(phonePadLink.current())); seen.push(phonePadLink.current()); });
    expect(seen).toEqual([{ rttMs: 48 }, { rttMs: null }, { rttMs: 48 }]);
    expect(phonePadLink.current()).toBeNull();
    expect(() => phonePadLink.deliver(10, () => { throw new Error('a listener threw'); })).toThrow();
    expect(phonePadLink.current()).toBeNull();                               // never left marked
  });

  it('arm / disarm: the pick screen waits while the pad is being paired', () => {
    phonePadLink.disarm();
    expect(phonePadLink.armed()).toBe(false);
    phonePadLink.arm();
    expect(phonePadLink.armed()).toBe(true);
    phonePadLink.disarm();
    expect(phonePadLink.armed()).toBe(false);
  });

  it('the pad is hidden on ?arena=, and corrects by the connected phone\'s measured round trip', () => {
    expect(dancePadOffered('')).toBe(true);
    expect(dancePadOffered('?track=battle')).toBe(true);
    expect(dancePadOffered('?arena=cm_duel_1')).toBe(false);
    const peer = (rttMs: number | null, connected = true) => ({ peerId: 'p' as never, name: 'x', slot: 0, ready: true, rttMs, connected });
    expect(padRttMs([])).toBeNull();
    expect(padRttMs([peer(40, false), peer(null), peer(55)])).toBe(55);
  });

  it('the room judges a phone press earlier by it, counts phone presses, and the pad delivers every event through the link', () => {
    const room = readFileSync(join(process.cwd(), 'lib/babylon/modes/DanceMode.ts'), 'utf8');
    expect(room).toContain('const phoneBack = phone ? phonePressBackdateSec(phone.rttMs, !!arena) : 0;');
    expect(room).toContain('const heard = clock.song(a) - latencySec - phoneBack;');
    expect(room).toContain('const heardNow = clock.song(ac) - latencySec - phoneBack;');
    const pad = readFileSync(join(process.cwd(), 'lib/babylon/dance/ui/DancePhonePad.tsx'), 'utf8');
    expect(pad).toContain('phonePadLink.deliver(rtt.current, () => sink(ev))');
    expect(pad).toContain('phonePadLink.deliver(rtt.current, () => bus.emit(e))');
    expect(pad).toContain('onPointerDownCapture={() => phonePadLink.arm()}');
  });
});
