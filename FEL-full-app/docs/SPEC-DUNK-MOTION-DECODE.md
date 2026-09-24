# Dunk motion — reference decode (DUNK MOTION pass, 2026-09-23)

Owner, 2026-09-23: *"all of the dunks need work, smoothening out, sharpening for accuracy in name and style. The body
movement looks unnatural."* Scope (AskUserQuestion): every dunk, everywhere (Flight Night, Dunk Duel, the 1v1/3v3 game
dunks). What reads wrong: pose and positioning, stiff robotic poses, not matching the name, hands/ball/timing. Source of
motion: the owner's captures where one matches, hand authoring against the reference where none does.

This file is the bar each dunk is measured against. It has two parts: **what a body in the air does** (true of every
dunk), then **what each named dunk is**. Each named entry lists the one or two shapes that make the dunk recognisable.
The instrument is `scripts/probes/_dunk-motion-probe.mts`, which records the drawn pose of every frame and replays it
frozen from the side and from the front three-quarter.

## 1. What every dunk body does

| Beat | What the body does | Source |
|---|---|---|
| Running with the ball | The ball is pushed out ahead of the body at speed. The dribbling elbow points back and a little out, never up. The free arm pumps in opposition to its own leg, bent and close to the body: forward and up as that knee goes back. Into the gather, both hands take the ball and rip it to the hip. | [HoopsKing on LaVine](https://hoopsking.com/blogs/default-blog/how-to-jump-higher-and-dunk-like-zach-lavine), owner 2026-09-23 ("fix the arms when running too") |
| Penultimate step | A long, low second-to-last step lowers the hips and pre-loads the take-off leg. It is the biggest single source of vertical speed on an approach jump. | [Acceleration Australia](https://accelerationaustralia.com.au/jump-higher-to-dunk-basketball-guide/), [Hoops Geek](https://www.thehoopsgeek.com/how-to-dunk/) |
| Take-off | The jumping leg bends little and acts as a lever. The hips extend hard (triple extension: ankle, knee, hip together). The lead knee drives up on a one-foot jump. | same, and [HoopsKing on LaVine](https://hoopsking.com/blogs/default-blog/how-to-jump-higher-and-dunk-like-zach-lavine) |
| Arm swing | Both arms drive up through the take-off. They are worth 10–15 % of the jump. The ball hand carries the ball up the front, never out to the side. | [Acceleration Australia](https://accelerationaustralia.com.au/jump-higher-to-dunk-basketball-guide/) |
| Air | Nothing holds still. The legs change shape through the flight (drive, tuck or kick, then long for the flush), the trunk follows the arms, and the head tracks the rim or the ball. | [Principles of animation](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation): follow-through / overlapping action, arcs, slow in / slow out |
| Flush | The ball hand is at or over the ring. The wrist snaps down through it, the trunk crunches into the iron, and the legs come long under the body. | [Wikipedia, Slam dunk](https://en.wikipedia.org/wiki/Slam_dunk) |
| After | Either the hand lets go and the body drops, absorbing with bent knees and the arms coming down in front, or the hand keeps the rim (a hang) and the body swings under it. | [Wikipedia, Slam dunk, elbow hang / hang](https://en.wikipedia.org/wiki/Slam_dunk) |

How this is measured (the probe):
- **Smoothness:** SPARC of each end effector's body-local speed.
- **Pops:** a bone's one-frame angular speed spiking over its neighbours.
- **Stiffness:** the share of the air in which a bone never moves.
- **Locked limbs:** elbows over 172° or knees over 176°.
- **Ball:** the palm-to-ball gap while held, and the hand-to-rim distance at the contact.

## 2. The named dunks

| Dunk (id) | What it must read as | Source |
|---|---|---|
| **Power / one-hand** (plain, 1v1/3v3 drive) | One-foot take-off. The ball rises in the strong hand up the front, cocks a little behind the ear, and hammers down through the ring. The off arm swings down and out for balance. | [Wikipedia](https://en.wikipedia.org/wiki/Slam_dunk) |
| **Two-hand** (standing) | Two-foot take-off. The ball goes up in both hands, over and slightly behind the head, and is flushed with both. The knees tuck a little. | [Wikipedia](https://en.wikipedia.org/wiki/Slam_dunk) |
| **Tomahawk** | The ball is raised above and often behind the head for a wind-up, then slammed down at the top of the jump. It is one- or two-handed; the two-hand version is the "back-scratcher". The body bows back (chest open, knees bent behind) for the wind-up and snaps forward with the slam. Dr. J popularised it. | [Wikipedia](https://en.wikipedia.org/wiki/Slam_dunk) |
| **Windmill** | One hand (the centripetal force), often with the ball cuffed between hand and forearm. The ball travels in a full circle from the front toward the back: down past the thigh, back behind the hip, up behind, then over the top and down into the ring, like a freestyle swimmer's stroke. The arm is long through the circle. Dominique Wilkins popularised it. | [Wikipedia](https://en.wikipedia.org/wiki/Slam_dunk), [HoopsKing](https://hoopsking.com/blogs/default-blog/exploring-different-types-of-dunks-basketball-parents-love) |
| **Rock the cradle** (cradle) | A windmill variant with the ball gripped between palm and wrist (cradled against the forearm). It is Jordan's: the ball is rocked down to the hip and swung up and over in one big arc. It is not a circle around the head. | [Jordan cradle, NBA.com](https://www.nba.com/watch/video/this-day-in-history-michael-jordan-throws-down-a-rock-the-cradle-dunk), [Wikipedia](https://en.wikipedia.org/wiki/Slam_dunk) |
| **360** (spin360) | A full turn before or with the dunk, most often into a tomahawk. The ball is held in tight, the knees are tucked (a small wheel turns faster), and the head spots the rim. | [Wikipedia](https://en.wikipedia.org/wiki/Slam_dunk) |
| **360 windmill** (windmill360) | The turn and a windmill arm together. Kenny Walker (1989) and Vince Carter (2000). | [Wikipedia](https://en.wikipedia.org/wiki/Slam_dunk) |
| **Eastbay** (eastbay) | Take-off off a right-left plant. The ball goes from the **non-dominant hand to the dominant hand** under the raised (left) leg, and the **dominant (right) hand** carries it up and finishes. This is Isaiah Rider's 1994 "East Bay Funk Dunk". | [Wikipedia](https://en.wikipedia.org/wiki/Slam_dunk), [Dylan Haugen, Dunk Definitions](https://dylan-haugen.com/dunk-definitions/) |
| **Double eastbay** (doubleeastbay) | Two passes under the legs in one flight. It is a Team Flight Brothers staple. | [Dylan Haugen](https://dylan-haugen.com/dunk-definitions/) |
| **Between the legs** (betweenlegs) | The SPLIT: the legs scissor apart (lead thigh forward, trail leg back, a hurdle stride), and the ball goes down through the gap and changes hands under the lead thigh. That makes it a different body from the eastbay's tucked lead knee. (The pass considered making it Gordon's under-both, then kept the split, which is already distinct and is what "between the legs" means on a court.) | [Dylan Haugen](https://dylan-haugen.com/dunk-definitions/), [NBA.com 2016 contest](https://www.nba.com/news/the-2016-dunk-contest-looking-back-at-the-best-one-ever) |
| **Fake eastbay** (fakeeastbay) | It starts as the eastbay (knee up, the ball going under) and pulls back out. The same hand finishes. | the game's own definition (a fake reads only if it starts as the real one) |
| **Double clutch** (clutch) | The ball is brought to the chest, thrust down below the waist, then brought over the head and dunked, "one fluid motion". It is often done with the back to the rim. | [Wikipedia](https://en.wikipedia.org/wiki/Slam_dunk) |
| **Behind the back** (behindback) | The ball is passed behind the back from one hand to the other in the air, and the receiving hand dunks. | [Dylan Haugen](https://dylan-haugen.com/dunk-definitions/) |
| **Fake behind the back** (fakeback) | It starts the behind-the-back (the ball goes round the hip) and brings it back to the same hand. | the game's own definition |
| **Scorpion** (scorpion) | Kilganon's. It is a no-look: the eyes go to the floor, the ball is brought behind him rather than over the shoulder, and the body ducks and arches so the feet kick up behind toward the head. | audited 2026-09-16 (dunk vocabulary + chains pass, commit 8536716) |
| **Lost & found** (lostfound) | Kilganon's. A self alley-oop thrown behind his own back with a 360 under it, caught, and slammed. | [ESPN](https://www.espn.com/espn/story/_/page/instantawesome-jordankilganon-150517/jordan-kilganon-debuts-incredible-lost-found-dunk-which-one-best-ever), [SI](https://www.si.com/extra-mustard/2015/05/18/jordan-kilganon-dunk-lost-and-found-video) |
| **Hide & seek** (hideseek) | Kilganon's. The ball disappears behind the head or back and reappears for the slam. | [Kilganon](https://www.youtube.com/watch?v=1G-vqi7a-8g) |
| **The tap** (tap) | No grip: an open palm redirects the ball into the ring. | owner's definition (2026-09-16) |

Runway beats:
- **Self-lob:** both hands toss it up ahead.
- **Bounce:** both hands throw it down into the floor.
- **Kick-up:** the ball is dropped to the foot and kicked up.
- **Back handspring:** a backward pitch over planted hands.
- **Backflip:** a tucked back flip under the lob.
- **Double-up:** a two-foot hop gather.

All six were owner-defined in the new-moves pass (f540b1f … 4609e3d); this pass does not change what they are, only how they move.
