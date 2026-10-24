// dancePad.test.ts — lane/dance-extras-2 (owner 2026-10-24): the phone as a SECOND-SCREEN DANCE PAD for the Cypher (Controller Link).
//
// The `dance` entry of the controller registry was one TAP button. It is now the on-glass pad (lib/babylon/dance/ui/DancePad.tsx) in
// Controller Link's own kinds — four HOLD buttons and the d-pad — and this file holds it to that pad:
//   1. the layout: the four buttons are the on-glass pad's in MATCH (padModel.padButtons), named for the same families, in the
//      MODE_VERBS.dance slot colours, held (a freeze is a held thumb), buzzing; the d-pad is forwarded as the d-pad;
//   2. EACH PAD BUTTON REACHES DANCEMODE AS THE SAME INPUT THE ON-GLASS PAD SENDS: the phone's press, as the controller page sends it
//      (padFeel.pressMessage / holdActions) and the host turns it into FelInput (modeBridge.toInputBus), is the on-glass button's own
//      down / up event — and a whole chart danced on each, through the room's input chain (tests/helpers/dancePressChain, which
//      dancePadWiring.test.ts pins to DanceMode's source), is judged identically, MATCH on and off, freestyle sections included;
//   3. the pick screen from the phone: ◀ ▶ ▲ ▼ are the on-glass pick keys, A / B start, Y is MATCH, X is FREE DANCE;
//   4. COUCH (FN-0, #383): in a couch room the same layout goes to every phone (couchControllerConfig), and a seated phone's press
//      reaches its seat — seat 1's also the merged stream the room reads — as that same event; a waiting phone's reaches nobody.
import { describe, expect, it } from 'vitest';
import type { FelInput, InputBus } from '@/lib/babylon/core/InputBus';
import { MODE_VERBS } from '@/lib/babylon/ui/modeVerbs';
import { DEFAULT_PAD_STATE, PAD_SLOTS, padButtons, pickEvent, verbFor, PICK_KEYS, type DancePadState, type PadSlot } from '@/lib/babylon/dance/ui/padModel';
import { buttonForStep } from '@/lib/babylon/dance/chartPlay';
import { freeDanceSlot } from '@/lib/babylon/dance/freeDance';
import { beatDuration } from '@/lib/babylon/core/DanceCore';
import { DEFAULT_TRACK_ID, freeSpansFor, stepsFor, styleBeatsFor, trackById } from '@/lib/babylon/core/danceTracks';
import { danceTap } from '@/lib/babylon/audio/SongClock';
import { runChain, sampleSteps, type TimedInput } from '@/tests/helpers/dancePressChain';
import { toInputBus } from '../modeBridge';
import { MODE_CONTROLLERS, controllerConfigFor, isControllerEnabled } from './registry';
import { holdActions } from './button';
import { dpadPayload, type Dir } from './dpad';
import { hintsOf, pressMessage } from './padFeel';
import { CouchSession, COUCH_ROOM_PHONES } from '@/lib/party/seats';
import { couchControllerConfig } from '@/components/controller-link/host-stage';
import type { ButtonSpec, ModeControllerConfig } from '../types';

const dance = MODE_CONTROLLERS.dance;
const buttonsSchema = () => dance.schemas.find((s) => s.kind === 'button') as Extract<ModeControllerConfig['schemas'][number], { kind: 'button' }>;
const specOf = (slot: PadSlot): ButtonSpec => buttonsSchema().buttons.find((b) => b.action === slot)!;
const glass = (mode: DancePadState['mode'], extra: Partial<DancePadState> = {}) => padButtons({ ...DEFAULT_PAD_STATE, mode, ...extra });

/** The phone's events, as the host turns them into FelInput (one adapter, as HostStage keeps one per phone). */
function phoneBridge() {
  const out: FelInput[] = [];
  const sink = toInputBus({ emit: (e: FelInput) => out.push(e) } as InputBus);
  /** What the controller page sends for a button press (ActionButton → pressMessage, the schema's hints) and release. */
  const down = (slot: PadSlot): FelInput[] => { const n = out.length; const [a] = pressMessage(specOf(slot), hintsOf(dance.schemas), null); sink({ a, t: 0 }); return out.slice(n); };
  const up = (slot: PadSlot): FelInput[] => { const n = out.length; sink({ a: holdActions(specOf(slot)).up, t: 0 }); return out.slice(n); };
  const dpad = (dir: Dir, pressed: boolean): FelInput[] => { const n = out.length; sink({ a: 'dpad', p: dpadPayload(dir, pressed), t: 0 }); return out.slice(n); };
  return { down, up, dpad };
}

