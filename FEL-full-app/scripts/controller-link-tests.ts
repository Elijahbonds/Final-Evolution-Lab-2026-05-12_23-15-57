// Headless proof for Controller Link's pure logic.
//
// The WebRTC handshake itself needs two real browser contexts and was verified
// live (join → connect → input → drop → rejoin-to-same-slot). What is proved
// here is everything that can be made deterministic: the signaling store's
// routing and reconnect semantics, the tilt→charge maths, the mode-bridge
// mapping, and the room-code alphabet.

import { makeRoomCode } from '../lib/controller-link/codes';
import { getSignalStore } from '../lib/controller-link/signalStore';
import { TiltCharge } from '../lib/controller-link/schemas/motion';
import { toInputBus } from '../lib/controller-link/modeBridge';
import type { FelInput } from '../lib/babylon/core/InputBus';
import type { InputBus } from '../lib/babylon/core/InputBus';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

async function main(): Promise<void> {
  // ── A. room codes ────────────────────────────────────────────────────────
  const codes = Array.from({ length: 400 }, () => makeRoomCode());
  ok(codes.every((c) => c.length === 4), 'A1 codes are 4 chars');
  // These get read off a TV across a room; 0/O and 1/I/L are support tickets.
  ok(codes.every((c) => !/[01OIL]/.test(c)), 'A2 alphabet excludes ambiguous glyphs');
  ok(new Set(codes).size > 380, 'A3 codes are not colliding wholesale');

  // ── B. signaling store routing ───────────────────────────────────────────
  const store = getSignalStore();
  await store.createRoom('TEST', 'threepoint', 'host-1');
  ok((await store.getRoom('TEST')) !== null, 'B1 room is retrievable after create');
  ok((await store.getRoom('NOPE')) === null, 'B2 unknown room is null');

  await store.push('TEST', { from: 'phone-1', to: 'host', data: { hello: 1 } });
  await store.push('TEST', { from: 'host', to: 'phone-1', data: { offer: 1 } });

  const hostInbox = await store.poll('TEST', 'host', 0);
  ok(hostInbox.length === 1, `B3 host sees only its own mail (got ${hostInbox.length})`);
  ok((hostInbox[0].data as { hello?: number }).hello === 1, 'B4 host got the hello');

  const phoneInbox = await store.poll('TEST', 'phone-1', 0);
  ok(phoneInbox.length === 1 && (phoneInbox[0].data as { offer?: number }).offer === 1,
    'B5 phone sees only the offer');

  // `after` is what stops a poller re-reading the same message forever.
  ok((await store.poll('TEST', 'host', hostInbox[0].seq)).length === 0,
    'B6 after-cursor suppresses already-read messages');

  // ── C. reconnect keeps ONE peer, not a ghost ─────────────────────────────
  await store.addPeer('TEST', 'phone-1', 'Elijah');
  await store.addPeer('TEST', 'phone-1', 'Elijah');   // the reconnect
  const room = await store.getRoom('TEST');
  ok(room?.peers.length === 1, `C1 reconnecting peer is not duplicated (got ${room?.peers.length})`);
  await store.addPeer('TEST', 'phone-2', 'Sam');
  ok((await store.getRoom('TEST'))?.peers.length === 2, 'C2 a genuinely new peer is added');

  // ── D. tilt charge ───────────────────────────────────────────────────────
  const t = new TiltCharge(40);
  ok(t.update(0) === 0, 'D1 no tilt is no charge');
  ok(!t.armed, 'D2 not armed before a real wind-up');
  t.update(20);
  ok(t.armed, 'D3 armed once pulled back');
  const peak = t.update(40);
  ok(Math.abs(peak - 1) < 1e-9, 'D4 full tilt is full charge');
  // The peak is the point: releasing past the top must not lose the wind-up.
  ok(Math.abs(t.update(5) - 1) < 1e-9, 'D5 charge holds the PEAK, not the instant angle');
  ok(Math.abs(t.release() - 1) < 1e-9, 'D6 release returns the peak');
  ok(t.update(0) === 0 && !t.armed, 'D7 release resets for the next shot');
  ok(new TiltCharge(40).update(100) === 1, 'D8 charge clamps at 1');

  // ── E. mode bridge → FelInput ────────────────────────────────────────────
  const seen: FelInput[] = [];
  const fakeBus = { emit: (i: FelInput) => { seen.push(i); } } as unknown as InputBus;
  const feed = toInputBus(fakeBus);

  feed({ a: 'shoot', t: 0 });
  ok(seen.length === 2 && seen[0].t === 'button' && seen[1].t === 'button',
    'E1 a tap emits press AND release');
  ok(seen[0].t === 'button' && seen[0].pressed && seen[1].t === 'button' && !seen[1].pressed,
    'E2 press comes before release');

  seen.length = 0;
  feed({ a: 'charge', p: 0.5, t: 0 });
  ok(seen.length === 1 && seen[0].t === 'trigger' && seen[0].value === 0.5,
    'E3 charge maps to the right trigger');

  seen.length = 0;
  feed({ a: 'charge', p: 9, t: 0 });
  ok(seen[0].t === 'trigger' && seen[0].value === 1, 'E4 charge is clamped to 0..1');

  seen.length = 0;
  feed({ a: 'dpad', p: { dir: 'left', pressed: true }, t: 0 });
  ok(seen.length === 1 && seen[0].t === 'dpad' && seen[0].dir === 'left' && seen[0].pressed,
    'E5 dpad payload maps through');

  seen.length = 0;
  feed({ a: 'X:down', t: 0 });
  feed({ a: 'X:up', t: 0 });
  ok(seen.length === 2 && seen[0].t === 'button' && seen[0].btn === 'X' && seen[0].pressed,
    'E6 hold down maps to a held button');
  ok(seen[1].t === 'button' && seen[1].btn === 'X' && !seen[1].pressed, 'E7 hold up releases it');

  // A HELD CHARGE must stay analog. This is the fallback a phone lands on when
  // it denies motion permission, and 'charge' is not a face button — it fell
  // through to normalizeBtn(), which maps every unknown action to 'A', so
  // holding CHARGE on such a phone fired SLAM instead. No error, just the wrong
  // verb: the same silent-degradation shape as the Karate VS verb-key bug, so
  // it gets the same treatment — a permanent guard rather than only a fix.
  seen.length = 0;
  feed({ a: 'charge:down', t: 0 });
  ok(seen.length >= 1 && seen[0].t === 'trigger',
    'E8 a HELD charge stays a trigger — never a face button');
  ok(!seen.some((i) => i.t === 'button'),
    'E9 a held charge emits no button press (SLAM must not fire from CHARGE)');
  await new Promise((r) => setTimeout(r, 260));
  const ramped = seen.filter((i) => i.t === 'trigger') as Extract<FelInput, { t: 'trigger' }>[];
  ok(ramped.length >= 3 && ramped[ramped.length - 1].value > ramped[0].value,
    `E10 a held charge RAMPS like the keyboard does (${ramped.length} samples)`);
  seen.length = 0;
  feed({ a: 'charge:up', t: 0 });
  ok(seen.length === 1 && seen[0].t === 'trigger' && seen[0].value === 0,
    'E11 releasing charge emits trigger 0 — the launch edge every mode watches');
  await new Promise((r) => setTimeout(r, 200));
  ok(seen.length === 1, 'E12 the ramp stops on release — no leaked timer');

  // ── report ───────────────────────────────────────────────────────────────
  if (fail.length) {
    console.error(`controller-link-tests: ${fail.length} FAILED of ${checks}`);
    for (const f of fail) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`controller-link-tests: ${checks} checks green`);
}

void main();
