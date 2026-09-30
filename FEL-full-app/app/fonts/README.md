# app/fonts: the app's three typefaces, self-hosted

Loaded by `app/layout.tsx` through `next/font/local` (FONT-LOCAL, 2026-09-30). They used to come through
`next/font/google`, which fetched them from Google at build time; a failed fetch failed the build.

| File | Family | Weight | Variable |
|---|---|---|---|
| `barlow-condensed-latin-500.woff2` | Barlow Condensed | 500 | `--font-display` |
| `barlow-condensed-latin-600.woff2` | Barlow Condensed | 600 | `--font-display` |
| `barlow-condensed-latin-700.woff2` | Barlow Condensed | 700 | `--font-display` |
| `barlow-condensed-latin-800.woff2` | Barlow Condensed | 800 | `--font-display` |
| `ibm-plex-sans-latin-variable.woff2` | IBM Plex Sans (variable) | 400–700 used | `--font-sans` |
| `jetbrains-mono-latin-variable.woff2` | JetBrains Mono (variable) | 100–800 | `--font-mono` |

## Provenance
Each file is byte-for-byte the latin-subset file `next/font/google` (next 14.2.35) self-hosted for the same
`Barlow_Condensed` / `IBM_Plex_Sans` / `JetBrains_Mono` calls in two separate production builds of this app (main
`428fa9b2` and `e35cbf68`, `.next/static/media/*-s.p.woff2`): identical SHA-256 in both. Only the latin subset is kept
(the subset the old code preloaded); characters outside it fall back to the next font in the stack.

## License
All three families are licensed under the SIL Open Font License, Version 1.1 (https://openfontlicense.org), as
listed in github.com/google/fonts `ofl/barlowcondensed`, `ofl/ibmplexsans` and `ofl/jetbrainsmono`. Copyright
belongs to their authors: The Barlow Project Authors; IBM Corp. (IBM Plex); The JetBrains Mono Project Authors.
The files are unmodified. See also the credits entry `fonts` in `lib/credits/credits.ts`.
