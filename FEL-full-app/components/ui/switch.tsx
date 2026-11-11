'use client';

import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';

import { cn } from '@/lib/utils';

// EVERY-SCREEN P9 (2026-11-11): the switch is a 44 px tap target with the same 44 × 24 px look. The button (Root) is the
// 44 px box and is transparent; the track it used to be is drawn inside it, so every place that uses a switch keeps
// its look and only gains the taller hit area. The state colours, the thumb's travel and the focus ring are unchanged.
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer group inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
    ref={ref}
  >
    <span
      aria-hidden
      className="inline-flex h-6 w-11 items-center rounded-full border-2 border-transparent transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background group-data-[state=checked]:bg-primary group-data-[state=unchecked]:bg-input"
    >
      <SwitchPrimitives.Thumb
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0'
        )}
      />
    </span>
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
