// quizPacks — question content for both quiz modes.
//
// ALL CONTENT IS ORIGINAL AND SELF-REFERENTIAL, on purpose.
//
// "Who Scene It" is a scene-recall game, and the obvious version of that —
// stills from films, posters, actors — is not something this project can ship:
// it would need licences it does not have, and likeness rights it cannot get.
// So the scenes it asks you to recall are FEL'S OWN VENUES, rendered live by
// the M73 venue system. That is a better game anyway (it rewards playing the
// product) and it carries zero IP risk: every asset is procedurally generated
// by this codebase.
//
// Brain Brawl draws on movement and training knowledge — the same domain the
// Cell coach and the biomechanics audit already work in — plus the game's own
// rules. Nothing here references a real brand, person, or franchise.

import type { QuizPack } from '../core/QuizCore';

/** Who Scene It — identify the venue from the rendered scene.
 *  `sceneVenueId` keys into VENUE_SPECS; the mode builds it behind the UI. */
export const WHO_SCENE_IT_PACK: QuizPack = {
  id: 'venues_v1',
  title: 'Know the Venue',
  questions: [
    { id: 'ws1', difficulty: 1, sceneVenueId: 'basketball_h2h', prompt: 'Where are you standing?',
      answer: 'venice', explain: 'Venice Beach Court — ocean-blue deck, palms on the baseline.',
      options: [{ id: 'venice', label: 'Venice Beach Court' }, { id: 'street', label: 'Streetball Arena' },
                { id: 'carn', label: 'Carnival Court' }, { id: 'yours', label: 'Your Court' }] },
    { id: 'ws2', difficulty: 2, sceneVenueId: 'basketball_3v3', prompt: 'Which court is this?',
      answer: 'street', explain: 'Streetball Arena — purple deck, crowd tiers at both baselines.',
      options: [{ id: 'street', label: 'Streetball Arena' }, { id: 'venice', label: 'Venice Beach Court' },
                { id: 'yours', label: 'Your Court' }, { id: 'carn', label: 'Carnival Court' }] },
    { id: 'ws3', difficulty: 1, sceneVenueId: 'karate_h2h', prompt: 'Name this room.',
      answer: 'dojo', explain: 'Sovereign Dojo — deep maroon mat, lanterns at the back wall.',
      options: [{ id: 'dojo', label: 'Sovereign Dojo' }, { id: 'gauntlet', label: 'Shadow Gauntlet' },
                { id: 'gym', label: 'Evolution Gym' }, { id: 'neuro', label: 'Neuro Arena' }] },
    { id: 'ws4', difficulty: 2, sceneVenueId: 'karate_endless', prompt: 'Where does the endless run happen?',
      answer: 'gauntlet', explain: 'Shadow Gauntlet — violet key light, waves arriving from the dark.',
      options: [{ id: 'gauntlet', label: 'Shadow Gauntlet' }, { id: 'dojo', label: 'Sovereign Dojo' },
                { id: 'cypher', label: 'The Cypher' }, { id: 'neuro', label: 'Neuro Arena' }] },
    { id: 'ws5', difficulty: 1, sceneVenueId: 'surfing', prompt: 'Which break is this?',
      answer: 'pipeline', explain: 'Pipeline Peak — open water, heavy haze, palms far inshore.',
      options: [{ id: 'pipeline', label: 'Pipeline Peak' }, { id: 'beach', label: 'Beach Pro' },
                { id: 'alpine', label: 'Alpine Pro' }, { id: 'links', label: 'Sovereign Links' }] },
    { id: 'ws6', difficulty: 2, sceneVenueId: 'snowboarding', prompt: 'Name the mountain.',
      answer: 'alpine', explain: 'Alpine Pro — the only white-out venue in the game.',
      options: [{ id: 'alpine', label: 'Alpine Pro' }, { id: 'pipeline', label: 'Pipeline Peak' },
                { id: 'skate', label: 'Sovereign Skatepark' }, { id: 'links', label: 'Sovereign Links' }] },
    { id: 'ws7', difficulty: 3, sceneVenueId: 'gymnastics', prompt: 'Which floor is this?',
      answer: 'gym', explain: 'Evolution Gym — violet mat, beam upstage, twin podiums.',
      options: [{ id: 'gym', label: 'Evolution Gym' }, { id: 'cypher', label: 'The Cypher' },
                { id: 'neuro', label: 'Neuro Arena' }, { id: 'vault', label: 'Scene Vault' }] },
    { id: 'ws8', difficulty: 2, sceneVenueId: 'dance', prompt: 'Where do you battle?',
      answer: 'cypher', explain: 'The Cypher — lit deck, four coloured lamps, crowd at your back.',
      options: [{ id: 'cypher', label: 'The Cypher' }, { id: 'gym', label: 'Evolution Gym' },
                { id: 'neuro', label: 'Neuro Arena' }, { id: 'vault', label: 'Scene Vault' }] },
    { id: 'ws9', difficulty: 3, sceneVenueId: 'brain_brawl', prompt: 'Which stage is this?',
      answer: 'neuro', explain: 'Neuro Arena — indigo stage, two podiums, electric hum.',
      options: [{ id: 'neuro', label: 'Neuro Arena' }, { id: 'vault', label: 'Scene Vault' },
                { id: 'cypher', label: 'The Cypher' }, { id: 'market', label: 'Market Hall' }] },
    { id: 'ws10', difficulty: 2, sceneVenueId: 'soccer', prompt: 'Name the pitch.',
      answer: 'global', explain: 'Global Pitch — full-size, stands behind both goals.',
      options: [{ id: 'global', label: 'Global Pitch' }, { id: 'grid', label: 'Gridiron Sovereign' },
                { id: 'diamond', label: 'Pro Diamond' }, { id: 'center', label: 'Center Court' }] },
    { id: 'ws11', difficulty: 3, sceneVenueId: 'volleyball', prompt: 'Which sand court?',
      answer: 'beach', explain: 'Beach Pro — painted swell in the sand, palms at the corners.',
      options: [{ id: 'beach', label: 'Beach Pro' }, { id: 'center', label: 'Center Court' },
                { id: 'pipeline', label: 'Pipeline Peak' }, { id: 'venice', label: 'Venice Beach Court' }] },
    { id: 'ws12', difficulty: 1, sceneVenueId: 'skateboarding', prompt: 'Where is this?',
      answer: 'skate', explain: 'Sovereign Skatepark — grey concrete, two ramps, amber banner.',
      options: [{ id: 'skate', label: 'Sovereign Skatepark' }, { id: 'alpine', label: 'Alpine Pro' },
                { id: 'street', label: 'Streetball Arena' }, { id: 'market', label: 'Market Hall' }] },
  ],
};

