'use client';

// THE JUDGES' CARDS (dunk and dunk duel, lane/hud-hoops): five cards held up in a row, as the panel actually does it, and a
// running total that climbs as they flip — the number everyone watches. The card that just flipped gets to speak: its voice
// line sits under the row. Drawn from the mode's `judgeReveal` exactly as the two hosts drew it before the TV HUD system
// (the score of a card, the sum of the cards, the last card's line), on the system's plate, palette and type scale.
//
// PRESENTATION ONLY: nothing here scores or judges; it sums the numbers it is handed for the total it always showed.
import type { HudScoreCard } from '@/lib/babylon';
import { HUD_TEXT_ALPHA, HudPlate, HudText, ScoreValue, hudColor } from './tv-hud';

export function JudgeCards({ cards }: { cards: HudScoreCard[] }) {
  if (cards.length === 0) return null;
  return (
    <>
      <div className="flex items-end justify-center gap-1.5">
        {cards.map((j) => (
          <HudPlate key={j.name} className="flex flex-col items-center px-2.5 py-1">
            <HudText size="caption" tone="you" className="uppercase">{j.name}</HudText>
            <ScoreValue value={j.score} size="score" tone="score" pop={false} />
          </HudPlate>
        ))}
        <HudPlate className="ml-1 flex flex-col items-center px-3 py-1" style={{ border: `1px solid ${hudColor('score', 0.4)}` }}>
          <HudText size="caption" alpha={HUD_TEXT_ALPHA.faint} className="uppercase">total</HudText>
          <ScoreValue value={cards.reduce((s, j) => s + Number(j.score), 0)} size="score" />
        </HudPlate>
      </div>
      {/* the card that just flipped gets to speak */}
      <HudPlate as="span" className="max-w-[85%] truncate px-3 py-1">
        <HudText size="label" alpha={0.7}>{cards[cards.length - 1].line}</HudText>
      </HudPlate>
    </>
  );
}
