# Live remote coaching (COACH-LIVE, 2026-10-25)

Owner's coaching decisions of 2026-10-24, lane 4: **live remote sessions, built in, peer-to-peer on the existing WebRTC
mesh, no paid video service.** Future and Caliber sell video-only remote coaching. Here the coach also sees the client's
**pose skeleton over the video, a live rep count, and form flags** from the Mirror's own audits. 1-on-1 first.

Ships **off**: `NEXT_PUBLIC_COACH_LIVE_ENABLED=1` turns it on (server routes, the page, and the "Go live" / "Live
session" links all read it). Until then every live route and the page are 404s and the links draw nothing.

## What a session is

| | Coach (`/coach/live/p_<programId>`, desktop or tablet) | Client (same link, on a phone) |
|---|---|---|
| Sees | the client's camera video with their skeleton drawn over it, or the skeleton alone (no video: a teen, a client who chose pose only, stalled video, the relay) | their self-view (`SelfView`), the coach's cue in large type, the exercise and how to stand, the set's rep count |
| Hears | the client (mic, echo cancellation on) | the coach |
| Does | picks the exercise (squat, lunge, hip hinge, push-up), starts and stops each set, sends a preset cue, ends the session | joins; for an adult, chooses whether to share video |
| Gets | per set: reps, flagged reps, the flag words ("Knee drifting inward on the descent (left) — reps 3, 6") | — |

**End** posts one message to the program's thread: the sets, reps and flags, worded by the server
(`lib/coach/live/session.ts` `summaryText`). That message is the only thing a session keeps.

## How it works

- **Transport** (`lib/coach/live/link.ts`): one native `RTCPeerConnection`, coach ↔ client, with the party voice mesh's
  own connection numbers (`CONNECT_TIMEOUT_MS`, `DISCONNECTED_GRACE_MS`, `RESTARTS_MAX`) and mic constraints, and the
  party's ICE servers (`partyIceServers`: STUN; TURN with short-lived credentials when `PARTY_TURN_URLS` and
  `PARTY_TURN_SECRET` are set). The coach offers its mic and a receive-only video slot; the client answers with its mic
  and, only when allowed, its camera. Two data channels on fixed ids: `ctl` (reliable, JSON control) and `pose`
  (unordered, no retransmits).
- **Signalling** (`app/api/coach/live/signal`, `lib/coach/live/server.ts`): Controller Link's signal store
  (`getSignalStore()`: in memory, or the KV store when `CONTROLLER_LINK_KV_URL` is set), under room codes
  `live:<kind>:<id>`. Those contain lower-case letters, and Controller Link's own routes upper-case every code, so they
  can never reach a live room. The server sets the sender and the recipient from the caller's role.
- **Pose frames** (`lib/coach/live/wire.ts`): 105 bytes each (19 landmarks; 16-bit x/y, 8-bit visibility; no depth, no
  picture), thinned to 20 Hz (`POSE_SEND_HZ`) from the camera's ~30.
- **Reps and flags** are read **on the client's phone**, on every camera frame, by the Mirror's audits
  (`lib/coach/live/reader.ts`), and each rep goes to the coach as it closes. At the stop, the whole set (`set_done`)
  settles any rep message the channel lost. The audits count frames, and they assume ~30 fps, so they cannot run on
  the coach's 20 Hz copy.
- **Cues** travel as a preset's key. The client's page looks the words up, so nothing a coach types can appear on an
  athlete's screen. The presets are each movement's existing Mirror cue lines plus six general ones, and all of them
  pass `lib/coach/cueLint.ts`.
- **No direct path** (strict NAT, some school and carrier networks): after `RELAY_AFTER_MS` (10 s) with no direct
  connection, control messages and pose frames (8 Hz, batched every 500 ms) go through the signal route, and both
  screens say so. **Voice and video cannot use the relay.** Media needs a direct path or a TURN relay (owner call 1).
  If the direct path comes up later, everything moves back onto it.

## Who can open a room (`lib/coach/live/gate.ts`)

- `p_<programId>`: the program's coach and client, while they have a **live roster link** (a `CoachClient` row with no
  `endedAt`).
- `b_<bookingId>`: a **booked live session**, by the coach store's own `decideJoin`. It must be `live_1on1` and `PAID`,
  joined inside its window, by adults.
- Anyone else gets the same 404, whether or not the room exists.
- The coach must be a verified adult. The client goes through the coach loop's teen gate unchanged. Under 13 is never
  allowed. A blank birth year must be filled in first. A teen needs a guardian consent that covers coach training,
  and none does today, so every teen fails closed until that wording goes live.
