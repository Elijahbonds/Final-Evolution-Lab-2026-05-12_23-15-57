# Online play: the audit, what "finished" needs, and what this lane built (lane/online-play, 2026-11-21)

Owner, 2026-11-21: **"Make sure the story and online play is finished."** This is the online half (the story has its own
lane). Every number here was measured on this lane, against a LOCAL netd (`server/netd`, started by the probes on a local
port) and the real app (a production build on a throwaway database, `scripts/every-screen/rig.mts`). Nothing reached a
deployed server. Instruments, all in the repo:

- `scripts/probes/online-play/match-room.mts` — the `?net=` match room with the app's own netcode (no browser), against
  today's netd or (`NETD=old`) the pre-party netd production still runs.
- `scripts/probes/online-play/e2e.mts` — up to seven real browsers: the party (create, code, link, QR, knock, six, a
  seventh, kick, reload, crown), "Start together" 1v1 and 3v3 with a spy peer in the match room, a phone-profile guest,
  a network drop, the host walking out.
- The unit suites: `tests/online-play/**`, `tests/party-chat/netd-party2.test.ts`, `party2-client.test.ts`,
  `party2-start.test.tsx`, `lib/party/social/run.test.ts`, `lib/net/knobs.test.ts`.

## 1. What online play was, measured (before this lane)

**The party works.** (PARTY-CHAT, 2026-10-13; measured again here in browsers, §6.) Make a party; join by a 6-letter code
(typed in lower case with a dash, it still works), by the invite link, or by the QR (the QR image is the invite link's,
checked byte for byte); a teen account or a guest knocks and the host lets them in; six is the cap and a seventh is told
"That party is full"; the host removes someone; a reload is the same member; "Make host" moves the crown; quick chat,
emotes, adults' typed chat and voice; "Start together" counts down and sends everyone to the game.

**The game you are sent to was not shared.** Measured with the app's own netcode against a real netd:

| | before | what it meant |
|---|---|---|
| Guest's input reaching the host, guest page opened 1.2 s after the host's | **0 of 183 frames** | the two pages count ticks from their own start; the host looked up its own tick number in the guest's queue, which never matched. Only pages that open inside the same 33 ms worked (control: 122 of 123). Every `?net=` rival stood still. |
| The guest seeing the host's game | **0 snapshots** | no mode ever called `publish()`. Each page ran ITS OWN game: the guest played the AI on its page while its body was a statue on the host's. |
| 1v1: the guest attacking | **never** | in 1v1 only "me" has an offence; the rival's offence is the AI attacker. A remote human could only move and poke on defence. |
| 3v3: humans | **2** (netd `ONLINE_MODES` `humans: 2`) | the second human took the first AI seat (a teammate); the other four stayed in the party. |
| A seventh peer refused "full" | **reconnected every few seconds, forever** | the transport retried every refusal. |
| Winners stay on | **not built** | `lib/adventure/venice/run.ts` in the Venice plan was never written. |
| Karate co-op | **two fights** | same as above: each page fought its own horde. |
| Latency / jitter | **not measured anywhere in the client**; a fixed 100 ms render delay on a buffer nothing filled | |
| Scoring agreement | **none possible**: two games, two scores | |

**Production.** The repo records that production's netd is the **pre-party build** (`docs/LAUNCH-CHECKLIST.md` C5 "not done",
`docs/OWNER-RUNBOOK.md` §8: "As of 2026-10-20 none has been run"). Its source is `git show 6c438074^:FEL-full-app/server/netd/src/index.ts`.
It answers `/party` with `{"t":"error","reason":"room and peer required"}`, which the app shows as **"Parties need a
server update. Everything else works as usual."** (measured: `match-room.mts` F with `NETD=old`). assumption: whether
production's app build has `NEXT_PUBLIC_NETD_URL` set is not recorded in the repo; unset, the party says "Online parties
aren't switched on here yet" and `?net=` stays single-player.

## 2. What broke, desynced, dead-ended or was missing

1. **No shared game** (above): the most broken thing, and the reason everything else looked fine in the party.
2. **Remote input lost** to the two clocks (above); on top of it, a tap that lasted one 60 fps frame between two 30 Hz
   sends was dropped on the sender's side, and one the host stepped over was dropped on the host's.
3. **1v1 had no human offence** for the second player.
4. **3v3 seated two**, and the second seat was a teammate, not the rival the owner's "2 + 2 bots a side" rule implies.
5. **Refusals retried forever** ("full").
6. **No round-trip or jitter figure**, no adaptive delay, no "reconnecting" in the game.
7. **No match result reached the party**, so "winners stay on" had nothing to stand on.
8. **Karate co-op** offered by "Start together" though it was two separate fights.
9. **The old netd**: the party correctly says it needs an update; match rooms relay any frame on every build (so the
   shared game below works against it too — measured, `match-room.mts` E with `NETD=old`).

