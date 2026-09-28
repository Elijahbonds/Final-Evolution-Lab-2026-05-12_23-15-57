'use client';

// END-CARD REWARDS (QA P0-02, 2026-09-27): the reward grid on the GameShell results card, out of the shell.
//
// The card's "Shards" tile printed /api/sessions' PROFILE shards (session-payout sessionShards, max(1, score/20), so never
// below 1) — a ledger no chip shows. A zero-score DNF read "+1 SHARDS" and the wallet chip's shards never moved, because
// wallet shards come only from the `mode_session_won` earn, which a loss never gets. The card now shows what the WALLET
// granted for this run, coins and shards, from the earn reports' own answers: "+0" when nothing was granted. The
// profile-shard tile is dropped ([DECISION-EJ] default); XP, Credits and PRQ Δ stay as the session reported them.

import { Sparkles, Gem, Coins, TrendingUp, TrendingDown } from 'lucide-react';
import type { EarnGrant } from '@/lib/wallet/client';

/** What the wallet granted this run: summed from the earn reports (the completed earn pays coins, the won earn shards). */
export interface WalletGrants {
  coins: number;
  shards: number;
  /** A rate or daily cap cut the coin (completed) earn. */
  capped: boolean;
  /** A cap cut the shard (won) earn. */
  shardsCapped?: boolean;
}

/**
 * The run's grants out of the reports' answers, in the order the shell sends them: [completed, won?]. A refused or failed
 * report (null) granted nothing, so it adds nothing — the card says +0, never a figure the wallet did not pay.
 */
export function walletGrantsFrom(gs: ReadonlyArray<EarnGrant | null>): WalletGrants {
  const paid = gs.filter((g): g is EarnGrant => g !== null);
  const sum = (k: 'coins' | 'shards') => paid.reduce((s, g) => s + (Number.isFinite(g[k]) ? g[k] : 0), 0);
  return { coins: sum('coins'), shards: sum('shards'), capped: Boolean(gs[0]?.capped), shardsCapped: Boolean(gs[1]?.capped) };
}

export interface EndCardRecap {
  xp: number;
  credits: number;
  prqDelta: number;
}

function Tile({ icon, value, label, color, recap, capped }: {
  icon: React.ReactNode; value: string; label: string; color: string; recap?: string; capped?: boolean;
}) {
  return (
    <div data-recap={recap} data-capped={capped ? '1' : undefined} className="fel-card rounded-lg p-3">
      {icon}
      <div className="mt-1 font-mono text-xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}

/**
 * The session tiles, then — once the earn reports have answered — the wallet's. `walletGrants` null means not answered
 * yet, or a run the shell does not report (dunk reports its own earns): no wallet tiles rather than a guess.
 */
export function EndCardRewards({ recap, walletGrants }: { recap: EndCardRecap; walletGrants: WalletGrants | null }) {
  const up = recap.prqDelta >= 0;
  return (
    <>
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Tile icon={<Sparkles className="mx-auto h-4 w-4 text-[#00FF9D]" />} value={`+${recap.xp}`} label="XP" color="#00FF9D" />
        <Tile icon={<Coins className="mx-auto h-4 w-4 text-[#FFD700]" />} value={`+${recap.credits}`} label="Credits" color="#FFD700" />
        <Tile
          icon={up ? <TrendingUp className="mx-auto h-4 w-4 text-[#00E5FF]" /> : <TrendingDown className="mx-auto h-4 w-4 text-[#FF3366]" />}
          value={`${up ? '+' : ''}${recap.prqDelta}`} label="PRQ Δ" color={up ? '#00E5FF' : '#FF3366'}
        />
      </div>
      {walletGrants && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Tile
            recap="coins" capped={walletGrants.capped}
            icon={<Coins className="mx-auto h-4 w-4 text-[#FFB020]" />} value={`+${walletGrants.coins}`} color="#FFB020"
            label={walletGrants.capped ? 'Wallet coins · limit reached' : 'Wallet coins'}
          />
          <Tile
            recap="shards" capped={walletGrants.shardsCapped}
            icon={<Gem className="mx-auto h-4 w-4 text-[#A855F7]" />} value={`+${walletGrants.shards}`} color="#A855F7"
            label={walletGrants.shardsCapped ? 'Wallet shards · limit reached' : 'Wallet shards'}
          />
        </div>
      )}
    </>
  );
}
