'use client';
// The style page's interactive half: segmented tabs, a toast, the docked pill.
import { useState } from 'react';
import { SegmentedTabs } from '@/components/ui/fel/segmented-tabs';
import { felToast } from '@/components/ui/fel/toast';
import { useMotionAttr } from '@/components/ui/fel/use-motion-attr';
import { TYPE } from '@/lib/design/type';

export function DevUiDemo() {
  useMotionAttr();
  const [seg, setSeg] = useState('week');
  return (
    <div className="flex flex-wrap items-center gap-4">
      <SegmentedTabs label="Range" value={seg} onChange={setSeg}
        items={[{ id: 'today', label: 'Today' }, { id: 'week', label: 'Week' }, { id: 'all', label: 'All time' }]} />
      <button type="button" className={`fel-press min-h-11 rounded-full border border-white/15 px-5 text-white ${TYPE.label}`}
        onClick={() => felToast('Drill saved', { tone: 'success', description: '+20 Lab Credits' })}>
        Show a toast
      </button>
    </div>
  );
}
