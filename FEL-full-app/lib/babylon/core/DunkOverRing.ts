// DunkOverRing — the finish that carries the ball OVER the ring (dunk-flagship P11, 2026-11-10; owner call 1 of 2026-11-10,
// docs/OWNER-DECISIONS.md: "the over-the-ring contact as its own off-by-default knob, so the owner can feel it before any
// default moves"). The pure side: the mode writes these onto the reach, the jam and the contact; nothing here touches Babylon.
//
// THE SHIPPED FINISH (knob 0, the default, unchanged): the hand brings the ball to the FRONT of the rim at the ring's height; the
// ball meets the iron from outside the ring (its horizontal distance from the ring centre at contact, the `[HANDS] iron contact`
// line's `flat`, measured 0.15–0.34 m against a 0.225 m ring) and the flush (RimFlush.startFlush) lifts it over the lip and in.
//
// OVER THE RING (knob 1), from the slam (the jam) to the contact; nothing before the slam changes. The hand path has three legs,
// each a point the reach is sent to —
//   lift   a ball under the clearance goes UP in front of the rim until it would clear the iron;
//   in     …then in over the ring, still at that height;
//   down   …and once its centre is inside the ring's radius, down through the middle.
// …and the body holds its height until the `down` leg (overRingHoldsBody). A contact is then met from above with the ball over
// the hole: `flat` ≤ the ring's radius. A ball the hand could not carry over in time is let go where the shipped finish lets it
// go (a make, never a new miss): the knob changes the path, never the verdict.
//
// OFF BY DEFAULT: `dunk.finishOverRing` (lib/feel-panel/knobs.ts). Like every knob it never applies in ranked, staked or paid
// play (lib/feel-panel's session gate).
export type V3 = { x: number; y: number; z: number };

/** The knob's default: ON (1) since the owner's call of 2026-11-10 ("turn all 4 on"); 0 = the finish shipped until then, bit for
 *  bit. A staked, ranked or challenge run reads 0 whatever the default (DunkMode). */
export const FINISH_OVER_RING = 1;

/** NEW numbers (no tuned value changed; every one is read only with the knob on). Metres and seconds. */
export const OVER_RING = {
  /** A jam starts on the lift only when the ball is under the top of the contact's height band (0.6 of a ball over the
   *  ring's plane) plus this, outside the ring. */
  liftBelowM: 0.01,
  /** lift → in: the ball's centre is this far over the ring's plane BEYOND its own radius (its underside clears the iron's top). */
  clearM: 0.0,
  /** The height the lift and the way in aim the ball's centre at, over the ring's plane beyond its radius: above `clearM`, so a
   *  hand that lags its target still holds the ball over the lip. */
  aimUpM: 0.10,
  /** in → down: the ball's centre is at least this far inside the ring's radius. */
  insideM: 0.05,
  /** The push down through the ring aims this far under its plane (the shipped flush's own aim). */
  downM: 0.06,
  /** The lift holds the ball no nearer the ring's axis than the front lip plus a ball plus this (it rises in FRONT of the iron). */
  frontGapM: 0.02,
  /** This long into the jam the path ends: a ball inside the ring's radius goes down wherever it is, one still outside comes
   *  down onto the front of the rim and is let go there, as the shipped finish lets it go. */
  giveUpSec: 0.4,
  /** …at this height over the ring's plane (inside the contact's own height band). */
  bailUpM: 0.02,
  /** …and this far inside a ball's touch on the iron's outside (so it is within the contact's reach of the ring). */
  bailInM: 0.02,
  /** Over the ring the jam's follow-through stops this far short of the shipped one (0 = the shipped carry-in, extra included:
   *  0.05 left the ball 0.22–0.27 m in front of the ring, out of the arm's reach — rig, 2 of 5 plain slams). */
  followBackM: 0,
  /** The most the body slides sideways, from where the jam found it, to put the ball over the centre. */
  sideMaxM: 0.25,
  /** DUNK SWITCH-ON (owner 2026-11-10 approved changing the jump at the slam): on the way in, the body carries on toward the ring
   *  past the shipped follow-through by the ball's remaining offset in front of the ring, at most this much (m). Measured before
   *  it: the ball sat 0.22–0.30 m in front of the ring with the body stopped at the follow-through, out of the arm's reach. */
  deepMaxM: 0.3,
  /** On the push down the body comes down with the ball, but never faster than this (m/s): at 2.4 m/s (0.04 m a frame) the ball is
   *  in the contact's 0.10 m height band for at least two frames. Measured both ways (rig): held at the top, the arm could not push
   *  the ball down and the jam ran 530–550 ms; dropping at the jam's own pace (~0.09 m a frame), the windmill's ball skipped the
   *  band between two frames — no contact, a miss. */
  downDropMps: 2.4,
};

