/**
 * lib/arena-teen-copy.ts — ARENA-AGE-1 teen Arena copy (Cyber T6, EASE-OF-USE R2-4).
 * Uses "entry" and "prize"; one plain name per currency ("Credits"). Never stake, pot,
 * wager, forfeit, odds or the "LC" abbreviation; no near-miss, "double or nothing" or countdown pressure.
 * Guarded by components/arena/teen-arena-copy.test.ts.
 */
export const TEEN_ARENA_COPY = {
  intro: 'Practice duels against house rivals. Entry is free. Win a duel to earn a prize.',
  prizeLine: (prize: number, cap: number) => `Prize: ${prize} Credits per win, up to ${cap} Credits a day.`,
  rivalNote: 'Your rival is a house athlete: a computer player matched to your recent scores.',
  chooseGame: 'Choose your game',
  play: 'PLAY A PRACTICE DUEL',
  starting: 'Starting your duel…',
  ready: (rival: string) => `${rival} is ready. Good luck!`,
  startFailed: 'Could not start a practice duel. Try again in a moment.',
  networkError: 'Network error. Try again in a moment.',
  balance: (n: number) => `Your Credits: ${n.toLocaleString('en-US')}`,
  myDuels: 'MY PRACTICE DUELS',
  none: 'No practice duels yet. Pick a game and play one.',
  rowLive: 'Live: play your round',
  rowWon: 'Won: prize added (up to the daily limit)',
  rowLost: 'Lost: no Credits lost',
  rowTie: 'Tie: no Credits lost',
  rowClosed: 'Closed: no Credits lost',
  playRound: 'PLAY',
  dailyLimit: 'You reached today\u2019s prize limit. You can keep playing; prizes start again tomorrow.',
  olderTitle: 'Older duels',
  olderEntry: (n: number) => `Older duel: ${n} Credits entry`,
  olderCancel: 'CANCEL AND GET CREDITS BACK',
  olderCancelled: 'Cancelled. Your Credits are back.',
  olderPlay: 'Play it to finish it.',
  birthYearBanner: 'Add your birth year to see every Arena option. Until then you can play free practice duels.',
  birthYearLink: 'Add birth year',
  // end-of-run card (components/games/end-screen/outcome-cards.tsx ArenaCard, practice branch)
  resultTitle: 'PRACTICE ARENA',
  resultPending: 'Score saved. Your rival is finishing.',
  resultWon: (n: number) => `You won! Prize: +${n} Credits`,
  resultWonCapped: 'You won! You reached today\u2019s prize limit, so no prize this time.',
  resultLost: 'You lost this one. No Credits lost.',
  resultBack: 'Back to practice',
} as const;
