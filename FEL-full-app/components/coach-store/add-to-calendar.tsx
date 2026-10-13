'use client';

/** Saves the booking's calendar file. The text is built on the server by icsFor; this only hands it to the browser. */
export function AddToCalendar({ ics, className }: { ics: string; className?: string }) {
  const save = () => {
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'coaching-call.ics';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" className={className} onClick={save}>
      Add to calendar
    </button>
  );
}