describe('the dance entry is the on-glass pad, in Controller Link\'s own kinds', () => {
  it('enabled, keyed by its own id, one dancer: four HOLD buttons A B X Y that buzz (no velocity), then the d-pad', () => {
    expect(isControllerEnabled('dance')).toBe(true);
    expect(controllerConfigFor('dance')).toBe(dance);
    expect(dance.modeId).toBe('dance');
    expect(dance.maxPlayers).toBe(1);
    expect(dance.schemas.map((s) => s.kind)).toEqual(['button', 'dpad']);
    const b = buttonsSchema();
    expect(b.buttons.map((x) => x.action)).toEqual([...PAD_SLOTS]);
    expect(b.buttons.every((x) => x.hold === true)).toBe(true);
    expect(hintsOf(dance.schemas)).toEqual({ haptics: true });
    expect(dance.schemas.find((s) => s.kind === 'dpad')).toEqual({ kind: 'dpad', dpad: { action: 'dpad' } });
    expect(dance.roomState).toBeUndefined();   // the phone draws no room state: its labels are the MATCH families, which never change
  });

  it('each button is named for the families the on-glass pad prints on it in MATCH, in the slot colour MODE_VERBS.dance gives it', () => {
    for (const g of glass('match')) {
      const spec = specOf(g.slot);
      expect(spec.label, g.slot).toBe(`${g.slot} · ${g.sub}`);
      expect(spec.color, g.slot).toBe(verbFor(g.slot).color);
      expect(spec.color, g.slot).toBe(g.color);
    }
    expect(specOf('A').label).toBe('A · TOP ROCK · BOUNCE');
    expect(specOf('Y').label).toBe('Y · FREEZE · HOLD');
  });
});

describe('EACH PAD BUTTON REACHES DANCEMODE AS THE SAME INPUT THE ON-GLASS PAD SENDS', () => {
  it('a phone press is the on-glass button\'s own down event, and its lift that button\'s up — the gamepad\'s face button, no src', () => {
    const phone = phoneBridge();
    for (const g of glass('match')) {
      expect(phone.down(g.slot), g.slot).toEqual([g.down]);
      expect(phone.up(g.slot), g.slot).toEqual([g.up]);
      expect(g.down).toEqual(MODE_VERBS.dance.buttons[PAD_SLOTS.indexOf(g.slot)].emit);
      expect(g.down).toEqual({ t: 'button', btn: g.slot, pressed: true });
    }
  });

  it('the room reads them alike: the same tap (danceTap), the same MATCH button, the same free-dance move', () => {
    const phone = phoneBridge();
    for (const g of glass('match')) {
      const [p] = phone.down(g.slot);
      expect(danceTap('up', p)).toEqual(danceTap('up', g.down!));
      expect(freeDanceSlot(p, danceTap('up', p).tap)).toBe(g.slot);
      phone.up(g.slot);
    }
  });

  /** A run that presses each step's MATCH button on the beat and lets go after half a beat (a freeze is held to its end). */
  function dance1(steps: ReturnType<typeof sampleSteps>, bpm: number, events: (slot: PadSlot, down: boolean) => FelInput[], off = 0): TimedInput[] {
    const bd = beatDuration(bpm);
    const out: TimedInput[] = [];
    steps.forEach((s, i) => {
      const slot = buttonForStep(s);
      const at = s.beat * bd + off * ((i % 3) - 1);   // early, dead on, late
      const lift = at + (slot === 'Y' ? s.holdBeats * bd : bd / 2);
      for (const ev of events(slot, true)) out.push({ at, ev });
      for (const ev of events(slot, false)) out.push({ at: lift, ev });
    });
    return out;
  }
  const onGlass = (slot: PadSlot, down: boolean): FelInput[] => { const g = glass('match').find((x) => x.slot === slot)!; return [down ? g.down! : g.up!]; };

  it('a whole chart, MATCH on and off, danced on the glass and on the phone: judged identically (labels, score, combo, STYLE)', () => {
    for (const match of [true, false]) {
      for (const off of [0, 0.03]) {
        const phone = phoneBridge();
        const viaPhone = (slot: PadSlot, down: boolean) => (down ? phone.down(slot) : phone.up(slot));
        const a = runChain({ steps: sampleSteps(), bpm: 120, match, inputs: dance1(sampleSteps(), 120, onGlass, off) });
        const b = runChain({ steps: sampleSteps(), bpm: 120, match, inputs: dance1(sampleSteps(), 120, viaPhone, off) });
        expect(b, `match ${match} off ${off}`).toEqual(a);
        expect(a.counts.PERFECT + a.counts.GREAT + a.counts.GOOD, `match ${match}`).toBeGreaterThan(0);
      }
    }
  });

  it('a shipped song with its STYLE beats and FREESTYLE sections: the phone dances exactly the moves the glass does', () => {
    const track = trackById(DEFAULT_TRACK_ID);
    const steps = stepsFor(track)!;
    const styleBeats = styleBeatsFor(track) ?? [];
    const freeSpans = freeSpansFor(track);
    const phone = phoneBridge();
    const viaPhone = (slot: PadSlot, down: boolean) => (down ? phone.down(slot) : phone.up(slot));
    // the chart, plus a press of every button on every beat of each freestyle section
    const bd = beatDuration(track.bpm);
    const extra = (events: (slot: PadSlot, down: boolean) => FelInput[]): TimedInput[] => freeSpans.flatMap((s) => {
      const out: TimedInput[] = [];
      for (let beat = s.start; beat < s.end; beat++) {
        const slot = PAD_SLOTS[beat % 4];
        for (const ev of events(slot, true)) out.push({ at: beat * bd + 0.01, ev });
        for (const ev of events(slot, false)) out.push({ at: beat * bd + bd / 3, ev });
      }
      return out;
    });
    const a = runChain({ steps, bpm: track.bpm, match: true, styleBeats, freeSpans, inputs: [...dance1(steps, track.bpm, onGlass), ...extra(onGlass)] });
    const b = runChain({ steps, bpm: track.bpm, match: true, styleBeats, freeSpans, inputs: [...dance1(steps, track.bpm, viaPhone), ...extra(viaPhone)] });
    expect(b).toEqual(a);
    if (freeSpans.length) expect(a.freestyle).toBeGreaterThan(0);
  });
});

