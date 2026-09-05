# Controls, move lists, avatars and clothes — audit (2026-09-05)

Owner asks: "make sure the move list and controls make sense for each mode; make sure the avatars and the clothes look
good too — the aesthetic of what we're playing matters." Method: every mode's pad verbs (`lib/babylon/ui/modeVerbs.ts`)
against the input its mode actually handles (`onInput` in `lib/babylon/modes/*`), plus the gauntlet's frames of the hero
in four kit-wearing modes (pre-rebuild hero, 13:20 sweep). Read-only; fixes listed by lane.

## 1. Controls — pad verbs vs what the mode handles

| Mode | A | B | X | Y | Handled | Verdict |
|---|---|---|---|---|---|---|
| dunk / dunk duel | SLAM | STYLE | PROP / CHAIR | RUN (hold) | A B X + trigger + d-pad + stick | ✔ every shown verb does something (other writer's lane for feel) |
| karate / karate vs / mixed combat / duel / showdown | JAB · KICK · BLOCK/GUARD · HEAVY/ULTIMATE | | | | A B X Y | ✔ |
| football | HURDLE | TRUCK (hold) | JUKE L | JUKE R | A B X Y + trigger | ✔ |
| skateboard | POP | FLIP | GRAB | PUMP (hold) | A B X Y + trigger | ✔ |
| surf | AIR | CUTBACK | GRAB | CARVE (hold) | A B X + trigger | ✔ (CARVE is the trigger) |
| snowboard slalom | JUMP | SPIN | GRAB | TUCK (hold) | (board host) | ✔ by the slalom trace: tuck/pump and steer drive the run |
| gymnastics / big air | FLIP / SPIN | STICK / STOMP | · | · | A B | ✔ two-verb modes; the blank slots read as blank letters — **hide or bind** |
| derby | SWING | CLUB | · | · | A B | ✔ two-verb; same blank-slot note |
| golf | SWING | CLUB | · | · | A (3-press meter) B | ✔ the hint says "A at address to pure the strike" — the three-press meter is not explained anywhere on screen: **add one hint line** |
| soccer (penalty) | STRIKE | · | · | · | A + stick feints | ✔ single verb; the pad shows three blank letters |
| **ones (1v1)** | BLOCK | **BOX OUT** | **STEAL** | SHOOT (hold) | **A + trigger only** | ✘ BOX OUT and STEAL are shown and do nothing — dead binds |
| **threes (3v3)** | BLOCK | **PASS** | **STEAL** | SHOOT (hold) | **A + trigger only** | ✘ PASS and STEAL are dead binds |
| **tennis** | **DRIVE** | **SLICE** | **DROP** | **LOB** | **A only** (one swing) | ✘ three of four shot verbs are dead; the shot type on screen comes from elsewhere |
| **volleyball** | HIT | BLOCK | **·** | **·** | A B | ✘ two blank slots on a court sport that has SET and DIG |
| carnival | GO | TRICK | CHARGE (hold) | POWER | delegated to the current mini-game | ? each mini-game must handle B and Y — verify per game |
| sprint | HIT | BLOCK | · | · | (mode disabled) | out of rollout |

**Correction (agent pass, 15:50):** the dead-bind rows above were mostly wrong. Ones and threes route the pad through
`LocalInputSource` (`lib/babylon/core/PlayerSlot.ts`): L1 → brace (BOX OUT), X → steal, B → pass, and the modes read those
intents; tennis lives in `NetSportMode.onInput` and sets a `pendingShot` of drive / slice / drop / lob from A/B/X/Y. The
only true dead bind was threes' STEAL for the hero's own press (the steal loop reads only the foes' intents) — now a hollow
socket, as are volleyball's two unbound slots. Golf and ones gained one hint line each. Landed as e7494e1.

**Rule from the pad spec (Benchmark feel bar):** "every face/trigger/stick the loop uses is readable — no dead binds
(shown but inert), no missing buttons." Ones, threes, tennis and volleyball fail it today.

Fixes by lane:
- Ones / threes: BOX OUT, STEAL and PASS need mode logic (contest for position, a steal window on the carrier, a pass to
  the open ally). Gameplay design — not a relabel. Until then the slots should not be lit as live verbs.
- Tennis: DRIVE / SLICE / DROP / LOB as four swing types — the mode already carries `shotType` in the HUD; binding B/X/Y to
  select the type before the A swing is a small change (owner sign-off: it is a rule).
- Volleyball: SET (Y) and DIG (X) exist in the sport and in the mode's vocabulary; bind or hide.
- Two-verb modes: the diamond shows bare letters for unbound slots. Either bind (golf: X = CLUB DOWN, Y = CLUB UP — the
  hint already says CLUB) or render the unbound slots hollow so they never read as controls.
- Hints: golf's three-press meter, ones' block timing and threes' pass are not said on screen. One line each.

## 2. Avatars and clothes (frames: karate, skateboard, volleyball, tennis at 13:20)

- **One outfit for every sport**: leopard tank (`top_lab`), torn-print shorts (`shorts_court`), tall glossy red boots
  (`shoes_flight`). A gi-less karate fighter and a tennis player in rain boots read wrong; the aesthetic of what we're
  playing is lost the moment the sport changes.
- **The flight shoe reads as a boot**: the garment covers the calf to the knee with a glossy red material. It needs to
  end at the ankle (mesh) or the material needs a sneaker read (matte, two-tone). This is the single biggest look fault.
- **Shorts texture**: the `shorts_court` print looks torn / stained under the venue grade; a plain court short would read
  cleaner.
- **Bodies**: the previous hero body (restored today) reads well; the roster rivals (green / pink tops) read well. The
  rebuilt hero and the new rival (other writer, 14:11–14:14) rendered headless and distorted — restored bytes hold until
  their rebuild is right.
- **Sport kits**: the kit library has two tops, two shorts, two shoes. A per-sport default (karate: gi top + belt; skate:
  loose tee + shorts + low sneaker; tennis: polo + shorts + court shoe; volleyball: jersey + shorts + knee pads) is asset
  work in the owner's MPFB / Meshy pipeline; the wiring exists (`kit.ts` slots, `resolveIdentity`). Recommended order:
  fix the shoe, then a plain short, then per-sport tops.

**Correction (kits agent, 16:20) and landing (8cb40bf + follow-up):** measured, the knee boot is `shoes_evo` (0.51 m), not
`shoes_flight` (0.22 m, already ankle-height); the leopard tank is `top_bonds` and `top_lab` is the plain tee; `shorts_glitch`
shares `shorts_court`'s material. Landed: per-sport default kits (`sportKitDefaults.ts`, Closet pick always wins), the boot
folded to a hi-top with a matte sneaker material and a split light sole (`garmentFixes.ts`). The "torn / stained" read on
the tee and the court short was NOT the print: the body's finer surface pokes through the coarse garments (188-vertex
short). Fixed at runtime on the shown garment — a depth offset on its material plus an inflate along the bind normals
(tops 13 mm, shorts 20 mm; the first attempt used `updateVerticesData`, a silent no-op on the loader's buffer). Karate and
tennis frames: clean tee and shorts, sneakers with soles. Rival capsule shooters in the three-point contest remain
placeholder bodies — a look note for the roster lane.

## 3. Venice court and background (owner: "still needs work")

- The dark crowd tier is gone from every basketball court (this pass). The red hoop banner remains — remove or replace
  with a clean backboard if the owner wants the frame quieter.
- The Venice court and horizon are now the other writer's look pass (Meshy court, surround palms, golden haze). Notes for
  them: the tan wireframe cage around the player under Venice; the hide rule for `head*` / `body*` catches athlete parts
  (it should be scoped to the surround root); the rebuilt scan renders no court on its own.
