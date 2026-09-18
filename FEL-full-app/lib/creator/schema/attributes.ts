// THE ATTRIBUTE TABLE (2026-09-14). Spec §2, six tabs, 0–99 integers.
//
// This is DATA. The editor screen renders whatever is in this array; adding an attribute is a new row and
// nothing else. That is the spec's own acceptance test for the layer.
//
// THE PRQ COLUMN IS THE LOAD-BEARING PART. Owner decision: **PRQ sets the ceiling and the editor spends
// underneath it.** Every row names the measured axis that caps it, or `null` when nothing measured should.
//
// The split is principled, not convenient: PRQ measures a BODY. It caps what a body can do — speed,
// strength, vertical, stamina, agility — and it has no business capping a jump shot, a post hook or court
// vision. Those are skill: learned, not measured, and free. A creator that let a body scan raise your
// three-point rating would be claiming something about you that it cannot know.
//
// DURABILITY IS PERFORMANCE LANGUAGE, ALWAYS (owner decision, same day). Every glossary line below is
// about how the body PERFORMS under repetition — "tires faster on repeated landings" — and never about its
// condition, never a risk, never a diagnosis. A per-limb number that drives a fatigue model must not read
// as a medical opinion about a real person, and the wording is the guard.

import type { RatedRow, SectionTable } from './types';

const r = (
  id: string, label: string, tab: string, prqAxis: RatedRow['prqAxis'], glossary: string,
): RatedRow => ({ kind: 'rated', id, label, section: 'attributes', tab, min: 0, max: 99, prqAxis, glossary });

