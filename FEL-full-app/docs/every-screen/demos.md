# Demos in the session player — built-in and signature programs

Generated 2026-11-10 by `scripts/every-screen/demos.mts` (read only). Each exercise shows its own looping demo, or a still labelled "Demo coming"; never another movement.

| Programs | Exercises | Own demo | Labelled still | of which: no loop exists | loop exists, not reached | Wrong demo |
|---|---|---|---|---|---|---|
| Signature (4 programs, every gate) | 136 | 126 | 10 | 10 | 0 | 0 |
| Coach templates (7, every wave and ladder rung) | 104 | 17 | 87 | 3 | 84 | 0 |
| Program builder (1680 requests) | 443 | 338 | 105 | 105 | 0 | 2 |

Served signature exercises missing from the page's demo map: 0.

How "wrong" is checked: each loop's name is read into a movement and compared with the exercise's own pattern tag and its name. 22 pairs disagreed and each was looked at by hand (verdicts in the script, with reasons): 2 wrong. The read cannot catch a loop that is the right kind of movement but the wrong version (a front squat shown as a back squat).

## Wrong demos

| Exercise | Plays | Where | Why it is wrong |
|---|---|---|---|
| Spider Crawl (`spider-crawl`) | `ex_spiderman_pushup` | builder: mobility | a travelling crawl warm-up plays a push-up in place: the chest drops to the floor and nothing travels. lib/library/demo.ts line 752 (demo-loops); assumption: the crawl is not done as a push-up |
| Split Squat Stretch (`split-squat-stretch`) | `ex_split_jump` | builder: full-body, strength, muscle, conditioning, athletic, mobility | a hamstring stretch (front leg long, fold forward, "no bouncing") plays a jumping split-switch plyometric. lib/library/demo.ts line 890 (demo-loops) |

## For the animation lane: exercises with no loop yet

117 exercises have no loop at all and show the labelled still. Most-used first.

