# INPUT & PRESENCE LAYER — audit before code

Deliverable 1 of the Input & Presence mission. Nothing below is proposed work; it is what is on disk on
2026-09-13, measured by grep and by reading the files. The gap list and the ordering follow it.

---

## 0. Two facts about the brief that change the plan

**`/tmp/fel3` does not exist.** Checked: no such directory, and no Vite twin anywhere under
`~/Developer/FEL-swarm`. The same path was named by the four earlier mission specs. The live tree is this
Next.js 14 App Router app (Babylon 9.23 + Havok), which is where every previous mission actually landed.
Everything below audits *that* tree.

**"Keep all 31 vitest suites green" is out of date.** The suite is **120 files / 1284 tests**. The
instruction still binds — add suites, do not rewrite existing ones — but the number to hold is 1284.

---

## 1. What input handling exists today

There are **three** input systems in the tree, not one. This matters more than any individual violation.

### 1a. `lib/babylon/core/InputBus.ts` — the canonical layer for every Babylon mode

The action set is `FelInput`:

```ts
| { t: 'stick';   side: 'L' | 'R'; x: number; y: number }
| { t: 'dpad';    dir: 'up'|'down'|'left'|'right'; pressed: boolean; src?: 'key' }
| { t: 'button';  btn: 'A'|'B'|'X'|'Y'|'L1'|'R1'|'SELECT'|'START'; pressed: boolean }
| { t: 'trigger'; side: 'L' | 'R'; value: number }
```

Every mode receives these through `ModeDefinition.onInput(ctx, e)` and **nothing else**. Keyboard
(WASD + arrows + jkli/qe), the touch overlay, the physical pad and Controller Link all converge here.
This is already the "canonical action layer" the mission asks for, under different names.

Pad handling: rAF poll, first live slot adopted (`padIndex`), axis-wise deadzone `0.15`, standard-mapping
button indices assumed, edge-latched buttons/d-pad, sticks emitted **on change** (a centred pad used to
overwrite a held key every frame).

### 1b. `lib/input/controller-map.ts` + `lib/gamepad-bridge.ts` + `lib/canvas-juice.ts` — the legacy Canvas-2D path

A second, older map for the pre-Babylon 2D games: `PAD_INDEX`, `AXIS_INDEX`, `STICK_DEADZONE = 0.28`.
Consumers: `components/games/game-shell.tsx`, `karate-game.tsx`, `rail-grind-game.tsx`,
`glitch-boss-game.tsx`, `virtual-controller.tsx`, `lib/board/board-input.ts`.

### 1c. `lib/controller-link/` — phone-as-pad, already built and shipping

Far more of Phase B exists than the brief assumes:

| Mission asks for | On disk |
|---|---|
| 6-char join code | `lib/controller-link/codes.ts` |
| `/pad?code=` route | `app/controller/[code]/page.tsx` |
| Host lobby + QR | `components/controller-link/host-lobby.tsx` |
| WebRTC datachannel, unordered, `maxRetransmits: 0` | `transport/webrtc.ts:64` — *exactly* these flags, on a `fel-input` channel, with a second ordered `fel-control` channel for lobby traffic |
| WebSocket only for signaling | `transport/signaling.ts` + `kvSignalStore.ts` + `app/api/controller-link/rooms` |
| Slot claim | `host.ts` — `assign` message, per-peer slot |
| Round-trip latency | `host.ts:63` — ping/pong every interval, `rttMs` per peer |
| Pilot mode | **3PT Shootout is the reference implementation** (`registry.ts:31`, `components/games/three-point-babylon.tsx`) |

22 modes already declare a controller schema (`schemas/registry.ts`): music_flip, threepoint, dunk,
threevthree, freerun, bigair, derby, penalty, football, golf, tennis, volleyball, skateboard, surf,
snowboard_slalom, dance, dunkduel, mixedcombat, onevone, karate, karate_vs, carnival.

---

## 2. Raw button-index violations

The acceptance criterion is "zero raw button-index reads outside `src/input/`". Grepped
`getGamepads|gamepadconnected|.buttons[|.axes[` across `lib`, `components`, `app`:

### Clean

**No Babylon mode reads raw pad state.** `grep` over `lib/babylon/modes/` returns nothing. All 20+ modes
are already thin skins over `FelInput`. This is the criterion's spirit, already met for the game modes.

### Violations, by file