- **Live video only from a verified adult** who chose it. A teen gets **pose + voice**: their phone never hands its
  camera to the link.
- Never ranked or paid: nothing here touches sessions, scores, ladders, wallets or payments. `tests/coach-live/` pins
  that, along with no recorder, no device storage, one database write (the summary), `SelfView` only, cues by key, and
  a minor's camera never reaching the link.

## Measured (two-browser rig, 2026-10-25)

`npx tsx scripts/probes/_coach-live-probe.mts <outDir>` runs two Chromium contexts with
`--use-fake-device-for-media-stream`, the esbuild static rig and a signalling stub that runs the real relay. The
client's pose is the pose service's dev feed playing the Mirror's fixture squats, which include a modelled 66 ms
pipeline latency. Everything ran on loopback, so the network part is near zero. A real network adds its own round trip.

| Scenario | Result |
|---|---|
| Adult, direct | Connected 951 ms after Join (host path). Coach gets audio and 640×480 video (20 fps, ~514 kbps; audio ~8.6 kbps). Pose **20 Hz** (min 19.5), capture → coach **p50 68 / p95 73 ms** (66 modelled + ~2 ms transport), **16.8 kbps**. **5/5 reps, 1 flagged** (left knee, rep 3). Each rep reaches the coach's screen 2 ms (p50; max 4) after the client's. A cue shows 72 ms after the click, with a 13 ms ack round trip. Summary posted once. |
| Teen (consented) | No video choice. Camera video is never requested. Coach gets 0 video tracks and 1 audio track, plus the pose stage at 20 Hz. 3/3 reps, 1 flagged, from an upright phone. |
| No direct path (every ICE candidate dropped) | Relay after 10.2 s, said on both screens. Pose at **8 Hz** through our server (p50 403 ms old). 3/3 reps, 1 flagged. Cue round trip 199 ms. |

Shots: `scratchpad/round7/coach-live/shots/`.

## Owner calls

1. **TURN.** Without it, a pair of strict NATs gets the relay: reps, flags, cues and the stick figure, but **no voice
   or video**. The brief's "fall back to audio plus pose" cannot be done peer-to-peer when no direct path exists,
   because audio needs the same path video does. To carry voice and video there:
   - run coturn on a small VM (UDP 3478 plus a relay port range; Cloud Run cannot serve UDP);
   - set `PARTY_TURN_URLS` and `PARTY_TURN_SECRET` (the party already reads them, and these sessions use the same
     slot);
   - nothing else changes.
   - The costs are a VM and its egress, about the video bitrate for each relayed session, roughly 0.5 Mbps each way.
2. **Minors and live video.** Teens get pose + voice, never video. Whether a guardian consent could ever cover live
   video is the owner's call. No consent wording says it does today, so none is read as covering it.
3. **Copy.**
   - The privacy policy does not yet mention live sessions:
     - the camera video goes peer-to-peer to the coach;
     - in relay mode, pose numbers (no picture) pass through our signal store, bounded to its last 200 messages and
       its 2 h room TTL;
     - the summary is kept in the thread.
   - That sentence is for the owner and legal; none was written here.
   - The new UI lines (the lobby, the relay note, the refusals, six general cue presets) are product copy for review.
4. **Turning it on:** `NEXT_PUBLIC_COACH_LIVE_ENABLED=1`, after 1–3. In production, signalling needs
   `CONTROLLER_LINK_KV_*` on a multi-instance deploy, the same requirement as Controller Link.

## Follow-ups

- **When PR #438 lands**, replace `lib/coach/live/reader.ts` with the re-export named in its header, keeping its test.
  This also removes the BORROWED numbers.
- **Small groups (up to 4)**, the stretch goal, are not built. The design is a star from the coach's page: one
  `LiveLink` per client, peer ids in place of the two roles (the signal store already addresses by peer id), a stage
  grid, and a gate scoped to a coach's group. The pure layer (wire, reader, session) carries over unchanged.
- **The booking page**: the coach store's `/session/[bookingId]` call does not link to `/coach/live/b_<id>` yet. That
  is one line in a file this lane does not hold.
- The skeleton is drawn from the newest pose frame, with no delay to match the video. On a real network the video can
  run ~100–200 ms behind the pose. A small video-delay estimate (`getStats` jitter buffer) could hold the skeleton
  back to match.
- The coach sends voice only. A coach camera for the client is one transceiver, if wanted.
- Keep the client's screen awake during a session (`MirrorWakeLock`, as drills do).
