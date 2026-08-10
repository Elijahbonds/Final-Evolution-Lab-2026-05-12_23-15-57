export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export const QUIZ_CATEGORIES = [
  { key: 'history', label: 'History', color: '#FFD700' },
  { key: 'science', label: 'Science', color: '#00E5FF' },
  { key: 'pop', label: 'Pop Culture', color: '#FF3366' },
  { key: 'sporthistory', label: 'Sport History', color: '#00FF9D' },
  { key: 'sportscience', label: 'Sport Science', color: '#A855F7' },
  { key: 'artlit', label: 'Art & Lit', color: '#FF8C00' },
  { key: 'vocab', label: 'Vocabulary', color: '#38BDF8' },
] as const;

export const QUIZ_BANK: Record<string, QuizQuestion[]> = {
  history: [
    { q: 'In which year did the Berlin Wall fall?', options: ['1985', '1989', '1991', '1993'], answer: 1, difficulty: 'easy' },
    { q: 'Who was the first President of the United States?', options: ['Jefferson', 'Adams', 'Washington', 'Lincoln'], answer: 2, difficulty: 'easy' },
    { q: 'The Great Wall of China was primarily built to defend against whom?', options: ['Mongols/Nomads', 'Japanese', 'Russians', 'Koreans'], answer: 0, difficulty: 'easy' },
    { q: 'Which empire was ruled by Emperor Justinian I?', options: ['Roman', 'Byzantine', 'Ottoman', 'Persian'], answer: 1, difficulty: 'medium' },
    { q: 'The Magna Carta was signed in which year?', options: ['1066', '1215', '1348', '1492'], answer: 1, difficulty: 'medium' },
    { q: 'Which civilization built Machu Picchu?', options: ['Aztec', 'Maya', 'Inca', 'Olmec'], answer: 2, difficulty: 'medium' },
    { q: 'The Treaty of Westphalia (1648) ended which conflict?', options: ['Hundred Years War', 'Thirty Years War', 'War of Roses', 'Seven Years War'], answer: 1, difficulty: 'hard' },
    { q: 'Who was the last pharaoh of ancient Egypt?', options: ['Nefertiti', 'Cleopatra VII', 'Hatshepsut', 'Ramses III'], answer: 1, difficulty: 'hard' },
    { q: 'The Meiji Restoration occurred in which country?', options: ['China', 'Korea', 'Japan', 'Thailand'], answer: 2, difficulty: 'hard' },
  ],
  science: [
    { q: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], answer: 2, difficulty: 'easy' },
    { q: 'How many planets are in our solar system?', options: ['7', '8', '9', '10'], answer: 1, difficulty: 'easy' },
    { q: 'What gas do plants absorb from the atmosphere?', options: ['Oxygen', 'Nitrogen', 'CO2', 'Hydrogen'], answer: 2, difficulty: 'easy' },
    { q: 'What particle carries a negative charge?', options: ['Proton', 'Neutron', 'Electron', 'Photon'], answer: 2, difficulty: 'medium' },
    { q: 'What is the powerhouse of the cell?', options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi body'], answer: 2, difficulty: 'medium' },
    { q: 'What is the speed of light (approx)?', options: ['300,000 km/s', '150,000 km/s', '1M km/s', '30,000 km/s'], answer: 0, difficulty: 'medium' },
    { q: 'Which quantum number describes electron spin?', options: ['n', 'l', 'mₗ', 'mₛ'], answer: 3, difficulty: 'hard' },
    { q: 'What is the half-life of Carbon-14 (years)?', options: ['~573', '~5,730', '~57,300', '~573,000'], answer: 1, difficulty: 'hard' },
    { q: 'Which enzyme unzips DNA during replication?', options: ['Ligase', 'Helicase', 'Polymerase', 'Primase'], answer: 1, difficulty: 'hard' },
  ],
  pop: [
    { q: 'Which streaming era phenomenon is a short vertical video?', options: ['Podcast', 'Reel', 'Blog', 'Wiki'], answer: 1, difficulty: 'easy' },
    { q: 'What color are Minions?', options: ['Blue', 'Green', 'Yellow', 'Red'], answer: 2, difficulty: 'easy' },
    { q: 'Which console brand makes the PlayStation?', options: ['Microsoft', 'Nintendo', 'Sony', 'Sega'], answer: 2, difficulty: 'easy' },
    { q: 'Which fictional metal is in Captain America\u2019s shield?', options: ['Adamantium', 'Vibranium', 'Mithril', 'Kryptonite'], answer: 1, difficulty: 'medium' },
    { q: 'In gaming, what does \u201cNPC\u201d stand for?', options: ['New Player Character', 'Non-Player Character', 'Net Play Code', 'Node Point Cache'], answer: 1, difficulty: 'medium' },
    { q: '\u201cBinge-watching\u201d became mainstream with which platform model?', options: ['Cable TV', 'Streaming', 'Cinema', 'Radio'], answer: 1, difficulty: 'medium' },
    { q: 'The \u201chero\u2019s journey\u201d story template was described by whom?', options: ['Tolkien', 'Campbell', 'Lucas', 'Jung'], answer: 1, difficulty: 'hard' },
    { q: 'Which decade birthed hip-hop culture in the Bronx?', options: ['1960s', '1970s', '1980s', '1990s'], answer: 1, difficulty: 'hard' },
    { q: 'What is the best-selling video game of all time?', options: ['Tetris', 'Minecraft', 'GTA V', 'Wii Sports'], answer: 1, difficulty: 'hard' },
  ],
  sporthistory: [
    { q: 'How often are the Summer Olympics held?', options: ['Every 2 years', 'Every 3 years', 'Every 4 years', 'Every 5 years'], answer: 2, difficulty: 'easy' },
    { q: 'In which sport is a \u201cslam dunk\u201d scored?', options: ['Tennis', 'Basketball', 'Volleyball', 'Soccer'], answer: 1, difficulty: 'easy' },
    { q: 'Which country hosts Wimbledon?', options: ['USA', 'France', 'England', 'Australia'], answer: 2, difficulty: 'easy' },
    { q: 'Who holds the record for most Olympic gold medals?', options: ['Usain Bolt', 'Michael Phelps', 'Carl Lewis', 'Mark Spitz'], answer: 1, difficulty: 'medium' },
    { q: 'The first modern Olympics (1896) were held where?', options: ['Rome', 'Paris', 'Athens', 'London'], answer: 2, difficulty: 'medium' },
    { q: 'Which boxer was known as \u201cThe Greatest\u201d?', options: ['Tyson', 'Ali', 'Foreman', 'Frazier'], answer: 1, difficulty: 'medium' },
    { q: 'Karate debuted as an Olympic sport in which Games?', options: ['Rio 2016', 'Tokyo 2020', 'London 2012', 'Beijing 2008'], answer: 1, difficulty: 'hard' },
    { q: 'Who scored the \u201cHand of God\u201d goal in 1986?', options: ['Pelé', 'Maradona', 'Zico', 'Platini'], answer: 1, difficulty: 'hard' },
    { q: 'The NBA three-point line was adopted in which season?', options: ['1969-70', '1979-80', '1985-86', '1990-91'], answer: 1, difficulty: 'hard' },
  ],
  sportscience: [
    { q: 'Which macronutrient is the primary fuel for sprinting?', options: ['Fat', 'Protein', 'Carbohydrate', 'Fiber'], answer: 2, difficulty: 'easy' },
    { q: 'What does \u201creps\u201d mean in training?', options: ['Repetitions', 'Recovery periods', 'Resistance points', 'Rest phases'], answer: 0, difficulty: 'easy' },
    { q: 'Stretching before sport primarily improves what?', options: ['Strength', 'Flexibility', 'Endurance', 'Power'], answer: 1, difficulty: 'easy' },
    { q: 'VO2 max measures what capacity?', options: ['Anaerobic', 'Aerobic', 'Flexibility', 'Strength'], answer: 1, difficulty: 'medium' },
    { q: 'Which energy system dominates a 5-second max sprint?', options: ['Aerobic', 'Glycolytic', 'ATP-PC', 'Lipolytic'], answer: 2, difficulty: 'medium' },
    { q: 'DOMS refers to what?', options: ['Delayed muscle soreness', 'Dynamic overload', 'Deep oxygen metabolism', 'Dual output metric'], answer: 0, difficulty: 'medium' },
    { q: 'Type IIx muscle fibers are best described as…', options: ['Slow oxidative', 'Fast fatigue-resistant', 'Fast glycolytic', 'Postural'], answer: 2, difficulty: 'hard' },
    { q: 'The stretch-shortening cycle powers which action?', options: ['Isometric hold', 'Plyometric jump', 'Static stretch', 'Steady jog'], answer: 1, difficulty: 'hard' },
    { q: 'EPOC after intense exercise refers to elevated…', options: ['Oxygen consumption', 'Protein synthesis only', 'Blood glucose', 'Lactate threshold'], answer: 0, difficulty: 'hard' },
  ],
  artlit: [
    { q: 'Who painted the Mona Lisa?', options: ['Michelangelo', 'Da Vinci', 'Raphael', 'Botticelli'], answer: 1, difficulty: 'easy' },
    { q: 'Who wrote \u201cRomeo and Juliet\u201d?', options: ['Dickens', 'Shakespeare', 'Austen', 'Chaucer'], answer: 1, difficulty: 'easy' },
    { q: 'What are the three primary colors?', options: ['Red/Green/Blue', 'Red/Yellow/Blue', 'Cyan/Magenta/Yellow', 'Red/Orange/Yellow'], answer: 1, difficulty: 'easy' },
    { q: '\u201c1984\u201d was written by whom?', options: ['Huxley', 'Orwell', 'Bradbury', 'Vonnegut'], answer: 1, difficulty: 'medium' },
    { q: 'Which movement did Salvador Dalí belong to?', options: ['Cubism', 'Surrealism', 'Impressionism', 'Baroque'], answer: 1, difficulty: 'medium' },
    { q: 'A haiku has how many syllables total?', options: ['14', '17', '20', '21'], answer: 1, difficulty: 'medium' },
    { q: '\u201cOne Hundred Years of Solitude\u201d was written by…', options: ['Borges', 'García Márquez', 'Neruda', 'Allende'], answer: 1, difficulty: 'hard' },
    { q: 'The Ukiyo-e wave print is by which artist?', options: ['Hiroshige', 'Hokusai', 'Utamaro', 'Sharaku'], answer: 1, difficulty: 'hard' },
    { q: 'Which epic poem opens \u201cSing, O goddess, the anger…\u201d?', options: ['Odyssey', 'Iliad', 'Aeneid', 'Beowulf'], answer: 1, difficulty: 'hard' },
  ],
  vocab: [
    { q: '\u201cRapid\u201d most nearly means…', options: ['Slow', 'Fast', 'Loud', 'Bright'], answer: 1, difficulty: 'easy' },
    { q: 'An antonym of \u201cbrave\u201d is…', options: ['Bold', 'Cowardly', 'Strong', 'Fierce'], answer: 1, difficulty: 'easy' },
    { q: '\u201cAnnual\u201d means occurring…', options: ['Daily', 'Monthly', 'Yearly', 'Weekly'], answer: 2, difficulty: 'easy' },
    { q: '\u201cUbiquitous\u201d means…', options: ['Rare', 'Everywhere', 'Hidden', 'Ancient'], answer: 1, difficulty: 'medium' },
    { q: '\u201cCandid\u201d most nearly means…', options: ['Secretive', 'Honest', 'Sweet', 'Angry'], answer: 1, difficulty: 'medium' },
    { q: '\u201cTenacious\u201d describes someone who is…', options: ['Persistent', 'Lazy', 'Gentle', 'Nervous'], answer: 0, difficulty: 'medium' },
    { q: '\u201cPerspicacious\u201d means…', options: ['Sweaty', 'Keenly perceptive', 'Suspicious', 'Talkative'], answer: 1, difficulty: 'hard' },
    { q: '\u201cLaconic\u201d speech is…', options: ['Wordy', 'Brief', 'Poetic', 'Loud'], answer: 1, difficulty: 'hard' },
    { q: '\u201cObstreperous\u201d most nearly means…', options: ['Obedient', 'Unruly and noisy', 'Transparent', 'Careful'], answer: 1, difficulty: 'hard' },
  ],
};
