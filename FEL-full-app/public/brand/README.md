# Brand assets

The owner's own artwork. Prepared by `npx tsx scripts/brand/prepare-brand.ts`, which never edits a source in
place — replace a `*-source.*` file and run it again.

## Marks

`crest-source.jpg` — the ornate Final Evolution crest exactly as supplied (black line art on opaque white,
1208×864). Source of truth.

`wordmark-source.jpg` — the yin-yang basketball with palms over the "Final Evolution" script, as supplied
(2100×1500). Source of truth.

`crest-light.png` (640×677) and `wordmark-light.png` (720×649) — the same two marks prepared for a dark
interface. The JPGs have no alpha, so on a #050505 page each would render as a white rectangle with a black
smudge in it. The conversion trims the paper margin, then uses the inverted luminance as the alpha channel: the
artwork becomes a white mark on transparency, and anything drawn under it shows through.

`badge-source.png` / `badge-est2020.png` (500×500) — the round "ELIJAH BONDS · FINAL EVOLUTION · EST 2020"
badge. It arrives WITH an alpha channel that is entirely opaque, which is not the same thing as being cut out:
composited against the page colour it painted a white square with the badge in the middle of it. Luminance-to-
alpha is wrong for this one — it is not line art, it is a white disc carrying black text and a photograph, and
inverting it would erase the disc. The prepared version masks to the inscribed circle, so only the corners go.

## Photographs

`bonds-dunk-arena.jpg`, `bonds-dunk-arena-alt.jpg` (933×1400) and `bonds-dunk-gym.jpg` (1120×1400) — for the
Elijah Bonds creator card's portrait and any marketing surface.

These were supplied at 4000×6000 and about 15 MB each. **public/ is copied WHOLESALE into the deployed function
bundle** (that is how the Prisma client ships — see `docs/DEPLOY-NOTES-PRISMA.md`), so shipping them as supplied
would have added ~45 MB to every deploy, forever, to show a photograph a few hundred pixels wide. What is here is
a web-sized copy at a 1400 px long edge; the originals live outside the repo. 31.4 MB became 660 kB.

If you replace one, put the full-resolution file here under the same name and re-run the script — it resizes in
place and will not enlarge something already small.
