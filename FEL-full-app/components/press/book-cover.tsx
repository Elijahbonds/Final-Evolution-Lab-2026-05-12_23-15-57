/** Typographic stand-in. Real covers are uploaded with the book files, not committed here. */
export function BookCover({ title, tall = false }: { title: string; tall?: boolean }) {
  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-xl border border-white/10 bg-[#161616] p-4 ${tall ? 'min-h-[280px]' : 'aspect-[3/4]'}`}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(255,255,255,0.04) 8px, rgba(255,255,255,0.04) 9px)',
        }}
      />
      <p className="relative text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F5C518]">Final Evolution Press</p>
      <p className="fel-heading relative text-xl leading-tight text-white">{title}</p>
      <p className="relative text-[10px] uppercase tracking-wider text-white/35">Cover placeholder</p>
    </div>
  );
}
