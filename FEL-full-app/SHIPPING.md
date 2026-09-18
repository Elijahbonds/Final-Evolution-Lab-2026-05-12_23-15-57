# FEL — Final Evolution Lab · shipping guide

The app: a **Next.js 14** (App Router, React 18) site whose games run on **Babylon.js 9** with Havok physics,
backed by **Prisma/PostgreSQL** and **NextAuth**, with Stripe for the wallet. One repo, one deploy.

Everything below is what a fresh machine needs — nothing here assumes this working tree.

---

## 1. Run it locally

```bash
npm install                 # Node 22.x (this tree runs 22.22.2)
cp .env.example .env.local  # fill in at least DATABASE_URL + NEXTAUTH_SECRET
npx prisma generate
npx prisma migrate deploy   # or `npx prisma db push` against a scratch database
npm run dev                 # http://localhost:3000
```

Only `DATABASE_URL` and `NEXTAUTH_SECRET` are needed to boot. Stripe, S3, the OAuth providers, Controller Link
and the Kitchens keys each gate their own feature and fail closed when unset — see the comments in `.env.example`.

**Playing a mode directly** (no lobby, no auth): `/dev/mode/<id>` — e.g. `/dev/mode/skateboard`,
`/dev/mode/dunk`, `/dev/mode/onevone`. The guest funnel is `/try`. The enabled list is
`ENABLED_BABYLON_MODES` in `lib/babylon/modes/registry.ts`.

## 2. Check it

```bash
npm test                    # vitest — 89 files / 728 tests
npx tsc --noEmit            # types
npm run build:check         # production build into .next-verify (leaves .next alone)
```

`HoopsMoves M7` is a known red and is red on every base commit; it is reported, not patched. Everything else is green.

**Visual/gameplay verification** is done with headless Playwright probes in `scripts/probes/`, not by eye:
each drives a real mode with a fake pad and grades it per rendered frame. Examples:

```bash
npx tsx scripts/probes/_venice-skate-thps.mts 3009 /tmp/skate after
npx tsx scripts/probes/_venice-skate-grade.mts /tmp/skate/after-rows.json
npx tsx scripts/probes/_board-family-smoke.mts 3009 /tmp/family surf,snowboard_slalom,bigair
```

They expect a dev server on the port you pass. Run a second one off the main port with
`NEXT_DIST_DIR=.next-f9 npx next dev -p 3009` so a probe never fights the server you are using.

## 3. Deploy

The repo is configured for **Firebase Hosting with the frameworks (SSR) backend** — `firebase.json` +
`.firebaserc`, project `final-evolution-lab`, region `us-central1`:

```bash
npx firebase-tools@latest login
npx firebase-tools@latest deploy --only hosting
```

Production needs the real environment set on the backend (not in git): `DATABASE_URL`, `NEXTAUTH_SECRET`,
`NEXTAUTH_URL` (the live origin), the `STRIPE_*` keys if checkout is live, and — if phone-as-controller is on —
`CONTROLLER_LINK_KV_URL` / `CONTROLLER_LINK_KV_TOKEN`, because the in-process fallback store is correct in dev
and **broken on any serverless host** (each invocation can land in a different isolate).

Any Node host works too (`npm run build && npm start`); nothing in the app is Firebase-specific.

## 4. State of play

- The 3-D modes in `ENABLED_BABYLON_MODES` are the shipping surface; each has been through an A+ pass with a
  per-frame probe behind it, and the commit message for that pass is the record of what was measured.
- Rendering is Babylon 9 + procedural IBL on WebGL2. WebGPU is behind `NEXT_PUBLIC_WEBGPU` and is not the
  default; `NEXT_PUBLIC_IBL_SHADOWS` is WebGL2-only and the two are mutually exclusive in practice.
- `NEXT_PUBLIC_DISABLE_3D=1` is the kill switch: every mode falls back to its Canvas 2D form.
- The older `*_AUDIT*.md` / `PHASE*.md` documents at the repo root are historical and were written against
  earlier trees; where they disagree with the code, the code and the commit messages are the truth.