## 3. What "finished" needs

### 3a. Code (this lane; §4 says what was built and measured)
- One shared game per match (1v1 and 3v3), input that arrives, a human offence in 1v1, six humans in 3v3, a seat for
  every human and the AI on every empty seat, the runner leaving handed over, a drop survived, the HUD and the end read
  from each side, a round trip measured, refusals final.
- netd `party2`, additive: six-seat 3v3, a seat order, the match result to the party.
- Winners stay on, on the host's page, from netd's result.
- The client against the party1 netd and the pre-party one: say what needs the update, keep everything else.

### 3b. The owner's netd redeploy (§5): exactly what changed and why
Only the PARTY path changed (`server/netd/src/{party,partyRules,partyServer}.ts`): `features` gains `party2`; 3v3 seats six;
`p_start` takes an `order`; `p_result` is new. Match rooms (`index.ts`, `room.ts`) are byte-for-byte as deployed. Without
the redeploy: the shared 1v1/3v3 game still works (client-only), 3v3 seats two, winners stay on is switched off with the
line "Winners stay on needs a party server update".

### 3c. Real-device tests only the owner can do (§7)

## 4. What this lane built

| Piece | Where | Measured |
|---|---|---|
| **Input across two clocks.** The host learns the offset from the first input, re-learns it after a burst, plays every tick up to its read with their buttons merged; the sender carries a one-frame tap to its next send. | `lib/net/NetClock.ts` `InputQueue`, `lib/net/NetSession.ts` | guest opened 1.2 s late: **0 → 175 of 176 frames**; 3v3 five guests **0 → 149 of 150 each** (`match-room.mts` A, D) |
| **One shared game.** One page RUNS the game (its mode updates and publishes the world as drawn — roots, every bone, the ball — 30 Hz, poses 15 Hz, its HUD writes and its end); every other page DRAWS it (its mode is held, like a replay holds it; its bodies are written after its animations and again after the physics step; its camera follows its own player; its input goes to the runner). | `lib/net/play.ts`, `lib/net/mirror.ts`, `lib/net/worldBuffer.ts` | `tests/online-play/{play,mirror,world-buffer}.test.ts`; browsers §6 |
| **1v1: the player with the ball runs the game.** A turnover hands it to the other page (with the score); that page plays its full offence — every move, the meter, the dunks. Alone in the room, or the other player gone, the mode plays the AI as single-player does. | `lib/net/play.ts` `handOff`, `OneVOneMode.ts` `startDefense` (one line), its rival slot | `play.test.ts` |
| **3v3 up to six humans.** Seats alternate teams (2 humans = 1-on-1 with bots, 4 = 2 a side, 6 = 3-on-3); each human drives a body's feet and its defence (pokes, contests, box-outs read off the slot); the AI's brain still decides that body's passes and shots (see §8). An empty seat, or one whose player left, is the AI. | `lib/net/seats.ts`, `lib/net/attach.ts` `seatSource`, `ThreeVThreeMode.ts` spawn | `seats.test.ts`; browsers §6 |
| **Each side reads it right.** Scores swap for a rival's page, YOUR ↔ THEIR, "THEY SCORE — JUMPER +2", the runner's meter / hints / momentum are never drawn elsewhere, an opponent's WIN is your LOSS. | `lib/net/perspective.ts` | `perspective.test.ts` |
| **Leaving, drops, a dead tab.** The runner leaving: a drawing page takes the game on from a check-up with the score it last drew. A runner silent for 9 s is taken over; if it comes back, the newer hand-over runs (an `epoch` on every world). | `play.ts` | `play.test.ts`; browsers §6 |
| **Latency and jitter.** A ping to netd every 2 s (median of 8); the draw delay adapts: two ticks plus 1.2 × the measured jitter, 66–250 ms. "RECONNECTING…" after 2.5 s without a world. | `NetdTransport.ts`, `worldBuffer.ts` | `world-buffer.test.ts`; browsers §6 |
| **Refusals.** "full" ends the attempt (status `refused`); "duplicate" (a reconnect racing its old socket) still retries. | `NetdTransport.ts` | `match-room.mts` D: **endless retries → one** |
| **netd `party2`** (additive). | `server/netd/src/{party,partyRules,partyServer}.ts` | `netd-party2.test.ts` (12), `server/netd/test` (5 of 5 on a real socket) |
| **Winners stay on.** The host's page keeps the court's line from netd's `p_result`: the winners hold the court, the next ones in line come on, the losers go to the back; a team is the mode's half or half the party ("a party of 4 plays 2 + 2 bots a side"). On by default (owner default 2026-11-17), one switch on the card. The card says who is on and who is next. | `lib/party/social/run.ts`, `client.ts`, `party-start.tsx` | `run.test.ts`, `party2-client.test.ts`, `party2-start.test.tsx` |
| **The fallback.** No `party2`: 3v3 offers 2 and says "Up to 6 need a party server update"; winners stay on says it needs the update; the old `p_start` exactly. The pre-party netd: "Parties need a server update" (unchanged), and the shared game still works. | `party-start.tsx`, `client.ts` | `party2-*.test.*`, `match-room.mts` NETD=old |
| **A seat on the bench.** Someone the game has no seat for gets a "Watch" button on the "Joining…" card: the shared game, drawn on their page, nothing sent (a `w…` peer). Their card at the end is the final score. A watcher who walks in first does not stall the game (the host seat runs it). Works on every netd build (client-only). | `party-start.tsx`, `play.ts` | `play.test.ts` |
| **Karate co-op** is not offered by "Start together" until its horde is shared (`net.karateTogether` 0; 1 offers it as before). netd still accepts it. | `lib/party/social/startable.ts` | `knobs.test.ts` |

