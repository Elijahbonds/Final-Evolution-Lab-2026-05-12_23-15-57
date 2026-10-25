# DRAFT — FEL community guidelines

> **DRAFT FOR THE OWNER'S APPROVAL. NOT LIVE, NOT LINKED, NOT POLICY.** Written by the safety lane (SAF-07,
> 2026-10-25) as a starting point. Nothing in the app links here or quotes it. Publishing it, adding it to
> `lib/policies.ts`, and the `CURRENT_POLICY_VERSION` bump that goes with it are the owner's (OWN-05), with counsel's
> review. Every number and promise below is marked with what in the code it describes, so the owner can check the
> words against what FEL does today. Where the words go further than the code, it says so.

---

## The short version

FEL is a training app. People here are working on their game, and a lot of them are teenagers. Be the teammate you'd
want: hype people up, keep it about the training, and keep everyone safe.

## 1. Who FEL is for

- **13 and over.** No accounts under 13. *(Code: `lib/privacy/ageScreen.ts`, `ageScreenOutcome` 'blocked'.)*
- **Teens (13–17) get a quieter FEL.** No free-text chat, no voice in parties, no public profile, and coaching and squads
  only with a parent or guardian's OK. *(Code: `server/netd/src/party.ts` `rights`; `lib/profile-v2/visibility.ts`;
  `lib/coach/teenGate.ts`; `lib/groups/gates.ts`. Squads and coach training for teens are closed today until the
  guardian wording is approved: OWN-03.)*

## 2. Be a good teammate

Do:
- Cheer, react, rematch, trash-talk the score — not the person.
- Keep it about training and games.
- Tell us when something is wrong ("Report" on a profile, a squad or a challenge result; "Report a problem" on the
  support page).

Don't:
1. **Bully or harass** anyone, including piling on, mocking someone's body or ability, or following them around the app.
2. **Hate.** No slurs, and nothing attacking people for race, ethnicity, religion, gender, sexual orientation,
   disability or where they're from.
3. **Sexual content or approaches.** None, anywhere on FEL — and never toward a minor, which we report to the
   authorities. *(Owner and counsel: confirm the reporting promise before publishing.)*
4. **Threats or violence**, including "joking" ones.
5. **Self-harm.** Don't encourage it, ever. If you're struggling, talk to someone you trust or a local helpline.
   *(Owner: decide whether FEL shows a helpline here, and which.)*
6. **Ask for or share contact details** — phone numbers, emails, addresses, other apps' handles — or try to move
   someone off FEL. Especially not with a teen.
7. **Spam or scams.**
8. **Cheat** — fake scores, someone else playing your ranked runs, bending the camera. *(Wording to match the fairness
   rules: ranked and paid play take no feel-panel knobs.)*
9. **Pretend to be someone else**, including a coach, a real athlete or FEL staff.
10. **Share someone else's private information**, pictures or videos.

These are the nine report reasons in the app, in the same order of seriousness (`lib/safety/reportPresets.ts`
`REPORT_REASONS`: harassment, hate, sexual, threat, self_harm, spam, cheating, impersonation, other).

## 3. What we check automatically

Anything you type that someone else can read passes a word and pattern screen first — slurs, strong profanity, threats,
self-harm baiting, sexual approaches and contact details. If it trips, you're asked to change it; we don't rewrite your
words. *(Code: `lib/safety/textScreen.ts`; today on team names, trainers' public notes, report and appeal notes, and
"Report a problem". Party chat has its own masking in netd. Coach messages are not screened yet — routed, see
docs/TEEN-SAFE-AUDIT.md.)*

## 4. What happens when someone breaks these

| Step | What it means | In the code today |
|---|---|---|
| **Warning** | A note on your account saying what rule was broken. | `UserModeration` kind `warn` |
| **Mute** | You can still train and play, but you can't post or message others for a while (7 days by default). | kind `mute`, `DEFAULT_DAYS.mute = 7` — **enforcement in the write routes is routed, not live** |
| **Ban** | Your account can't be used, until an admin lifts it. | kind `ban` — **sign-in enforcement is routed, not live** |

A person reviews every report; nothing is decided by a machine. Serious harm to a minor may skip straight to a ban.
*(Owner: confirm.)*

## 5. Reporting

- **Report** is on profiles, squads and challenge results. Pick a reason; adults may add a short note.
- **The person you report is never told who reported them.** They see the rule and the outcome, nothing else.
  *(Code: `lib/safety/reports.ts`; their data export leaves reports about them out: `lib/data-rights/registry.ts`.)*
- **Reports are reviewed by FEL staff.** *(Owner: name a response time only once one can be kept.)*

## 6. Appeals

Every warning, mute and ban can be appealed **once, within 30 days**, from the support page. Pick why; adults may add a
short note. A person reviews it and either lifts it or keeps it, and you'll see which. *(Code: `APPEAL_WINDOW_DAYS = 30`.)*

## 7. Parents and guardians

A parent or guardian's OK is what lets a teen train with a coach or join a squad on FEL. They can **withdraw it at any
time** from the link they get when they say yes, and it takes effect straight away. *(Code: `lib/consent/withdraw.ts`;
the email that carries the link is off until the owner turns it on: `GUARDIAN_ACCEPTED_EMAIL_ENABLED`.)*

---

### Owner checklist before publishing

1. Approve or rewrite each section; strike anything FEL does not do yet (§4 mute/ban enforcement is routed).
2. Decide the self-harm resource (§2.5) and the reporting-to-authorities promise (§2.3) with counsel.
3. Decide how long reports and moderation records are kept (docs/TEEN-SAFE-AUDIT.md, owner calls).
4. Add the link (footer, support page, sign-up) and the Privacy/Terms lines in ONE `CURRENT_POLICY_VERSION` bump (OWN-05).
