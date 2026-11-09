# binjgb (vendored, pinned) — BINJGB-SHELF-1

The homebrew player's engine. Vendored by hand; no npm package, no CDN, no build step that pulls from the network
(Cyber G3, review 067e0dce). Served only while `BINJGB_SHELF_ENABLED` is on: middleware returns 404 for
`/vendor/binjgb/*` while the flag is off (G10).

- Upstream: https://github.com/binji/binjgb
- Commit: `16621111ed0ee73bcc45c912a823bcebedcffc0f` (committed 2026-09-25 16:59:08Z = 9:59 AM PT Sep 25, 2026)
- Licence: MIT, Copyright (c) 2016 Ben Smith — the upstream root `LICENSE`, copied verbatim beside these files.
- Fetched: 2026-11-09 (PT) from raw.githubusercontent.com at the commit above; hashes re-computed on the download and
  matched the pins in the spec and in Cyber's review before the files were added.

| File (upstream path) | Bytes | sha256 |
|---|---|---|
| `binjgb.js` (`docs/binjgb.js`) | 13,640 | `a68e5854b5d68339a34c0aa0b6dbeacd615ed316657ee17b63dafa5e00561b09` |
| `binjgb.wasm` (`docs/binjgb.wasm`) | 88,269 | `52c165069441a09180b4bd63464318aa7b861b1d36e0d05e8047b48619fd2f0b` |
| `LICENSE` (root `LICENSE`) | 1,053 | MIT text, verbatim |

Shipped: only the three files above (and this record). Not shipped: `docs/idb.min.js`, `sha1.js`, `vue.min.js`,
`demo.js`, `simple.js`, `index.html`, `simple.html`, `LICENSE.gbstudio`, or any demo cartridge. FEL's own wrapper does
not use upstream `simple.js` (so none of its `localStorage` calls exist here); saves go to the `fel_binjgb` IndexedDB only.

Hardware note (technical record only, never user-facing): binjgb emulates the original handheld and its colour model.
The pins are checked by `tests/binjgb/binjgb-vendor.test.ts` (T-JS-PIN, T-WASM-PIN, T-LICENSE-BINJGB).
