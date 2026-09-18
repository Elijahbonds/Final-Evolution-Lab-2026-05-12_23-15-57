// THE VERSION THAT GOES IN THE TEXT MESSAGE (2026-09-13).
//
// The owner picked copy-ready text plus a link over an SMS integration, which is the right call — no
// dependency, no per-message cost, no carrier compliance, and the trainer keeps their own thread with their
// own client. What it means for this file is that the output is pasted into iMessage by a human, so it has
// to look like something a person wrote.
//
// THE DECISION THAT SHAPES IT: HOW MUCH GOES IN THE MESSAGE, AND HOW MUCH IS BEHIND THE LINK.
//
// The lazy build renders everything and produces a nine-screen wall of text that nobody reads and every
// trainer trims by hand. The other lazy build sends a bare link, which is the thing that looks like spam and
// does not get tapped. Neither is what a trainer writes when they do this manually today.
//
// What they actually write depends on the kind, so this does too:
//
//   · A DRILL IS COMPLETE IN THE MESSAGE. "Depth drop, 3x5, quiet landings" plus the coaching note IS the
//     whole communication — that is the most common text a trainer sends and it should need no tap at all.
//     The link is there for the detail, not for the instruction.
//   · A PROGRAM IS A SUMMARY. Title, what it is for, the week focuses, then the link. A recipient should be
//     able to tell what they have been given and decide to open it. Long blocks fold at WEEK_PREVIEW so a
//     16-week send is still a readable message.
//   · A SELECTION IS ITS LIST, because the list is short by construction and is the content.
//   · A RECOMMENDATION IS ITS WORDS, up to a point. Somebody forwarding a recommendation wants the words in
//     the thread, not a link — so it goes in whole when it fits, and excerpts on a sentence boundary rather
//     than mid-word when it does not.
//
// NO MARKDOWN, NO BOX DRAWING, NO EMOJI. This lands in a plain-text field on a phone. Asterisks and pipes
// render as asterisks and pipes.
//
// Pure: no Prisma, no DOM.

import type { Share, SharedItem } from './shareable';

/** Weeks listed in full before the message folds. Four is a screen on a phone. */
export const WEEK_PREVIEW = 4;
/** A recommendation shorter than this goes in the message whole. */
export const RECOMMENDATION_INLINE_CHARS = 420;

function line(item: SharedItem): string {
  const bits = [item.title];
  if (item.frequency) bits.push(`${item.frequency}x/wk`);
  if (item.prescription) bits.push(item.prescription);
  return bits.join(' — ');
}

/** Cut on a sentence end if there is one in range, otherwise on a word. Never mid-word. */
function excerpt(text: string, max: number): string {
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
  if (sentence > max * 0.5) return window.slice(0, sentence + 1);
  const word = window.lastIndexOf(' ');
  return `${window.slice(0, word > 0 ? word : max).trimEnd()}…`;
}

/**
 * The text a trainer copies.
 *
 * `url` is required rather than optional: a share with no way back to the full version is the spammy version
 * of this feature, and making it optional is how it ends up missing.
 */
export function toPlainText(share: Share, url: string): string {
  const from = share.by.credentialed ? `${share.by.displayName} · Certified` : share.by.displayName;
  const greeting = share.forName ? `${share.forName} — ` : '';
  const out: string[] = [];

  switch (share.kind) {
    case 'drill': {
      // complete in the message: this needs no tap
      out.push(`${greeting}${share.item.title}`);
      const dose = [share.item.prescription, share.item.frequency ? `${share.item.frequency}x/wk` : null]
        .filter(Boolean).join(' · ');
      if (dose) out.push(dose);
      if (share.note) out.push('', share.note);
      if (share.item.opensAt?.length) {
        out.push('', `Opens at ${share.item.opensAt.map((o) => `${o.label} ${o.need}`).join(', ')}.`);
      }
      out.push('', `From ${from}`, url);
      break;
    }

    case 'program': {
      out.push(`${greeting}${share.title}`);
      if (share.outcome) out.push(share.outcome);
      out.push('');
      const shown = share.weeks.slice(0, WEEK_PREVIEW);
      for (const w of shown) {
        out.push(`Wk${w.week} ${w.focus}${w.items.length ? ':' : ''}`);
        for (const i of w.items) out.push(`  ${line(i)}`);
      }
      const rest = share.weeks.length - shown.length;
      if (rest > 0) out.push(`  …and ${rest} more week${rest === 1 ? '' : 's'}`);
      out.push('', `Retest after week ${share.retestAfterWeeks}.`, '', `From ${from}`, url);
      break;
    }

    case 'selection': {
      out.push(`${greeting}${share.title}`);
      out.push('');
      for (const i of share.items) out.push(`· ${line(i)}`);
      if (share.note) out.push('', share.note);
      out.push('', `From ${from}`, url);
      break;
    }

    case 'recommendation': {
      out.push(share.title);
      // only when the title has not already said who it is for — a trainer who writes "Recommendation for
      // Ama" should not get a "For Ama" line under it
      if (share.forName && !share.title.toLowerCase().includes(share.forName.toLowerCase())) {
        out.push(`For ${share.forName}`);
      }
      out.push('', excerpt(share.body, RECOMMENDATION_INLINE_CHARS));
      if (share.body.length > RECOMMENDATION_INLINE_CHARS) out.push('', 'Full version:');
      out.push('', `— ${from}`, url);
      break;
    }
  }

  // collapse any run of blanks the branches produced, and never lead or trail with one
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * A one-line version, for a share sheet title or a link preview.
 *
 * Deliberately not the same string as the first line of `toPlainText` — a preview says what KIND of thing
 * arrived, which the message body does not need to because the body is right there.
 */
export function toSummaryLine(share: Share): string {
  const who = share.by.displayName;
  switch (share.kind) {
    case 'drill': return `${who} sent you a drill: ${share.item.title}`;
    case 'program': return `${who} sent you a ${share.weeks.length}-week program: ${share.title}`;
    case 'selection': return `${who} sent you ${share.items.length} things to work on`;
    case 'recommendation': return `${who} wrote you a recommendation`;
  }
}
