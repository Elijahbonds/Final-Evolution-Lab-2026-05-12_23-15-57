'use client';
// WalletBalances — PLAT-P07 (2026-11-02): /wallet's three balances as tiles, one line each on what the currency is for, then
// "Earn today" (the reward rules' own amounts, handed in by the page) and the two spend doors. The balances are the
// wallet's own answer (GET /api/v1/wallet: lc, coins, shards); nothing here moves a balance (no economy change).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SHOP_LOOK as L } from './look';

export interface EarnLine { label: string; amount: string; href: string }

export const WALLET_COPY = {
  lc: { name: 'Lab Credits', line: 'Earned by training.' },
  coins: { name: 'Coins', line: 'Bought in the Coin Store.' },
  shards: { name: 'Shards', line: 'For group and 1-on-1 sessions.' },
  earn: 'Earn today',
  spend: 'Spend',
} as const;

export function WalletBalances({ earn, spend }: { earn: readonly EarnLine[]; spend: readonly { label: string; href: string }[] }) {
  const [bal, setBal] = useState<{ lc: number; coins: number; shards: number } | null>(null);
  useEffect(() => {
    fetch('/api/v1/wallet').then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (j && typeof j.coins === 'number') setBal({ lc: Number(j.lc) || 0, coins: j.coins, shards: Number(j.shards) || 0 });
    }).catch(() => {});
  }, []);
  const tile = (k: 'lc' | 'coins' | 'shards') => (
    <li key={k} className={L.card} data-balance={k}>
      <p className={L.cardSide}>{WALLET_COPY[k].name}</p>
      <p className={`${L.cardTitle} tabular-nums`} data-amount>{bal ? bal[k].toLocaleString() : '—'}</p>
      <p className={L.cardLine}>{WALLET_COPY[k].line}</p>
    </li>
  );
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-3" aria-label="Balances">{(['lc', 'coins', 'shards'] as const).map(tile)}</ul>
      <section className={L.section} aria-labelledby="earn">
        <h2 id="earn" className={L.sectionTitle}>{WALLET_COPY.earn}</h2>
        <ul className={L.rows}>
          {earn.map((e) => (
            <li key={e.href}><Link href={e.href} className={L.row}><span>{e.label}</span><span className={L.rowSide}>{e.amount}</span></Link></li>
          ))}
        </ul>
      </section>
      <section className={L.section} aria-labelledby="spend">
        <h2 id="spend" className={L.sectionTitle}>{WALLET_COPY.spend}</h2>
        <ul className={L.rows}>
          {spend.map((s) => <li key={s.href}><Link href={s.href} className={L.row}><span>{s.label}</span><span aria-hidden className={L.rowSide}>›</span></Link></li>)}
        </ul>
      </section>
    </>
  );
}
