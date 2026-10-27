# Premium UI: the audit and the measurements

**Owner, 2026-10-27:** "Let's make this feel like a premium app in the screens and UI/UX, it still feels cheap to me."

The lane is `lane/premium-ui`, and the phases are in `docs/PLAN-UI-10PHASE.md`.

## How it is measured

`scripts/premium-ui/shots.mts` renders the real page modules on the accessibility rig. The rig stubs the server and
answers every API with "nothing yet", so each screen shows what a new account sees. The rig is served over http, so
the `public/` images load.

- **Widths:** 390 × 844 (a phone, with the CPU throttled 4x) and 1280 × 800.
- **Lock:** every run holds the gate lock.
- **Frozen bundles:** `--build-only` freezes a bundle, so the "before" is the tree it was built from even when the
  gate queue shoots it an hour later.

What each column counts:

| Column | What it counts |
|---|---|
| words | Words of visible text above the fold (phone). |
| sizes | Distinct font sizes above the fold / on the whole page. |
| btn | Distinct button looks on the page: shape, size, weight, case and fill kind. Hue is ignored, so an accent is not a new look. |
| card | Distinct card looks: radius, border, fill, shadow and padding. |
| empty | % of the first screen that is flat near-black with nothing on it, measured from the screenshot's pixels in 10 px blocks. |
| img | Images on the first screen / their % of it. |
| anim | Elements animating at load. |
| fcp | First contentful paint, ms (phone, 4x CPU). |
| cls | Cumulative layout shift over the load. |
| a11y | The accessibility audit's static scan (`scripts/a11y/inpage.ts`): critical / serious / total. |

## Before: the shipped screens, at `df54e17e` plus the additive P1 kit (phone)

| Screen | words | sizes | btn | card | empty | img | anim | fcp | cls | a11y |
|---|---|---|---|---|---|---|---|---|---|---|
| Landing `/` | 46 | 5/5 | 1 | 2 | 77 % | 0 | 0 | 2440 | 0.001 | 0/0/1 |
| Play | 133 | 11/12 | 10 | 3 | 49 % | 0 | 7 | 2892 | 0.015 | 0/0/0 |
| Train | 141 | 10/10 | 7 | 2 | 53 % | 0 | 12 | 3300 | **0.064** | 0/0/0 |
| Profile | 104 | 11/17 | 7 | 7 | 59 % | 0 | 0 | 3176 | 0.004 | 0/0/0 |
| Learn | 106 | 9/9 | 6 | 0 | 56 % | 0 | 0 | 1896 | 0.013 | 0/0/0 |
| Coach | 29 | 6/6 | 4 | 2 | 75 % | 0 | 0 | 2912 | 0.004 | 0/0/0 |
| Today's drill | 153 | 8/8 | 3 | 2 | 56 % | 0 | 0 | 3132 | 0.004 | 0/2/3 |
| Quick Screen results | 90 | 3/4 | 3 | 6 | 62 % | 0 | 0 | 4860 | 0.012 | 0/0/1 |

Faces rendered on the menus: Barlow Condensed, JetBrains Mono and IBM Plex, with Chakra Petch in the theme's
`.fel-*` classes.

The a11y audit (all 10 key pages, Tab pass included) found 0 critical, 0 serious and 2 moderate issues. Both are
`landmark`, on the landing and signup pages.

## The 10 worst problems

1. **No imagery anywhere.** Every top screen had 0 images on its first screen, though `public/` holds the venue art,
   the Venice and Muscle Beach backdrops and the brand dunk photographs. This is the owner's "flat and empty".
2. **The landing is 77 % flat black** on a phone and 90 % on a desktop. Three blurred colour blobs sit behind
   46 words.
3. **Walls of small text.** Above the fold: Train has 141 words, Play 133, Profile 104 and Today's drill 153. The
   Train shelf was 16 cards of a 15–25-word paragraph each, plus a tag ("Start a screen →").
4. **Type chaos.** Play uses 11 font sizes above the fold. Profile uses 11, and 17 on the page, with sizes like
   9 px, 10 px, 10.5 px, 11 px, 11.5 px, 12 px and 12.5 px. The tree carries 33 ad-hoc `text-[Npx]` values.
5. **Dev-like labels.** The eyebrows, tabs, counts and tags were set in JetBrains Mono at 10–11 px with wide
   tracking ("LAST 7 DAYS VS THE 7 BEFORE", "NOT MEASURED"). There were 767 `font-mono` uses. They read as a
   terminal, not as a product.
6. **No single primary.** Play opened on three equal-weight bordered buttons (gold, cyan, crimson). The page had
   10 distinct button looks; Profile and Train had 7 each.
7. **Boxes on boxes.** Every card was the same 1 px white/8 outline on a white/2 fill, and cards sat inside cards.
   Profile had 7 different card looks.
8. **Three accents competing.** The lit tab, the page wash and the eyebrow took the tab's own colour (cyan, green,
   gold), and each Train card added its own icon colour.
9. **Little motion, and some of it wrong.** Profile, Learn, Coach, the results and Today's drill animated nothing.
   The shelf's entrance ignored the in-app Motion setting, honouring only the device's. Train shifted the layout
   by 0.064 on load on a phone.
10. **Fonts fragile off the happy path.** `font-family: var(--font-sans), system-ui` falls to the browser serif
    whenever the next/font variable is missing. That happens on the probe rigs and on the root crash screen.
    `--fel-font-body` named Inter, which is never loaded.

**Production fonts were measured, not assumed.** On 2026-10-27 `final-evolution-lab.web.app` served all four
`@font-face` sets, the `<html>` carried the four next/font variables, and a woff2 returned 200. So "cheap" there is
not a missing typeface. It is the mix: four faces, mono labels and 11 sizes.

## After

The per-phase numbers, shots and contact sheets are in the sections below.
