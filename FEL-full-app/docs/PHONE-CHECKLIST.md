# Real-phone checklist — ten minutes, one phone, one owner (ship pass 5, phase 9)

Every measurement so far is desktop Chromium or an emulated phone (Pixel 8 profile, four-times CPU throttle). This is the
list to run on real hardware. Write what you see next to each line; "felt fine" is a result, so is a number from the HUD.

**Before**: the build the Assistant Manager deployed (or `npm run dev` on the Mac and the phone on the same Wi-Fi at the Mac's
LAN address, port 3000). Log in as yourself. Rotate to landscape for play routes.

| # | Do this | Expect | Write down |
|---|---|---|---|
| 1 | Open `/modes` | The header chip shows coins · shards · credits; the list has every mode with its venue | chip numbers, load time |
| 2 | Open `/play/dunk` | Loads under 3 s on Wi-Fi; READY gate; no white screen | seconds to READY |
| 3 | Play one dunk with the touch deck (RUN hold (the hold-to-run verb; it was CHARGE before 2026-09-05), SLAM) | The jump reads the hold; the slam lands or misses with the judges' reveal | did the hold register |
| 4 | Finish the contest | Results card with XP / shards / credits and **SHARE PROOF**; the toast "+N coins" if first session today | the proof line text |
| 5 | Tap SHARE PROOF, open the link in the phone's browser | The card page renders the proof line | yes / no |
| 6 | `/play/karate-vs`, one round | Buttons respond within a beat; the camera keeps both fighters in frame | frame hits felt |
| 7 | `/play/skateboard`, one run | PUMP/POP feel; no hitching on the bowl | fps from the dev HUD if visible, else "smooth / choppy" |
| 8 | `/play/tennis`, one rally | The hero is framed from behind, the net and rival visible | yes / no |
| 9 | `/closet` | Skin, hair and garments change on the preview; save; back to `/play/dunk` | do the choices show on court |
| 10 | Lock the phone mid-run, unlock | The game resumes or shows a clear message with Retry | which |
| 11 | Turn Wi-Fi off mid-run | "unreachable" message with Retry; nothing frozen | which |
| 12 | Battery and heat after ten minutes | Warm is fine; hot is a finding | temperature by hand |

Send the twelve lines back as they are. Numbers become the phone row of `lib/babylon/config/textureBudget.json` and the
next pass's benchmark; a "no" on any row becomes a backlog item with your words attached.
