// The public /links page (Instagram bio). One list, in order. A null url is hidden —
// nothing here is guessed. External http(s) links are new tabs. Affiliates use
// rel="sponsored noopener" and the disclosure line below.

export type HubKind = 'internal' | 'external' | 'affiliate' | 'email';

export interface HubItem {
  id: string;
  label: string;
  /** Hidden when null. */
  url: string | null;
  kind: HubKind;
  /** Section heading. The books section is the /books redirect target (#books). */
  section?: 'books' | 'merch' | 'follow';
  /** Checkout code, shown with a copy button. */
  code?: string;
}

export const AFFILIATE_DISCLOSURE = 'Paid link: I earn a commission if you buy.';

export const HUB_SECTION_TITLES = {
  books: 'Books',
  merch: 'Merch',
  follow: 'Follow',
} as const;

export const LINKS_TITLE = 'Final Evolution · Links';
export const LINKS_DESCRIPTION = 'Take the free movement screen, play FEL, and find the book, merch, and contact.';

/** Share card built from the existing wordmark (public/brand/wordmark-light.png). */
export const LINKS_SHARE_IMAGE = '/brand/links-og.png';

export const HUB_ITEMS: readonly HubItem[] = [
  { id: 'screen', label: 'Take the free movement screen', url: '/screen', kind: 'internal' },
  { id: 'play', label: 'Play FEL', url: '/try', kind: 'internal' },
  {
    id: 'blueprint',
    label: "The Neuro-Mechanic's Blueprint on Kindle",
    url: 'https://www.amazon.com/dp/B0H5J1M18H',
    kind: 'external',
    section: 'books',
  },
  {
    id: 'all-books',
    label: 'All Books',
    url: 'https://www.amazon.com/Elijah-Bonds/e/B0H63J1Q7B',
    kind: 'external',
    section: 'books',
  },
  { id: 'millions', label: 'MILLIONS', url: 'https://millions.co/elijah-bonds-basketball', kind: 'external', section: 'merch' },
  {
    id: 'pjf',
    label: 'PJF Performance Band',
    url: 'https://pjf-performance-shop.myshopify.com/?sca_ref=9885072.t2P8qJogGNMRly',
    kind: 'affiliate',
  },
  {
    id: 'tbb',
    label: 'Total Body Board',
    url: 'https://www.totalbodyboard.com/',
    kind: 'affiliate',
    code: 'EBondJmp',
  },
  { id: 'contact', label: 'Contact', url: 'mailto:FinalEvolution.us@gmail.com', kind: 'email' },
  { id: 'ig-elijah', label: 'Instagram @elijahbonds', url: 'https://www.instagram.com/elijahbonds', kind: 'external', section: 'follow' },
  { id: 'ig-fel', label: 'Instagram @finalevolutionllc', url: 'https://www.instagram.com/finalevolutionllc', kind: 'external', section: 'follow' },
  { id: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/channel/UCP_ziu1PO1DGWfpmIP3kEng', kind: 'external', section: 'follow' },
  { id: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com/in/elijah-bonds-771aa1228', kind: 'external', section: 'follow' },
];

/** Items the page renders. A null url stays in the config and stays off the page. */
export function visibleHubItems(items: readonly HubItem[] = HUB_ITEMS): HubItem[] {
  return items.filter((item) => item.url !== null);
}

/** rel for a visible item. Internal links stay in this tab and name no rel. */
export function hubLinkRel(item: HubItem): string | null {
  if (item.url === null || item.kind === 'internal') return null;
  if (item.kind === 'affiliate') return 'sponsored noopener';
  return 'noopener';
}

/** http(s) links open a new tab. mailto stays in this tab. */
export function hubLinkTarget(item: HubItem): '_blank' | null {
  if (item.url === null || item.kind === 'internal' || item.kind === 'email') return null;
  return '_blank';
}
