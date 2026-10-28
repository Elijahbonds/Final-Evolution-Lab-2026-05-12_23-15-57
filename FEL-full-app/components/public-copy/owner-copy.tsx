// OwnerCopy — approved public-page copy with the owner's blanks drawn as visible [OWNER: …] markers (ONB-05). A server
// component: the copy is data (lib/creator/creatorCatalog.ts PUBLIC_PAGE_COPY), and a marker stays on the live page,
// in plain sight, until the owner fills that blank.
import type { CopyPart } from '@/lib/creator/creatorCatalog';

export function OwnerCopy({ parts, className = '' }: { parts: readonly CopyPart[]; className?: string }) {
  return (
    <p className={className} data-public-copy>
      {parts.map((p, i) => (typeof p === 'string'
        ? <span key={i}>{p}</span>
        : (
          <mark key={i} data-owner-blank={p.owner}
            className="mx-0.5 rounded border border-dashed border-[#F5C518]/70 bg-[#F5C518]/10 px-1 py-0.5 font-mono text-[0.85em] text-[#F5C518]">
            {`[OWNER: ${p.owner}]`}
          </mark>
        )))}
    </p>
  );
}