export const ATTRIBUTES: SectionTable<RatedRow> = {
  section: 'attributes',
  title: 'Attributes',
  rows: [
    // ── Misc ────────────────────────────────────────────────────────────────────────────────────────
    r('intangibles', 'Intangibles', 'Misc', 'mental', 'Composure on the big possession — holds quality when the moment is loud.'),
    r('ceiling', 'Ceiling', 'Misc', 'mental', 'How much room is left to grow. Raises the cap future training can unlock.'),

    // ── Offense (skill: no PRQ cap) ──────────────────────────────────────────────────────────────────
    r('drivingLayup', 'Driving Layup', 'Offense', null, 'Finishing on the move at the rim.'),
    r('postFade', 'Post Fade', 'Offense', null, 'Turnaround fadeaway out of the post.'),
    r('postHook', 'Post Hook', 'Offense', null, 'Hook shot over either shoulder.'),
    r('postControl', 'Post Control', 'Offense', null, 'Holding and moving a defender with your back to the rim.'),
    r('contactDraw', 'Contact Draw', 'Offense', null, 'Finding contact and finishing through it.'),
    r('closeShot', 'Close Shot', 'Offense', null, 'Shots inside the paint that are not layups.'),
    r('midRange', 'Mid-Range Shot', 'Offense', null, 'Two-point jump shots outside the paint.'),
    r('threePoint', 'Three-Point Shot', 'Offense', null, 'Shots from beyond the arc.'),
    r('freeThrow', 'Free Throw', 'Offense', null, 'Unguarded shooting from the stripe.'),
    r('ballHandle', 'Ball Handle', 'Offense', null, 'Control of the ball on the move. Gates the handle move library.'),
    r('passIq', 'Pass IQ', 'Offense', null, 'Choosing the right pass.'),
    r('passAccuracy', 'Pass Accuracy', 'Offense', null, 'Putting the pass where the catcher wants it.'),
    r('offRebound', 'Offensive Rebound', 'Offense', null, 'Pursuing your own team’s misses.'),
    r('standingDunk', 'Standing Dunk', 'Offense', 'power', 'Dunking from a standstill under the rim.'),
    r('drivingDunk', 'Driving Dunk', 'Offense', 'power', 'Dunking off a run-up, in traffic or in space.'),
    r('shotIq', 'Shot IQ', 'Offense', null, 'Shot selection — taking the shot the defence gave you.'),
    r('courtVision', 'Court Vision', 'Offense', null, 'Seeing the floor and the man two passes away.'),
    r('hands', 'Hands', 'Offense', null, 'Catching a hard pass and holding a contested ball.'),

    // ── Defense ─────────────────────────────────────────────────────────────────────────────────────
    r('defRebound', 'Defensive Rebound', 'Defense', null, 'Securing the ball off an opponent’s miss.'),
    r('interiorD', 'Interior Defense', 'Defense', 'strength', 'Defending inside the paint against a body.'),
    r('perimeterD', 'Perimeter Defense', 'Defense', 'agility', 'Staying in front on the ball outside the arc.'),
    r('block', 'Block', 'Defense', 'power', 'Meeting a shot at its apex.'),
    r('steal', 'Steal', 'Defense', 'agility', 'Taking the ball off a handler or a passing lane.'),

    // ── Athleticism (the body: every row PRQ-capped) ─────────────────────────────────────────────────
    r('speed', 'Speed', 'Athleticism', 'speed', 'Top-end movement without the ball.'),
    r('speedWithBall', 'Speed With Ball', 'Athleticism', 'speed', 'Top-end movement while dribbling.'),
    r('vertical', 'Vertical', 'Athleticism', 'power', 'How high the body leaves the floor.'),
    r('strength', 'Strength', 'Athleticism', 'strength', 'Holding position and absorbing contact.'),
    r('stamina', 'Stamina', 'Athleticism', 'endurance', 'How long the output holds up across a run.'),
    r('motor', 'Motor', 'Athleticism', 'endurance', 'Willingness to keep repeating hard efforts.'),
    r('agility', 'Agility', 'Athleticism', 'agility', 'Changing direction without losing speed.'),

    // ── Durability (per-limb, bilateral). PERFORMANCE LANGUAGE ONLY — see the header. ────────────────
    r('durHead', 'Head', 'Durability', 'recovery', 'How well the body keeps its bearings through jostling and contact.'),
    r('durNeck', 'Neck', 'Durability', 'recovery', 'Holding a stable head position through contact.'),
    r('durBack', 'Back', 'Durability', 'flexibility', 'Repeated bending and rotation before the movement loses quality.'),
    r('durShoulderL', 'Left Shoulder', 'Durability', 'recovery', 'Repeated overhead effort on the left before output drops.'),
    r('durShoulderR', 'Right Shoulder', 'Durability', 'recovery', 'Repeated overhead effort on the right before output drops.'),
    r('durElbowL', 'Left Elbow', 'Durability', 'recovery', 'Repeated extension under load on the left.'),
    r('durElbowR', 'Right Elbow', 'Durability', 'recovery', 'Repeated extension under load on the right.'),
    r('durHipL', 'Left Hip', 'Durability', 'flexibility', 'Range and drive from the left hip across a long run.'),
    r('durHipR', 'Right Hip', 'Durability', 'flexibility', 'Range and drive from the right hip across a long run.'),
    r('durKneeL', 'Left Knee', 'Durability', 'recovery', 'Repeated landings and cuts on the left before the legs go.'),
    r('durKneeR', 'Right Knee', 'Durability', 'recovery', 'Repeated landings and cuts on the right before the legs go.'),
    r('durAnkleL', 'Left Ankle', 'Durability', 'recovery', 'Repeated push-off and landing on the left.'),
    r('durAnkleR', 'Right Ankle', 'Durability', 'recovery', 'Repeated push-off and landing on the right.'),
    r('durFootL', 'Left Foot', 'Durability', 'recovery', 'Ground contact on the left across a long session.'),
    r('durFootR', 'Right Foot', 'Durability', 'recovery', 'Ground contact on the right across a long session.'),

    // ── Mental ──────────────────────────────────────────────────────────────────────────────────────
    r('passPerception', 'Pass Perception', 'Mental', 'mental', 'Reading a pass before it is thrown.'),
    r('defConsistency', 'Defensive Consistency', 'Mental', 'mental', 'How reliably the defensive effort repeats.'),
    r('helpIq', 'Help Defense IQ', 'Mental', 'mental', 'Knowing when to leave your man and when not to.'),
    r('offConsistency', 'Offensive Consistency', 'Mental', 'mental', 'How reliably the offensive output repeats.'),
  ],
};

/** The spec's §2 "[MISSING TOP ROW]" in Durability was the HIP pair — the only major bilateral joint the
 *  list skipped between the elbow and the knee. Recorded here rather than left as a gap in the data. */
export const DURABILITY_RESOLVED_GAP = 'hips';
