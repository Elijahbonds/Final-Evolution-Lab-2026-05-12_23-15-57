import Link from 'next/link';
import { DoorsRow } from '@/components/shell/doors-row';
import { TabPage } from '@/components/shell/tab-page';
import { FAMILIES, OFF_SHELF, SHELF_MODE_COUNT, shelvedModes, type Family } from '@/lib/nav/families';
import { modeMenuMetaFor, visibleModeEntries } from '@/lib/mode-menu';
import { PartyBadge } from '@/components/party/party-badge';   // MULTIPLAYER: the games friends can play together

type ModeTile = {
  key: string;
  name: string;
  venue: string;
  href: string;
  desc: string;
  color: string;
  Icon: ReturnType<typeof modeMenuMetaFor>['icon'];
};

function tileFor([key, info]: ReturnType<typeof visibleModeEntries>[number]): ModeTile {
  const meta = modeMenuMetaFor(key);
  return {
    key,
    name: info.name,
    venue: info.venue,
    href: info.href,
    desc: meta.desc,
    color: meta.color,
    Icon: meta.icon,
  };
}

function ModeCard({ tile }: { tile: ModeTile }) {
  const { Icon } = tile;
  return (
    <Link
      href={tile.href}
      className="group flex h-full gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-all duration-200 hover:bg-white/[0.055]"
      style={{ ['--mode-accent' as string]: tile.color }}
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--mode-accent)]/10 text-[var(--mode-accent)] transition-transform duration-200 group-hover:scale-105"
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="fel-heading block truncate text-[15px] font-bold text-white">{tile.name} <PartyBadge modeKey={tile.key} className="ml-1" /></span>
        <span className="mt-0.5 block truncate font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/35">
          {tile.venue}
        </span>
        <span className="mt-2 block text-[12.5px] leading-relaxed text-white/48">{tile.desc}</span>
      </span>
    </Link>
  );
}

function ModeSection({
  title,
  blurb,
  accent,
  tiles,
}: {
  title: string;
  blurb: string;
  accent: string;
  tiles: ModeTile[];
}) {
  if (!tiles.length) return null;
  return (
    <section className="rounded-3xl border border-white/[0.06] bg-white/[0.018] p-4 md:p-5">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="fel-heading text-[19px] font-black text-white">{title}</h2>
          <p className="mt-1 text-[12.5px] text-white/45">{blurb}</p>
        </div>
        <p className="font-mono text-[11px] font-bold tabular-nums" style={{ color: accent }}>
          {tiles.length} {tiles.length === 1 ? 'mode' : 'modes'}
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => <ModeCard key={tile.key} tile={tile} />)}
      </div>
    </section>
  );
}

export default function ModesPage() {
  const byKey = new Map(visibleModeEntries().map((entry) => [entry[0], tileFor(entry)]));
  const shelved = new Set(shelvedModes());
  const sections = FAMILIES.map((family: Family) => ({
    title: family.label,
    blurb: family.blurb,
    accent: family.accent,
    tiles: family.modes.map((key) => byKey.get(key)).filter((tile): tile is ModeTile => Boolean(tile)),
  }));
  const offShelf = [...byKey.values()].filter((tile) => !shelved.has(tile.key));

  return (
    <TabPage
      eyebrow="Modes"
      title="All live modes"
      lede={`${SHELF_MODE_COUNT} shelf modes plus ${offShelf.length} training-floor ${offShelf.length === 1 ? 'entry' : 'entries'}. Every card has a route, venue and play contract.`}
      accent="#00E5FF"
    >
      <div className="space-y-5">
        {sections.map((section) => <ModeSection key={section.title} {...section} />)}
        <ModeSection
          title="Training floor"
          blurb={offShelf.map((tile) => OFF_SHELF[tile.key]).filter(Boolean).join(' · ') || 'Mode surfaces that live outside the Play shelf.'}
          accent="#00FF9D"
          tiles={offShelf}
        />
      </div>
      <DoorsRow tab="play" />
    </TabPage>
  );
}
