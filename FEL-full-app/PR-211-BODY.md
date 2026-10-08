# P3: membership delivers (programsForAccess, membership player, teen parent view, noindex coming-soon lanes)

> **NOTE FOR ELIJAH — please replace this PR's title & body with this content** (the agent sandbox cannot edit PR title/body directly — GitHub writes are blocked — so the body is committed here and mirrored in a comment).
>
> **Retitle exactly:** `P3: membership delivers (programsForAccess, membership player, teen parent view, noindex coming-soon lanes)`
>
> Keep PR #211 a **DRAFT**. Do not merge until the DB suites below pass in GitHub CI's database run (`npm run test:ci`).

---

**Base SHA:** `d04d1031384836e4ca6605ac6c52afb212037d42` (lane/finish-release — unchanged; not moved past d04d1031, so no merge/rebase was needed).
**Pre-flight (task 8aa045f0 review):** FAILED read-only — it had flipped `bundlePolicy.ts` false→true, changed `productsGrantedBy` in `entitlement.ts` (adding `MEMBERSHIP_PRODUCT_KEY` → checkout 409 `already_owned`), and rewritten existing assertions in `entitlement.test.ts` / `bundlePolicy.test.ts`. This follow-up reverts all of that.

## R1 restore proof (money files byte-identical to base)

`git diff origin/lane/finish-release...HEAD -- FEL-full-app/lib/coach-store/bundlePolicy.ts FEL-full-app/lib/coach-store/entitlement.ts FEL-full-app/lib/coach-store/entitlement.test.ts FEL-full-app/lib/coach-store/bundlePolicy.test.ts` → **(empty)**

Blob SHAs at HEAD (`git rev-parse HEAD:FEL-full-app/lib/coach-store/<file>`) — all match base:

| file | blob |
|---|---|
| bundlePolicy.ts | `c9e62bff15669facec2d404baa3ef3059feacf76` |
| entitlement.ts | `0a95774ec51933df4fddc9bfa89b739ac13df194` |
| entitlement.test.ts | `1124680feabbd359303f258255e4cf9d7f9fefc9` |
| bundlePolicy.test.ts | `11a0ae10621742afe133e5f0f8193d98c3c07e2e` |

`git diff --stat origin/lane/finish-release...HEAD` — **exactly the 4 expected files, nothing else:**

```
 .../app/coach/[slug]/programs/[lane]/page.tsx      |   2 +-
 FEL-full-app/app/program/[accessId]/page.tsx       |  47 ++++-
 .../lib/coach-store/membership-delivers.test.tsx   | 233 +++++++++++++++++++++
 FEL-full-app/lib/coach-store/programsForAccess.ts  |  63 ++++++
 4 files changed, 337 insertions(+), 8 deletions(-)
```

The four money/test files are **not in the diff at all.**

## Per item

- **M1 — `programsForAccess` (one pure answer).** NEW `lib/coach-store/programsForAccess.ts`. Exports `RELEASED_PROGRAM_KEYS` (derived from `STORE_PRICES`: manifest `kind==='program'` && !`programComingSoon`; today exactly `['dunking-plyometrics-8wk']`) and pure `programsForAccess(row, policy = currentEntitlementPolicy()): readonly string[]` implementing the M1 truth table (lane/product/bundle/all/teen_all/else). No I/O, no status logic.
  - **Why a new file:** the original M1 said to put these in `entitlement.ts`, but `entitlement.ts` must stay byte-identical, so per the PM override they live in `programsForAccess.ts`. It only *imports* `currentEntitlementPolicy`/`EntitlementPolicy` (./entitlement), `STORE_PRICES` (./storePrices) and `programComingSoon` (./manifest) — none of those files are edited.
