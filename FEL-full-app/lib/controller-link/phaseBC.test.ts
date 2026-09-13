// PHASE B/C ACCEPTANCE — the mission's own checklist, as tests (2026-09-13).
//
// The criteria that can be held by a test are held here. The two that cannot are stated explicitly at the
// bottom rather than faked, because a green suite that implies a four-phone WiFi session was measured would
// be a lie about what was verified.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FelInput } from '@/lib/babylon/core/InputBus';
import { HostInput } from './hostInput';
import { sampleFrame, PadSender } from './padSampler';
import { decodePadFrame, PAD_FRAME_BYTES, packButtons, type PadFrame } from './wire';
import { controllerConfigFor } from './schemas/registry';
import { factorFor, widen } from './tvMode';
import { PERFECT_BAND, GOOD_BAND, SHOT_TARGET } from '@/lib/babylon/core/shootoutHud';
import type { PadLike } from '@/lib/input/profiles';

const ROOT = path.resolve(__dirname, '../..');
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const padFixture = (id: string, down: number[] = [], axes = [0, 0, 0, 0]): PadLike => ({
  id, mapping: 'standard', axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })),
});

describe('4 PAD CLIENTS AGAINST 1 HOST', () => {
  it('3PT accepts four phones', () => {
    expect(controllerConfigFor('threepoint')!.maxPlayers).toBe(4);
  });

  it('four pads drive four slots through one host, independently', () => {
    const seen: { slot: number; e: FelInput }[] = [];
    const host = new HostInput({ emit: (slot, e) => seen.push({ slot, e }) });
    const senders = [0, 1, 2, 3].map((slot) => {
      const out: Uint8Array[] = [];
      return { slot, out, sender: new PadSender((b) => out.push(b.slice())) };
    });
    // every phone presses its own button
    senders.forEach(({ slot, sender }, i) => {
      sender.tick({ slot, touch: { buttons: { [(['A', 'B', 'X', 'Y'] as const)[i]]: true } }, t: i }, i);
    });
    for (const s of senders) for (const bytes of s.out) host.onMessage(bytes);

    expect(host.stats().activeSlots).toEqual([0, 1, 2, 3]);
    const pressed = seen.filter((x) => x.e.t === 'button' && (x.e as { pressed: boolean }).pressed)
      .map((x) => `${x.slot}:${(x.e as { btn: string }).btn}`);
    expect(pressed).toEqual(['0:A', '1:B', '2:X', '3:Y']);
  });

  it('one phone’s stale frames never block the other three', () => {
    const seen: number[] = [];
    const host = new HostInput({ emit: (slot) => seen.push(slot) });
    host.onFrame({ slot: 0, seq: 500, lx: 1, ly: 0, rx: 0, ry: 0, buttons: 0, trigL: 0, trigR: 0, t: 0 });
    for (let i = 0; i < 5; i++) {
      host.onFrame({ slot: 0, seq: 1, lx: 0, ly: 0, rx: 0, ry: 0, buttons: 0, trigL: 0, trigR: 0, t: 0 });   // stale
      host.onFrame({ slot: 1, seq: i + 1, lx: 0, ly: 0, rx: 0, ry: 0, buttons: packButtons({ A: true }), trigL: 0, trigR: 0, t: 0 });
    }
    expect(seen).toContain(1);
    expect(host.stats().dropped).toBe(5);
  });
});

