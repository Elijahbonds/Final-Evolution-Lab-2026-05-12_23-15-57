import { redirect } from 'next/navigation';
import { TIEBREAK_VARIANT_PATH } from '@/lib/babylon/modes/tennisVariant';

export const dynamic = 'force-dynamic';

/**
 * TENNIS-TIEBREAK-FOLD (ALL-MODES-TO-75 §1 + S6, 2026-10-22; Elijah: "Fold Tiebreak into Tennis"): Tiebreak is the
 * Tennis tiebreak variant now. This route stays live as a redirect so old links, cards and saved picks still land in it;
 * /play/tennis does the sign-in round trip with the variant kept. Nothing is deleted — the old loader
 * (./_components/loader.tsx), components/games/tiebreak-game.tsx, TiebreakMode.ts and TiebreakBlitz are untouched and
 * unmounted; removing them is Elijah's call.
 */
export default function TiebreakPage() {
  redirect(TIEBREAK_VARIANT_PATH);
}
