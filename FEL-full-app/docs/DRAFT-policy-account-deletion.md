# DRAFT — Privacy Policy change for in-app account deletion

> **DRAFT for the owner. Not live. Nothing in `lib/policies.ts` was changed.** Legal and policy copy is owner-only.
> Lane `lane/account-delete`, 2026-10-25. Approve, edit or reject. When approved, the owner (or a lane the owner names)
> pastes it into `lib/policies.ts` and bumps `CURRENT_POLICY_VERSION` (Privacy §9: material changes are communicated
> in-app).

## Why a change is needed

Privacy §4 says today: *"Until an in-app delete option exists, you can have your account and personal data deleted by
emailing … from the email address on your account."* The in-app option now exists (Account settings → **Delete my
account**, owner decision 2 of 2026-10-25). Once it ships, §4 is out of date, and §8 ("via your Profile settings")
points at the wrong screen: export and erase live in account settings.

The in-app screen already shows what is deleted and what is kept, and every "kept" line repeats a rule the policy has
already written (`lib/data-rights/deleteCopy.ts` names its source per line). This draft makes the policy say the same.

## Proposed text

### §4. Data Retention & Deletion (replaces the current paragraph)

> You may export or delete your PRQ data at any time from your account settings.
>
> **Deleting your account.** You can delete your account in the app, from **Account settings → Delete my account**.
> We ask you to type the email address on the account and your password, and to confirm. You can download your data
> first from the same screen. You can also still ask us by email, from the email address on your account, at
> ${BUSINESS_CONTACT_EMAIL}.
>
> When your account is deleted, we delete your sign-in, name, birth year and state, and the personal data in your
> account: your profile and PRQ, Mirror sessions and assessments, movement history, workouts and plans, game progress,
> health intake, pain check-ins, daily check-ins and Dial-Up Breath uses, your coaching sessions, messages and form
> reviews, your challenge links and the squads you own. If you coach, your client list, invites, availability and coach
> profile text are deleted and your coach page is taken down. You are signed out on every device.
>
> Some records are kept, for the reasons this Policy gives elsewhere:
> - **Money records** — orders, payments, refunds, payouts, referral rewards and your wallet history — for 7 years after
>   the purchase, for tax and accounting (§10), with your name and email removed. A booking keeps its price and dates;
>   your goal, notes, pain answer and written review are deleted. Anything left in your wallet can't be used after the
>   account is deleted.
> - **Consent records** — health data consent, a parent's or guardian's consent, and your choice about saving scans —
>   as proof of what you agreed to and when (§5).
> - **Party reports** — a report you made is kept for its 12 months without your name; a report about you is kept for
>   its 12 months, then deleted (§1).
> - **Records other people rely on** — a coach's programs for their clients, match and ladder results — with your name
>   removed.
>
> An empty placeholder for the account, with no name, email or password, keeps those records consistent. Nobody can
> sign in to it.
>
> Before an account can be deleted in the app, anything in progress has to be settled first: a booking still to be
> delivered or attended, a refund or dispute that is open, a payout on its way, or a subscription or coaching plan that
> would renew. The screen lists what is open.
>
> **Under 18.** If you are under 18, or we don't have your birth year, the account is not deleted in the app: a parent
> or guardian asks us by email at ${BUSINESS_CONTACT_EMAIL}, and we delete it. If you are 18 or over and we don't have
> your birth year, email us from the email address on your account.

### §8. Your Rights (replaces the current sentence)

> You can download your data (JSON) and delete your account from your account settings, or ask us by email (§4).

## Owner calls this draft depends on

1. **Minors (blocked in the app, by email instead).** A guardian has no account here (GuardianConsent holds a name and an
   email), so there is no in-app place for a guardian to act, and nothing in the repo said whether a 13–17-year-old may
   delete their own account. The app blocks under-18s and blank birth years and says "ask your parent or guardian to
   email us". Alternatives: let a minor delete their own account (deleting is privacy-protective), or build a
   guardian-link delete on the existing signed guardian link (`lib/coach/guardianLink.ts`).
2. **Obligations block, not handled.** The app does not cancel subscriptions, refund bookings or move payouts on the
   person's behalf; it lists them to settle first. Say if any should be handled automatically instead.
3. **The 7-year purge does not exist yet.** The policy says money records are deleted after 7 years; nothing deletes them
   (docs/DATA-RIGHTS.md §3.2). The draft keeps the existing wording; a retention job is needed to make it true.
4. **Wallet history and payouts as "money records".** §10 names "order, payment, refund and referral records". The erase
   also keeps the wallet ledger (Lab Credits) and payout requests (DATA-RIGHTS.md §2). The draft names them; confirm.
5. **A wallet balance is forfeited.** The draft says so plainly. Confirm, or decide on a pay-out / refund first.
6. **Coach reply clips** stay in storage after a client's account is deleted (DATA-RIGHTS.md §3.7: nothing sweeps reply
   objects). The draft does not claim they are deleted. A storage delete would let the policy say so.
7. **Version bump** of `CURRENT_POLICY_VERSION` with the paste, which re-asks every signed-in person to accept.
