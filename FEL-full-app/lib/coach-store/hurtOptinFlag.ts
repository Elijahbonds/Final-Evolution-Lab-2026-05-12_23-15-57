// STORE-HURT-OPTIN — off by default (env twin).
//
// Off (unset, "", "0", "false", anything but 1/true/on/yes): today's behaviour — the "Does anything hurt?"
// answer is stored on the booking (checkout and review submit) and deliverReview opens with PAIN_LINE only
// when a stored yes is present.
// On: the answer is never stored; submit no longer requires it and writes painYes null (clearing a leftover);
// every delivered review opens with PAIN_LINE.
//
// Env twin, split helpers (Cyber F1): the server (checkout, submitReview, deliverReview) reads only
// STORE_HURT_OPTIN_ENABLED. The booking and review forms read only NEXT_PUBLIC_STORE_HURT_OPTIN_ENABLED
// (a literal so Next can inline it into the browser bundle). The public twin must not turn on the server path.
function envOn(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

/** Server no-store path: checkout, submitReview, deliverReview. Ignores the public twin. */
export function isStoreHurtOptinServerEnabled(): boolean {
  return envOn(process.env.STORE_HURT_OPTIN_ENABLED);
}

/** UI only (book-form, review-studio). The NEXT_PUBLIC_ read is a literal for Next's inlining. */
export function isStoreHurtOptinUiEnabled(): boolean {
  return envOn(process.env.NEXT_PUBLIC_STORE_HURT_OPTIN_ENABLED);
}
