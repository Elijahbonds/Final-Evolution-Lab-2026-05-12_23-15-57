# Security review before launch

**Pass 1 of 2**, 2026-10-25, lane `quality-gates` (QG-06), on `lane/finish-release` at `e173f413` (everything merged by
then). Pass 2 runs after round 8's wave 2 merges, on the same method, and adds its findings below this one's.

The owner asked for a full review before launch: auth and roles, every API route's checks, rate limits, payments and
webhooks, uploads, secrets in the repo, the dependency audit, and the teen and privacy rules. "Fix what is fixable.
Anything that needs a dependency change or legal text goes to the owner." (quality round, 2026-10-20.)

## How it was done

- **Every route, by machine.** `tests/security/routeScan.ts` reads all 295 `route.ts` files and records what each one
  calls: a session read, an admin gate, a role check, a shared secret, a webhook signature, a dev-only 404, a rate limit,
  a schema parse, an age or consent gate, an upload. The table at the end of this file is its output, one row a route.
- **The risky ones, by hand.** Every route the scan found with no check at all (26), every write among them (10), every
  shared-secret route, all three webhooks, all three upload routes, the admin routes and pages, the auth core
  (`lib/auth.ts`, `lib/auth/safeNext.ts`, the NextAuth route), both rate limiters, every `dangerouslySetInnerHTML`,
  and a sample of `[id]` routes for ownership checks (coach-store rows, receipts, call signals, coach programs, form
  reviews). A check made inside a lib helper is found by reading the helper; the scan only sees the route file.
- **Secrets.** Known key shapes and an entropy scan over all 8,914 tracked files, plus the git history for committed
  env and key files. GitHub's own secret scanning is GitHub-side and was not run from here.
