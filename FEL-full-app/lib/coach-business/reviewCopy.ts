// lib/coach-business/reviewCopy.ts — COACH-DELIVERY COA-10: the review form's words and limit, client-safe (reviews.ts is the
// server half). DRAFT copy for the owner.
export const TEXT_MAX = 600;

export const REVIEW_ERROR_COPY: Record<string, string> = {
  stars: 'Pick 1 to 5 stars.', text_too_long: `Up to ${TEXT_MAX} characters.`, text_claims: 'Leave out health claims (a condition, a treatment or a promise).',
  text_contact: 'Leave out contact details and links.', adults_only: 'Reviews are for adults (18+).', no_ended_package: 'You can review a coach once a package with them has ended.',
};