| Exercise | Pattern | Family / variation | Appears in |
|---|---|---|---|
| Wall Hip Hinge (`wall-hip-hinge`) | hinge | hinge-pattern / wall-tap | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength, template:adult-bw-3, template:adult-bw-4, template:camp-session, template:youth-bw-2, template:youth-bw-3 |
| Anti-Gravity Press (`anti-gravity-press`) | push | overhead-press / anti-gravity-press | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Barbell Ab Rollout (`barbell-ab-rollout`) | other | rollout / ab-rollout | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Barbell Ab Rollout - On Knees (`barbell-ab-rollout-on-knees`) | other | rollout / ab-rollout-kne | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Barbell Box Step-Up (`barbell-box-step-up`) | lunge | step-up / bb | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Barbell Rear Delt Row (`barbell-rear-delt-row`) | pull | rear-delt-face-pull / rear-shoulder-row | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Barbell Rollout from Bench (`barbell-rollout-from-bench`) | other | rollout / rollout-bench | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Barbell Side Split Squat (`barbell-side-split-squat`) | lunge | lunge / sid-split-squat | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Barbell Walking Lunge (`barbell-walking-lunge`) | lunge | lunge / walk-lung | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Bird Dog Hold, Knee Hover (`bird-dog-hold-knee-hover`) | other | dead-bug-bird-dog / bird-hover | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Bird Dog Row (`bird-dog-row`) | other | dead-bug / bird-dog-row | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Bodyweight Walking Lunge (`bodyweight-walking-lunge`) | lunge | lunge / bodyweight-walk-lung | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Butt Lift (Bridge) (`butt-lift-bridge`) | hinge | bridge-thrust / glut-lift-bridg | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Calf Press (`calf-press`) | other | calf-raise / calf-press | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Copenhagen Plank (`copenhagen-plank`) | other | side-plank / copenhagen-long | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Couch Stretch Knee Lift-Off (`couch-stretch-knee-lift-off`) | mobility | active-mobility / couch-liftoff | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Dead Bug with Kettlebell Press (`dead-bug-with-kettlebell-press`) | other | dead-bug-bird-dog / kb | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Dumbbell Push Press (`dumbbell-push-press`) | push | push-extra / db-push-press | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Dumbbell Renegade Row (`dumbbell-renegade-row`) | pull | db-upper / renegade | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Dumbbell Walking Lunge (`dumbbell-walking-lunge`) | lunge | lunge / walking-db | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Eccentric Pull-Up (`eccentric-pull-up`) | pull | vertical-pull / eccentric | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Feet-Elevated Inverted Row (`feet-elevated-inverted-row`) | pull | row / inverted-feet-up | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Feet-Elevated Inverted Row with 4-Second Lower (`feet-elevated-inverted-row-with-4-second-lower`) | pull | row / inverted-feet-up+tempo | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Frog Pump (`frog-pump`) | hinge | hinge-accessory / frog-pump | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Frog Pump with 4-Second Lower (`frog-pump-with-4-second-lower`) | hinge | hinge-accessory / frog-pump+tempo | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Goblet Deep Squat Hold with Reach (`goblet-deep-squat-hold-with-reach`) | mobility | loaded-mobility / goblet-reach | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Handstand Push-Ups (`handstand-push-ups`) | push | push-up / handstand-push-ups | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Incline Plank (`incline-plank`) | other | plank / incline | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Kettlebell Arm Bar (`kettlebell-arm-bar`) | mobility | loaded-mobility / arm-bar | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Kneeling Cable Triceps Extension (`kneeling-cable-triceps-extension`) | push | triceps / kneel-tricep-extension | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Lateral Bear Crawl (`lateral-bear-crawl`) | other | plank / bear-lateral | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Leg-Over Floor Press (`leg-over-floor-press`) | push | bench-press / leg-over-floor-press | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Loaded Ankle Rock (`loaded-ankle-rock`) | mobility | ankle-mobility / loaded | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Loaded Jefferson Curl (`loaded-jefferson-curl`) | mobility | posterior-chain-mobility / jefferson | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Long-Lever Forearm Plank with Leg Lift (`long-lever-forearm-plank-with-leg-lift`) | other | plank-matrix / long-lever-leg-lift | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Long-Lever Plank (`long-lever-plank`) | other | plank / long-lever | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Lying Crossover (`lying-crossover`) | mobility | stretch-hip / lying-crossover | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Lying Glute (`lying-glute`) | mobility | stretch-hip / lying-glut | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Muscle Up (`muscle-up`) | pull | pull-up / muscl-up | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Pallof Press With Rotation (`pallof-press-with-rotation`) | rotation | plank / pallof-press-rotation | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Pigeon Back-Knee Lift-Off (`pigeon-back-knee-lift-off`) | mobility | active-mobility / pigeon-liftoff | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Plank Bird Dog (`plank-bird-dog`) | other | dead-bug-bird-dog / bird-plank | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Prone Dumbbell Rear Fly (`prone-dumbbell-rear-fly`) | pull | upper-back / rear-fly-prone | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Prone W Raise (`prone-w-raise`) | pull | shoulder-care / prone-w | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Prone Y Raise (`prone-y-raise`) | pull | shoulder-care / prone-y | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Reverse Flyes With External Rotation (`reverse-flyes-with-external-rotation`) | pull | rear-delt-face-pull / revers-fly-external-rotation | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Reverse Plank with Leg Lift (`reverse-plank-with-leg-lift`) | other | plank-matrix / reverse-leg-lift | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Seated Biceps (`seated-biceps`) | mobility | stretch-upper / seat-bicep | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Seated Glute (`seated-glute`) | mobility | stretch-hip / seat-glut | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Short Side Plank (`short-side-plank`) | other | side-plank / short | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Side Plank Hip Dip (`side-plank-hip-dip`) | other | rollout-matrix / side-dip | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Side Plank Reach-Through (`side-plank-reach-through`) | other | rollout-matrix / side-reach | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Side Plank with Arm Reach (`side-plank-with-arm-reach`) | other | plank-matrix / side-arm-reach | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Single-Arm Push-Up (`single-arm-push-up`) | push | push-up / singl-arm-push-up | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Single-Leg Hip Airplane (`single-leg-hip-airplane`) | hinge | single-leg-hinge / airplane | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Spinal Wave (`spinal-wave`) | mobility | shoulder-mobility / spinal-wave | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Staggered-Hand Push-Up (`staggered-hand-push-up`) | push | push-extra / staggered | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| T Push-Up (`t-push-up`) | push | push-extra / t-push-up | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| T Push-Up with 4-Second Lower (`t-push-up-with-4-second-lower`) | push | push-extra / t-push-up+tempo | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Zottman Preacher Curl (`zottman-preacher-curl`) | pull | curl / zottman-preacher-curl | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:sport, builder:strength |
| Adductor/Groin (`adductor-groin`) | mobility | stretch-hip / adductor-groin | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:strength |
| Barbell Step Ups (`barbell-step-ups`) | lunge | step-up / step-ups | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:strength |
| Chair Squat (`chair-squat`) | squat | squat / chair-squat | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:strength |
| Clock Push-Up (`clock-push-up`) | push | push-up / clock-push-up | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:strength |
| Hack Squat (`hack-squat`) | squat | leg-press-hack / hack-squat | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:strength |
| Kipping Muscle Up (`kipping-muscle-up`) | pull | pull-up / kip-muscl-up | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:strength |
| Leg Press (`leg-press`) | squat | leg-press-hack / leg-press | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:strength |
| Lunge Pass Through (`lunge-pass-through`) | lunge | lunge / lung-pass-through | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:strength |
| Lying Prone Quadriceps (`lying-prone-quadriceps`) | mobility | stretch-quad-hip / lying-pron-quadricep | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:strength |
| Muscle Up with 4-Second Lower (`muscle-up-with-4-second-lower`) | pull | pull-up / muscl-up+tempo | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:strength |
| Seated Front Deltoid (`seated-front-deltoid`) | mobility | stretch-upper / seat-front-deltoid | builder:athletic, builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:strength |
| Eccentric Push-Up (`eccentric-push-up`) | push | push-up / eccentric | builder:conditioning, builder:full-body, builder:muscle, builder:sport, builder:strength |
| Long-Lever Forearm Plank with Arm Reach (`long-lever-forearm-plank-with-arm-reach`) | other | plank-matrix / long-lever-arm-reach | builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:strength |
| Long-Lever Forearm Plank with Knee-to-Elbow (`long-lever-forearm-plank-with-knee-to-elbow`) | other | plank-matrix / long-lever-knee-elbow | builder:conditioning, builder:full-body, builder:mobility, builder:muscle, builder:strength |
| Supported Split Squat (`supported-split-squat`) | lunge | split-squat / supported | template:adult-bw-3, template:adult-bw-4, template:camp-session, template:youth-bw-2, template:youth-bw-3 |
| Barbell Guillotine Bench Press (`barbell-guillotine-bench-press`) | push | bench-press / guillotin-bench-press | builder:conditioning, builder:full-body, builder:muscle, builder:strength |
| Barbell Hack Squat (`barbell-hack-squat`) | squat | leg-press-hack / hack-squat | builder:conditioning, builder:full-body, builder:muscle, builder:strength |
| Kettlebell Gorilla Row (`kettlebell-gorilla-row`) | pull | row / kb-gorilla | builder:athletic, builder:conditioning, builder:full-body, builder:sport |
| Kettlebell Gorilla Row with 4-Second Lower (`kettlebell-gorilla-row-with-4-second-lower`) | pull | row / kb-gorilla+tempo | builder:athletic, builder:conditioning, builder:full-body, builder:sport |
| 5-10-5 Shuttle (`5-10-5-shuttle`) | locomotion | change-of-direction / 5-10-5 | signature:athletic-foundation, signature:basketball-skills |
| Ankling (`ankling`) | locomotion | sprint-mechanics / ankling | builder:athletic, builder:sport |
| Dead Bug, Legs Only (`dead-bug-legs-only`) | other | dead-bug-bird-dog / legs | builder:muscle, builder:strength |
| Dead Bug, Wall Press (`dead-bug-wall-press`) | other | dead-bug-bird-dog / wall | builder:muscle, builder:strength |
| Dot Drill (`dot-drill`) | locomotion | quick-feet / dot | builder:athletic, builder:sport |
| Fast-Leg Drill (`fast-leg-drill`) | locomotion | sprint-development / fast-leg | builder:athletic, builder:sport |
| Half-Kneeling Landmine Press (`half-kneeling-landmine-press`) | push | overhead-press / landmine-hk | template:adult-gym-3, template:adult-gym-4 |
| Hill Sprint (`hill-sprint`) | locomotion | acceleration / hill | builder:athletic, builder:sport |
| Kettlebell Hike Pass (`kettlebell-hike-pass`) | hinge | kb-swing / hike | builder:athletic, builder:sport |
| Line Quick Steps (`line-quick-steps`) | locomotion | quick-feet / line-steps | builder:athletic, builder:sport |
| Lunge Sprint (`lunge-sprint`) | locomotion | sprint-drill / lung-sprint | builder:athletic, builder:sport |
| Lying Machine Squat (`lying-machine-squat`) | squat | leg-press-hack / lying-squat | builder:conditioning, builder:full-body |
| Prone Scorpion Reach (`prone-scorpion-reach`) | mobility | shoulder-mobility / scorpion | builder:mobility, builder:sport |
| Push Up to Side Plank (`push-up-to-side-plank`) | push | push-up / push-up-sid-plank | builder:conditioning, builder:full-body |
| Quick Feet in Place (`quick-feet-in-place`) | locomotion | quick-feet / in-place | builder:athletic, builder:sport |
| Spiderman Lunge Walk (`spiderman-lunge-walk`) | mobility | dynamic-flow / spiderman | builder:mobility, builder:sport |
| Straight-Leg Run (`straight-leg-run`) | locomotion | sprint-development / straight-leg-run | builder:athletic, builder:sport |
| Vertical Swing (`vertical-swing`) | hinge | kb-swing / vertical-swing | builder:athletic, builder:sport |
| 45-Degree Back Extension (`45-degree-back-extension`) | hinge | hinge-accessory / 45-ext | builder:sport |
| 45-Degree Back Extension with 4-Second Lower (`45-degree-back-extension-with-4-second-lower`) | hinge | hinge-accessory / 45-ext+tempo | builder:sport |
| 90/90 Back-Leg Lift-Off (`90-90-back-leg-lift-off`) | mobility | active-mobility / ninety-liftoff | builder:sport |
| Barbell Side Split Squat with 4-Second Lower (`barbell-side-split-squat-with-4-second-lower`) | lunge | lunge / sid-split-squat+tempo | builder:athletic |
| Between-Behind Combo (`between-behind-combo`) | other | handle-combos / between-behind | signature:basketball-skills |
| Box-Out (`box-out`) | locomotion | defense / box-out | signature:basketball-skills |
| Cone Change-of-Pace Dribble (`cone-change-of-pace-dribble`) | other | ball-handling / change-of-pace | signature:basketball-skills |
| Controlled Thoracic Circle, Seated (`controlled-thoracic-circle-seated`) | mobility | joint-circles / thoracic-seated | builder:mobility |
| Crossover into Layup (`crossover-into-layup`) | locomotion | moving-handles / cross-layup | signature:basketball-skills |
| Crossover-Between Combo (`crossover-between-combo`) | other | handle-combos / cross-between | signature:basketball-skills |
| Elevated Back Lunge (`elevated-back-lunge`) | lunge | lunge / elevat-back-lung | builder:athletic |
| Floor Snow Angel (`floor-snow-angel`) | mobility | stretch-matrix / chest-angel | builder:sport |
| Full-Court Layup Lines (`full-court-layup-lines`) | locomotion | finishing-touch / full-court | signature:basketball-skills |
| Full-Court Speed Dribble (`full-court-speed-dribble`) | locomotion | moving-handles / speed | signature:basketball-skills |
| Kettlebell High Pull, Light (`kettlebell-high-pull-light`) | pull | pull-extra / kb-high-pull | builder:sport |
| Latissimus Dorsi-SMR (`latissimus-dorsi-smr`) | mobility | roll / latissimus-dorsi-smr | signature:pain-free |
| Seated Hip Rotation Lift-Off (`seated-hip-rotation-lift-off`) | mobility | active-mobility / hip-rot-liftoff | builder:mobility |
| Slide-Run-Slide (`slide-run-slide`) | locomotion | defense / slide-run | signature:basketball-skills |
| Tall-Kneeling Hip Rotation (`tall-kneeling-hip-rotation`) | mobility | shoulder-mobility / tall-kneel-rotation | builder:mobility |
| Walking Knee Hug (`walking-knee-hug`) | mobility | dynamic-flow / knee-hug | builder:sport |