- **Dependencies.** `npm audit` (report only: a dependency change is the owner's).
- **Guards that keep it true.** Three new vitest suites under `tests/security/` run in CI on every PR (below).

## Findings

Severity is for this app at launch: a public web app with teen accounts, card payments through the coach store, and a
small number of instances (`firebase.json`: up to 4).

| ID | Severity | Area | Finding | Status |
|---|---|---|---|---|
| S-01 | **High** until configured | Rate limits | The in-memory limiter's client key (`clientKeyFromHeaders`, `lib/rate-limit.ts`) was the **first** `X-Forwarded-For` entry, which the client writes. Every limit keyed on it could be skipped by sending a new made-up address each time: signup's per-address limit, the coach-invite and group join-code lookups (the only thing slowing a code guess), multiplayer create and join, the book checkout, download and stream routes, and the card route. | **Fixed in code** (`lib/rate-limit.ts`): with `TRUSTED_PROXY_HOPS` set, the key is the address the trusted proxy appended. Test: `tests/security/client-key.test.ts`. **Owner call O-1:** set `TRUSTED_PROXY_HOPS` in production; until then the old read stays. |
| S-02 | Medium | Auth | Sign-in timing told which emails have accounts. `authorize()` returned before bcrypt when no account matched, about 250 ms sooner than a wrong password for a real account. | **Fixed** (`lib/auth.ts`): an unknown email pays one compare against a fixed cost-12 hash. Same answers as before. Test: `tests/security/auth-unknown-account.test.ts`. |
| S-03 | Medium | Rate limits | 47 routes use the in-memory limiter, which counts per instance and forgets on a cold start. With 4 instances a limit is effectively 4× its number. The database-backed limiter (`lib/rate-limits`, the `rate_limits` table) covers only login, signup, run start, season claim and Arena submit. | **Routed** to the rate-limits owner: move the guessing-sensitive ones (invite code, group code, guest, creative upload) to `checkRateLimits`. Patch R-3 below. |
| S-04 | Medium | Roles | CRM access (`lib/crm/helpers.ts`) is granted to `role === 'admin'` **or** the hard-coded email `elijahbonds1@gmail.com`. Sign-up does not verify email addresses, so on any database where that email has no account yet (a fresh or restored database), whoever signs up with it first gets the CRM. Every other admin surface uses `requireAdmin` (role only). | **Routed**, owner call O-2. Patch R-4 below drops the email arm. |
| S-05 | Medium | Headers | No `Strict-Transport-Security` header is set by the app, and the session cookie's `Secure` flag depends on `NEXTAUTH_URL` starting with `https`. | **Owner** (deploy config, OWN-22): exact `next.config.js` diff in `docs/QUALITY-GATES-PROPOSAL.md` §5. Check first: `curl -sI https://<prod-host>/ \| grep -i strict-transport` — Firebase Hosting may already send it. |
| S-06 | Low | Public routes | Controller-link signalling (`/api/controller-link/rooms`, `/signal`) needs no account, accepts a message body of any size (`data: z.unknown()`), and creates rooms without a limit. Codes are 6 characters (887 million), rooms live 2 hours, 200 messages a room: guessing is not practical, memory pressure on one instance is. | **Routed** (patch R-6: a 16 KB cap on `data` and a rooms-per-address limit). |
| S-07 | Low | Public routes | `POST /api/guest` creates a `GuestSession` row for every request without a guest cookie, with no limit. | **Routed** (patch R-7). |
| S-08 | Low | Public routes | `POST /api/telemetry/crash` logs one bounded line per request (fields are cut to 400 / 256 / 1,200 characters), but any number of requests and any body size are accepted: a log-cost flood. | **Routed** (patch R-8). |
| S-09 | Low | Validation | `POST /api/mirror-triumph` takes any `mode` string and any whole-number score. The data is the player's own (no leaderboard reads it), but a script can create unlimited rows. | **Routed** (patch R-9: modes from the registry). |
| S-10 | Info | Auth | Passwords need 6 characters; there is no breached-password check. bcrypt cost is 12 (good). | Owner call O-3. |
| S-11 | Info | Auth | Sessions are JWTs that live 30 days; the role is re-read every 5 minutes. A demoted admin keeps the role up to 5 minutes, and there is no "sign out everywhere" (no server-side session list). | Written up; no change (touches session behaviour broadly). |
| S-12 | Info | Dependencies | `npm audit` (production): 1 critical, 3 high, 3 moderate, 1 low. Details below. The critical (Next.js Image Optimizer DoS) does not apply: `images.unoptimized` is true. | **Owner** (dependency changes), O-4. |
| S-13 | Info | Headers | The CSP is report-only and only on the screen paths (`middleware.ts`); elsewhere only `frame-ancestors 'self'` is enforced. | Next step after the report-only data is read; owner call O-5. |
| S-14 | Info | Repo | `_archive/root-twin/next.config.js` (the old Abacus build) injects a base64-encoded client error reporter into the bundle. It is not in the live `next.config.js` (which documents removing it) and it beacons only to its own origin. | Owner call O-6: delete `_archive/` (not this lane's to delete). |

Nothing found in: committed credentials (none: every hit is a fixture or a placeholder), webhook verification,
shared-secret comparison, partner API keys, upload signing, open redirects, HTML injection, CORS, admin pages, and the
dev-only routes.

## By area

### Auth and roles

- **Sign-in** is NextAuth credentials with bcrypt (cost 12), JWT sessions in an `httpOnly`, `SameSite=Lax` cookie
  named `__session`, 30-day lifetime, re-issued daily. The credentials POST is rate limited per email and per trusted
  address in the database (`lib/rate-limits/login.ts`), before NextAuth runs. S-02 fixed the timing leak.
- **Roles** come from the database: the JWT callback re-reads `role` every 5 minutes, so a client cannot keep a role the
  database took away for longer than that (S-11).
- **Admin**: `requireAdmin` (role `admin` only) gates `/api/admin/*`; `/admin/*` pages redirect anyone else on the
  server; the coach knowledge base uses `denyUnlessCoachOrAdmin`. The CRM is the exception (S-04).
- **Redirects after sign-in** go through `lib/auth/safeNext.ts`, which refuses absolute and protocol-relative URLs,
  backslashes, control characters and anything that decodes (up to 5 rounds) into one of those.
- **CSRF**: the session cookie is `SameSite=Lax`, so a cross-site form POST does not carry it, and no route sends
  `Access-Control-Allow-Origin`. The JSON APIs therefore cannot be driven from another site with the user's session.

### Every API route's checks

The table at the end lists all 295 route files. Of the 285 under `/api`: every route that writes has a session, admin,
secret, signature or dev-only check in its file, except the 10 reviewed by hand and listed in
`REVIEWED_PUBLIC_WRITES` (`tests/security/routeScan.ts`), each with what stands in for a session:

| Route | Why it needs no session |
|---|---|
| `/api/auth/[...nextauth]` | NextAuth itself; credentials POST rate limited per email and trusted address |
| `/api/signup` | creates the account; zod-validated; rate limited per email (database) and per address (S-01) |
| `/api/guest` | mints the guest cookie; refuses an age-blocked browser (S-07) |
| `/api/marketing/subscribe` | closed unless `NEXT_PUBLIC_JOIN_LAB_ENABLED`; validated; rate limited |
| `/api/creator/inquiry` | a contact form, rate limited per address |
| `/api/telemetry/crash` | one bounded log line, nothing stored (S-08) |
| `/api/controller-link/rooms`, `/signal` | room-scoped signalling, 6-character codes, 2 h TTL (S-06) |
| `/api/coach-store/unlock/redeem`, `/status` | the 72-bit code bound to one device is the credential; stored hashed |

Ownership on `[id]` routes was checked by hand on a sample: coach-store rows, receipts and call signals answer 404
unless the session user is the booking's client or coach; coach programs go through `accessRole`; form reviews through
`formReviewDetail` / `deleteFormReview` with the user id. No route found that reads another account's row by id alone.

### Rate limits

Two limiters exist. `lib/rate-limits` counts in the shared `rate_limits` table, keys on account, email or the trusted
proxy address (never the client's claim), and fails open when the table is missing. `lib/rate-limit.ts` counts in each
instance's memory (S-03) and, until this review, keyed anonymous callers on the client's own `X-Forwarded-For` (S-01).
The DB limiter's buckets are HMACs, so the table cannot be read back into emails or addresses.

### Payments and webhooks

- All three Stripe webhooks (`/api/stripe/webhook`, `/api/v1/wallet/stripe-webhook`, `/api/books/webhook`) read the raw
  body, require `stripe-signature`, verify with `constructEvent` before any write, and answer 503/500 when their secret
  is not configured. Fulfilment is idempotent (event id or Checkout Session id).
- Checkout routes refuse before calling Stripe when payments are not set up (409 `store_closed`), when virtual
  purchases are off (B10: every product but the coach store), and when the buyer is not a verified adult
  (`adultBuyerGate`). Stripe URLs are built from `NEXTAUTH_URL`, never the request's Origin.
- Success pages verify the Checkout Session on the server (`/api/stripe/verify-session`, SEC-F4), so fulfilment does not
  depend on the webhook.
- The coach store's fulfilment ignores `event.livemode`. Test and live webhook endpoints have different signing secrets,
  so a test event cannot be signed for the live endpoint; noted, not a finding.
- The E2E gate's checkout flow (`tests/e2e/flows/checkout.flow.ts`) holds the client half of this on every PR, against a
  Stripe test fake that refuses any live session.

### Uploads

Both upload routes hand out **signed PUT URLs** rather than accepting bytes: the signature binds the content type and
the exact length (`x-goog-content-length-range: n,n`), and expires in 15 minutes (`lib/soundtrack/storage.ts`,
`lib/coach-store/constants.ts`). Types and sizes are checked before signing (`checkUpload`, `clipRejected`). Coach review
clips are adults-only and owner-scoped; creative-card uploads are rate limited and a private (teen) account's go to a
private bucket path. Downloads are signed GETs for the owner, 1 hour.

### Secrets

- No credential in any tracked file. Every key-shaped hit is a fixture (`sk_live_placeholder`, a fake PEM in a test,
  `s3cret` in a URL parser test) or a placeholder in `.env.example`.
- No `.env`, `.pem`, key or service-account file in the tree or its history.
- Shared-secret routes (`/api/cron/retention`, `/api/arena/reclaim`, `/api/coach-store/reconcile`) compare SHA-256
  digests with `timingSafeEqual` and refuse when the secret is unset. Partner API keys are stored as SHA-256 hashes.
- `tests/security/secrets-in-tree.test.ts` now runs the same scan on every PR.

### Dependency audit (`npm audit --omit=dev`, 2026-10-25; report only)

| Package | Severity | Advisory | Applies here? | Fix |
|---|---|---|---|---|
| `next` 14.2.35 | critical | Image Optimizer DoS via `remotePatterns` (GHSA-9g9p-9gw9-jx7f) | **No**: `images.unoptimized: true` | next 16 (major) |
| `postcss` (via next) | high | XSS in stringify output; file read | Build time only | with next |
| `zod` 3.23.8 | high | memory exhaustion on oversized constrained collections (GHSA-mrhx-c7xc-m3w5) | **Yes, partly**: routes zod-parse request bodies; bodies are size-limited by the platform, not by the app | zod 4 (major) |
| `source-map-js` | high | event-loop DoS on crafted source maps | Build time only | patch available |
| `csv`, `csv-parse` | moderate | prototype replacement via `columns` | Only if CSV import parses untrusted files with `columns` | csv 6.6.4 |
| `fast-uri` | moderate | scheme spoofing | Indirect (ajv) | patch available |
| `webpack` | low | build-time SSRF in `buildHttp` | No (`buildHttp` unused) | patch available |

With dev dependencies: 22 (3 critical, 6 high, 10 moderate, 3 low). The non-major patches (`source-map-js`, `fast-uri`,
`csv`, `webpack`) are owner call O-4.

### Teen and privacy rules against the routes

54 routes call an age, consent or adult gate in their own file (`scanSaveGate`, `canWriteHealthData`,
`adultBuyerGate`, `isVerifiedAdult*`, `teenGateRefusal`, `teenUploadGate`, guardian checks); more call one inside
their lib helper (the coach-store upload checks `isVerifiedAdult` in `uploadUrl`; the coach readiness board and the
combine keep numbers only for verified, opted-in adults in `lib/coach/readiness/server.ts` and `lib/combine/server.ts`).
The person-data write routes the scan found with no gate in the route file were read: they are the user's own consent,
erase and revoke actions, coach-athlete messages (both accounts on one roster), squads (reactions only for teens, held
by the groups lane's tests), learn progress, and `mirror-triumph` (S-09). Party voice and text need a signed ticket that
is refused when `PARTY_TICKET_SECRET` is unset, and carry the adult flag from the database birth year. No route was
found that stores a minor's body, health or camera data without its gate.

## Patches routed to their owners

These change files this lane does not own. Each is small and reversible; the holder (or the owner) applies it.

**R-1 (S-01, owner / rate-limits).** `.env.example`, after the rate-limit block (the file changed in the last 24 hours,
so this lane did not edit it):

```diff
+# Rate limits: how many proxies in front of the app append to X-Forwarded-For (Firebase Hosting -> Cloud Run is
+# usually 1 or 2; measure with a request that logs the header). Unset = the address buckets are skipped by the
+# database limiter and the in-memory one keys on the client's own claim (docs/SECURITY-REVIEW.md S-01).
+TRUSTED_PROXY_HOPS=""
```

**R-3 (S-03, rate-limits).** Move the code lookups to the shared table: add `inviteCode` and `groupCode` buckets to
`RATE_LIMITS` in `lib/rate-limits/policy.ts` (20 per trusted address a minute, the in-memory numbers today) and call
`checkRateLimits(prisma, 'inviteCode', [{ kind: 'ip', value: trustedClientIp(req.headers) }])` in
`app/api/coach/invite/code/[code]/route.ts` and `app/api/groups/join/route.ts` in place of `rateLimit(...)`.

**R-4 (S-04, CRM / owner).** `lib/crm/helpers.ts`:

```diff
-  // Admin-only: role === 'admin' OR the platform owner
-  const ownerEmail = 'elijahbonds1@gmail.com';
-  if (user.role !== 'admin' && user.email !== ownerEmail) {
+  // Admin-only: role === 'admin', as every other admin surface (lib/admin/requireAdmin.ts). An email is not proof of
+  // identity here: sign-up does not verify addresses (docs/SECURITY-REVIEW.md S-04).
+  if (user.role !== 'admin') {
```

Before applying: make sure the owner's own account has `role = 'admin'` in production, or the owner loses the CRM.

**R-6 (S-06, controller-link).** `app/api/controller-link/signal/route.ts`: `data: z.unknown().refine((d) =>
JSON.stringify(d ?? null).length <= 16_384, 'data too large')`; `rooms/route.ts`: `rateLimit(\`cl-room:${clientKeyFromHeaders(req.headers)}\`, 30, 60_000)` before creating.

**R-7 (S-07, guest).** `app/api/guest/route.ts`, first statement: refuse with 429 past 20 new guest sessions per
trusted address an hour (`checkRateLimits` with a new `guest` bucket).

**R-8 (S-08, telemetry).** `app/api/telemetry/crash/route.ts`: refuse a `content-length` over 16 KB with 413, and
`rateLimit(\`crash:${clientKeyFromHeaders(req.headers)}\`, 30, 60_000)`.

**R-9 (S-09, mirror).** `app/api/mirror-triumph/route.ts`: `if (!MODES[mode] && !MODE_INFO[mode]) return 400`.

## Owner calls

| | Question | Options (recommended first) |
|---|---|---|
| O-1 | Set `TRUSTED_PROXY_HOPS` in production? | **a) Yes, after one request logs the real `X-Forwarded-For` shape (likely 1 or 2)** · b) leave unset (S-01 stays open) |
| O-2 | CRM access by role only? | **a) Yes: give your account `role = 'admin'`, then apply R-4** · b) keep the email arm and add email verification first |
| O-3 | Password rule | **a) 8 characters minimum, no breached-password lookup yet** · b) keep 6 · c) 8 + a breached-password check (an outside service: k-anonymity range API) |
| O-4 | Dependency patches | **a) apply the non-major patches now (source-map-js, fast-uri, csv, webpack); plan next 15/16 and zod 4 as post-launch lanes** · b) all after launch |
| O-5 | CSP | **a) read a week of report-only data, then enforce on the screen paths, then everywhere** · b) leave report-only |
| O-6 | `_archive/` | **a) delete it (old build, not deployed)** · b) keep |