/** Is the knob on? (The mode passes `feel('dunk.finishOverRing', FINISH_OVER_RING)`.) */
export const overRingOn = (knob: number): boolean => knob >= 0.5;

export type OverRingLeg = 'lift' | 'in' | 'down' | 'bail';

/** The ball's horizontal distance from the ring's axis. */
export const flatOf = (p: V3, rim: V3): number => Math.hypot(p.x - rim.x, p.z - rim.z);

/**
 * The next leg of the path, from the last one (`prev`, null on the jam's first frame) and where the ball is. The legs only go
 * FORWARD (lift → in → down): the first cut read them off the ball's position alone, and a ball jittering across a threshold
 * flipped between pushing down and holding up every frame (rig: the hand hovered for 0.4 s). `jamSec` = seconds into the jam;
 * NEGATIVE while the push is not allowed yet (the REVERSE still turning its back to the iron): the ball is then held over the
 * ring, never pushed down. Past `giveUpSec` the path ends one way or the other: a ball inside the ring's radius goes down
 * wherever it is; one still outside comes down onto the front of the rim (`bail`), where the shipped finish meets it.
 *   lift  only a ball that starts in or under the contact's height band outside the ring (it would meet the front iron): up first;
 *   in    over the ring's centre, high;
 *   down  through the middle.
 */
export function overRingLeg(prev: OverRingLeg | null, ball: V3, rim: V3, ringR: number, ballR: number, jamSec: number): OverRingLeg {
  if (prev === 'down' || prev === 'bail') return prev;
  const r = flatOf(ball, rim), dy = ball.y - rim.y;
  if (jamSec >= OVER_RING.giveUpSec) return r <= ringR ? 'down' : 'bail';
  if (r <= ringR - OVER_RING.insideM) return jamSec >= 0 ? 'down' : 'in';
  if (prev === 'in') return 'in';
  if (prev === 'lift') return dy >= ballR + OVER_RING.clearM ? 'in' : 'lift';
  return dy < ballR * 0.6 + OVER_RING.liftBelowM ? 'lift' : 'in';
}

/**
 * THE BODY WAITS FOR THE BALL. Measured on the shipped finish (rig, 2026-11-10): the slam finds the body at the top of its
 * arc with the ball already 0.16–0.25 m over the ring's plane and 0.26–0.56 m out in front, and the jam then drops the body
 * onto the iron (0.10 m in its first frame) while it carries in — a race the ball loses whenever it was the further out (it
 * sinks into the contact's height band before it has crossed the lip, and meets the front of the rim from outside). Over the
 * ring, the body holds its height through the jam — the hand takes the ball over and down through the ring — and comes down
 * after the contact as the shipped finish's does, or at the give-up
 * (`bail`): it then comes straight down until the ball is in the contact's height band at the front of the rim (the carry-in
 * stays off, overRingFollows). Measured: with the
 * body held on `bail`, the double clutch — the highest flight, the ball 0.27 m over the ring and 0.25 m out where no arm could
 * bring it in — never came down to the iron and missed (SHORT OF THE IRON); the shipped finish makes it.
 */
export function overRingHoldsBody(leg: OverRingLeg | null, ballOverRingM: number, ballR: number): boolean {
  // on the push down too: the hand alone takes the ball down through the ring. Measured (the windmill, knob on): with the body
  // dropping ~0.09 m a frame on the push as well, the ball went from over the ring to under its plane between two frames
  // without ever being seen in the contact's height band — no contact, SHORT OF THE IRON on a ball that went through the hole
  if (leg === 'down') return false;   // …it comes down, at most OVER_RING.downDropMps (DunkMode caps the drop on this leg)
  // at the give-up: down while the ball is still over the contact's height band, held once it is in it (lower would take it under the iron)
  if (leg === 'bail') return ballOverRingM <= ballR * 0.6;
  return true;
}

