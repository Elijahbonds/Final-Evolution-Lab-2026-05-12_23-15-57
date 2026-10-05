'use client';

export function CancelMembership({ accessId }: { accessId: string }) {
  return (
    <button
      type="button"
      className="mt-2 rounded-lg border px-3 py-1"
      onClick={() => { void fetch(`/api/coach-store/access/${accessId}/cancel`, { method: 'POST' }); }}
    >
      Cancel membership
    </button>
  );
}
