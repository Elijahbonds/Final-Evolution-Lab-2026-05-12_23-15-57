# Teen-safe defaults: an audit of every social surface

**Safety lane (SAF-08), 2026-10-25.** Read from the code at `lane/safety` (base `origin/lane/finish-release` e173f413).
The rules held against each surface are the owner's: **under 18 fails closed; under 13 never; no free text from or
about minors; legal and consent words are the owner's drafts.** "Teen" below means the app's own test: not a verified
adult (`lib/privacy/verifiedAdult.ts`, a year gap of more than 18), which includes a blank birth year and a guest.

Each surface: what a teen can do today, the verdict, what this lane fixed in its own files, and what is left (routed to
the owner of the file, or an owner call). Nothing here changes `lib/policies.ts` or `server/netd/**`.

## Summary

| Surface | Teen today | Verdict | Fixed here | Left |
|---|---|---|---|---|
| Guardian consent | Asks a guardian; a yes unlocks a camp plan only | Was missing the promised withdraw | **Withdraw link** (SAF-01), re-ask (SAF-02), wording version (SAF-03) | Reader wiring for the version (R1); report-link withdraw (R2); owner calls O1–O3 |
| Profile (`/u/[slug]`) | Never public; seen by self, coach, squadmates | Safe | **Report** (preset reasons only) | — |
| Squads / teams | Closed (no squads wording live) | Safe today | **Team names screened**; **Report** on the squad | Withdraw does not remove from squads (O2); adult + minor squads (O5) |
| Challenges | Plays; result card shows "A friend" unless an adult chose a name | Safe | **Report** on the result card | — |
| Party (netd) | Presets and emotes only; no voice; adults' free text never relayed to teens | Safe | — | netd over-masks four real words (R5) |
| Trainer share links | Trainer-written, first name only, public URL | Words were screened for medical claims only | **Abuse screen** added to `lib/share/screen.ts` | — |
| Coach threads | Closed (no teen on a roster until coach-training wording is live) | Safe today; NOT at go-live | — | Coach messages unscreened (R3); teens would read coach free text (O4); no Report mount (R4) |
| Report a problem | Sends context only | Safe | **Built** (SAF-04): no account, email or address stored; teen text dropped | Retention (O6) |
| Reports + moderation | Reports with preset reasons; sees own standing; appeals with a preset reason | Safe | **Built** (SAF-05) | Mute/ban enforcement wiring (R6); retention (O6) |

## 1. Guardian consent

- **Found:** nothing wrote `GuardianConsent.revokedAt`, while the draft wording promises "withdraw at any time".
  **Fixed (SAF-01):** `lib/consent/withdraw.ts` — a signed, single-use link (HMAC over the consent id, no expiry, names
  nobody), shown on the accept page once confirmed and in the accepted email (off: `GUARDIAN_ACCEPTED_EMAIL_ENABLED`);
  `POST /api/consent/withdraw` sets `revokedAt` on that guardian's open consents for the athlete, never deletes a row.
  Every gate re-reads the consent per request; `tests/consent/withdraw-gates.test.ts` runs roster join, set log, squad
  join and the combine 403 → 200 → withdraw → 403.
- **Found:** no way to re-ask a guardian under the new words. **Fixed (SAF-02):** `POST /api/consent/reask` and the
  panel on `/consent/guardian`, wording from one slot (`lib/consent/wording.ts`, placeholders marked `TODO(owner):
  OWN-03` that can never go live). Both dates stay `null`, so nothing changes today.
- **Found:** the coach-training/squads test was a date proxy. **Fixed (SAF-03):** `GuardianConsent.wordingVersion`
  (pending SQL), stamped on every new request, read by the gates when present; a row without one is judged by its date
  exactly as before.

## 2. Profile

`lib/profile-v2/visibility.ts`: an under-18 or unknown-age owner is never public; refusals are a 404 identical to a
missing slug. **Added:** a preset-only Report on someone else's profile (signed in, not on your own).

## 3. Squads and teams

No free text (preset reactions and nudges, `lib/groups/types.ts`); typed team names only by a certified coach. Teens are
closed out until the squads wording is live (`SQUADS_CONSENT_SINCE = null`). **Fixed:** a typed team name now passes the
shared text screen (`lib/groups/rules.ts` `checkGroupName`). **Added:** Report on a squad or team.

## 4. Challenges

The other player shows as "A friend" unless an adult chose to show a name; a teen's result stays on the phone. **Added:**
Report on the result card for signed-in viewers.

## 5. Party

`server/netd/src/party.ts`: a teen (no adult ticket) gets presets and emotes, no voice, and adults' free text is relayed
to adults only. Safe. See R5 for a word-list bug.

