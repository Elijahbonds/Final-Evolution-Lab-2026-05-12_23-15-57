'use client';

// components/binjgb/local-player-lazy.tsx — the load-your-own player, client-only and code-split (dev brief 4): its code,
// and the Worker it makes, load only when the server rendered the picker. Nothing here runs for a teen, an unknown age,
// or with either flag off, because the shelf page never renders this component for them.
import dynamic from 'next/dynamic';

export const LocalPlayerLazy = dynamic(() => import('./local-player').then((m) => m.LocalPlayer), { ssr: false });