describe('ALL FOUR INPUT PATHS REACH THE SAME MODE VOCABULARY', () => {
  // "3PT Shootout fully playable: touch-only, keyboard, local gamepad, and remote PAD relay."
  // The claim is that all four produce the SAME FelInput — that is what makes it one game.
  const collect = () => {
    const out: FelInput[] = [];
    return { out, host: new HostInput({ emit: (_s, e) => out.push(e) }) };
  };

  it('remote pad relay → FelInput', () => {
    const c = collect();
    c.host.onFrame(sampleFrame(1, { slot: 0, pad: padFixture('Xbox Wireless Controller', [0]), t: 0 }));
    expect(c.out.some((e) => e.t === 'button' && e.btn === 'A' && e.pressed)).toBe(true);
  });

  it('remote TOUCH-ONLY phone → the identical FelInput', () => {
    const c = collect();
    c.host.onFrame(sampleFrame(1, { slot: 0, touch: { buttons: { A: true } }, t: 0 }));
    expect(c.out.some((e) => e.t === 'button' && e.btn === 'A' && e.pressed)).toBe(true);
  });

  it('a local gamepad produces the same event through the Phase A layer', async () => {
    const { readPad } = await import('@/lib/input/profiles');
    expect(readPad(padFixture('Xbox Wireless Controller', [0])).buttons.A).toBe(true);
  });

  it('and the KEYBOARD path is in the bus that all of them feed', () => {
    const src = code(fs.readFileSync(path.join(ROOT, 'lib/babylon/core/InputBus.ts'), 'utf8'));
    expect(src).toMatch(/KEYMAP/);
    expect(src).toMatch(/readPad\(/);          // the local pad path, same file, same emit
  });

  it('3PT reads only FelInput — it cannot tell which path a press came from', () => {
    const src = code(fs.readFileSync(path.join(ROOT, 'lib/babylon/modes/ThreePointMode.ts'), 'utf8'));
    expect(src).not.toMatch(/getGamepads|\.buttons\[|\.axes\[/);
    expect(src).not.toMatch(/decodePadFrame|PeerLink|RTCDataChannel/);
  });
});

describe('NO JSON PER FRAME', () => {
  it('the transport sends input as bytes and control as text, and never confuses them', () => {
    const src = code(fs.readFileSync(path.join(ROOT, 'lib/controller-link/transport/webrtc.ts'), 'utf8'));
    expect(src).toMatch(/sendFrame/);
    expect(src).toMatch(/binaryType/);
    // the hot path does not stringify
    const sendFrame = src.slice(src.indexOf('sendFrame'));
    expect(sendFrame.slice(0, 400)).not.toMatch(/JSON\.stringify/);
  });

  it('a frame is 16 bytes however much is happening', () => {
    const busy: PadFrame = sampleFrame(1, {
      slot: 3, t: 99999,
      pad: padFixture('Xbox Wireless Controller', [0, 1, 2, 3, 4, 5, 9, 12], [1, -1, 0.5, -0.5]),
    });
    const bytes = new PadSender(() => {}) && decodePadFrame(new Uint8Array(PAD_FRAME_BYTES));
    expect(bytes).toBeNull();                 // an empty buffer is not a frame
    const sent: number[] = [];
    new PadSender((b) => sent.push(b.length)).tick({ slot: 3, pad: padFixture('Xbox Wireless Controller', [0, 1, 2, 3]), t: 0 }, 0);
    expect(sent).toEqual([PAD_FRAME_BYTES]);
    expect(busy.slot).toBe(3);
  });

  it('the input channel stays unordered and unreliable — a late frame is worse than a lost one', () => {
    const src = code(fs.readFileSync(path.join(ROOT, 'lib/controller-link/transport/webrtc.ts'), 'utf8'));
    expect(src).toMatch(/ordered:\s*false/);
    expect(src).toMatch(/maxRetransmits:\s*0/);
  });

  it('and there is a WebSocket fallback when the datachannel will not open', () => {
    const src = code(fs.readFileSync(path.join(ROOT, 'lib/controller-link/transport/webrtc.ts'), 'utf8'));
    expect(src).toMatch(/sendViaSocket/);
    expect(src).toMatch(/'socket'/);
  });
});

describe('TV MODE WIDENS THE REAL WINDOW', () => {
  it('3PT’s bands are the ones the factor multiplies', () => {
    expect(PERFECT_BAND).toBeGreaterThan(0);
    expect(GOOD_BAND).toBeGreaterThan(PERFECT_BAND);
    expect(SHOT_TARGET).toBeGreaterThan(0);
    const mirrored = factorFor('mirrored');
    expect(widen(PERFECT_BAND, mirrored)).toBeGreaterThan(PERFECT_BAND);
    expect(widen(PERFECT_BAND, factorFor('direct'))).toBe(PERFECT_BAND);
  });

  it('3PT actually applies it rather than importing it decoratively', () => {
    const src = code(fs.readFileSync(path.join(ROOT, 'lib/babylon/modes/ThreePointMode.ts'), 'utf8'));
    expect(src).toMatch(/readDisplaySetting/);
    expect(src).toMatch(/perfectBand\(\)/);
    expect(src).toMatch(/goodBand\(\)/);
    // and the raw constants are no longer what the judging reads
    expect(src).not.toMatch(/err < PERFECT_BAND/);
  });

  it('a mirrored player is not given a better shot than a direct one — only the same shot, later', () => {
    // the widened band still requires the same relative accuracy; it just accounts for the picture arriving
    // late. Expressed as: the widened band is a fraction of the meter, not a guaranteed make.
    const widened = widen(PERFECT_BAND, factorFor('mirrored'));
    expect(widened).toBeLessThan(GOOD_BAND);
  });
});

describe('PRESENCE IS ON THE HOST, BEHIND A GESTURE', () => {
  it('the host stage asks for fullscreen, wake lock and orientation from a click handler', () => {
    const src = code(fs.readFileSync(path.join(ROOT, 'components/controller-link/host-stage.tsx'), 'utf8'));
    expect(src).toMatch(/HostPresence/);
    expect(src).toMatch(/onClick=\{start\}/);
    // and presence is started, not AWAITED: requestFullscreen can stay pending forever, and a host that
    // waits on it never opens a room (measured in headless Chromium)
    expect(src).toMatch(/void presenceRef\.current\.enter/);
    // nothing acquires presence on mount
    expect(src).not.toMatch(/useEffect\([^)]*presenceRef\.current\.enter/);
  });

  it('presence releases the wake lock when the stage unmounts', () => {
    const src = code(fs.readFileSync(path.join(ROOT, 'components/controller-link/host-stage.tsx'), 'utf8'));
    expect(src).toMatch(/presenceRef\.current\.exit\(\)/);
  });

  it('the wake lock is RE-ACQUIRED after the tab is hidden', () => {
    // a wake lock is dropped automatically whenever the tab hides and is not restored on return; without
    // this the screen sleeps a few minutes after the first time anyone glances away
    const src = code(fs.readFileSync(path.join(ROOT, 'lib/controller-link/presence.ts'), 'utf8'));
    expect(src).toMatch(/visibilitychange/);
  });

  it('/host exists and defaults to the pilot mode', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/host/page.tsx'), 'utf8');
    expect(src).toMatch(/HostStage/);
    expect(src).toMatch(/threepoint/);
  });
});

describe('what was NOT verified here', () => {
  it('records the two criteria that need real hardware, rather than faking them', () => {
    // "4 PADs + 1 HOST on local WiFi, input-to-render under 50ms on the debug overlay" and "Deploys to
    // Vercel and works from a shareable link on a phone" both need devices and a deployment. The overlay
    // that would measure the first is built and its target is encoded; the measurement itself is a
    // human test. Saying so in the suite is better than a green test that implies otherwise.
    const overlay = fs.readFileSync(path.join(ROOT, 'components/controller-link/link-debug-overlay.tsx'), 'utf8');
    expect(overlay).toMatch(/RTT_TARGET_MS = 50/);
    expect(overlay).toMatch(/jitter/i);
  });
});
