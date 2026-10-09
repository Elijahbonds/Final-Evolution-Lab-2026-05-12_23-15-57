# Deploy checklist: the party room and Controller Link

Owner decision, 2026-10-06 ("Write a checklist"). This is what the party room (`/play/party`) and Controller Link
(phones at `/controller/<code>`) need in production, how to check it, and how to back it out. Read it before the
first deploy that carries the party room (commit `51beea46`, lane `lane/multiplayer`).

Who does what: deploys and production env changes are the owner's, or the one deploy owner the owner names
(`docs/LANES.md` section 4). Nothing here is run by a lane agent.

Sources: `lib/controller-link/README.md`, `lib/controller-link/signalStore.ts`, `lib/controller-link/kvSignalStore.ts`,
`app/api/controller-link/rooms/route.ts`, `app/api/controller-link/signal/route.ts`,
`lib/controller-link/transport/{signaling,webrtc}.ts`, `components/party/*`, `.env.example`, `firebase.json`.

---

## 1. What the server does, in one paragraph

The server only passes the WebRTC handshake: room create and lookup (`/api/controller-link/rooms`) and the SDP / ICE
messages (`/api/controller-link/signal`, polled every 250 ms). Once a phone's data channel opens, its input goes
phone to TV directly and never touches the server. Those few seconds of handshake must all read and write **one
shared store**. The default store is an in-process `Map`. Production runs on the Firebase web-frameworks backend with
`minInstances: 1, maxInstances: 4` (`firebase.json`), so a second instance, or a restart of the first, has its own
empty Map: a phone's answer is written on one instance and polled on another that never sees it. Production needs
the KV store.

## 2. Environment variables

Two variables, both server-only (no `NEXT_PUBLIC_` prefix, so they never reach the browser bundle):

| Variable | Value |
|---|---|
| `CONTROLLER_LINK_KV_URL` | The REST URL of an Upstash Redis database (or any endpoint that speaks the Upstash / Vercel-KV REST dialect), e.g. `https://<name>.upstash.io`. The code POSTs each command to `${url}` (or `${url}/pipeline`) with the command in the body; a trailing slash is stripped. |
| `CONTROLLER_LINK_KV_TOKEN` | That database's REST token. Use the **read-write** token, not the read-only one: rooms, peers and mailboxes are all writes. |

- Both must be set, or the app quietly keeps the memory store (`kvSignalStoreFromEnv` returns null when either is
  empty). Nothing fails at startup.
- **Where they go:** the deploy tree's production env file, the one the packager ships with the function
  (`docs/LANES.md` section 4: `.env.production` in `wt-webapp-deploy`, or `.env.local` in `deploy-wt`). Set them there
  before the deploy. Never commit them. `.env.example` lists them, empty.
- **No package, no schema, no Prisma.** The KV client is plain `fetch` (`restKvTransport`). Keys are
  `felcl:<CODE>:meta | :peers | :seq | :mlist:<peer>` (the last is a Redis list, one entry per message), each written
  with a 2-hour TTL, so the store empties itself.