- **M2 — the player renders that list.** `app/program/[accessId]/page.tsx`: flag check → owner check → B4 `programAccessOpen` gate with the unchanged `"This program isn't active."` branch, in that order. After them it computes `keys = programsForAccess(access)` and renders from keys (`dunking-plyometrics-8wk` → `DUNK_WEEKS` block, `drillsForTeen` for teen rows; course/series keys → the existing `ProductVideos` blocks). Adult membership (`scope 'all'`) adds one line under the header: "Re-screen trend board and plans that adjust: coming soon." (the "Re-screens sit on days 14, 28, 42 and 56." line is kept). An open row with empty keys renders "Nothing to show yet.". Heading is "Your program" for every row.
- **M3 — teen parent view.** When `access.scope === 'teen_all'`, the page renders a parent view INSTEAD of the drill list: program titles (`storePriceByKey(key).title`) with week titles only (no drill names/cues), the unlock steps ("On your teen's phone, open `<siteOrigin() or /program/unlock>` and type the unlock code from checkout. Lost it? Re-issue a code from Account, then Coaching."), and "Your teen's progress stays on their phone. They can share a one-page summary with you from there." `ParentSummary` is not rendered. Other teen rows keep `drillsForTeen` unchanged.
- **M4 — noindex coming-soon lanes.** `app/coach/[slug]/programs/[lane]/page.tsx` `generateMetadata`: `robots: { index: params.lane === 'dunking', follow: true }` → `correctives`/`posture` get `{index:false, follow:true}`, `dunking` stays `{index:true, follow:true}`. Only the robots value changed; title/description/openGraph/body identical.

## Tests (all in `lib/coach-store/membership-delivers.test.tsx`, rewritten; describe blocks "P3 M1 …"–"P3 M4 …" + "P3 membership delivers — acceptance")

- **(a)** ACTIVE `all` row → all 8 dunk week titles + drill names. *(M2: "(a) an ACTIVE adult membership (scope all) renders all 8 dunk weeks with drill names")*
- **(b)** PAUSED/CANCELED/past-accessUntil/REFUNDED/PENDING `all` rows → "This program isn't active.", no week title, no drill name. *(acceptance: "(b) …")*
- **(c)** `teen_all` parent view → no `adultOnly` drill name, no drill name at all, unlock steps with `/program/unlock`. *(M3: "(c) …")*
- **(d)** `generateMetadata` → correctives & posture `noindex`, dunking `index:true`. *(M4: "(d) …")*
- **(e)** existing `entitlement.test.ts`, `bundlePolicy.test.ts`, `program-access-open.test.tsx` pass **UNCHANGED**.
- **(f)** `programsForAccess` truth table for every scope with `membershipIncludesCourses` false and true (passed as the `EntitlementPolicy` arg — bundlePolicy is **not** mocked to true); `RELEASED_PROGRAM_KEYS === ['dunking-plyometrics-8wk']`, no coming-soon lane. *(M1 block)*
- **(g)** parity: ACTIVE `lane`/dunking, `product`/course, `product`/series, `bundle` render the same week titles, drill names and video titles as before, adult and teen beneficiary. *(M2: "(g) …")*
- **(h)** ACTIVE `all` shows the coming-soon line; a `lane` row does not. *(M2: "(h) …")*
- **(i)** another user's `all` row → notFound. *(acceptance: "(i) …")*

**ENV VARS:** none read or added.
**STRIPE CALLS:** none added or changed.

**Defaults used (PM defaults Elijah can change):** `membershipIncludesCourses` = false; trend board shown as "coming soon"; no listing copy changes.

## Gates (run from FEL-full-app/, DATABASE_URL/DIRECT_URL unset)

- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **19238 passed | 39 skipped | 1 todo (0 failed)** across 1338 files
- `npm run test:suites` (`scripts/ci-suite.ts`) → **203 passed, 0 failed, 11 skipped**
- `npm run lint` (`eslint . --max-warnings=0`) → **clean (0 warnings)**

**No existing test file changed.**

## DB suites skipped locally (no DATABASE_URL) — must pass in GitHub CI's database run (`npm run test:ci`) before merge

`DATABASE_URL: unset (DB suites skipped)`; skipped 11: `arena-tests.ts, coach-store-db-tests.ts, creative-card-tests.ts, economy-tests.ts, ledger-invariants.ts, ledger-tests.ts, m2-tests.ts, m3-tests.ts, m4-tests.ts, prq-tests.ts, wallet-tests.ts`.

## Manual checks for AM (not automated)

- As a test buyer with an ACTIVE adult membership, open `/program/<id>` → the 8 dunk weeks render, plus the "coming soon" line; no Signature/Blueprint libraries.
- As a parent, open the teen membership row → parent view (titles + week titles, no drill names) with the unlock steps.
- `/coach/<slug>/programs/correctives` and `/posture` serve `noindex`; `/dunking` stays indexed.
