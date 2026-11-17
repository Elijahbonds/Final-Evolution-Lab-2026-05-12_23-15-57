# Hoops foley set: credits and licences

Owner decision, 2026-11-12: the basketball sounds come from free **CC0** recordings. Every file in this folder is made from a
recording released under **CC0 1.0 (public domain)**. Nothing here needs attribution, but it is recorded so anyone can check it.

- Built by `scripts/audio/hoops-foley/build.mjs` (fetch, then build). It slices one hit, cuts the leading silence, fades, high-passes,
  normalises and encodes MP3 mono. Nothing else in the audio is changed.
- `sources.json` holds each source's URL and sha256 and each output's sha256, length and size.
- Total: 24 files, about 251 KB.

| Files | Sound | Source (title as published) | Author | Licence | Source page |
|---|---|---|---|---|---|
| `bounce_1`–`bounce_5` | the dribble: a ball hitting the floor | Ball Rebounds (s1045). The French original reads "Trois rebonds différents de ballon": three rebounds of a **ball**. The English page's "balloon" is a translation slip | Joseph Sardin (BigSoundBank) | CC0 1.0 | https://bigsoundbank.com/ball-rebounds-s1045.html |
| `bounce_6` | the dribble (a harder surface) | Ball against wall #1 (s1825): "Ball bouncing off a wall" | Joseph Sardin (BigSoundBank) | CC0 1.0 | https://bigsoundbank.com/balloon-against-wall-1-s1825.html |
| `squeak_1`–`squeak_5` | sneakers on the court | Gnashing basketball (s0938): "Squeaking shoes, as you hear during a basketball or handball tournament indoors" | Joseph Sardin (BigSoundBank) | CC0 1.0 | https://bigsoundbank.com/gnashing-basketball-s0938.html |
| `rim_1` | the iron: a clank | Falling sheet steel bar #1 (s1771) | Joseph Sardin (BigSoundBank) | CC0 1.0 | https://bigsoundbank.com/falling-sheet-steel-bar-1-s1771.html |
| `rim_3` | the iron: a rattle (three hits) | Falling sheet steel bar #2 (s1772) | Joseph Sardin (BigSoundBank) | CC0 1.0 | https://bigsoundbank.com/falling-sheet-steel-bar-2-s1772.html |
| `rim_2` | the iron: a clank | Falling sheet steel bar #3 (s1773) | Joseph Sardin (BigSoundBank) | CC0 1.0 | https://bigsoundbank.com/falling-sheet-steel-bar-3-s1773.html |
| `net_1`–`net_4` | the net (a **stand-in**: a short nylon rustle; no CC0 net recording was found) | Tent or curtain shower (s0399): "the friction of a shower curtain with your fingers" | Joseph Sardin (BigSoundBank) | CC0 1.0 | https://bigsoundbank.com/tent-or-curtain-shower-s0399.html |
| `catch_1`–`catch_3` | a pass caught (a flat hand on a skin, the drum's ring faded out) | Djembe: hand flat in the center (s0560) | Joseph Sardin (BigSoundBank) | CC0 1.0 | https://bigsoundbank.com/djembe-hand-flat-in-the-center-s0560.html |
| `cheer_1` | the crowd cheers | Shouts and applauses of teens #1 (s0236): "Teens who shout Yeah and applauding" | Joseph Sardin (BigSoundBank) | CC0 1.0 | https://bigsoundbank.com/shouts-and-applauses-of-teens-1-s0236.html |
| `cheer_2` | the crowd cheers | Shouts and applauses of teens #2 (s0237) | Joseph Sardin (BigSoundBank) | CC0 1.0 | https://bigsoundbank.com/shouts-and-applauses-of-teens-2-s0237.html |
| `crowd_bed` | the crowd's murmur, a 14 s seamless loop | Crowd of 50-60 people #1 (s3515): "Discussions among a small crowd of about 50 to 60 people" | Joseph Sardin (BigSoundBank) | CC0 1.0 | https://bigsoundbank.com/crowd-of-50-60-people-1-s3515.html |

Each page says "License: CC0 (public domain): Free and royalty-free", checked on 2026-11-12. The site's footer says "Free,
royalty-free sounds (CC0)". The source file is the page's own player file (`https://bigsoundbank.com/UPLOAD/mp3/<id>.mp3`, 320 kbps).

**Still synthesised** (no CC0 recording found or used): the crowd's groan, the backboard, the whistle, the score chime, the whoosh and
the impacts. The game falls back to its synthesiser for any sound here that has not loaded.
