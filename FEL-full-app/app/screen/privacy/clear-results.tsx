'use client';

// The privacy page's "Done, clear my results": the same clear as the results screen's button (lib/screen/store.ts
// clearScreen), which only REMOVES this tab's screen keys. The age answer stays locked until the tab closes.
import { useState } from 'react';
import { DONE_CLEAR, PRIVACY_CLEARED } from '@/lib/screen/copy';
import { clearScreen, localForClear, tabStorage } from '@/lib/screen/store';
import { quietBtn } from '@/app/play/mirror/assess/_components/screen-ui';

export function ClearResults() {
  const [done, setDone] = useState(false);
  const clear = () => { clearScreen(tabStorage(), localForClear()); setDone(true); };
  return (
    <div>
      <button type="button" onClick={clear} data-done-clear className={quietBtn}>{DONE_CLEAR}</button>
      {done ? <p data-cleared role="status" className="mt-2 text-[13px] text-[#00FF9D]">{PRIVACY_CLEARED}</p> : null}
    </div>
  );
}
