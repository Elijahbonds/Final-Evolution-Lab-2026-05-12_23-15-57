// share-link — the one place that builds a creator card's shareable URL.
//
// THE CODE HAS TO BE IN THE LINK (owner, 2026-09-19: "whoever card gets scanned and a new account is created they get
// shards — with a QR code"). Every other piece of that chain already existed: /api/signup accepts a ?ref=CODE, the
// auth form lifts one off the URL, and convertReferralOnSignup pays the code's owner. What the chain never got was
// the code, because the card's QR encoded a bare /card/<slug> — so a sticker could be scanned, land on the card, make
// an account, and pay its owner nothing. Pure and shared so the QR, the copy button and the CTA cannot drift apart.

/** A referral code is uppercase alphanumerics; anything else is dropped rather than pasted into a URL. */
export function cleanRefCode(code: string | null | undefined): string | null {
  const c = String(code ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{4,16}$/.test(c) ? c : null;
}

/** The card's public path, carrying the owner's referral code when there is one. */
export function cardSharePath(slug: string, refCode?: string | null): string {
  const s = encodeURIComponent(String(slug ?? '').toLowerCase());
  const code = cleanRefCode(refCode);
  return code ? `/card/${s}?ref=${code}` : `/card/${s}`;
}

/** The absolute URL for a QR or the clipboard. `origin` comes from the browser, so it is never guessed here. */
export function cardShareUrl(origin: string, slug: string, refCode?: string | null): string {
  return `${String(origin ?? '').replace(/\/+$/, '')}${cardSharePath(slug, refCode)}`;
}

/** Where "build your own card" goes — the same code, so the scan and the button pay the same owner. */
export function signupPathFor(refCode?: string | null): string {
  const code = cleanRefCode(refCode);
  return code ? `/signup?ref=${code}` : '/signup';
}