describe('the pick screen from the phone', () => {
  it('the d-pad is the on-glass pick keys: ◀ ▶ songs, ▲ ▼ level — the same d-pad events, pressed and released', () => {
    const phone = phoneBridge();
    for (const k of PICK_KEYS) {
      expect(phone.dpad(k.dir, true), k.dir).toEqual([pickEvent(k.dir, true)]);
      expect(phone.dpad(k.dir, false), k.dir).toEqual([pickEvent(k.dir, false)]);
    }
  });
  it('A and B start, Y is MATCH, X is FREE DANCE: the on-glass pick buttons\' own events', () => {
    const phone = phoneBridge();
    for (const g of glass('pick', { freeDance: false })) {
      expect(g.live, g.slot).toBe(true);
      expect(phone.down(g.slot), g.slot).toEqual([g.down]);
      phone.up(g.slot);
    }
  });
});

describe('COUCH (FN-0, #383): phones join a couch room the way they join every other', () => {
  it('a couch room sends every phone the same pad, lets one past the seats connect, and turns party chat off', () => {
    const couch = couchControllerConfig(dance);
    expect(couch.schemas).toBe(dance.schemas);
    expect(couch).toMatchObject({ modeId: 'dance', maxPlayers: COUCH_ROOM_PHONES, couch: true });
  });
  it('a seated phone\'s press reaches its seat as the on-glass event (seat 1 also the merged stream); a waiting phone\'s reaches nobody', () => {
    const seats = new CouchSession();
    const phones = Array.from({ length: 5 }, (_, i) => ({ peerId: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true }));
    seats.seat([], phones);
    const merged: FelInput[] = [];
    const slots: { slot: number; e: FelInput }[] = [];
    const bus = { emit: (e: FelInput) => merged.push(e), emitSlot: (slot: number, e: FelInput) => slots.push({ slot, e }) };
    const g = glass('match').find((x) => x.slot === 'B')!;
    for (const p of phones) {
      const out: FelInput[] = [];
      toInputBus({ emit: (e: FelInput) => { out.push(e); seats.route(p.peerId, e, bus); } } as InputBus)({ a: 'B:down', t: 0 });
      expect(out).toEqual([g.down]);
    }
    expect(slots).toEqual([0, 1, 2, 3].map((slot) => ({ slot, e: g.down })));   // the fifth phone waits: no seat, no press
    expect(merged).toEqual([g.down]);                                            // seat 1 is the stream the room reads
  });
});
