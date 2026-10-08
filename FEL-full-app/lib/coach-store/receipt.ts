import { SCREEN_CONTACT_EMAIL } from '@/lib/screen/copy';
import { SELLER_OF_RECORD } from './constants';

export interface ReceiptInput {
  rowId: string;
  title: string;
  priceCents: number;
  paidAt: Date;
  buyerEmail: string;
  businessMailingAddress: string | null;
  testMode: boolean;
}

export function receiptText(input: ReceiptInput): string {
  const dollars = `$${(input.priceCents / 100).toFixed(2)}`;
  const lines = [
    SELLER_OF_RECORD,
    SCREEN_CONTACT_EMAIL,
    input.businessMailingAddress ? input.businessMailingAddress : '',
    '',
    `Receipt ${input.rowId}`,
    input.title,
    dollars,
    input.paidAt.toISOString(),
    input.buyerEmail,
    'Seller of record: Final Evolution LLC.',
    'FEL keeps 15%. Stripe\'s card fee comes out of the coach\'s share. You pay one price.',
  ];
  if (input.testMode) lines.push('TEST MODE. Card 4242 4242 4242 4242.');
  return lines.filter((l) => l !== '').join('\n');
}
