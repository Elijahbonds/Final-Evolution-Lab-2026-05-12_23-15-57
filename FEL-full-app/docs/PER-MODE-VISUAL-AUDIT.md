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
| **Skate** | Ramps sit on a flat tan plane; horizon bare; `crowd: 8` authored and rendered by nothing. | Ground lacks a detail map. The board venue `crowd` field has no consumer. |
| **Velocity Kart** | Fixed this pass — verges now read either side. Still no crowd or grandstand. | `trackside` covers furniture; spectators are not part of it yet. |

**C — looks unfinished.**

| Mode | Defect | Cause |
|---|---|---|
| **Freerun** | Untextured white/grey blocks on a white plane in heavy fog. Nothing reads as a material. | Platforms are bare geometry with no venue dressing and no painted ground. The worst-looking shipping mode. |
| **Surf** | Flat teal water, one white wave band, empty horizon. "A pier down the line" is copy with no object. | `buildSurfBreak` builds water + wave + rider only; no mid-ground exists for surf. |
| **Aero Aces** | Near-empty gradient. Floor added this pass and still not resolving — see `VISUAL-AUDIT-2026-09-13.md`. | Open; strongest hypothesis is the `bk_dome` backdrop (radius 682) vs a world larger than it. |

## The three jobs this implies, in value order

1. **Freerun venue dressing** — biggest single jump available, and it is currently the mode most likely to
   make the project look unfinished to a first-time viewer.
2. **A crowd consumer.** `crowd` is authored on nine board venues and read by nothing; `Onlookers` exists
   (`MAX_BODIES 8`). Wiring one to the other lights up skate, surf and both racing modes at once.
3. **Ground detail maps** on golf's green and skate's park floor — `groundTextures.ts` already exists and is
   used elsewhere (the Venice court's grain), so this is application, not authoring.

Deliberately NOT on the list: any lighting, tone-mapping or AA work. That layer is shared, tiered and good.
