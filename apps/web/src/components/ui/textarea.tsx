import * as React from 'react';
import { cn } from '@/lib/utils';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          'border-input placeholder:text-muted-foreground min-h-[80px] w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-colors outline-none',
          // Focus is the border alone: no outer halo
          'focus-visible:border-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          'resize-none',
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