/** Brain Brawl — movement, training and the game's own rules. */
export const BRAIN_BRAWL_PACK: QuizPack = {
  id: 'movement_v1',
  title: 'Movement IQ',
  questions: [
    { id: 'bb1', difficulty: 1, prompt: 'Which quality does plyometric training most directly build?',
      answer: 'power', explain: 'Plyometrics train rate of force development — power, not endurance.',
      options: [{ id: 'power', label: 'Explosive power' }, { id: 'endur', label: 'Aerobic endurance' },
                { id: 'flex', label: 'Passive flexibility' }, { id: 'grip', label: 'Grip strength' }] },
    { id: 'bb2', difficulty: 1, prompt: 'A deeper counter-movement before a jump mainly increases…',
      answer: 'stretch', explain: 'It loads the stretch-shortening cycle, storing elastic energy.',
      options: [{ id: 'stretch', label: 'Elastic energy stored' }, { id: 'hr', label: 'Heart rate' },
                { id: 'react', label: 'Reaction time' }, { id: 'balance', label: 'Static balance' }] },
    { id: 'bb3', difficulty: 2, prompt: 'Landing softly from a jump mostly reduces…',
      answer: 'peak', explain: 'Bending at ankle, knee and hip spreads the impulse, lowering peak force.',
      options: [{ id: 'peak', label: 'Peak impact force' }, { id: 'height', label: 'Jump height' },
                { id: 'hrv', label: 'HRV' }, { id: 'cadence', label: 'Cadence' }] },
    { id: 'bb4', difficulty: 2, prompt: 'Which is a MOBILITY quality rather than a strength one?',
      answer: 'rom', explain: 'Mobility is usable range of motion under control.',
      options: [{ id: 'rom', label: 'Controlled range of motion' }, { id: '1rm', label: 'One-rep max' },
                { id: 'iso', label: 'Isometric hold force' }, { id: 'rfd', label: 'Rate of force development' }] },
    { id: 'bb5', difficulty: 3, prompt: 'Higher heart-rate variability at rest usually suggests…',
      answer: 'recovered', explain: 'Higher resting HRV generally indicates better recovery readiness.',
      options: [{ id: 'recovered', label: 'Better recovery state' }, { id: 'fatigue', label: 'Deep fatigue' },
                { id: 'dehydr', label: 'Dehydration' }, { id: 'nothing', label: 'Nothing measurable' }] },
    { id: 'bb6', difficulty: 1, prompt: 'In FEL, which currency is EARNED ONLY and never purchased?',
      answer: 'lc', explain: 'Lab Credits are earned-only by design. Shards are the purchasable currency.',
      options: [{ id: 'lc', label: 'Lab Credits' }, { id: 'shards', label: 'Shards' },
                { id: 'coins', label: 'Coins' }, { id: 'both', label: 'Both' }] },
    { id: 'bb7', difficulty: 2, prompt: 'How many touches per side does volleyball allow before it must cross?',
      answer: '3', explain: 'Three. Tennis allows one.',
      options: [{ id: '3', label: 'Three' }, { id: '1', label: 'One' },
                { id: '2', label: 'Two' }, { id: '4', label: 'Four' }] },
    { id: 'bb8', difficulty: 2, prompt: 'A Creator Card may carry at most how many SECONDARY disciplines?',
      answer: '2', explain: 'Two, on top of one primary.',
      options: [{ id: '2', label: 'Two' }, { id: '1', label: 'One' },
                { id: '4', label: 'Four' }, { id: 'unl', label: 'Unlimited' }] },
    { id: 'bb9', difficulty: 3, prompt: 'Why is a warm-up done BEFORE mobility work in most sessions?',
      answer: 'temp', explain: 'Raising tissue temperature first makes range work safer and more effective.',
      options: [{ id: 'temp', label: 'Warmer tissue tolerates range better' },
                { id: 'burn', label: 'It burns more calories' },
                { id: 'rules', label: 'It is a competition rule' },
                { id: 'none', label: 'Order does not matter' }] },
    { id: 'bb10', difficulty: 1, prompt: 'Which of these is an AGILITY demand rather than pure speed?',
      answer: 'cod', explain: 'Agility is change of direction under decision pressure.',
      options: [{ id: 'cod', label: 'Reactive change of direction' }, { id: 'sprint', label: 'A 100m sprint' },
                { id: 'hold', label: 'A plank hold' }, { id: 'stretch2', label: 'A seated stretch' }] },
    { id: 'bb11', difficulty: 3, prompt: 'Progressive overload means…',
      answer: 'grad', explain: 'Demand increases gradually so adaptation can keep up.',
      options: [{ id: 'grad', label: 'Gradually increasing demand over time' },
                { id: 'max', label: 'Training to failure every session' },
                { id: 'same', label: 'Repeating the same session forever' },
                { id: 'rand', label: 'Randomising every workout' }] },
    { id: 'bb12', difficulty: 2, prompt: 'Sleep most directly supports which training outcome?',
      answer: 'adapt', explain: 'Adaptation and repair happen largely during sleep.',
      options: [{ id: 'adapt', label: 'Recovery and adaptation' }, { id: 'rom2', label: 'Instant flexibility' },
                { id: 'skill', label: 'Skill you never practised' }, { id: 'none2', label: 'Nothing' }] },
  ],
};
