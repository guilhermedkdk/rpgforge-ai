'use client';

import * as React from 'react';
import { Textarea } from '@/components/ui/textarea';

type TextareaProps = React.ComponentProps<typeof Textarea>;

interface DeferredTextareaProps extends Omit<TextareaProps, 'value' | 'onChange'> {
  value: string;
  /** Called on blur with the final value — only when it actually changed. */
  onCommit: (value: string) => void;
}

/**
 * Keeps keystrokes in local state and commits to the parent only on blur, so typing doesn't
 * re-render the whole sheet. Use only for fields no derived stat depends on (personality/name/notes).
 */
export function DeferredTextarea({ value, onCommit, onFocus, onBlur, ...props }: DeferredTextareaProps) {
  const [local, setLocal] = React.useState(value);
  const focusedRef = React.useRef(false);

  // Resync from the source of truth when it changes externally (sheet load/reset) — never while the
  // user is editing this field, so in-progress typing is never clobbered.
  React.useEffect(() => {
    if (!focusedRef.current) setLocal(value);
  }, [value]);

  return (
    <Textarea
      {...props}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={(e) => {
        focusedRef.current = true;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        if (local !== value) onCommit(local);
        onBlur?.(e);
      }}
    />
  );
}
