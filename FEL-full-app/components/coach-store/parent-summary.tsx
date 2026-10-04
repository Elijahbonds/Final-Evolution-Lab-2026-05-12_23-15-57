'use client';

/** One page, drawn on this phone. Weeks, trends, and drills. No video and no face. Nothing is uploaded. */
export function ParentSummary({ lines }: { lines: string[] }) {
  const share = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1100;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = '28px sans-serif';
    ctx.fillText('Program summary', 40, 64);
    ctx.font = '18px sans-serif';
    lines.slice(0, 32).forEach((line, index) => {
      ctx.fillText(line.slice(0, 72), 40, 120 + index * 28);
    });
    ctx.fillText('Drawn on this phone. Nothing was uploaded.', 40, 1060);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'program-summary.png', { type: 'image/png' });
    if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Program summary' });
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'program-summary.png';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" className="mt-4 rounded-xl border px-3 py-2 text-sm" onClick={() => { void share(); }}>
      Share with parent
    </button>
  );
}
