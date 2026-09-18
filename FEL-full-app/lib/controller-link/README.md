# Controller Link

Play any mode on a big screen while phones join as controllers over a shared
link. No install, no account — a guest scans a QR and is playing.

This is infrastructure. A mode declares which control schemas it wants; the
join flow, lobby, QR, reconnect and controller UI all come for free.

---

## Adding a new mode

**One file.** Add an entry to [`schemas/registry.ts`](./schemas/registry.ts):

```ts
streetball: {
  modeId: 'threevthree',        // must match the Babylon registry key
  title: 'Streetball 3v3',
  maxPlayers: 3,
  askName: true,
  schemas: [
    { kind: 'dpad', dpad: { action: 'dpad' } },
    { kind: 'button', buttons: [
      { action: 'A', label: 'SHOOT' },
      { action: 'B', label: 'PASS' },
      { action: 'X', label: 'STEAL' },
      { action: 'Y', label: 'CHARGE', hold: true },
    ] },
  ],
},
```

Then in the mode's host component:

```tsx
const config = controllerConfigFor('threevthree');
const onInput = useCallback((ev) => { if (busRef.current) toInputBus(busRef.current)(ev); }, []);

{config && <HostLobby config={config} onInput={onInput} collapsed={phase === 'playing'} />}
```

That's it. `toInputBus` maps every controller event onto the same `FelInput`
union the keyboard and touch overlay already emit, so **the mode itself needs no
changes at all** — it cannot tell a phone from a gamepad.

`action` strings are the *mode's own vocabulary*. They are forwarded untouched.

---

## Architecture, and why

```
phone                          server (thin)                 host / TV
─────                          ─────────────                 ─────────
ControllerClient ──HTTP──▶  /api/controller-link/*  ◀──HTTP── HostSession
       │                    (SDP + ICE only, ~2s)                 │
       └──────────── WebRTC DataChannel (P2P) ────────────────────┘
                       gameplay input lives here
```

**Why WebRTC and not the WebSocket relay the brief first reached for:** this app
deploys on Vercel, where every API route is a serverless function that cannot
hold a socket open. A relay would have meant standing up a second always-on
service. WebRTC needs the server only for the handshake — and it is *better* for
the actual goal: on one WiFi the peers connect through host candidates and
packets never leave the LAN, instead of making two internet round trips.

Two data channels:

| Channel | Config | Carries |
|---|---|---|
| `fel-input` | unordered, `maxRetransmits: 0` | gameplay input |
| `fel-control` | ordered, reliable | lobby, slot assignment, hello |

Input is deliberately **unreliable**. For a timing mechanic a late input is worse
than a lost one, and re-sending a stale tilt sample actively hurts.

---

## ⚠️ Before deploying to Vercel

`signalStore.ts` ships an **in-process `Map`**. That is correct for `next dev`
and any single long-lived instance, and it is what the tests and the live
verification ran against. It is **not** correct on Vercel serverless: each
invocation may land in a different isolate with its own empty Map, so a phone's
answer can be written to one instance and read from another that never sees it.

The `SignalStore` interface is the entire seam. Implement it over KV/Redis/
Postgres and call `setSignalStore()` once at startup — nothing else changes.
Entries are small and short-lived, so a KV with TTL is the natural fit.

---

## ⚠️ iOS motion requires HTTPS

`DeviceOrientationEvent.requestPermission()` (iOS 13+) must be called from a real
user gesture **and** requires a secure context. A phone opening
`http://192.168.x.x` over the LAN gets no motion at all — no prompt, no error.

**Serve the controller page over HTTPS even when both devices are on the same
WiFi.** The WebRTC channel still connects peer-to-peer over the LAN, so you keep
the low latency and satisfy the secure-context requirement. The join tap doubles
as the required user gesture.

Every motion schema should ship a button fallback (3PT does) so a denied
permission degrades instead of dead-ending.

---

## Reconnect

The phone persists a `peerId` in `localStorage`. On a WiFi drop it re-announces
with the **same id**, and the host hands back the same player slot rather than
seating a ghost second player. A `RTCPeerConnection` that has reached `failed`
cannot be revived, so reconnect builds a fresh one — the id is what preserves
continuity, not the connection.

Backoff: 500ms → 1s → 2s → 4s → 8s.

---

## Verification status

Live-tested host↔controller in two browser contexts:

- join by code → WebRTC connect → slot assignment (`Connected · P1`)
- 14 `shoot` events delivered, all correctly attributed to P1
- drop → host shows `reconnecting` and **holds the slot** → rejoin returns to P1
- schema-driven UI: motion pad + button fallback rendered from the registry alone

Latency, **loopback on one machine** (not a real phone — see below):

| n | min | mean | p95 | max | channel RTT |
|---|---|---|---|---|---|
| 14 | 0ms | 1ms | 7ms | 7ms | 1ms |

**These are a protocol floor, not WiFi numbers.** Both peers were the same
machine, so this measures serialization + data-channel overhead only. A real
phone on the same WiFi adds the radio round trip — typically ~5–20ms on decent
5GHz, worse on congested 2.4GHz. Read the lobby's ping/pong RTT for the true
figure: it needs no synchronised clock, unlike the send→receive number.

Headless: `npx tsx scripts/controller-link-tests.ts` — 26 checks.

---

## Files

| Path | Role |
|---|---|
| `types.ts` | wire contract |
| `host.ts` | `HostSession` — room, peers, lobby, routing |
| `client.ts` | `ControllerClient` — join, send, reconnect |
| `transport/webrtc.ts` | `PeerLink` — the two data channels |
| `transport/signaling.ts` | HTTP signaling client |
| `signalStore.ts` | server state + the swap seam |
| `modeBridge.ts` | `ControlEvent` → `InputBus` / `FelModeBridge` |
| `schemas/registry.ts` | **the only file a new mode touches** |
| `codes.ts` | room codes, peer identity, join URL |
