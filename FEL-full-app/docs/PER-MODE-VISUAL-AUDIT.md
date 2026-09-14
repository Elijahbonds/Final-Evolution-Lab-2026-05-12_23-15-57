# Per-mode visual audit (2026-09-13)

Captured live through `/dev/mode/<key>` at the pre-start frame. Graded on **venue density** — does the
playable surface sit in a place, or on a plane in a void — because that is the one systemic cause the
step-0 audit isolated. Lighting and post are shared and already good (`LightRig` + `ModeHarness`).

## Tiers

**A — ships as-is. Use as the reference.**

| Mode | Why it works |
|---|---|
| **1v1 (Venice)** | Painted court with real line work, hoop + backboard + net, palms, boardwalk, sunset backdrop, mid-ground depth. This is the bar. |
| **Tennis** | Blue court, net, stands, crowd bodies, warm key light. Reads as a venue with people in it. |
| **Snowboard** | Real ridge backdrop, treeline, gates, snow surface. Best of the board three. |

**B — reads correctly, one specific weakness.**

| Mode | Weakness | Cause |
|---|---|---|
| **Golf** | The putting green is a large flat untextured disc that reads as paper. | No detail map on the green mesh; the surrounding terrain has one. |
| **Skate** | Ramps sit on a flat tan plane; horizon bare. | Ground lacks a detail map. (~~crowd unread~~ — see correction below.) |
| **Velocity Kart** | Fixed this pass — verges now read either side. Still no crowd or grandstand. | `trackside` covers furniture; spectators are not part of it yet. |

**C — looks unfinished.**

| Mode | Defect | Cause |
|---|---|---|
| **Freerun** | Untextured white/grey blocks on a white plane in heavy fog. Nothing reads as a material. | Platforms are bare geometry with no venue dressing and no painted ground. The worst-looking shipping mode. |
| ~~**Surf**~~ | **FIXED 2026-09-13.** Headland on the seaward horizon + three swell lines out the back; pier shoreward for The Break. | The empty horizon was SEAWARD (camera forward.z −0.98) while the pier is shoreward — right object, wrong direction. A point of land is what gives a break its scale, and swell lines are the cheapest thing that makes water read as an ocean rather than a plane. |
| **Aero Aces** | Near-empty gradient. Floor added this pass and still not resolving — see `VISUAL-AUDIT-2026-09-13.md`. | Open; strongest hypothesis is the `bk_dome` backdrop (radius 682) vs a world larger than it. |

## The three jobs this implies, in value order

1. **Freerun venue dressing** — biggest single jump available, and it is currently the mode most likely to
   make the project look unfinished to a first-time viewer.
2. ~~**A crowd consumer.**~~ **WITHDRAWN — I was wrong, again.** `venue.crowd` is read in all three board
   builders (`rideWorlds.ts` lines 227, 457, 721) and all three modes mount `Onlookers` from
   `world.crowdSpots`. The crowd system is fully wired. I did not see bodies in the skate capture because
   `Onlookers` spawns its roster asynchronously and the pre-start camera does not face the spots. Racing is
   the only family with genuinely no spectators.
3. **Ground detail maps** on golf's green and skate's park floor — `groundTextures.ts` already exists and is
   used elsewhere (the Venice court's grain), so this is application, not authoring.

Deliberately NOT on the list: any lighting, tone-mapping or AA work. That layer is shared, tiered and good.

## A note on this audit's own reliability

Two claims in it were wrong on first writing and are struck above — "no shared render pipeline" (there is
one, `LightRig`, mounted for every mode) and "crowd read by nothing" (read in three places). Both were
written from a screenshot plus a narrow grep, and both were killed in under a minute by actually opening
the file. **Screenshots show what is not visible; they do not show what is not built.** Grep the consumer
before claiming a producer is unread.
