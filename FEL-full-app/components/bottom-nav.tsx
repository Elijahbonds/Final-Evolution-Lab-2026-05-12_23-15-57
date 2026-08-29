'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Gamepad2, User, Radio, Sparkles, Palette } from 'lucide-react';

const ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/modes', label: 'Modes', icon: Gamepad2 },
  { href: '/create', label: 'Create', icon: Palette },
  { href: '/live', label: 'Live', icon: Radio },
  { href: '/coach', label: 'Coach', icon: Sparkles },
  { href: '/profile', label: 'Profile', icon: User },
];

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-white/10 bg-[#0F0F13]/90 backdrop-blur-md">
      <div className="mx-auto max-w-3xl grid grid-cols-6">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? 'text-[#00E5FF]' : 'text-white/45 hover:text-white/80'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]' : ''}`} />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="mx-auto max-w-3xl flex items-center justify-center gap-4 pb-1.5 pt-0.5">
        {[{ href: '/support', label: 'Support' }, { href: '/terms', label: 'Terms' }, { href: '/privacy', label: 'Privacy' }].map((l) => (
          <Link key={l.href} href={l.href} className="text-[9px] text-white/40 hover:text-white/60 transition-colors">
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
