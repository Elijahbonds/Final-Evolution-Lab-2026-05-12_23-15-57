# Ship readiness — 0.9.0-rc.1 (2026-09-03)

| Check | Evidence | State |
|---|---|---|
| Every Babylon mode plays on its shipping route, logged in | `scripts/gauntlet-play.sh`: 20/20 0/0/0 (dev server), 20/20 0/0/0 (production bundle on :3004) | ✅ |
| Production build clean, headers present, dev harness dark | `prod-serve.sh build` exit 0; `X-Frame-Options`, CSP frame-ancestors, nosniff, referrer, permissions policy; `/dev/mode/*` → 404 | ✅ |
| Dev-harness gauntlet green | 17 rounds on 2026-09-03; last diff "(no change)" | ✅ |
| Mobile tier and phone controls | 7 modes at 59–61 fps under 4× CPU throttle; phone captures 7 modes, 0 errors | ✅ |
| Failure states | missing model → error + Retry; unreachable server → message + Retry; WebGL context lost → message + reload; each posts a diagnostic | ✅ |
| Diagnostics reach the owner | `game_diag` events stored; `/api/admin/diag` lists by kind and mode | ✅ |
| Unit tests | 213 passing | ✅ |
| CI | `.github/workflows/ci.yml` (type-check, tests, production build) — first run on push | ⏳ |
| Owner items | curriculum review (Camp artifact); a session on real phone hardware | ⏳ owner |
| Known residuals | carnival's camera occasionally takes its overhead fallback in a shuffled venue (logged as `FEL-CAM`, not a fault); dev-only double mount in the shipping hosts; the preview-managed dev server dies while idle | recorded |

Signed: Claude (build), pending the owner's two items above.
