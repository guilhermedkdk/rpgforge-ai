'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Per-field red flagging after a blocked save. `isFlagged(key)` stays true only while that field is
 * unanswered, so acting on one silences it and leaves the rest on screen; the global decay timer
 * lives in `useSheetSaveFlow`.
 *
 * Keys are plain strings, one per field, prefixed by area: `identity:*`, `attributes`,
 * `skills:class`, `languages`, `tool:<segment>`, `feature:<name>`, `feat:<id>`, `equipment:*`.
 */
export interface PendingFlags {
  isFlagged: (key: string) => boolean;
  /** Marks the field as answered (called on pointerdown over its control). */
  dismiss: (key: string) => void;
}

/** Owns the per-field dismissals; a new save attempt starts from a clean slate. */
export const useSheetPendingFlags = (saveAttempted: boolean): PendingFlags => {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    setDismissed((prev) => (prev.size === 0 ? prev : new Set()));
  }, [saveAttempted]);

  const dismiss = useCallback((key: string) => {
    setDismissed((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  return useMemo(
    () => ({
      isFlagged: (key: string) => saveAttempted && !dismissed.has(key),
      dismiss,
    }),
    [saveAttempted, dismissed, dismiss]
  );
};
