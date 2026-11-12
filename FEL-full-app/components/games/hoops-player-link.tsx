'use client';
// hoops-builder phase B (owner 2026-11-12): the 1v1 / 3v3 start card's way to the hoops builder (/creator/hoops). In a rating-free run
// (ranked, staked, arena, challenge, online, party) it says so instead and links nowhere. The row holds its 44 px either way, so the
// card never shifts when the query is read.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { startCardLink } from '@/lib/creator/hoops/links';

export function HoopsPlayerLink({ modeId }: { modeId: string }) {
  const [search, setSearch] = useState<string | null>(null);
  useEffect(() => { setSearch(typeof window !== 'undefined' ? window.location.search : ''); }, []);
  const link = startCardLink(modeId, search ?? '');
  if (!link) return null;
  return (
    <div data-hoops-player-link className="mt-2 flex min-h-11 items-center justify-center">
      {search === null ? null : link.href
        ? <Link href={link.href} className="inline-flex min-h-11 items-center rounded-full border border-white/25 px-4 text-[12px] font-black tracking-[0.2em] text-white/85 hover:bg-white/10">{link.label}</Link>
        : <p className="text-[12px] font-black tracking-[0.2em] text-white/60">{link.label}</p>}
    </div>
  );
}