**The knobs** (group "Online play", `docs/FEEL-PANEL.md`): `net.mirrorOn` 1 (0 = the old behaviour exactly: each page its
own game, the old one-seat wiring), `net.renderDelayMs` 0 (adaptive), `net.poseHz` 15, `net.possessionSwap` 1 (0 = the host
runs every 1v1 possession and the guest only defends), `net.karateTogether` 0. All NEW numbers, chosen here, flagged. The
feel panel's session gate keeps overrides off in online runs, so these are set in code.

## 5. The owner's netd redeploy — copy and paste, in order

Do this from the deploy tree's `FEL-full-app/` after this lane is merged. Project `final-evolution-lab`, region `us-central1`
(the README's). If you have never deployed the party netd, the secret step (1) is new; if you have, skip it.

1. Only the first time: make and store the ticket secret (keep the value in your password manager):
   ```sh
   openssl rand -base64 48
   printf '%s' 'PASTE-THE-SECRET' | gcloud secrets create party-ticket-secret --data-file=- --project final-evolution-lab
   gcloud run services describe fel-netd --region us-central1 --project final-evolution-lab --format='value(spec.template.spec.serviceAccountName)'
   gcloud secrets add-iam-policy-binding party-ticket-secret --project final-evolution-lab --member serviceAccount:PASTE-THE-SERVICE-ACCOUNT --role roles/secretmanager.secretAccessor
   ```
   (An empty service-account line means the default one: `PROJECT_NUMBER-compute@developer.gserviceaccount.com`.)
2. Note what is serving now, so you can go back:
   ```sh
   gcloud run revisions list --service fel-netd --region us-central1 --project final-evolution-lab --limit 3
   curl -s "$(gcloud run services describe fel-netd --region us-central1 --project final-evolution-lab --format='value(status.url)')/healthz"
   ```
3. Deploy:
   ```sh
   gcloud run deploy fel-netd --source server/netd --project final-evolution-lab --region us-central1 \
     --allow-unauthenticated --min-instances 1 --max-instances 1 --session-affinity --timeout 3600 \
     --set-secrets PARTY_TICKET_SECRET=party-ticket-secret:latest
   ```
4. Check it:
   ```sh
   curl -s "$(gcloud run services describe fel-netd --region us-central1 --project final-evolution-lab --format='value(status.url)')/healthz"
   ```
   You should see `"features":["party1","party2"]`.
5. The app (only if not already set): in the deploy tree's production env file, `PARTY_TICKET_SECRET` = the same secret and
   `NEXT_PUBLIC_NETD_URL=wss://` + the URL from step 4 without `https://`. It is read when `next build` runs, so it must be
   there before the app deploy. Then deploy the app the usual way (`docs/OWNER-RUNBOOK.md` §11).
6. Undo, if anything is wrong: `gcloud run services update-traffic fel-netd --to-revisions PASTE-THE-OLD-REVISION=100 --region us-central1 --project final-evolution-lab`.
   The app keeps working: on the old netd the party says it needs an update, and games are single-player or shared as before.

## 6. The browser runs (`e2e.mts`, the lane's build, a local party2 netd, 2026-11-21)

The rig is a 4-core machine shared by eight lanes, drawing 3D with a software renderer (swiftshader) in up to six browsers at
once. It proves what happens; it cannot judge smoothness (a page drew at ~1 frame a second under that load). The "before"
browser run could not be made (the gate queue and the disk floor: one build at a time); the before numbers are the headless
ones in §1, which use the same netcode.

| Check | Result |
|---|---|
| Create a party; join by code typed `abc-def` in lower case; by link; by the QR's link | PASS (2, 3, 4 in the party) |
| The QR on the host's page is the invite link's QR | PASS: 841 of 841 modules match (first run: a byte compare said FAIL; the browser's PNG bytes differ from node's, the code was right) |
| A teen knocks and is let in; a guest knocks and is let in; six in; a seventh is turned away ("full") | PASS |
| The host removes the guest (5 left); a reload is the same member (no ghost); "Make host" gives the crown | PASS |
| 1v1 Start together: who is seated | HOST (`h…`) and CASEY (`foe`); the other three stay in the party |
| 1v1: exactly one page runs the game | PASS. CASEY's page (the phone) ran it; HOST's drew it |
| 1v1: what crosses the match room (a spy peer, 15 s) | **before (headless, §1): no world ever.** After: worlds from the running page (18 sent, 11 seen by the spy at ~1 fps rendering), the drawing page's input; ~1.0 KB a world for two bodies with poses |
| 1v1: netd dropped a page that was loading for over 10 s | it re-joined by itself (`rejoins` 2) and went on drawing. First run, before that fix: every page dropped, nothing flowed (`worldsOut` 0) |
| 1v1: the guest drops off the network for 5 s | the running page carried on; frames flowed again afterwards |
| 1v1: the host walks out | the guest kept the game (it was running it) against the AI, the score kept |
| 3v3 Start together, a party of five | **5 seated** (`h…`, `net1`…`net4`; party1 seated 2). Exactly one page runs it. No world crossed in the 15 s window: five 3D pages were still loading on the shared machine (one page answered pings 110 s late). **Not measured**: the six-page 3v3 picture; it is covered by the unit suites only, and by the owner's 6-device test (§7). |
| Frame times on the phone profile | not measurable on this rig (8.4 s a frame with CPU ×4 under the load); **not measured** |
| Venice "Play with your party" | not re-run here (`scripts/probes/venice-hub/party-walk.mts` covers it; unchanged code path) |

## 7. Real-device tests (the owner)

Production is HTTPS; use real phones. Write down the time you start.

1. **Two phones, different networks** (one on mobile data). /party → Start a party → the other joins by code. Quick chat,
   an emote, typed chat (18+ accounts), Join voice both ways. Pass: each sees the other; voice is heard both ways.
2. **1v1 together.** Host: Start together → 1v1. Pass: both phones show the SAME game — when one player moves, the other
   sees it; the player with the ball has the shot meter; a miss the other rebounds gives THEM the ball and their own meter;
   the score is the same on both phones, swapped (yours first); the end screen says WIN on one and LOSS on the other.
3. **Feel.** On each phone, does your own player respond at once when you have the ball (it should: that phone runs the
   game) and does the defender's response feel late? Tell us if it does: the delay is a knob (`net.renderDelayMs`).
4. **Drop.** During 1v1, turn one phone's WiFi off for 5 s and on. Pass: it says RECONNECTING…, then carries on; the score
   is kept.
5. **Walk out.** The player with the ball closes the app. Pass: within a few seconds the other phone carries on against the
   AI with the score kept ("THE GAME IS YOURS TO RUN — PLAY ON").
6. **Six humans, 3v3** (needs the §5 redeploy). Six phones in one party, Start together → 3v3. Pass: all six land in one game,
   three a side; each phone's camera follows its own player; the score agrees.
7. **Winners stay on** (needs §5). A party of three, 1v1 twice. Pass: the winner of game 1 plays game 2 against the one who
   sat out; the card says who is on.
8. **Venice.** From the Venice court, "Play with your party". Pass: everyone lands in the game and comes back to the court.

## 8. What is still not finished (honest)

- **3v3 remote humans do not choose their own passes or shots**: they move, defend and box out; the AI brain decides when
  their body passes or shoots. Giving every body the hero's full offence is hoops-mode work in `ThreeVThreeMode.ts`
  (owned by the hoops lanes).
- **Karate co-op** is not shared (the horde would need mirroring).
- **Seeing friends walk in the Venice hub** (presence) is not built.
- The drawing page shows the runner's HUD (score, clock, banners) but not its sounds, and the 1v1 defender's contest jump
  is still the AI's timing on the runner's page.
