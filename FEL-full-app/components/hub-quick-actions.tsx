'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ScanLine, Users, IdCard, Dumbbell, Shirt, Radio, CalendarDays } from 'lucide-react';

/**
 * M17-M21 hub surfacing. Big, ≤2-tap entries for the new product surfaces so
 * the update is immediately visible and multiplayer / system scan / creator
 * card are one tap from home. Ordered by the flywheel we want to drive:
 * Scan → Card → Multiplayer, then the training/commerce surfaces.
 */
const ACTIONS = [
  { href: '/try', label: 'System Scan', sub: 'Free · get your PRQ', icon: ScanLine, accent: '#00E5FF', hero: true },
  { href: '/multiplayer', label: 'Multiplayer', sub: 'Play a friend · 2 taps', icon: Users, accent: '#FF3366', hero: true },
  { href: '/cards', label: 'Creator Card', sub: 'Build & share yours', icon: IdCard, accent: '#A855F7', hero: true },
  { href: '/workout', label: 'My Workout', sub: 'Your avatar, your plan', icon: Dumbbell, accent: '#00FF9D' },
  { href: '/live', label: 'Live', sub: 'Classes & creators', icon: Radio, accent: '#FF3366' },
  { href: '/sessions', label: 'Sessions', sub: 'Train with Elijah', icon: CalendarDays, accent: '#FFD700' },
  { href: '/closet', label: 'Closet', sub: 'Style your avatar', icon: Shirt, accent: '#C79BFF' },
];

export function HubQuickActions() {
  return (
    <section className="mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {ACTIONS.map((a, i) => {
          const Icon = a.icon;
          return (
            <motion.div key={a.href} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i, duration: 0.3 }}>
              <Link
                href={a.href}
                className={`group relative flex h-full flex-col justify-between overflow-hidden rounded-xl border p-4 transition-all hover:scale-[1.02] ${a.hero ? 'min-h-[104px]' : 'min-h-[92px]'}`}
                style={{ borderColor: `${a.accent}44`, background: `linear-gradient(135deg, ${a.accent}1c 0%, rgba(5,5,5,0.6) 70%)` }}
              >
                <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl" style={{ background: `${a.accent}33` }} />
                <Icon className="h-6 w-6" style={{ color: a.accent }} />
                <div>
                  <div className="fel-heading text-sm font-bold text-white">{a.label}</div>
                  <div className="font-mono text-[10px] text-white/50">{a.sub}</div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
