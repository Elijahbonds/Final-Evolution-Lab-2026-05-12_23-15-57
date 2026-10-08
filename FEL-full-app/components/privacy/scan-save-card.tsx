'use client';

import { SCAN_SAVE_CONSENT_TEXT } from '@/lib/privacy/scanSaveConsent';

/** The opt-in card. Default off. The sentence is the consent text, not a paraphrase. */
export function ScanSaveCard(props: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      data-testid="scan-save-card"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: 10,
        alignItems: 'start',
        margin: '8px 0',
        padding: 12,
        borderRadius: 12,
        border: '1px solid rgba(0,229,255,0.45)',
        background: 'rgba(0,229,255,0.06)',
        color: '#fff',
        fontSize: 14,
        lineHeight: 1.4,
        textAlign: 'left',
      }}
    >
      <input
        data-testid="scan-save-toggle"
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>{SCAN_SAVE_CONSENT_TEXT}</span>
    </label>
  );
}