/** Where the reach sends the BALL this frame on `leg` (into `out`). */
export function overRingAim(leg: OverRingLeg, ball: V3, rim: V3, ringR: number, ballR: number, out: V3): V3 {
  if (leg === 'down') { out.x = rim.x; out.y = rim.y - OVER_RING.downM; out.z = rim.z; return out; }
  const dx = ball.x - rim.x, dz = ball.z - rim.z, r = Math.hypot(dx, dz);
  const ux = r > 1e-3 ? dx / r : 0, uz = r > 1e-3 ? dz / r : 1;   // dead on the axis: the court side (+z), as RimFlush
  if (leg === 'bail') {   // down onto the front of the rim from where it is (no further out than a ball's touch on the iron)
    const at = Math.min(r, ringR + ballR - OVER_RING.bailInM);
    out.x = rim.x + ux * at; out.y = rim.y + OVER_RING.bailUpM; out.z = rim.z + uz * at; return out;
  }
  out.y = rim.y + ballR + OVER_RING.aimUpM;
  if (leg === 'in') { out.x = rim.x; out.z = rim.z; return out; }
  // lift: straight up where the ball is; a ball UNDER the ring's plane comes out from under the front lip first
  const keep = ball.y < rim.y ? Math.max(r, ringR + ballR + OVER_RING.frontGapM) : r;
  out.x = rim.x + ux * keep; out.z = rim.z + uz * keep;
  return out;
}

/**
 * The contact, deferred: with the knob on, a ball that is at the iron but still OUTSIDE the ring's radius is not let go yet —
 * the hand is carrying it over. After `giveUpSec` of jam it is let go there, exactly as the shipped finish would (so the knob
 * never turns a make into SHORT OF THE IRON).
 */
export function overRingDefers(ball: V3, rim: V3, ringR: number, ballR: number, jamSec: number): boolean {
  // only a ball still on the OUTSIDE half of the iron is held (it can still be lifted over): one already half across the lip is
  // let go where it is, as shipped — held, it would be carried through the metal (the model in DunkOverRing.test found it)
  return jamSec < OVER_RING.giveUpSec && flatOf(ball, rim) > ringR + ballR * 0.5;
}

/** THE BODY SLIDES UNDER THE BALL, sideways. Measured (rig, the over-the-ring cut of 2026-11-10): a slam carried in the off
 *  hand rides 0.26 m to the side of the ring's centre, and an arm reaching across the body cannot bring it over the middle —
 *  the jam timed out with the ball 0.30 m out to the side. Through the way in and the push, the body moves sideways by the
 *  ball's sideways offset from the ring (eased, at most `sideMaxM` from where the jam started), so the ball comes over the
 *  centre. Returns the root's x step for this frame. */
export function overRingSideStep(leg: OverRingLeg | null, ballX: number, rimX: number, rootX: number, rootX0: number, dt: number, tau: number): number {
  if (!overRingFollows(leg)) return 0;
  // the root eases toward where it puts the ball over the centre, never more than sideMaxM from where the jam found it (rig: an
  // unbounded slide ran the root 0.6 m sideways while the arm, reaching for the centre, kept the ball where it was)
  const goal = Math.max(rootX0 - OVER_RING.sideMaxM, Math.min(rootX0 + OVER_RING.sideMaxM, rootX + (rimX - ballX)));
  return (goal - rootX) * Math.min(1, tau > 0 ? dt / tau : 1);
}

/** The jam's follow-through carries the body in only once the ball is over the ring or going down through it: while the hand
 *  is still lifting it in front of the rim (or lowering it onto the front of the rim at the give-up), the body would carry it
 *  INTO the iron from the side. */
/** The deep carry, this frame's root z step (see OVER_RING.deepMaxM): on the way in only, toward putting the ball over the ring's
 *  centre in z, never more than deepMaxM past `followZ` (the shipped follow-through's own target). */
export function overRingDeepStep(leg: OverRingLeg | null, ballZ: number, rimZ: number, rootZ: number, followZ: number, dt: number, tau: number): number {
  if (leg !== 'in') return 0;
  const goal = Math.max(followZ - OVER_RING.deepMaxM, Math.min(followZ + OVER_RING.deepMaxM, rootZ + (rimZ - ballZ)));
  return (goal - rootZ) * Math.min(1, tau > 0 ? dt / tau : 1);
}

export function overRingFollows(leg: OverRingLeg | null): boolean {
  return leg === 'in' || leg === 'down';
}
