# The coach platform, audited against the field (2026-09-19)

Owner's list: CoachNow · TrueCoach · Muscle & Motion · PJF Performance · THP Strength · ATG Online Coaching.
Researched from their own product pages and store listings, then checked against what is actually in this tree —
not against what the roadmap says is in this tree.

## What they are, in one line each

| Product | What it actually is | Their strongest thing |
|---|---|---|
| **TrueCoach** | The direct competitor: a coach's programming tool with a client app | Free-form builder, ~3,000 exercise demo videos, logging, two-way messaging with video feedback, Stripe billing, and compliance alerts that warn a coach a client is drifting before they churn |
| **CoachNow** | Media-first coaching spaces, not fitness-specific | The shared "space" per client — video, notes and feedback in one thread |
| **Muscle & Motion** | An anatomy and biomechanics *library*, not a coaching tool | 3D muscle animation, 1,200+ exercises with anatomical analysis and the common mistakes for each |
| **PJF Performance** | A trainer's programs sold as products (vertical, skills, IQ) | Authority. Paul Fabritz's NBA client list *is* the product |
| **THP Strength** | Assessment-driven vertical-jump coaching | A questionnaire (jump style, strength, injury history, schedule, goals) routed into one of 280+ tested cycles |
| **ATG Online Coaching** | Follow Ben Patrick's own programming | "Coaching your form every workout" — form correction as the headline feature |

## Where we already win, and it is not close

1. **The demo is the athlete's own body.** `components/coach/exercise-demo.tsx` renders an exercise on the 3D avatar.
   Muscle & Motion built an entire business on 3D exercise animation; TrueCoach ships stock video. Ours is the
   athlete's own character doing the movement, and it costs nothing per exercise added.
2. **The client experience is a game.** Every one of these six delivers a client app that is a checklist with videos.
   THP does not even own theirs — their programming is delivered through TeamBuildr. The client side here is a
   platform an athlete already opens for fun, which is the churn problem the entire category is losing to.
3. **The Mirror is the thing none of them can answer quickly.** ATG's headline is form coaching — done by humans
   reviewing uploaded video, on a delay. THP's differentiator is an assessment — done by questionnaire, by hand,
   once. Ours is a camera movement screen from the owner's own books that scores the athlete, names the asymmetry and
   writes the corrective work, in the session, for free. That is their two flagship features, automated.
4. **Sharing is free by construction.** `lib/share/service.ts` consults no plan, no subscription, no entitlement, and
   the leak guard means athlete data never travels in a shared object. The category charges per client seat.

## Where they beat us today

Ranked by how much it costs us, most expensive first.

1. **There is no way to add a client. At all.** No invite, no code, no email. `/api/coach/roster` derives the roster
   from existing *programs*, so a client does not exist until a coach has already built them one. Every competitor
   solves this in the first thirty seconds of their onboarding. This is the single biggest hole in the product.
2. **No programming leverage.** No templates, no personal library, no duplicate-and-tweak, no assigning one program
   to a squad. TrueCoach's whole retention story is that programming is fast; a coach who writes ten identical
   programs by hand leaves.
3. **Exercise library depth.** TrueCoach ships ~3,000 demos, Muscle & Motion 1,200 with anatomical analysis. Ours is
   a database table with whatever has been seeded into it.
4. **No compliance signal.** TrueCoach tells a coach who is about to ghost them. We have the richer data — sessions,
   PRQ, screens — and do not surface it.
5. **No scheduling.** CoachNow and TrueCoach both do calendars; we do not.
6. **Coach mobile.** TrueCoach's own gap (coaches must program on the web) is one we could take, but our coach
   surfaces are desktop-shaped today too.

## What this says about the pass

Fix the hole before adding anything: a coach who cannot add a client never reaches the features we are good at. Then
build the leverage (templates, library, assign-to-many) that keeps them, then wire the Mirror into programming, which
is the thing that cannot be copied in a quarter. Sharing stays free — that is the reason a coach recommends this to
another coach, and it is the one competitive position none of these six can follow us to without breaking their
per-seat pricing.
