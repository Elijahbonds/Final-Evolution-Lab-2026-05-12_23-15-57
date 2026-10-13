# fel-netd

Authoritative realtime server for FEL netplay. Node + `ws`, deployed to Cloud Run.

## Why this exists, and what it is not

Firebase Hosting serves the app through Cloud Functions, which cannot hold a WebSocket. Cloud Run
can. So the realtime layer is a separate service.

The server is authoritative for **membership and the clock**, not (yet) for the simulation. It owns
who is in a match, stamps every relayed message with the sender's real identity so a client cannot
forge one, and hands authority to the next player when the holder leaves — so **a match outlives
any one player's browser**, which is the thing a peer-hosted match cannot offer.

Running the game simulation server-side (headless Babylon + Havok) is a much larger build and is
deliberately not claimed here.

## Run locally

```bash
cd server/netd && npm install && npm run dev
# ws://localhost:8080?room=r1&peer=p1&mode=onevone
curl localhost:8080/healthz
```

## Deploy

```bash
gcloud run deploy fel-netd --source server/netd \
  --region us-central1 --allow-unauthenticated \
  --min-instances 1 --session-affinity
```

`--session-affinity` matters: without it, two players in one room can land on different instances,
which hold their rooms in memory and will never see each other. `--min-instances 1` avoids a cold
start on the first join. Point the app at it with `NEXT_PUBLIC_NETD_URL`.

**Single-instance state.** Rooms live in memory, so this scales to one instance today. Multi-instance
needs a shared room registry (Redis or Firestore) — noted, not built.

## Parties (PARTY-CHAT, 2026-10-13)

The PSN-style party (owner decision 2026-10-09) rides this same service on its own path, `/party`. It is **additive**:
match rooms (`/?room=&peer=&mode=`) are unchanged. An old build answers `/party` with `room and peer required`, and the
app shows "Parties need a server update" instead of the party; nothing else in the app changes.

- `src/party.ts` — the rules, as a pure state machine (tested in the app's suite: `tests/party-chat/netd-party.test.ts`).
- `src/partyServer.ts` — the socket shell. `src/partyRules.ts` — limits, presets, emotes, the profanity list (the app
  imports the same file). `src/ticket.ts` — the signed ticket and the sealed report slip.
- Up to 6 (`MAX_PLAYERS`). The server names every member and stamps every relayed frame with the sender. Host-only kick,
  crown transfer, let-in and Start together. Rate limits per member. Nothing said is stored or logged.
- **Who is an adult** comes only from a ticket the app signs with `PARTY_TICKET_SECRET` (User.dobYear from the database,
  the strict 18+ rule). No valid ticket = teen rules: quick chat and emotes only, never typed chat, never voice, and a
  party with a teen in it is invite-only (newcomers knock; the host lets them in). Both services need the SAME secret.
- Voice is peer-to-peer WebRTC: this server only relays the offer/answer/ICE frames between two adults who both turned
  voice on. Audio never passes through netd and is never recorded.

### Test

```bash
cd server/netd && npm ci && npm run build && npm test     # real server, real sockets (node:test)
```

### Owner's redeploy steps (a lane never deploys)

Run from the `FEL-full-app/` of the tree you deploy from, after the lane's PR is merged. Project and region are the ones
this README already uses; correct them if yours differ.

1. **Make the shared secret, once.** `openssl rand -base64 48`. Store it:
   `printf '%s' '<the secret>' | gcloud secrets create party-ticket-secret --data-file=- --project final-evolution-lab`
   and let the netd runtime service account read it:
   `gcloud secrets add-iam-policy-binding party-ticket-secret --member serviceAccount:<netd runtime SA> --role roles/secretmanager.secretAccessor --project final-evolution-lab`
2. **Redeploy netd:**
   ```bash
   gcloud run deploy fel-netd --source server/netd --project final-evolution-lab \
     --region us-central1 --allow-unauthenticated \
     --min-instances 1 --max-instances 1 --session-affinity --timeout 3600 \
     --set-secrets PARTY_TICKET_SECRET=party-ticket-secret:latest
   ```
   - `--max-instances 1`: parties and rooms live in one instance's memory (above). A second instance would split a party.
   - `--timeout 3600`: Cloud Run ends a WebSocket at the request timeout (default 300 s). The party client reconnects and
     resumes its place within 30 s either way, but an hour means one blip an hour instead of one every five minutes.
3. **Check it:** `curl -s https://<netd url>/healthz` → `"features":["party1"]`.
4. **The app:** in the deploy tree's production env file set `PARTY_TICKET_SECRET` (the same value) and
   `NEXT_PUBLIC_NETD_URL=wss://<netd url>` (a build-time variable: it must be there when `next build` runs), plus,
   optionally, `PARTY_TURN_URLS` / `PARTY_TURN_SECRET` for a TURN relay. Then the usual app deploy.
5. **Device test:** two phones on different networks (one on mobile data): /party → Start a party → the other joins by
   code; quick chat, typed chat (18+ accounts), Join voice both ways; host Start together → both land in the match.

**Rollback:** netd — `gcloud run services update-traffic fel-netd --to-revisions <previous revision>=100 --region us-central1`
(old netd = "Parties need a server update", nothing else changes). App — unset `NEXT_PUBLIC_NETD_URL` and redeploy: the
party UI says "Parties aren't switched on here yet" and draws nothing anywhere else.
