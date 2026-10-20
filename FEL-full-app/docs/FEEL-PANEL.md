# The feel panel

Owner, 2026-10-20: "dev-only sliders for the new numbers. The owner tweaks them on a phone and tells us the values, and
we commit them." This is that panel. The owner tunes feel numbers on their own phone on the live site, and no other
player is affected.

## What it guarantees

- **Everyone plays the defaults.** `feel(id, DEFAULT)` returns the shipped constant. It returns an override only when
  all three of these hold:
  1. this device's `localStorage` holds an override (key `fel.feel.overrides.v1`; it is never sent anywhere);
  2. the server opened the panel for this user. `GET /api/feel-panel` answers `{ enabled: true }` only when
     `FEEL_PANEL_ENABLED` is on **and** `requireAdmin()` passes (`lib/admin/requireAdmin.ts`, `role === 'admin'`);
  3. the run may carry overrides (`lib/feel-panel/sessionGate.ts`).
- **Overrides apply only in a playtest run.** The run must be a `/play/<mode>?playtest=1` run. The server already
  records that run as unpaid with no `GameSession` row (`lib/sessions/runEligibility.ts`, `PLAYTEST`). It pays no XP,
  shards, Lab Credits, coins, PRQ, streak, season XP or mastery, and it adds nothing to a leaderboard or to the
  Arena's rival draw.
- **Some sessions are always blocked.** Overrides are ignored when any of these URL keys is present, even with an
  empty value, and on `/play/party`:

  | Key | Session |
  |---|---|
  | `arena` | a staked Arena duel |
  | `mp` | an async friend challenge |
  | `c` | a friend's challenge link |
  | `signature` | the weekly Signature ladder, the repo's ranked surface |
  | `story` | a Story node, which pays a reward |
  | `carnival` | the Court Carnival relay |
  | `net` | online play against another person |
  | `party` | a party-room start |
  | `ranked` | reserved for a future ranked session |
  | `agent` | a probe or agent run, which measures the defaults |

  A test fails if GameShell starts reading a new query key that this table does not cover
  (`lib/feel-panel/sessionGate.test.ts`).
- **No challenge links from an override run.** GameShell will not mint a challenge link from a page where overrides
  were applied. The mint route accepts any score the client sends.
- **Values stay in safe bounds.** Every knob has a safe `min`/`max`. Values are clamped and stepped on load and on
  every set, so a hand-edited `localStorage` value cannot go outside the bounds.
- **Reads are cheap.** `feel()` is a null check, or one `Map.get`. It allocates nothing and never reads storage per
  frame. Storage is read once, when the server opens the panel.

## Turning it on (the owner)

1. Check that your account's `User.role` is exactly `admin`. No API route writes that column. `/coach/admin` loads
   only for an admin (it is a 404 otherwise). An account whose role is `owner` does **not** pass `requireAdmin()`.
2. Set the server env var **`FEEL_PANEL_ENABLED=1`** in the production server environment, then deploy. It is read
   per request (`lib/flags.ts` `isFeelPanelEnabled()`). `1`, `true`, `on` and `yes` turn it on; anything else, or
   unset, leaves it off. Deploying is the owner's step.
3. On your phone, sign in and open a mode as a playtest run, for example
   `/play/threevthree?playtest=1` or `/play/onevone?playtest=1`. A slim **FEEL** tab sits on the left edge, at
   mid-height.
4. Tap it. For each knob the sheet shows its name, id, default and current value, a slider, and **Reset**. At the
   bottom are **Reset all** and **Copy values**. When a value differs from its default, the amber
   **FEEL OVERRIDES ON · n** chip shows at the top, with the sheet open or closed.
5. Play, adjust and play again. Values take effect on the next frame.
6. **Copy values** puts the changed knobs on the clipboard as JSON, for example `{ "hoops.aiHandRangeM": 2.8 }`.
   Paste that to us and we commit it.

On a normal (paying) run the sheet still opens, but it says "Saved on this device, NOT applied here" and offers
**Restart as a playtest run**. To turn the panel off, unset the env var. Your saved values stay on your phone and do
nothing.

## Registering a knob (other lanes)

1. **Keep the constant.** It stays in its module, and it is still the default everyone plays:
   ```ts
   export const COMBO_WINDOW_SEC = 0.18;
   ```
2. **Read it through `feel()`** at the point of use, per frame or per call. Do not read it at module load: that read
   would happen once, before the panel exists.
   ```ts
   import { feel } from '@/lib/feel-panel/feel';   // inside lib/babylon: '../../feel-panel/feel'
   if (t > feel('hoops.comboWindowSec', COMBO_WINDOW_SEC)) { … }
   ```
   A default parameter also works: `fn(x, w = feel('hoops.comboWindowSec', COMBO_WINDOW_SEC))`. Use the id as a
   string literal, because the catalogue test finds reads by searching for `feel('…'`.
3. **Add a row** to the end of your group in `lib/feel-panel/knobs.ts` (`FEEL_KNOBS`). Append only, so a merge only
   ever adds lines.
   ```ts
   {
     id: 'hoops.comboWindowSec', label: 'Combo window', def: 0.18, min: 0.05, max: 0.4, step: 0.01, unit: 's',
     group: 'Hoops · moves', source: 'lib/babylon/core/HandleCombo.ts COMBO_WINDOW_SEC',
     hint: 'How late in a move the next press still chains.',
   },
   ```
4. **Pin the default.** Add one line to the first test in `lib/feel-panel/knobs.test.ts`:
   `expect(def('hoops.comboWindowSec')).toBe(COMBO_WINDOW_SEC);`.

`knobs.test.ts` checks every row automatically. Each id must have the form `<area>.<camelName>` and be unique. The
default must lie inside `[min, max]` and on the step grid. `source` must name a real file that exports that constant.
Every registered knob must be read somewhere in `lib/`, and every `feel('…')` read must name a registered knob.

**What may be a knob:** a feel number, such as a timing, distance, window or smoothing value. A score ceiling, a
payout or a price is never a knob. **assumption:** this lane chose the bounds for the four #375 knobs. They are safe,
not tuned. Widen a bound only with a reason.

## The pieces

| File | What it does |
|---|---|
| `lib/feel-panel/feel.ts` | `feel()`, the store (three conditions, storage, set/reset, copy JSON, the challenge-link latch) |
| `lib/feel-panel/sessionGate.ts` | `feelSessionBlock(pathname, search)`, the allow-list and the blocked keys |
| `lib/feel-panel/knobs.ts` | `FEEL_KNOBS`, the catalogue |
| `lib/flags.ts` | `isFeelPanelEnabled()`, `FEEL_PANEL_ENABLED` |
| `app/api/feel-panel/route.ts` | the server's yes/no: 404 when the flag is off (no session is read), 403 when the user is not an admin |
| `components/feel-panel/feel-panel.tsx` | the client container. It is mounted once in `app/play/layout.tsx` and renders nothing until the server says yes |
| `components/feel-panel/feel-sheet.tsx` | the sheet itself (pure view) |

Knobs registered today, with their defaults unchanged: `hoops.aiHandRangeM` 2.4 m, `hoops.aiHandDwellSec` 0.35 s,
`hoops.aiHandGapSec` 0.9 s and `hoops.handClearM` 0.01 m (PR #375's `AI_HAND_RANGE_M`, `AI_HAND_DWELL_SEC`,
`AI_HAND_GAP_SEC` and `HAND_CLEAR_M`).
