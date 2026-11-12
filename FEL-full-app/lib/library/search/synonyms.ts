// lib/library/search/synonyms.ts — EXERCISE-LIBRARY (2026-10-25): the words people search with → the library's words.
//
// Owner (2026-10-25): "Make sure people can search for what they need." Coaches type "RDL", "DB", "KB", "plyo";
// athletes type "hammy", "vert", "bodyweight", "abs". Abbreviations that are always the same thing are folded in
// search/text.ts TOKEN_CANON (both sides of the index). This file holds the looser equivalences: words that should find
// each other's entries, each with a weight under 1 so an exact word still ranks first.
//
// Each group is a set of phrases (folded, then stemmed by the engine); a query term in one phrase expands to the
// terms of every other phrase in its group. Pure data. Client-safe.

export interface SynonymGroup { phrases: readonly string[]; weight: number }

export const SYNONYM_GROUPS: readonly SynonymGroup[] = [
  // equipment
  { phrases: ['bodyweight', 'no equipment', 'none', 'body only', 'calisthenics', 'equipment free'], weight: 0.9 },
  { phrases: ['band', 'resistance band', 'loop band', 'tube'], weight: 0.9 },
  { phrases: ['mini band', 'hip band', 'booty band', 'glute band'], weight: 0.9 },
  { phrases: ['cable', 'pulley', 'cable machine'], weight: 0.9 },
  { phrases: ['trap bar', 'hex bar'], weight: 1 },
  { phrases: ['medicine ball', 'slam ball', 'wall ball'], weight: 0.8 },
  { phrases: ['stability ball', 'swiss ball', 'exercise ball', 'physio ball'], weight: 1 },
  { phrases: ['suspension', 'straps', 'rings'], weight: 0.7 },
  { phrases: ['box', 'plyo box', 'bench', 'step'], weight: 0.5 },
  // muscles and regions
  { phrases: ['hamstring', 'back of thigh', 'posterior chain'], weight: 0.9 },
  { phrases: ['quad', 'front of thigh', 'quadricep'], weight: 0.9 },
  { phrases: ['glute', 'hip', 'booty'], weight: 0.6 },
  { phrases: ['ab', 'trunk', 'abdominal', 'six pack', 'midsection'], weight: 0.9 },
  { phrases: ['oblique', 'side ab', 'love handle'], weight: 0.8 },
  { phrases: ['lat', 'back', 'upper back', 'mid back'], weight: 0.6 },
  { phrases: ['shoulder', 'delt', 'deltoid'], weight: 0.9 },
  { phrases: ['chest', 'pec', 'pectoral'], weight: 0.9 },
  { phrases: ['bicep', 'arm', 'tricep'], weight: 0.5 },
  { phrases: ['calf', 'soleus', 'achilles'], weight: 0.8 },
  { phrases: ['shin', 'tibialis', 'tib'], weight: 0.9 },
  { phrases: ['inner thigh', 'adductor', 'groin'], weight: 0.9 },
  { phrases: ['outer hip', 'abductor', 'glute med', 'side glute'], weight: 0.9 },
  { phrases: ['rotator cuff', 'cuff', 'external rotation'], weight: 0.8 },
  { phrases: ['grip', 'forearm', 'hand strength'], weight: 0.9 },
  { phrases: ['foot', 'arch', 'toe'], weight: 0.7 },
  // qualities and goals
  { phrases: ['vertical', 'vertical jump', 'jump higher', 'hops', 'bounce', 'dunk'], weight: 0.6 },
  { phrases: ['plyometric', 'jump', 'jumping', 'hop', 'bound', 'explosive'], weight: 0.7 },
  { phrases: ['speed', 'sprint', 'fast', 'quickness', 'acceleration'], weight: 0.8 },
  { phrases: ['agility', 'change of direction', 'cutting', 'cut', 'lateral quickness', 'footwork'], weight: 0.8 },
  { phrases: ['conditioning', 'cardio', 'endurance', 'stamina', 'gas', 'wind'], weight: 0.8 },
  { phrases: ['mobility', 'stretch', 'flexibility', 'range of motion', 'loosen'], weight: 0.8 },
  { phrases: ['warm up', 'activation', 'prep', 'pre game', 'dynamic'], weight: 0.8 },
  { phrases: ['cool down', 'recovery', 'reset', 'wind down', 'relax'], weight: 0.8 },
  { phrases: ['balance', 'stability', 'proprioception', 'single leg balance'], weight: 0.8 },
  { phrases: ['landing', 'land', 'stick', 'deceleration', 'decel', 'stopping'], weight: 0.8 },
  { phrases: ['strength', 'strong', 'power lifting'], weight: 0.6 },
  { phrases: ['power', 'explosive', 'throw', 'olympic'], weight: 0.6 },
  { phrases: ['prehab', 'injury prevention', 'durability', 'bulletproof', 'joint care'], weight: 0.8 },
  { phrases: ['posture', 'upright', 'stand tall'], weight: 0.7 },
  // movement names
  { phrases: ['lunge', 'split squat', 'step up'], weight: 0.6 },
  { phrases: ['hinge', 'deadlift', 'rdl', 'romanian deadlift', 'good morning'], weight: 0.7 },
  { phrases: ['glute bridge', 'hip thrust', 'bridge', 'hip raise'], weight: 0.8 },
  { phrases: ['push up', 'press up'], weight: 1 },
  { phrases: ['pull up', 'chin up', 'pull down', 'pulldown'], weight: 0.7 },
  { phrases: ['row', 'pull'], weight: 0.6 },
  { phrases: ['press', 'push', 'overhead'], weight: 0.4 },
  { phrases: ['plank', 'brace', 'hold'], weight: 0.6 },
  { phrases: ['carry', 'walk', 'farmer'], weight: 0.6 },
  { phrases: ['curl', 'bicep curl'], weight: 0.9 },
  { phrases: ['skull crusher', 'tricep extension', 'pushdown'], weight: 0.8 },
  { phrases: ['shuffle', 'slide', 'defensive slide', 'lateral'], weight: 0.7 },
  { phrases: ['skip', 'a skip', 'skipping'], weight: 0.9 },
  { phrases: ['pogo', 'ankle hop', 'ankle bounce'], weight: 0.9 },
  // basketball
  { phrases: ['handle', 'ball handling', 'dribble', 'dribbling', 'crossover'], weight: 0.8 },
  { phrases: ['finish', 'finishing', 'layup', 'lay up', 'floater', 'around the rim'], weight: 0.8 },
  { phrases: ['shoot', 'shooting', 'jumper', 'jump shot', 'form shooting', 'free throw'], weight: 0.8 },
  { phrases: ['defense', 'defensive', 'on ball', 'closeout'], weight: 0.7 },
  { phrases: ['pass', 'passing', 'outlet'], weight: 0.9 },
  { phrases: ['rebound', 'rebounding', 'box out'], weight: 0.9 },
  { phrases: ['basketball', 'hoops', 'court'], weight: 0.5 },
];
