# Brand assets

`crest-source.jpg` — the ornate Final Evolution crest exactly as the owner supplied it (black line art on
opaque white, 1208×864). Source of truth; never edit in place.

`crest-light.png` — the same mark prepared for a dark interface. The JPG has no alpha, so on a #050505 page it
would render as a white rectangle with a black smudge in it. The conversion trims the paper margin, then uses the
inverted luminance as the alpha channel: the artwork becomes a white mark on transparency, and anything drawn
under it shows through. Reproduce with `npx tsx scripts/brand/prepare-crest.ts`.

## Still missing

The owner supplied six images on 2026-09-20 — four dunk photographs and three logos — but only the crest reached
the filesystem. The other five are needed as files before they can ship:

- `bonds-dunk-*.jpg` — the dunk photographs, for the Elijah Bonds creator card's portrait
- `badge-est2020.png` — the round "ELIJAH BONDS · FINAL EVOLUTION · EST 2020" badge
- `wordmark.png` — the yin-yang basketball with palms over the "Final Evolution" script
