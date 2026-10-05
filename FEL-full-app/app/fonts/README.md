# app/fonts: the app's four typefaces, self-hosted

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
| `chakra-petch-latin-400.woff2` | Chakra Petch | 400 | `--font-chakra` |
| `chakra-petch-latin-500.woff2` | Chakra Petch | 500 | `--font-chakra` |
| `chakra-petch-latin-600.woff2` | Chakra Petch | 600 | `--font-chakra` |
| `chakra-petch-latin-700.woff2` | Chakra Petch | 700 | `--font-chakra` |

## Provenance
Each file is byte-for-byte the latin-subset file `next/font/google` (next 14.2.35) self-hosted for the same
`Barlow_Condensed` / `IBM_Plex_Sans` / `JetBrains_Mono` calls in two separate production builds of this app (main
`428fa9b2` and `e35cbf68`, `.next/static/media/*-s.p.woff2`): identical SHA-256 in both. Only the latin subset is kept
(the subset the old code preloaded); characters outside it fall back to the next font in the stack.

### Chakra Petch (added 2026-10-05, when FONT-SHARED met FONT-LOCAL)
FONT-SHARED (PR #35) added Chakra Petch through `next/font/google` the day before FONT-LOCAL took every face off it, so
the face never had a committed file. These four were fetched by **next 14.2.35's own `next/font/google` pipeline**,
called directly rather than re-implemented: `getFontAxes` → `getGoogleFontsUrl` → `fetchCSSFromGoogleFonts` →
`findFontFilesInCss(css, ['latin'])` (the files it marks to preload) → `fetchFontFile`, for
`Chakra_Petch({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })`. The CSS request was
`https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&display=swap`.

The method was checked against a control first: the same pipeline asked for Barlow Condensed 500 returned a file
byte-identical to the committed `barlow-condensed-latin-500.woff2` (SHA-256 `31ff5e6e…d1b2b1`). Then Chakra Petch was
fetched twice, and both fetches gave identical bytes:

| File | Bytes | SHA-256 |
|---|---|---|
| `chakra-petch-latin-400.woff2` | 9,728 | `e592818029a919d578974df32686d415d6acd8401bc5420695de41a46eeae426` |
| `chakra-petch-latin-500.woff2` | 9,944 | `adf007cd277ef6dac0c8cecacfb60cc5e24e7c8bcce4db98aa233bd3a88ef5a3` |
| `chakra-petch-latin-600.woff2` | 10,040 | `4d6d5f0b31b3a471a843779c4ecada040e5bc291f96bca9805a94293fe8003fa` |
| `chakra-petch-latin-700.woff2` | 9,868 | `3c2433eb167176cddcdb3eb2ea306d68c2a4ed4c6e78a0dc07b3853d8f6ae8e3` |

## License
All four families are licensed under the SIL Open Font License, Version 1.1 (https://openfontlicense.org), as
listed in github.com/google/fonts `ofl/barlowcondensed`, `ofl/ibmplexsans`, `ofl/jetbrainsmono` and `ofl/chakrapetch`. Copyright
belongs to their authors: The Barlow Project Authors; IBM Corp. (IBM Plex); The JetBrains Mono Project Authors; The Chakra Petch Project
Authors (designer: Cadson Demak).
The files are unmodified. The full licence text, with the four copyright lines from those google/fonts `OFL.txt`
files, ships beside the fonts in [`OFL.txt`](./OFL.txt). See also the credits entry `fonts` in
`lib/credits/credits.ts`.