| File | What it does | Severity |
|---|---|---|
| `lib/canvas-juice.ts:127-145` | 11 hardcoded button indices (`buttons[0..5]`, `[9]`, `[12..15]`) + `axes[0]/[1]`, no profile, no `mapping` check | **HIGH** — the largest single violation |
| `lib/gamepad-bridge.ts:93-142` | `getGamepads()`, `buttons[i]`, `axes[0]/[1]` raw; half-converted (it *does* import `AXIS_INDEX` for the right stick only) | **HIGH** |
| `components/games/virtual-controller.tsx` | reads raw pad state in a UI component | MEDIUM |
| `lib/babylon/core/InputBus.ts:164-186` | raw indices — but this **is** the input layer, so it is allowed to; the defect is that it keeps its **own** table instead of importing `PAD_INDEX`, and its own deadzone (0.15 vs controller-map's 0.28) | MEDIUM (duplication, not layering) |
| `lib/feel/sensory-bus.ts:121`, `lib/babylon/premium/Haptics.ts:23` | `getGamepads()` for **rumble output only** — never reads a button | LOW — should move behind a capability API, not a violation of input layering |

**Two sources of truth for one pad** (§1a vs §1b), with two different deadzones, is the structural finding.
The mission's `src/input/` is the right answer; the work is a merge, not a greenfield.

---

## 3. Gap list, ordered by blocking dependency

### Phase A

1. **No vendor profiles at all.** Nothing in the tree reads `gamepad.id` or `gamepad.mapping`. Switch Pro
   and most Joy-Con configs report **non-standard** mapping, so today they mis-map silently — there is no
   code path that could even notice. *This is the single biggest real gap in Phase A.* Blocks the
   "identical canonical output for DualSense / Xbox / Switch Pro" criterion outright.
2. **Deadzone is axis-wise, not radial, and defined twice** (0.15, 0.28). Per-profile deadzone does not exist.
3. **No player slots.** `InputBus` adopts exactly one pad. Four local pads is impossible today.
4. **Disconnect does not pause.** `dropPad()` correctly releases every latched stick/button/trigger so
   nothing stays held — but the mode keeps running. The mission requires pause + reconnect prompt.
5. **No "press any button to join" gate.** InputBus re-scans every frame instead (a deliberate fix: a pad
   plugged in before page load never fires `gamepadconnected`). The scan should stay; the join screen is new.
6. **No remap UI, no persistence.**
7. **Action-name mismatch.** `FelInput` uses `A/B/X/Y/L1/R1/triggers`; the mission's set is
   `moveX/moveY/aimX/aimY/jump/action1..4/modifier/pause/confirm/back`. Renaming `FelInput` would touch every
   mode and every test — recommend an **adapter** in the new layer that exposes the mission's names over the
   same bus, rather than a rewrite. Flagging because it changes the shape of Phase A's PR.
8. Rumble exists but is not behind a surfaced capability check.

### Phase B

9. **Wire format is JSON per frame.** `webrtc.ts:115` — `sendFast(JSON.stringify(msg))`. The mission
   requires a fixed-size binary frame `{slot, seq, axes, buttonBitfield}`. Real gap, and the one with a
   measurable payoff.
10. **No `seq` on input frames**, therefore no out-of-order drop — on a channel that is *deliberately*
    unordered. Frames can be applied out of order today.
11. **`maxPlayers: 1` on every schema.** 4 PADs + 1 HOST needs the host, the lobby and the schemas widened.
12. **No input-to-render debug overlay.** Per-peer `rttMs` exists (transport RTT); input-to-render is a
    different, larger number and is not measured anywhere.
13. **No WS fallback for input** if the datachannel fails.
14. Route naming: `/controller/[code]` exists, `/host` does not (the lobby is embedded in the mode page).
    Cosmetic relative to the rest.

### Phase C

15. **TV Mode does not exist.** No `tvMode`, no mirror-lag compensation, nothing that widens a timing window.
16. **No fullscreen, no Screen Wake Lock, no orientation lock** anywhere in the tree (grepped: zero hits).
17. 3PT itself is the closest thing to done: it consumes only `FelInput` (`ThreePointMode.ts:632-642` —
    R stick, R trigger, A/B) and already has a Controller Link motion schema.

---

## 4. Recommended shape of the Phase A PR

Merge the two existing maps into one layer rather than adding a third:

1. `lib/input/` becomes the single source (it already holds `controller-map.ts`).
2. Add `profiles/` keyed off `gamepad.id` + `mapping`, with `generic-standard` and `generic-fallback`
   defaults, and an explicit non-standard mapping for Switch Pro / Joy-Con. Detect the Switch 2 Pro over
   BT on iOS and surface the "not supported on this device" notice.
3. Radial deadzone, per-profile, default 0.15 (keep InputBus's number; 0.28 is the 2D games' feel and
   should become that profile's override, not the global).
4. `PlayerSlots` with hot-plug, and a `pause` signal the harness honours.
5. `InputBus` keeps its public `FelInput` contract and starts *consuming* the new layer, so no mode file
   and no existing test changes. The mission's canonical action names ship as an adapter over it.
6. Point `canvas-juice.ts` / `gamepad-bridge.ts` at the same layer, which closes the two HIGH violations.

Acceptance greps that will then pass:
`grep -rn "getGamepads\|\.buttons\[\|\.axes\[" lib components app --include=*.ts --include=*.tsx`
should return hits only under `lib/input/` (plus the two rumble-output call sites, behind a capability API).