- **Plan size.** An open party room's TV polls the signal route about 4 times a second for as long as the room is
  open (drop-in), and each poll is 3 KV reads (room meta, peers, the TV's mailbox). That is up to about 43,000 KV
  commands an hour per open room, plus a few dozen writes per phone join. Check the KV plan's command limit against
  that before launch. The same polls are also SSR-function invocations.

### Not needed for the party room: `NEXT_PUBLIC_NETD_URL`

`NEXT_PUBLIC_NETD_URL` points the app at `server/netd`, a separate WebSocket server on Cloud Run for `?net=` netplay
(`lib/net/attach.ts`; `server/netd/README.md`). **The party room and Controller Link do not use it.** No party game
uses `?net=` (`lib/party/catalog.ts`), and Controller Link's WebSocket input fallback (`PeerLink.sendViaSocket`) is
not wired to anything. Leave it unset for this deploy. Unset, `?net=` logs
`[FEL-NET] ?net= given but NEXT_PUBLIC_NETD_URL is unset — staying single-player` and the mode plays single-player.

## 3. Which store is active: read the logs

`getSignalStore()` picks the store once per server instance, on the first Controller Link request that instance
serves (a room create, a lookup or a signal poll). Startup does not pick it.

- **KV active:** the instance logs, once:
  `[FEL] Controller Link signaling: KV store (multi-instance safe).`
- **Memory store:** it logs **nothing**. After a room has been opened, no such line from that instance means it is
  on the Map.
- Every instance logs it for itself. After a deploy, open one party room and look for the line. If traffic has
  brought up a second instance, look for it there too.
- Where: the hosting backend's function logs in Google Cloud Logging. For example:
  `gcloud logging read 'textPayload:"Controller Link signaling"' --project final-evolution-lab --freshness=1h`
  (assumption: the SSR function's stdout lands in Cloud Logging as `textPayload`, as Cloud Functions / Cloud Run
  stdout does. If the filter finds nothing, search the same text in the console's Logs Explorer.)
- Bad credentials still log the KV line, because the line means "configured", not "reachable". Section 5 covers
  what a wrong URL or token looks like.

An optional check that writes really land: open a party room, read the 6-character code off the TV, then
`curl -s -H "Authorization: Bearer $CONTROLLER_LINK_KV_TOKEN" "$CONTROLLER_LINK_KV_URL/get/felcl:<CODE>:meta"`.
It should answer `{"result":"{\"code\":\"<CODE>\",...}"}`. A `null` result means the room was written somewhere else,
so the memory store is serving.

## 4. The five-minute real-device test

You need a TV or laptop (the host, signed in), two phones and one WiFi network (not a guest network that isolates
clients, see section 5). Production is HTTPS, which iOS needs for motion. Write down the time you start, so the logs
are easy to find afterwards.

| # | Step | Pass |
|---|---|---|
| 1 | Host: `/play` → **Play with friends**. | The PARTY ROOM screen shows a QR, a 6-character code, and four empty player cards. Not "Phone link offline". |
| 2 | Logs (section 3). | The KV line is there. |
| 3 | Phone 1: scan the QR with the camera, type a name, **JOIN**. | The phone reaches **Connected** within a few seconds and shows its seat and colour. The TV fills card 1 with the name. |
| 4 | Phone 2: open `<site>/join`, type the code (try a look-alike such as `0` for `O`, the form catches it), **JOIN**. | Card 2 fills. Both phones show their own seat. |
| 5 | Both phones: **TAP WHEN READY**. Phone 1 (the first phone in): ◀ ▶ to pick **Brain Brawl**, then START. | The game opens full screen on the TV. Each phone answers as its own player: P2's buttons move P2, not P1. |
| 6 | Finish or play a round to RESULTS. | The TV shows the winner, **REMATCH ▶** and **CHANGE GAME**. The phones show REMATCH / CHANGE GAME. |
| 7 | Tap **REMATCH**. | The same game restarts with the same two seats. Nobody rescans. |
| 8 | **CHANGE GAME**, pick **Downtown** (take turns). | Every phone's layout changes to the new game's controls without a rescan. Turns go P1, P2 and a board keeps score. |
| 9 | Phone 2: **LEAVE THE ROOM**. | The TV frees seat 2 at once. Phone 2 shows **YOU LEFT THE ROOM**. |
| 10 | Phone 2: **REJOIN** (one tap, name remembered). | Phone 2 is seated again, as one player: no ghost second card. |
| 11 | Phone 1: switch WiFi off for 5 s, then on. | The phone shows **Reconnecting…**, then **Connected** in the same seat (backoff 0.5 to 8 s). |
| 12 | Phone 2: open `/controller/ZZZZZZ` (a code that does not exist). | **Can't find that game** with a **TYPE A CODE** button. Not a stuck "Disconnected". |

If all of that passes, the party room works in production. The party room does not show latency. For a real WiFi
number, open a mode that has its own controller lobby (`components/controller-link/host-lobby.tsx` shows each phone's
round-trip in ms). The README's numbers are loopback only.

## 5. What failure looks like

| What you see | What it means | What to do |
|---|---|---|
| Phones sometimes join and sometimes hang on **Finding host…** / **Connecting…**. Or "Can't find that game" for a code that is on the TV. Worse when busy, or right after a deploy. No KV line in the logs. | The memory store, with requests landing on different instances. | Set both variables (section 2) and redeploy. |
| The TV shows **Phone link offline — The game server refused the room (500)** after its 3 retries. The logs show an error like `KV set felcl:<CODE>:meta failed: 401` (or 403). The message names the command and key, never the value. | Wrong or read-only token. (Failed reads are swallowed and read as "no room"; the first failed write is what surfaces.) | Fix the token and redeploy. |
| The same, with `failed: 404`, or a `fetch failed` / DNS error. | Wrong URL (a trailing slash is stripped, so it is not that). | Fix the URL and redeploy. |
| Rooms open, then a join fails: the signal POST returns 500, and the logs show `KV rpush felcl:<CODE>:mlist:<peer> + ltrim ... failed: 413` (or 400). | **Fixed in code 2026-10-06 (was: values in the URL); proven against a fake endpoint, not yet against the real one: the five-minute device test (section 4) on the deploy is the check.** The REST transport used to put each value in the URL path and rewrite the TV's whole mailbox per message, so a busy room could outgrow the URL limit (414). Now every command goes in the request body (`POST <url>` / `<url>/pipeline`), and each message is one `RPUSH` to a list capped at the newest 200, so a request carries one message, not the mailbox. Tested with a 64 KB message against a fake endpoint that answers 414 to any URL over 2 KB (`lib/controller-link/kvSignalStore.test.ts`). What is left is the plan's request-size limit (Upstash documents a per-request maximum, around 1 MB on its smallest plans; check yours), which one SDP message, a few KB, is far below. | If it ever shows: a 413 means one message outgrew the plan's request size; check the KV plan. Reopening the party room still gives a fresh mailbox. |
| The TV lists a phone's name, but the phone never reaches **Connected**. | Signalling worked; the direct WebRTC path did not. The usual cause is a guest or office WiFi that isolates clients, or a phone on mobile data. Production has public STUN only, no TURN relay. | Put every device on the same home WiFi. A TURN server is a separate decision; nothing is configured for it. |
| After about 2 hours, new phones cannot join a room that is still open; seated phones keep playing. | The room's KV keys expired (2-hour TTL; the memory store sweeps at 2 hours too). | Close and reopen the party room. |
| Motion controls do nothing on an iPhone. | No secure context, or the permission was denied. Production is HTTPS, so this is the permission. | The party games are button-driven. Every motion schema ships a button fallback. |

## 6. Rollback: hide "Play with friends"

The party room has **no feature flag**. Hiding it is a small code change, which reaches production the normal way:
a lane branch, a PR into `lane/finish-release` that the owner merges, then an owner-run deploy. Nothing below touches
the database, the schema or the game modes. The party room records no sessions, coins or Arena results, so there is
nothing to clean up.

Remove the doors, smallest first:

1. **The main entry.** `app/play/page.tsx`: the `Play with friends` link (`href="/play/party"`,
   `data-testid="play-party-entry"`).
2. **The in-game invites.** `components/party/party-invite.tsx`: make `PartyInvite` return `null`. That hides
   "PLAY WITH FRIENDS" on a party game's start screen (`components/games/boot-splash.tsx`) and "PLAY THIS WITH
   FRIENDS" on its results card (`components/games/game-shell.tsx`) in one place.
3. **The guest doors**, if guests should not be told about it either: the "Join with a code" link in
   `components/guest-landing-hero.tsx` (`data-testid="landing-join"`) and `{ href: '/join', label: 'Join a game' }` in
   `lib/nav/doors.ts`.
4. **Optional:** the "2 PLAYERS" / "1-4 PLAYERS" badges (`PartyBadge` in `components/shell/play-shelf.tsx` and
   `app/modes/page.tsx`). They link nowhere, so they can stay.

Notes:

- `/play/party`, `/join` and `/controller/<code>` keep working for anyone who has the URL. Hiding the doors is the
  rollback the owner asked for. To shut the room itself, make `app/play/party/page.tsx` redirect to `/play`.
- The per-mode Controller Link lobbies that existed before the party room (the `HostLobby` in a mode's own host
  page) use the same API routes and the same store. Section 2 matters to them whether or not the party room is shown.
- Check the tests the doors carry before merging the hide: `scripts/probes/_party-probe.mts` (browser) and any test
  that reads `play-party-entry` or `landing-join`. Name every test you change in the PR, as `test changed:`.
- A Firebase Hosting rollback to the previous release also removes the doors, together with everything else in that
  deploy. Use it only if the whole deploy is bad.
