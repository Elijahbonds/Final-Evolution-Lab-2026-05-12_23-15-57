# VBT benchmark — what camera and sensor bar-speed tools do, and FEL's targets (lane `vbt`, 2026-10-25)

Owner decisions 2026-10-25: **camera only** (no sensor, no Bluetooth); barbell, dumbbell/kettlebell, body-only and
med-ball throws; coaches, solo lifters and a game tie-in; **no accuracy claim until a validation pilot** (the jump
check's rule). This file is Step 0: what the market does, what the published validity says, and the targets FEL holds
its own code to. Public pages and papers only, read 2026-10-25; no account was made. Where a number came from a
developer's own blog it says so.

## 1. The tools

| Tool | Method | Published validity (vs a reference) | Features | Price (public page, 2026-10-25) |
|---|---|---|---|---|
| **Metric VBT** | Phone camera, side-on; tracks the plate in the video | Renner 2024 (PLOS ONE, vs Vicon 200 Hz, iPhone SE, 3 m side-on, 60 fps class): MCV **not** comparable to a transducer except bench (SMB 0.07, RMSE 0.04 m/s); squat/deadlift RMSE worse; **52 of 589 reps missed, 16 ghost reps** [1]. Puppyn (AUT, vs GymAware, 25 lifters): 94.3 % of reps detected vs 99.5 % [2]. Developer-linked bench studies: r = 0.937 vs GymAware [3]; PV r = 0.91 but MV ICC = 0.612 on a Smith bench [4] | MCV, PV, bar path on the video, e1RM from the athlete's velocity profile, coach dashboard (coach plans), jump and sprint apps | Ultra Solo **$89.99/yr**; Ultra Coach **$199/yr (5 athletes)**, **$529/yr (25)** [5] |
| **Qwik VBT** | Phone video (imported, e.g. 1080p 60 fps); the user taps the plate, then plate tracking | Renner 2024: **equivalent to the RepOne transducer** vs Vicon in squat, bench and deadlift; SMB 0–0.21, **RMSE 0.01–0.04 m/s**, 0 missed and 0 ghost reps (v0.94) [1] | MCV, PV, bar path, rep comparison, CSV/JSON export | Free + **$27.99** premium (App Store listing via a tracker page) [6] |
| **MyLift** (was PowerLift) | Phone high-speed video; the user marks the start and end of each rep by hand (Newtonian kinematics over the ROM) | Balsalobre-Fernández 2018: valid vs a transducer on bench, small positive bias; e1RM correlated with the real 1RM [7]. Independent: large errors above ~0.3 m/s, reliability falls above 1 m/s [7]; Renner 2024: 175 of 589 reps not registered, RMSE up to 0.14 m/s [1] | MCV, LV profile, e1RM | (not verified on a public page) |
| **GymAware** (FLEX / RS) | Linear position transducer (a tether on the bar; FLEX is optical) — the field's reference device | Dorrell 2019 (vs 3-D motion capture and a force plate): R² > 0.85 for all variables except deadlift MV; typical error 0.6–8.8 % [8]. Orange 2019 (test–retest, rugby): MV ICC 0.77–0.83 squat 40–90 % 1RM, 0.78–0.87 bench at 80–90 % [8]. Thompson 2020: best of six devices on squat and clean [9] | MCV, PV, power, ROM, velocity loss, LV profile and 1RM estimate, team cloud dashboard | Quote / reseller only (no price on the pages reached) |
| **Vmaxpro → Enode** | Bar-mounted IMU (accelerometer + gyro) | Vmaxpro: Held 2021 vs a transducer, squat MCV ICC 0.91–0.96, small bias; displacement LoA 7.8–10.7 cm [10]; Olaya-Cuartero 2022 vs 3-D capture, bias −0.021 m/s, random error 0.053 m/s [10]. EnodePro (Behrmann/Warneke, n = 53): **systematically higher** velocities, error 0.036–0.198 m/s, squat ICC 0.204–0.991 — overestimated 1RM [11] | Velocity profiles per exercise, daily e1RM, team planning (Enode Pro), Apple Watch tracking (Enode One) | Free tiers; paid Pro+ / One+ (no prices shown) [12] |
| **PUSH** (Band 2.0) | Arm- or bar-worn IMU | Lake 2019 (bench, vs 3-D capture): **PV valid, MV not** (proportional bias) [13]; Pérez-Castilla (squat, vs T-Force): acceptable reliability, low MV validity [13]; accurate on bench only under ~0.65 m/s in rugby players [13] | MV, PV, power, team | (not verified; the band is no longer prominent on public pages) |
| **Output Sports** | Wearable IMU, one sensor for jumps, sprints and lifts | No peer-reviewed barbell validation found (2026-10-25). Thompson 2020 places IMUs below transducers and phone apps generally [9] | VBT module (velocity, force, power), automatic LV profiles, squad profiling, leaderboards, a rep-max pathway | "Get demo and pricing" (no price); up to 50 % off for high schools [14] |

**What the evidence says, in one line.** A camera can be as valid as a transducer for **mean concentric velocity** when
it tracks the **plate**, side-on, at 60 fps and up, and finds every rep (Qwik VBT in [1]). The same camera approach
failed when it missed or invented reps (Metric in [1]). Sensors on the bar (IMUs) do well on peak velocity and worse on
mean velocity, and some overestimate it (EnodePro) [11, 13]. Nobody publishes validity for wrist- or hip-tracked
bodyweight moves or med-ball release speed from a phone: those are FEL's own estimates and are labelled that way.

## 2. The numbers FEL reads (definitions, from the literature)

- **MCV** — mean concentric velocity: concentric displacement ÷ concentric time.
- **PV** — the peak instantaneous velocity in the concentric.
- **MPV** — mean propulsive velocity: the mean over the part of the concentric where the bar's acceleration is above
  −g (after that the bar decelerates faster than gravity alone, i.e. the lifter is braking) — Sánchez-Medina,
  Pérez & González-Badillo 2010, *Int J Sports Med* [15].
- **Velocity loss %** — (fastest rep's MCV − last rep's MCV) ÷ fastest × 100, within a set; Sánchez-Medina &
  González-Badillo 2011, *Med Sci Sports Exerc* (VL tracks lactate, ammonia and CMJ loss) [16]. Pareja-Blanco 2017
  (*Scand J Med Sci Sports*): stopping squat sets at **20 % VL** gave similar strength gains to 40 % with less fatigue —
  the source of FEL's default auto-stop line (a new number; the coach can change it) [17].
- **Minimum velocity threshold (MVT)** — the MCV of a 1RM, used to read an e1RM off the load–velocity line:

  | Lift | MVT used | Source |
  |---|---|---|
  | Back squat, front squat | **0.30 m/s** | the "general 0.3 m/s" squat MVT [18]; full-squat 1RM MPV 0.32 ± 0.03 (Sánchez-Medina 2017, *Int J Sports Med*) |
  | Bench press | **0.17 m/s** | 1RM MPV 0.16 ± 0.04 (González-Badillo & Sánchez-Medina 2010, *Int J Sports Med*) |
  | Deadlift | **0.24 m/s** | 1RM MV 0.24 ± 0.03, 20 trained men (Morán-Navarro et al. 2021, "Load-velocity relationship of the deadlift exercise") [19] |
  | Overhead press | **0.19 m/s** | military-press 1RM MV ≈ 0.19 (Balsalobre-Fernández et al. 2018) — assumption: not re-read in full text here |
  | Clean / snatch, jump squat, med ball | none | ballistic: there is no slow 1RM rep to read; no e1RM is offered |

  The MVT itself varies between people (±0.03–0.04 m/s above) and is unreliable within a person for some lifts; reference
  MVTs mispredict the 1RM in trained men [18]. So every e1RM carries that spread in its band, and is labelled estimate.
- **Velocity zones** — the coaching table popularised by Mann (*Developing Explosive Athletes*, 2016) after
  Jovanović & Flanagan 2014: absolute strength < 0.50 m/s, accelerative strength 0.50–0.75, strength–speed 0.75–1.00,
  speed–strength 1.00–1.30, starting strength > 1.30. A heuristic, not a measurement; FEL uses it as the default zone
  set a coach prescribes from.

## 3. FEL's targets (held on the synthetic bench now; claimed only after the pilot)

| # | Target | Why | How it is checked now |
|---|---|---|---|
| T1 | Barbell MCV, plate tracked, side-on, 60 fps: **|bias| ≤ 0.03 m/s, 95 % of reps within ± 0.06 m/s** | Qwik VBT's RMSE 0.01–0.04 [1] is the bar to meet | `lib/vbt/bench.test.ts`: generated bar paths with known velocity + realistic pixel noise at 30/60/240 fps |
| T2 | Pose-only (wrist) barbell / DB / body moves: every number an **estimate with a ± band**; 95 % of reps within the band on the bench | no published validity for this method | the same bench, pose-jitter noise model |
| T3 | **No missed and no ghost reps** on the bench's takes (pauses, partials, bounce, a sticking point) | Metric's 52 missed + 16 ghost reps [1] is the failure that matters most to a set count and VL % | `lib/vbt/reps.test.ts` |
| T4 | e1RM only from ≥ 2 loads, only for lifts with a published MVT, always with a band that includes the MVT's own spread; never for a minor | [18, 19] | `lib/vbt/profile.test.ts` |
| T5 | Video never leaves the phone; numbers only are saved, for verified adults who opted in | FEL privacy rule (SelfView, scan-save gate) | `tests/vbt/*.scan.test.ts` |
| T6 | Accuracy claim | none until the **validation pilot**: FEL vs a linear transducer (GymAware or RepOne), side-on phone at 3 m, squat/bench/deadlift 45–90 % 1RM, Bland–Altman bias and LoA, ICC, missed/ghost reps — run alongside the jump pilot | owner call |

Not in scope by the owner's decision: any sensor, Bluetooth, or a transducer integration.

## 4. Sources

1. Renner et al. 2024, "Concurrent validity of novel smartphone-based apps monitoring barbell velocity in powerlifting exercises", *PLOS ONE* 19(11): e0313919. https://pmc.ncbi.nlm.nih.gov/articles/PMC11575817/
2. Puppyn et al., AUT thesis/paper on Metric vs GymAware. https://openrepository.aut.ac.nz/bitstreams/5344904a-b73d-4d16-aa1d-0f533319f3b4/download
3. Li et al. 2024 (Metric's blog summary; developer-linked). https://metric.coach/articles/li-et-al-2024-metricvbt-vs-tempro-spleeft-bench-press
4. Grossi et al. 2026 (Metric's blog summary; developer-linked). https://metric.coach/articles/grossi-et-al-2026-metricvbt-vs-vitruve-bench-press
5. Metric pricing. https://www.metric.coach/pricing
6. Qwik VBT App Store listing (via AppsHunter). https://appshunter.io/ios/app/qwik-vbt/id1660094818
7. Balsalobre-Fernández et al. 2018 and the independent critiques (Martínez-Cava 2020; Pallarés letter 2019). https://abacus.universidadeuropea.com/entities/publication/2c7c6bdf-89be-4b9a-834f-5e50b8b25a15 ; https://www.fisiologiadelejercicio.com/wp-content/uploads/2019/11/2019_Letter-to-editor_reliability_Pallar%C3%A9s.pdf
8. Dorrell et al. 2019 (Portsmouth); Orange et al. 2019 (Hull). https://researchportal.port.ac.uk/en/publications/validity-and-reliability-of-a-linear-positional-transducer-across/ ; https://hull-repository.worktribe.com/output/901017
9. Thompson et al. 2020, "The Reliability and Validity of Current Technologies for Measuring Barbell Velocity in the Free-Weight Back Squat and Power Clean", *Sports*. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7404723/
10. Held et al. 2021 (VmaxPro, *IJERPH*); Olaya-Cuartero et al. 2022 (*JPES*). https://pmc.ncbi.nlm.nih.gov/articles/PMC8431394 ; https://rua.ua.es/dspace/bitstream/10045/130113/1/Olaya-Cuartero_etal_2022_JPES.pdf
11. "Is the EnodePro® a Valid Tool to Determine the Bar Velocity in the Bench Press and Barbell Back Squat?" https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11769546/
12. Enode. https://enode.ai/
13. Lake et al. 2019 (PUSH Band 2.0, bench); Pérez-Castilla et al. (PUSH vs T-Force, squat). https://eprints.chi.ac.uk/id/eprint/4781/ ; https://researchprofiles.canberra.edu.au/en/publications/validity-of-the-push-band-20-and-speed4lifts-to-measure-velocity-/
14. Output Sports. https://www.outputsports.com/
15. Sánchez-Medina, Pérez & González-Badillo 2010, "Importance of the propulsive phase in strength assessment", *Int J Sports Med* 31: 123–129 (the MPV definition; cited from the literature, full text not re-read here).
16. Sánchez-Medina & González-Badillo 2011, "Velocity loss as an indicator of neuromuscular fatigue during resistance training", *Med Sci Sports Exerc* 43: 1725–1734.
17. Pareja-Blanco et al. 2017, "Effects of velocity loss during resistance training on athletic performance, strength gains and muscle adaptations", *Scand J Med Sci Sports* 27: 724–735. https://paulogentil.com/pdf/Effects%20of%20velocity%20loss%20during%20resistance%20training%20on%20athletic%20performance,%20strength%20gains%20and%20muscle%20adaptations.pdf
18. MVT reviews and squat MVT methods. https://pmc.ncbi.nlm.nih.gov/articles/PMC8151422 ; https://thieme-connect.de/products/ejournals/html/10.1055/a-2330-3001
19. Deadlift load–velocity: https://lida.sport-iat.de/ta/Record/4062985 ; Benavides-Ubric et al. 2020, *J Sports Sci Med* 19: 452–459, https://www.jssm.org/jssm-19-452.xml-abst

Prices and features change; each row is what the linked public page said on 2026-10-25.
