# Sprint speed by camera: the benchmark (SPRINT-SPEED, 2026-10-25)

Owner decision, 2026-10-25: measure sprint speed **by camera**, to replace hand-timing where it can (combine day hand-times
sprint and agility today, PR #453), and measure top speed and splits. Camera only. **No accuracy claim until a
validation pilot** (the jump rule): every number is labelled an estimate and carries its own ± band.

This file is Step 0: what the public tools do, how, and what has been published about how well they agree with timing
gates. It is a reading of public pages only (no accounts). The build that follows is in `docs/SPRINT-SPEED.md`.

---

## 1. The tools

| Tool | What it is | How it times | What it gives |
|---|---|---|---|
| **MySprint** (Balsalobre-Fernández; Romero-Franco et al. 2017) | iPhone app, high-speed video (120–240 fps) | The coach films the run and **marks by hand** the frame each split marker is passed (side-on, markers every 5 m), then the app fits Samozino's model | Splits (5–40 m), v_max, τ, F0, V0, Pmax, F-V slope, RF and DRF |
| **Photo Finish** (developer "Sprint Timer"; Sensors 2024) | Smartphone app, 30 fps | One phone **at the line, photo-finish style**: an AI detector fires when the athlete passes in front of it. Start by sound, by a second phone, or by passing a start phone | Times, splits with several phones, 5-0-5 style go-and-return |
| **SpeedClock / CoachMyVideo-style apps** | Video apps | The coach scrubs frames and taps start and finish; some draw on-screen lines | Times from frame counts |
| **Freelap** | Hardware, not a camera: a magnetic chip worn by the athlete, magnetic transmitter cones | A start / lap / finish cone resets, splits or ends the chip's stopwatch; times reach the phone over Bluetooth | Flying 10/20/30, splits, several athletes at once |
| **Dashr** | Hardware: laser gates with a phone app | Beam breaks at each gate | Sprint splits, 5-10-5 and other agility drills |
| **Timing gates (Brower, Witty, single/dual beam)** | The reference coaches compare against | Beam break at a set height; dual beams reject an arm or leg breaking it early | Splits, flying times |
| **Radar / laser (Stalker ATS)** | The reference for a speed-time curve | Continuous speed at 47 Hz from behind the athlete | v(t), v_max, τ, the F-V profile |

## 2. The three camera methods

1. **One phone at the line (photo finish).** The phone sits on the line's extension, side-on to the lane. Because the
   lens is *in* the line's vertical plane, the line projects to one line on the screen and a body crossing it in the
   picture is crossing it in the world: no parallax, whatever the athlete's distance from the lens. This is the most
   reliable one-phone method and the one Photo Finish validates. A torso-based line (Photo Finish's store page says it
   detects the chest) matches how a race is judged; a single-beam gate fires on whatever breaks the beam first.
2. **Side-on tracking.** The phone films the run from far to the side and the body's position is tracked frame by
   frame (MySprint, by hand). It gives splits at every marker in view and a speed-time curve, but only over the part of
   the run in the frame, and only as far as its scale is right: a marker line that is not where the athlete runs is a
   parallax error of `half-span × lane offset ÷ camera distance`.
3. **Several phones, clocks synced.** A start phone and a finish phone (or one per split) share a clock over the
   network. Photo Finish chains phones this way. The clock offset has to be measured (an NTP-style round trip), and
   its error is at most half the best round trip.

## 3. Published agreement with timing gates

| Study | Tool and setup | Sample | Agreement |
|---|---|---|---|
| Romero-Franco et al., *Eur J Sport Sci* 2017 | MySprint (iPhone 240 fps, hand-marked) vs 7 photocell pairs and a radar | 12 trained male sprinters × 6 × 40 m | Splits r = 0.989–0.999, ICC ≈ 1.0; F0, V0, Pmax vs radar r = 0.974–0.999 |
| Elite youth football, *PMC12136470* (2025) | MySprint (iPhone XR, 60 fps) vs radar; GPS vs radar | 11 academy players × 2 × 30 m | MySprint **biased**: higher F0, lower V0, a steeper F-V slope (large effects), put down to finding the start; GPS agreed best (LoA ±0.19 N/kg F0, ±0.09 m/s V0) |
| Photo Finish, *Sensors* 2024 (24(20):6719) | One phone at the line, 30 fps, vs photocells | 5 active adults; 10 m, 20 m, 5 m go-and-return | Bias 0.005–0.012 s; ICC 0.978–0.995; two phones together ICC 0.999; largest single difference ≈ 0.09 s |
| Johansen et al., *Sensors* 2022 (22(7):2774) | iPhone 240 fps at the finish vs fully automatic timing | Athletics meets | Mean deviation ≈ 0.004 s, at most 0.006 s with a non-light start; no systematic bias |
| SpeedClock, *PMC4972912* | App vs timing lights, 10 m | Recreationally active women | Excellent agreement, **systematic −0.13 s** |
| 240 fps camcorder vs single-beam photocells (soccer) | Video as the reference | Soccer players | MAE ≤ 0.040 s with systematic bias: not interchangeable |
| Samozino et al., *Scand J Med Sci Sports* 2016 | The simple field method (v(t) = v_max(1 − e^(−t/τ))) vs force plates | 9 elite/sub-elite sprinters × 7 | Bias < 5 % on F0, V0, Pmax, the slope; between-trial SEM < 5 % |
| JSSM 20(2):357 (2021) | Reliability of the sprint F-V profile | — | F0, V0, Pmax moderate-to-excellent; **the slope is not reliable enough** to prescribe from |

**Hand timing** is the thing being replaced: hand-timed 40 yd dashes ran **0.225 s faster** than electronic timing
(5.23 vs 5.45 s; JSCR 2010) — the timer starts late (≈ 0.065 s) and stops early (≈ 0.16 s); a later study suggests
adding 0.22–0.26 s depending on the timer's experience. The 0.24 s track convention comes from 100 m.

The 5-10-5 (pro agility) itself: test–retest r = 0.88–0.95, typical error 1.95–2.40 % (Physiopedia's summary). It is a
change-of-direction test, not reactive agility. No validation of Dashr's or Freelap's gates was found on public pages.

A systematic review of 131 timing studies (Research Square rs-10621620) concludes no timing system is interchangeable
with another unless the event, the body reference, the camera settings and the error statistics match the use.

## 4. What the top tools offer, and what FEL builds

| Feature | MySprint | Photo Finish | Freelap / Dashr | **FEL `/train/speed`** |
|---|---|---|---|---|
| Time from one phone | by hand, frame-marked | automatic at the line | needs hardware | **automatic at a line you tap**, torso by default, sub-frame |
| Start | hand-marked first movement | sound / start phone | start cone / gate | **"Go" from the phone** (sound travel corrected, reaction time included and said), or **first movement** in frame |
| Two phones, one clock | — | yes | — (hardware) | **core + clock handshake built; the transport is an adapter** (§6 of SPRINT-SPEED.md) |
| Flying 10 / 20 | from video | with two phones | yes | **two lines in one wide frame** |
| Speed-time curve, v_max | yes (fit) | — | flying splits only | **side-on trace**, hip tracked, scaled from height or two markers |
| F-V profile (Samozino) | yes | — | — | **v_max, τ, F0, Pmax** from the trace, labelled estimate |
| 5-10-5 | — | go-and-return | Dashr yes | **camera beta** from a wide front view; hand timing stays in combine day |
| ± on every number | — | — | — | **yes**, each read's own spread |
| Validity claim | published (2017) | published (2024, n = 5) | vendor | **none until FEL's own pilot vs gates** (owner call) |

What FEL must not do, from the studies: claim agreement it has not measured (the jump rule); hide that a "Go" time
includes the athlete's reaction (gates and Photo Finish's start phone do not); let a marker line sit off the running
line without saying what it costs; or prescribe from the F-V slope (the least reliable number in it).

---

_Sources (public pages, read 2026-10-25):_
- Romero-Franco N. et al., "Sprint performance and mechanical outputs computed with an iPhone app: comparison with
  existing reference methods", Eur J Sport Sci 2017, doi 10.1080/17461391.2016.1249031 —
  <https://digitum.um.es/entities/publication/d6cc4099-bb5c-499a-8faf-99ae85fd43b4/full>
- "Validity and reliability of sprint force-velocity profiling in elite football: comparison of MySprint, GPS, and
  radar devices" — <https://pmc.ncbi.nlm.nih.gov/articles/PMC12136470/>
- "Analysis of the Validity and Reliability of the Photo Finish® Smartphone App to Measure Sprint Time", Sensors 2024 —
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC11511534/>; App Store listing <https://apps.apple.com/app/id6477607305>
- "Athletics — the world's most measurable sport, but at what price? A comparison of fully automatic timing with times
  measured with standard mobile phones", Sensors 2022 — <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9003053/>
- SpeedClock validity — <https://pmc.ncbi.nlm.nih.gov/articles/PMC4972912>
- Single-beam photocells vs 240 fps video (soccer) — <https://repositorio.bc.ufg.br//handle/ri/30366>
- Samozino P. et al., "A simple method for measuring power, force, velocity properties, and mechanical effectiveness in
  sprint running", Scand J Med Sci Sports 2016 — <https://hal.univ-reunion.fr/hal-01389134>
- Sprint F-V profile reliability, JSSM 20(2):357 — <https://www.jssm.org/jssm-20-357.xml-Fulltext>
- Hand vs electronic 40 yd — <https://www.naseinc.com/blog/hand-timed-vs-electronic-timed-40-yard-dash/>;
  <https://simplifaster.com/articles/the-4-4-40/>
- Timing lights at two heights (flying 20 m) — <https://www.jhse.ua.es/article/view/2018-v13-n3-timing-lights-determining-sprint-velocities>
- Freelap Pro Coach BLE — <https://www.freelapusa.com/freelap-pro-coach-ble-timing-system/>
- Pro-agility (5-10-5) — <https://www.physio-pedia.com/Pro-Agility_%285-10-5%29_Test>;
  <https://www.scienceforsport.com/pro-agility-5-10-5-test/>
- Timing-systems review — <https://www.researchsquare.com/article/rs-10621620>
