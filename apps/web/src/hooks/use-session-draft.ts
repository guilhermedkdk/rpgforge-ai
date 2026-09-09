'use client';

import { useEffect, useRef } from 'react';
import { isHandingOffToProvider } from '@/lib/provider-handoff';
import { writeSessionDraft } from '@/lib/session-draft';

/**
 * Hands the current work to the sign-in round trip, and to nothing else.
 *
 * Written as the page goes away, the last moment the state exists, but gated on a provider button
 * having armed the handoff, so work the user chose to abandon never comes back. `pagehide` and
 * `visibilitychange` are both needed: mobile Safari can kill a backgrounded tab without an unload.
 */
export const useSessionDraft = <T>(key: string, getSnapshot: () => T | null): void => {
  const snapshotRef = useRef(getSnapshot);
  snapshotRef.current = getSnapshot;

  useEffect(() => {
    const flush = () => {
      if (!isHandingOffToProvider()) return;
      const snapshot = snapshotRef.current();
      if (snapshot === null) return;
      writeSessionDraft(key, snapshot);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibility);
      flush();
    };
  }, [key]);
};