## Guards added (run on every PR)

- `tests/security/route-guard.test.ts`: every route file is in the inventory below; every write route has a check or is
  a reviewed public write; no secret compared with `===`. Adding a route: `npx tsx tests/security/inventory.ts --write`,
  then read the new row.
- `tests/security/secrets-in-tree.test.ts`: no live key shape, private key block, real database password or high-entropy
  secret in any tracked file, and no tracked env file but `.env.example`.
- `tests/security/client-key.test.ts`, `tests/security/auth-unknown-account.test.ts`: S-01 and S-02 stay fixed.

## Pass 2 (after wave 2)

Re-run the scan (`npx tsx tests/security/inventory.ts --write`), read every new or changed route row, re-run
`npm audit`, and re-read the routes the wave-2 lanes touched (the multiplayer, coach-delivery and teacher-platform
lanes add the most). Add pass 2's findings as S-15 onward.

## Route inventory

<!-- route-inventory:start (generated: npx tsx tests/security/inventory.ts --write) -->

295 route files (285 under /api). Columns are what the route FILE calls (tests/security/routeScan.ts); a check made inside a lib helper the route calls is not seen here, which is why the findings above were read by hand.

| Route | Methods | Auth | Age/consent gate | Rate limit | Validation | Upload |
|---|---|---|---|---|---|---|
| `/api/account/birth-year` | GET POST | session | yes | · | · | · |
| `/api/account/coach-share` | POST | session | · | · | · | · |
| `/api/account/export` | GET | session | · | · | · | · |
| `/api/account/health-erase` | POST | session | · | · | · | · |
| `/api/account/scan-history/delete` | POST | session | yes | · | · | · |
| `/api/account/scan-history` | GET | session | yes | · | · | · |
| `/api/account/scan-save` | GET POST | session | yes | · | · | · |
| `/api/account/subscription` | GET | session | · | · | · | · |
| `/api/admin/diag` | GET | admin | · | · | · | · |
| `/api/admin/library` | GET POST | session + admin | · | · | · | · |
| `/api/admin/metrics` | GET POST | admin | · | · | · | · |
| `/api/admin/signature-programs` | GET POST | session + admin | · | · | · | · |
| `/api/ai/status` | GET | session | · | · | · | · |
| `/api/analytics` | POST | session | yes | · | yes | · |
| `/api/arena/[matchId]` | GET | session | · | · | · | · |
| `/api/arena/cancel` | POST | session | · | · | · | · |
| `/api/arena/config` | GET | session | · | · | · | · |
| `/api/arena/create` | POST | session | · | · | yes | · |
| `/api/arena/join` | POST | session | · | · | · | · |
| `/api/arena/list` | GET | session | · | · | · | · |
| `/api/arena/music-attempt` | POST | session | · | · | · | · |
| `/api/arena/quick-match` | POST | session | · | · | yes | · |
| `/api/arena/reclaim` | POST | secret | · | · | · | · |
| `/api/arena/submit-score` | POST | session | · | yes | · | · |
| `/api/auth/[...nextauth]` | POST GET | public (reviewed) | · | yes | · | · |
| `/api/bests` | GET | session | · | · | · | · |
| `/api/books/checkout` | POST | session | yes | yes | · | · |
| `/api/books/download` | POST | session + secret | · | yes | yes | upload |
| `/api/books/stream` | POST | session | yes | yes | yes | · |
| `/api/books/webhook` | POST | signature | · | · | · | · |
| `/api/breath/ramp` | GET POST | session | yes | · | · | · |
| `/api/cards/boosts` | GET POST | session | · | · | · | · |
| `/api/cell/chat` | POST | session + role | · | · | yes | · |
| `/api/cell/compile` | POST | session | · | yes | · | · |
| `/api/cell/projects/[id]/bundle` | GET | session | · | · | · | · |
| `/api/cell/projects/[id]/costs` | GET | session + role | · | · | · | · |
| `/api/cell/projects/[id]/export` | GET | session | · | · | · | · |
| `/api/cell/projects/[id]/files` | GET POST | session | · | · | · | · |
| `/api/cell/projects/[id]` | GET | session | · | · | · | · |
| `/api/cell/projects` | GET | session | · | · | · | · |
| `/api/cell/settings` | GET POST DELETE | session | · | · | · | · |
| `/api/cell/venue` | POST | session | yes | yes | · | · |
| `/api/challenge/[code]/attempt` | POST | session | yes | · | yes | · |
| `/api/challenge/[code]/open` | POST | session | yes | · | · | · |
| `/api/challenge/[code]/rematch` | POST | session | · | · | yes | · |
| `/api/challenge/mint` | POST | session | · | · | yes | · |
| `/api/challenge/referral` | POST | session | · | yes | · | · |
| `/api/coach-store/[slug]/slots` | GET | public read | · | · | · | · |
| `/api/coach-store/access/[id]/cancel` | POST | session | · | · | · | · |
| `/api/coach-store/access/[id]/reissue` | POST | session | · | · | · | · |
| `/api/coach-store/bookings/[id]/cancel` | POST | session | · | · | · | · |
| `/api/coach-store/bookings/[id]/connection-failed` | POST | session | · | · | · | · |
| `/api/coach-store/bookings/[id]/reschedule` | POST | session | · | · | · | · |
| `/api/coach-store/call/[bookingId]` | GET | session | · | · | · | · |
| `/api/coach-store/call/[bookingId]/signal` | GET POST | session | · | · | · | · |
| `/api/coach-store/checkout` | POST | session | · | · | · | · |
| `/api/coach-store/program-library` | GET | public read | · | · | · | · |
| `/api/coach-store/receipt/[rowId]` | GET | session | · | · | · | · |
| `/api/coach-store/reconcile` | POST | session + secret | · | · | · | · |
| `/api/coach-store/reviews/[id]/clip` | GET | session | · | · | · | · |
| `/api/coach-store/reviews/[id]/deliver` | POST | session | · | · | · | · |
| `/api/coach-store/reviews/[id]/submit` | POST | session | · | · | · | · |
| `/api/coach-store/reviews/[id]/upload-url` | POST | session | · | · | · | upload |
| `/api/coach-store/rows/[rowId]/status` | GET | session | · | · | · | · |
| `/api/coach-store/settings` | POST | session | · | · | · | · |
| `/api/coach-store/sweep` | POST | session | · | · | · | · |
| `/api/coach-store/unlock/redeem` | POST | public (reviewed) | · | · | · | · |
| `/api/coach-store/unlock/status` | POST | public (reviewed) | · | · | · | · |
| `/api/coach/attention/digest` | POST | session | · | yes | · | · |
| `/api/coach/attention` | GET | session | · | · | · | · |
| `/api/coach/availability` | GET POST | session | · | yes | · | · |
| `/api/coach/business/applications/[id]` | PATCH | session | · | yes | · | · |
| `/api/coach/business/apply` | POST | session | · | yes | · | · |
| `/api/coach/business/checkout` | POST | session | · | yes | · | · |
| `/api/coach/business/checkout/verify` | POST | session | · | yes | · | · |
| `/api/coach/business/connect/dashboard` | POST | session | · | yes | · | · |
| `/api/coach/business/connect` | POST GET | session | yes | yes | · | · |
| `/api/coach/business/highlights/[id]` | GET POST | session | yes | yes | · | · |
| `/api/coach/business/highlights` | POST | session | · | yes | · | · |
| `/api/coach/business/packages/[id]` | PATCH | session | · | yes | · | · |
| `/api/coach/business/packages` | POST | session | yes | yes | · | · |
| `/api/coach/business/pro` | POST | session | yes | yes | · | · |
| `/api/coach/business` | GET PUT | session | yes | yes | · | · |
| `/api/coach/business/sales/[id]/refund` | POST | session | · | yes | · | · |
| `/api/coach/catalogue` | GET | session | · | · | · | · |
| `/api/coach/categories` | GET POST | session + admin + role | · | · | · | · |
| `/api/coach/chat/consent` | GET POST | session | · | yes | · | · |
| `/api/coach/chat` | POST | session | yes | yes | · | · |
| `/api/coach/combine/[id]` | GET PUT DELETE | session | yes | yes | · | · |
| `/api/coach/combine` | GET POST | session | · | yes | · | · |
| `/api/coach/drafts/approve-safe` | POST | session | · | yes | · | · |
| `/api/coach/drafts` | GET POST | session | · | yes | · | · |
| `/api/coach/exercises/[id]` | PATCH DELETE | session + admin + role | · | · | · | · |
| `/api/coach/exercises` | GET POST | session + admin + role | · | · | · | · |
| `/api/coach/form-reviews/[id]/reply` | POST | session | · | · | · | · |
| `/api/coach/form-reviews/[id]` | GET DELETE | session | · | · | · | · |
| `/api/coach/form-reviews` | GET POST | session | yes | · | · | · |
| `/api/coach/guardian-report` | GET POST | session | · | yes | · | · |
| `/api/coach/inbox` | GET | session | · | · | · | · |
| `/api/coach/invite/[token]` | GET POST DELETE | session | yes | · | · | · |
| `/api/coach/invite/bulk` | POST | session | · | yes | · | · |
| `/api/coach/invite/code/[code]` | GET | public read | · | yes | yes | · |
| `/api/coach/invite` | GET POST | session | · | yes | · | · |
| `/api/coach/live` | GET | session + role | · | yes | · | · |
| `/api/coach/live/signal` | GET POST | session + role | · | yes | · | · |
| `/api/coach/live/summary` | POST | session | · | yes | · | · |
| `/api/coach/me/cooldown` | POST | session | yes | · | · | · |
| `/api/coach/me/log` | POST | session | yes | · | · | · |
| `/api/coach/me/plan-updates` | GET | session | · | · | · | · |
| `/api/coach/me/today` | GET | session | · | · | · | · |
| `/api/coach/me/warmup` | GET | session | · | · | · | · |
| `/api/coach/messages/read` | POST | session | · | · | · | · |
| `/api/coach/messages` | GET POST | session | · | · | yes | · |
| `/api/coach/messages/unread` | GET | session | · | · | · | · |
| `/api/coach/prescribe` | GET | session | · | · | · | · |
| `/api/coach/programs/[id]/exercises` | POST | session | · | · | · | · |
| `/api/coach/programs/[id]/gates` | GET | session | · | · | · | · |
| `/api/coach/programs/[id]` | GET | session | · | · | · | · |
| `/api/coach/programs/duplicate` | POST | session | · | · | · | · |
| `/api/coach/programs/exercises/[id]` | PUT DELETE | session | · | · | · | · |
| `/api/coach/programs/exercises/[id]/submit` | POST | session + role | · | · | · | · |
| `/api/coach/programs/exercises/from-kb` | POST | session | · | · | · | · |
| `/api/coach/programs/exercises/from-library` | POST | session + role | · | · | · | · |
| `/api/coach/programs/exercises` | GET POST | session | · | · | · | · |
| `/api/coach/programs` | GET POST | session | · | · | yes | · |
| `/api/coach/readiness` | GET PUT PATCH | session | · | · | · | · |
| `/api/coach/review` | POST | session | · | · | yes | · |
| `/api/coach/roster` | GET | session | · | · | · | · |
| `/api/combine/mine` | GET | session | · | · | · | · |
| `/api/competition/config` | GET | public read | · | · | · | · |
| `/api/competition/create` | POST | session | · | · | yes | · |
| `/api/competition/dispute` | POST | session | · | · | · | · |
| `/api/competition/eligibility` | GET | session | · | · | · | · |
| `/api/competition/join` | POST | session | · | · | · | · |
| `/api/competition/settle` | POST | session | · | · | · | · |
| `/api/competition/submit-score` | POST | session | · | · | · | · |
| `/api/competition/void` | POST | session + admin + role | · | · | · | · |
| `/api/controller-link/rooms` | POST GET | public (reviewed) | · | · | yes | · |
| `/api/controller-link/signal` | POST GET | public (reviewed) | · | · | yes | · |
| `/api/creator/inquiry` | POST | public (reviewed) | · | yes | · | · |
| `/api/crm/companies/[id]` | GET PATCH DELETE | session + admin | · | · | · | · |
| `/api/crm/companies` | GET POST | session + admin | · | · | · | · |
| `/api/crm/contacts/[id]` | GET PATCH DELETE | session + admin | · | · | · | · |
| `/api/crm/contacts` | GET POST | session + admin | · | · | · | · |
| `/api/crm/stats` | GET | session + admin | · | · | · | · |
| `/api/cron/retention` | POST | secret | · | · | · | · |
| `/api/daily-drill/claim` | POST | session | · | · | · | · |
| `/api/drills/[drillId]` | GET | session | · | · | · | · |
| `/api/education/complete` | POST | session | · | · | · | · |
| `/api/education/playbook/check` | GET POST | session | yes | yes | · | · |
| `/api/education/playbook` | GET POST | session | · | · | · | · |
| `/api/education` | GET | session | · | · | · | · |
| `/api/feel-panel` | GET | session + admin | · | · | · | · |
| `/api/groups/[id]/act` | POST | session | · | yes | · | · |
| `/api/groups/[id]/members` | POST | session | · | yes | · | · |
| `/api/groups/[id]` | GET PATCH DELETE | session | · | yes | · | · |
| `/api/groups/join` | GET POST | session | · | yes | · | · |
| `/api/groups` | GET POST | session | · | yes | · | · |
| `/api/guest` | POST | public (reviewed) | yes | · | · | · |
| `/api/guidance` | GET | session | · | · | · | · |
| `/api/health/consent` | GET POST | session | yes | · | · | · |
| `/api/health/db` | GET | public read | · | · | · | · |
| `/api/health/guardian` | GET | session | yes | · | · | · |
| `/api/health/intake` | GET POST | session | yes | · | · | · |
| `/api/health/pain` | GET POST | session | yes | · | · | · |
| `/api/health/readiness` | GET POST | session | yes | · | · | · |
| `/api/health` | GET | public read | · | · | · | · |
| `/api/kitchens/instacart-list` | GET POST | session | · | · | · | · |
| `/api/ladder/enter` | POST GET | session | · | · | · | · |
| `/api/ladder/results` | POST GET | session + admin + role | · | · | · | · |
| `/api/learn/event` | POST | session | · | · | · | · |
| `/api/learn/sync` | GET POST DELETE | session | · | · | · | · |
| `/api/library/[id]` | GET | session + role | · | · | · | · |
| `/api/library/ask` | POST | session + role | · | yes | · | · |
| `/api/library/search` | GET | session + role | · | · | · | · |
| `/api/library/submissions` | GET POST | session + role | · | · | · | · |
| `/api/live/schedule` | GET | public read | · | · | · | · |
| `/api/marketing/reengage` | POST | session + admin + role | · | · | · | · |
| `/api/marketing/referral` | GET | session | · | · | · | · |
| `/api/marketing/subscribe` | POST | public (reviewed) | · | yes | yes | · |
| `/api/marketplace/purchase` | GET | session | · | · | · | · |
| `/api/mastery` | GET | session | · | · | · | · |
| `/api/mirror-triumph` | GET POST | session | · | · | · | · |
| `/api/mirror/assessment` | POST GET | session | yes | · | yes | · |
| `/api/mirror/dunks` | GET POST | session | yes | · | · | · |
| `/api/mirror/prove-it` | POST | session | yes | · | · | · |
| `/api/mirror/screen-history` | POST | session | yes | · | · | · |
| `/api/mirror/screen` | POST PATCH | session | yes | · | · | · |
| `/api/mirror/sessions` | POST GET | session | yes | · | · | · |
| `/api/music/grandfather` | POST | session | · | · | · | · |
| `/api/music/unlock` | POST GET | session | · | · | · | · |
| `/api/nexus/queue` | GET | session | · | · | · | · |
| `/api/nexus/session-result` | POST | session | · | · | · | · |
| `/api/onboarding/host` | GET | public read | yes | · | · | · |
| `/api/partner/v1/catalog` | GET | secret | · | yes | · | · |
| `/api/party/report` | POST | session + secret | · | · | · | · |
| `/api/party/ticket` | GET | session + secret | yes | · | · | · |
| `/api/profile` | GET PATCH | session + role | · | · | · | · |
| `/api/prq/delete` | POST | session | · | · | · | · |
| `/api/prq/entries` | GET POST | session | · | · | · | · |
| `/api/prq/export` | GET | session | · | · | · | · |
| `/api/prq/vector` | GET | session | · | · | · | · |
| `/api/readiness/check` | GET POST DELETE | session | yes | · | · | · |
| `/api/season/checkout` | POST | session + secret | yes | · | · | · |
| `/api/season/claim` | POST | session | · | yes | · | · |
| `/api/season` | GET | session | · | · | · | · |
| `/api/sessions` | POST | session | yes | yes | yes | · |
| `/api/sessions/start` | POST | session | · | yes | · | · |
| `/api/share/[token]` | GET DELETE POST | session | · | · | · | · |
| `/api/share/me` | GET | session | · | · | · | · |
| `/api/share` | POST GET | session | · | · | · | · |
| `/api/shop/purchase` | POST | session | · | · | · | · |
| `/api/shop` | GET | session | · | · | · | · |
| `/api/signature-programs/[id]` | GET POST | session + role | · | · | · | · |
| `/api/signature-programs` | GET | session + role | · | · | · | · |
| `/api/signature` | GET POST | session | · | yes | yes | · |
| `/api/signup` | POST | public (reviewed) | yes | yes | yes | · |
| `/api/story/complete` | POST | session | · | · | · | · |
| `/api/story` | GET | session | · | · | · | · |
| `/api/stripe/checkout` | POST | session | yes | · | · | · |
| `/api/stripe/payout` | POST | session | · | · | · | · |
| `/api/stripe/portal` | POST | session | · | · | · | · |
| `/api/stripe/verify-session` | POST | session | · | · | · | · |
| `/api/stripe/webhook` | POST | secret + signature | · | · | · | · |
| `/api/studio/cartridges` | GET POST | session | · | · | yes | · |
| `/api/studio/credits` | GET POST | session + secret | yes | · | · | · |
| `/api/studio/entitlement` | GET | session | · | · | · | · |
| `/api/studio/partner-keys` | GET POST DELETE | session | · | · | · | · |
| `/api/telemetry/crash` | POST | public (reviewed) | · | · | · | · |
| `/api/v1/camp/assess` | GET POST | session | · | yes | · | · |
| `/api/v1/camp/consent` | POST GET PATCH | session | yes | · | · | · |
| `/api/v1/camp/mentees` | GET | session | · | · | · | · |
| `/api/v1/camp/plans` | GET POST | session | yes | · | · | · |
| `/api/v1/camp/profile` | GET | session | · | · | · | · |
| `/api/v1/camp/revoke` | POST | session | · | · | · | · |
| `/api/v1/camp/sessions` | POST GET | session | yes | · | · | · |
| `/api/v1/camp/templates` | GET POST | session | · | · | · | · |
| `/api/v1/card-slot` | GET POST | session | · | · | · | · |
| `/api/v1/card/[slug]` | GET | public read | · | · | · | · |
| `/api/v1/card/highlights` | GET | session | · | · | · | · |
| `/api/v1/card/publish` | POST | session | · | · | · | · |
| `/api/v1/card` | GET POST | session | · | yes | yes | · |
| `/api/v1/closet/active` | POST | session | yes | · | · | · |
| `/api/v1/closet/buy` | POST | session | · | · | · | · |
| `/api/v1/closet` | GET POST | session | yes | · | · | · |
| `/api/v1/creative-card/[id]/review` | POST | session | · | · | · | · |
| `/api/v1/creative-card/[id]/rotation` | POST | session | · | · | · | · |
| `/api/v1/creative-card/[id]` | GET | session | · | · | · | · |
| `/api/v1/creative-card/review-queue` | GET | session | · | · | · | · |
| `/api/v1/creative-card` | GET POST | session | · | · | · | · |
| `/api/v1/creative-card/slots/buy` | POST | session | · | · | · | · |
| `/api/v1/creative-card/upload-url` | POST | session | yes | yes | · | upload |
| `/api/v1/creator/athlete` | GET POST | session | yes | · | yes | · |
| `/api/v1/hero-body` | GET | session | · | · | · | · |
| `/api/v1/mp/create` | POST | session | · | yes | yes | · |
| `/api/v1/mp/join` | POST | session | · | yes | yes | · |
| `/api/v1/mp/list` | GET | session | · | · | · | · |
| `/api/v1/mp/local` | POST | session | · | · | yes | · |
| `/api/v1/pipelines/community` | GET | public read | · | · | · | · |
| `/api/v1/pipelines/play` | POST | session | · | yes | · | · |
| `/api/v1/scene-packs` | GET | public read | · | · | · | · |
| `/api/v1/sessions/book` | POST | session | yes | · | · | · |
| `/api/v1/sessions/join-link` | POST DELETE | session | · | · | · | · |
| `/api/v1/sessions` | GET | session | · | · | · | · |
| `/api/v1/soundtrack/[id]/play` | POST | session | · | yes | · | · |
| `/api/v1/soundtrack` | GET | public read | · | · | · | · |
| `/api/v1/wallet/checkout` | POST | session + secret | yes | · | · | · |
| `/api/v1/wallet/config` | GET | public read | · | · | · | · |
| `/api/v1/wallet/earn` | POST | session + role | · | · | · | · |
| `/api/v1/wallet/entitlements` | GET | session | · | · | · | · |
| `/api/v1/wallet/exchange` | GET POST | session | · | · | · | · |
| `/api/v1/wallet/ledger` | GET | session | · | · | · | · |
| `/api/v1/wallet` | GET | session | · | · | · | · |
| `/api/v1/wallet/shard-checkout` | POST | session + secret | yes | · | · | · |
| `/api/v1/wallet/spend` | POST | session | · | · | · | · |
| `/api/v1/wallet/stripe-webhook` | POST | secret + signature | · | · | · | · |
| `/api/v1/workout/plan` | POST GET | session | · | · | · | · |
| `/api/v1/workout/scan` | POST GET DELETE | session | yes | · | · | · |
| `/api/wallet/balance` | GET | session | · | · | · | · |
| `/api/wallet/deposit` | POST | session | · | · | · | · |
| `/api/wallet/earn` | POST | session | · | yes | · | · |
| `/api/wallet/equip` | POST | session | · | · | · | · |
| `/api/wallet` | GET | session | · | · | · | · |
| `/api/wallet/spend` | POST | session | · | · | · | · |
| `/api/wallet/withdraw` | POST | session | · | · | · | · |
| `/books` | GET | public read | · | · | · | · |
| `/dev/coach-catalogue/api` | GET POST PUT DELETE | dev-only | · | · | · | · |
| `/dev/coach-loop/api` | GET POST | dev-only | · | · | · | · |
| `/dev/coach-prescribe/api` | GET POST | dev-only | · | · | · | · |
| `/dev/coach-today/api` | GET POST | dev-only | · | · | · | · |
| `/dev/mirror-coach-p1` | POST GET | dev-only | · | · | · | · |
| `/dev/mirror-coach-p3-screen` | POST PATCH GET | dev-only | · | · | · | · |
| `/dev/program-builder/api` | GET POST | dev-only | · | · | · | · |
| `/elijah` | GET | public read | · | · | · | · |
| `/healthz` | GET | public read | · | · | · | · |

<!-- route-inventory:end -->
