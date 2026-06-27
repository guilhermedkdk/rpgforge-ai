'use client';

import * as React from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

interface DeferredNumberInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value: number;
  /**
   * Parse/clamp the digits-only `raw`, persist it, and return the committed value. Called on blur.
   * The returned value becomes the display, so clamping shows correctly even when it leaves the data
   * unchanged (e.g. typing above the max when already at the max).
   */
  onCommit: (raw: string) => number;
}

/**
 * Numeric field that keeps keystrokes in local state and commits on blur, so typing doesn't
 * re-render the whole sheet. Use for values nothing derives from live (current/temp HP).
 */
export function DeferredNumberInput({
  value,
  onCommit,
  onFocus,
  onBlur,
  ...props
}: DeferredNumberInputProps) {
  const [local, setLocal] = React.useState(() => String(value));
  const focusedRef = React.useRef(false);

  // Resync from the source of truth when it changes externally — never while the field is focused.
  React.useEffect(() => {
    if (!focusedRef.current) setLocal(String(value));
  }, [value]);

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={local}
      onChange={(e) => setLocal(e.target.value.replace(/\D/g, ''))}
      onFocus={(e) => {
        focusedRef.current = true;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        setLocal(String(onCommit(local)));
        onBlur?.(e);
      }}
    />
  );
}