## Not the animation lane's: a coach-template exercise that shows the still although a loop could play

The coached athlete's Today reads each catalogue row's loop by its exact name in the library, approved entries only (lib/coach/todayExtras.ts libraryClips). The signature programs play draft entries' loops; this path does not.

| Exercise (coach catalogue name) | Why the still | Loop the library would play | Templates |
|---|---|---|---|
| Backpack Hug Carry | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2 |
| Backpack Hug Hold | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2 |
| Backpack Hug March | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2 |
| Backpack Hug Squat | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Backpack Hug Squat, 3-Second Pause | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Backpack RDL | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Backpack Reverse Lunge | no library entry has this name | — | adult-bw-3, adult-bw-4 |
| Barbell Back Squat | library entry `barbell-back-squat` is a draft | `ex_squat_bar` | adult-gym-3, adult-gym-4 |
| Barbell Bench Press | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Barbell Bent-Over Row, 2-Second Squeeze | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Barbell Overhead Press | library entry `barbell-overhead-press` is a draft | `ex_press` | adult-gym-3, adult-gym-4 |
| Barbell RDL | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Barbell RDL, 3-Second Lower | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Barbell Rear-Foot Elevated Split Squat | library entry `barbell-rear-foot-elevated-split-squat` is a draft | `ex_bulgarian_bar` | adult-gym-3, adult-gym-4 |
| Bent-Over Backpack Row | no library entry has this name | — | adult-bw-3, adult-bw-4, camp-session |
| Bent-Over Backpack Row, 3-Second Squeeze | no library entry has this name | — | adult-bw-3, adult-bw-4, camp-session |
| Bodyweight RDL, 3-Second Hold | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Box Jump and Stick | no library entry has this name | — | adult-bw-3, adult-bw-4, adult-gym-4 |
| Breathing Plank | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Breathing Plank with Shoulder Taps | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Broad Jump and Stick | library entry `broad-jump-to-stick` is a draft | `ex_broad_jump_stick` | adult-bw-3, adult-gym-3 |
| Cable Face Pull | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Cable Face Pull, 2-Second Hold | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Chair Box Squat | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Chest-Supported Dumbbell Row | library entry `chest-supported-dumbbell-row` is a draft | `ex_chest_row` | adult-gym-3, adult-gym-4 |
| Continuous Lateral Bounds | library entry `continuous-lateral-bound` is a draft | `ex_lateral_bound` | adult-bw-3, adult-gym-3 |
| Countermovement Jump and Stick | library entry `countermovement-jump-to-stick` is a draft | `ex_jump` | adult-bw-3, adult-bw-4, adult-gym-4 |
| Double Broad Jump and Stick | no library entry has this name | — | adult-bw-3, adult-gym-3 |
| Dumbbell Farmer Carry | library entry `dumbbell-farmer-carry` is a draft | `ex_carry` | adult-gym-3, adult-gym-4 |
| Dumbbell Farmer Hold | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Dumbbell RDL | library entry `dumbbell-romanian-deadlift` is a draft | `ex_hinge` | adult-gym-3, adult-gym-4 |
| Dumbbell Rear-Foot Elevated Split Squat | library entry `dumbbell-rear-foot-elevated-split-squat` is a draft | `ex_bulgarian` | adult-gym-3, adult-gym-4 |
| Dumbbell Step-Up | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Dumbbell Step-Up, 3-Second Lower | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Dumbbell Step-Up, Low Box | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Dumbbell Suitcase Carry | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Dumbbell Suitcase March | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Fast Bodyweight Squat | no library entry has this name | — | adult-bw-3, adult-bw-4, adult-gym-4 |
| Fast Heel Raise | no library entry has this name | — | adult-bw-4, adult-gym-3, adult-gym-4 |
| Feet-Elevated Pike Push-Up | no library entry has this name | — | adult-bw-3, adult-bw-4 |
| Feet-Elevated Push-Up | library entry `feet-elevated-push-up` is a draft | `ex_decline_pushup` | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Front-Rack Kettlebell Carry | library entry `front-rack-kettlebell-carry` is a draft | `ex_carry_rack` | adult-gym-3, adult-gym-4 |
| Glute Bridge, 5-Second Squeeze | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2 |
| Glute Bridge, Feet Close | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2 |
| Goblet Carry | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Goblet Hold | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Half-Kneeling Single-Arm Pulldown | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Hands-Elevated Pike Push-Up | no library entry has this name | — | adult-bw-3, adult-bw-4 |
| Hip Snap | no library entry has this name | — | adult-bw-3, adult-gym-3 |
| Incline Breathing Plank | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Kettlebell Deadlift | library entry `kettlebell-deadlift` is a draft | `ex_hinge` | adult-gym-3, adult-gym-4 |
| Lat Pulldown | library entry `lat-pulldown` is a draft | `ex_pulldown` | adult-gym-3, adult-gym-4 |
| Lateral Bound and Stick | library entry `lateral-bound-to-stick` is a draft | `ex_lateral_bound` | adult-bw-3, adult-gym-3 |
| Lateral Step and Stick | no library entry has this name | — | adult-bw-3, adult-gym-3 |
| Low Box Depth Drop and Stick | no library entry has this name | — | adult-bw-3, adult-bw-4, adult-gym-4 |
| Paused Barbell Back Squat | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Paused Barbell Bench Press | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Pike Push-Up | library entry `pike-push-up` is a draft | `ex_pike_pushup` | adult-bw-3, adult-bw-4 |
| Pogo Hops | library entry `pogo-hop` is a draft | `ex_pogo` | adult-bw-4, adult-gym-3, adult-gym-4 |
| Prone T Raise | library entry `prone-t-raise` is a draft | `ex_prone_t` | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2 |
| Prone Y-T Raise | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2 |
| Prone Y-T Raise, 3-Second Holds | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2 |
| Rear-Foot Elevated Split Squat | library entry `rear-foot-elevated-split-squat` is a draft | `ex_bulgarian` | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Rear-Foot Elevated Split Squat, 4-Second Lower | library entry `rear-foot-elevated-split-squat-with-4-second-lower` is a draft | `ex_bulgarian` | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Reverse Lunge | library entry `reverse-lunge` is a draft | `ex_reverse_lunge` | adult-bw-3, adult-bw-4 |
| Single-Arm Door Frame Row | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2 |
| Single-Arm Door Frame Row, 3-Second Lower | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2 |
| Single-Leg Bridge with a Backpack | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2 |
| Single-Leg Bridge, 5-Second Squeeze | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2 |
| Single-Leg Pogo Hops | no library entry has this name | — | adult-bw-4, adult-gym-3, adult-gym-4 |
| Single-Leg RDL Toe Touch, Supported | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Single-Leg RDL, Free Stand | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Split Squat, 3-Second Hold | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Split-Stance Pallof Press with a Hold | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Standing Pallof Press | no library entry has this name | — | adult-gym-3, adult-gym-4 |
| Suitcase Carry | library entry `suitcase-carry` is a draft | `ex_carry_suitcase` | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Suitcase March | library entry `suitcase-march` is a draft | `ex_march_carry` | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Supported One-Arm Backpack Row | no library entry has this name | — | adult-bw-3, adult-bw-4, camp-session |
| Supported Reverse Lunge | no library entry has this name | — | adult-bw-3, adult-bw-4 |
| Tall-Kneeling Pallof Press | library entry `tall-kneeling-pallof-press` is a draft | `ex_pallofpress_tk` | adult-gym-3, adult-gym-4 |
| Tempo Bodyweight Squat | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Two-Bag Farmer Carry | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Two-Bag Farmer Hold | no library entry has this name | — | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
| Wall Push-Up | library entry `wall-push-up` is a draft | `ex_wall_pushup` | adult-bw-3, adult-bw-4, youth-bw-3, youth-bw-2, camp-session |
