'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'bg-muted text-foreground border border-border data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=delayed-open]:zoom-in-95 data-[state=closed]:zoom-out-95 z-100 max-w-[--radix-tooltip-content-available-width] overflow-hidden rounded-md px-3 py-1.5 text-xs shadow-md',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

interface TruncatedTooltipProps {
  text: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Tooltip that only appears when the text is truncated (overflow with ellipsis).
 * Use for truncated item names where showing the full name on hover is only useful when cut off.
 */
export function TruncatedTooltip({ text, className, children }: TruncatedTooltipProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);

  const checkTruncation = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setIsTruncated(el.scrollWidth > el.clientWidth);
  }, []);

  React.useEffect(() => {
    checkTruncation();
    const observer = new ResizeObserver(checkTruncation);
    const el = ref.current;
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [checkTruncation, text]);

  const content = (
    <span ref={ref} className={cn('truncate', className)}>
      {children ?? text}
    </span>
  );

  if (isTruncated) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px]">
          {text}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
