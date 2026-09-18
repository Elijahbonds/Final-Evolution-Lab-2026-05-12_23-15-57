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