## 6. Trainer share links

Trainer-authored text on a public URL, first name only (`lib/share/shareable.ts`). It was screened for medical claims,
not abuse. **Fixed:** `lib/share/screen.ts` now also flags the shared text screen's abuse kinds (contact details are
left to the trainer: their own number is theirs to publish).

## 7. Coach threads

`POST /api/coach/messages` stores free text up to 2,000 characters with no screen (`lib/coach/loop.ts`
`validateMessage`). No teen can be on a roster today, so no teen reads one. At go-live of the coach-training wording a
consented 13–17 would read their coach's free text — see O4.

## Routed (one line each, for the file's owner)

- **R1 — wordingVersion readers** (coach-parity / teams / combine owners). Add `id: true` to the GuardianConsent select
  and wrap with `withWordingVersions(prisma as unknown as RawDb, rows)` from `lib/consent/wording.ts` in:
  `lib/coach/teenGateServer.ts` `readTeenGate`; `lib/groups/server.ts` `gateFor`; `lib/combine/server.ts`
  `rosterAthletes`; `lib/coach/guardianReportServer.ts` `reportConsent`. Until then those gates use the date proxy,
  which is today's behaviour.
- **R2 — the withdraw link on the guardian report** (coach owners): in `lib/coach/guardianReport.ts`
  `guardianReportEmail` and `app/guardian/report/[token]/page.tsx`, add `withdrawHref(consentId)` from
  `lib/consent/withdraw.ts` (the page has the consent id from `readGuardianReportToken`).
- **R3 — screen coach messages:** in `lib/coach/loop.ts` `validateMessage`, refuse when
  `!passesScreen(s)` (`lib/safety/textScreen.ts`).
- **R4 — Report on coach threads:** `components/coach/thread-messages.tsx`, one
  `<ReportButton target="coach_message" refId={m.id} />` per message not written by the viewer.
- **R5 — netd over-masks real words** (owner's next netd deploy): its collapsed-letter match turns "as" into "ass",
  "assess" into "asses", "con" into "coon" and "cons" into "coons", so party chat masks them. The fix is the one in
  `lib/safety/textScreen.ts` (collapse only a word with a run of three). Pinned in `lib/safety/textScreen.test.ts`
  `NETD_OVER_MASKS`, so it fails here when netd is fixed and the pin can drop.
- **R6 — mute and ban enforcement:** `moderationState(db, userId)` in `lib/safety/reports.ts` is the reader. Wire a
  `muted` refusal into `app/api/groups/[id]/act/route.ts`, `app/api/coach/messages/route.ts` (POST) and the challenge
  mint; a `banned` refusal into sign-in (`lib/auth.ts`) and `lib/party/social/ticketServer.ts` (no ticket). Until then a
  mute or ban is recorded, shown to the person, appealable and audited, but does not yet stop them.

## Owner calls (recommendation first)

- **O1 — Wording (OWN-03).** Approve the guardian words for coach training and squads; then put them in
  `GUARDIAN_CONSENT_DRAFT` and set the two dates together. (a) the COACH-LOOP §1 / TEAMS-SQUADS §3 drafts as they are,
  recommended; (b) rewrite with counsel; (c) keep teens closed.
- **O2 — What a withdraw ends.** Today it closes every gate for new actions; an existing roster link and squad
  membership stay. (a) at withdraw, end the teen's live roster links and squad memberships, recommended — the draft
  squads wording already promises "leaves every squad"; (b) keep them, block new actions only (today); (c) end squads
  only.
- **O3 — Another guardian's yes.** A withdraw closes that guardian's consents only. (a) any guardian's withdraw closes
  every consent for the athlete, recommended (the careful side); (b) per guardian (today).
- **O4 — Teens and coach free text at go-live.** (a) coach messages to a 13–17 are screened (R3) and the guardian sees
  the thread in the report, recommended; (b) preset messages only for teens; (c) no threads for teens.
- **O5 — Adults and minors in one squad** (TEAMS-SQUADS §3 #8). (a) a squad with a minor is minors-only, recommended;
  (b) owner-approved joins; (c) as built.
- **O6 — Retention** of `UserReport`, `UserModeration`, `ModerationAudit`, `ProblemReport` (nothing deletes them yet).
  (a) reports and problem reports 12 months like party reports, moderation and audit 24 months, recommended; (b) all 12
  months; (c) keep until the account is erased.

Not an issue, checked: a re-ask leaves a camp plan's unlock alone — `app/api/v1/camp/plans` reads any accepted,
unrevoked consent, not the newest row, so the pending re-ask does not close it (and a withdraw does).
