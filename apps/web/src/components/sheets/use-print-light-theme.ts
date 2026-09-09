'use client';

import { useEffect } from 'react';

/**
 * Prints the sheet in the LIGHT theme whatever the app is set to: on paper the dark one is a black
 * rectangle.
 *
 * Driven by the print media change so Ctrl+P behaves the same, with `beforeprint`/`afterprint` for
 * browsers that do not fire it. The server-side export renders the theme the reader asked for, so it
 * marks itself with `?export=pdf` and this hook stands down.
 */
export const PDF_EXPORT_QUERY_FLAG = 'export';
export const PDF_EXPORT_QUERY_VALUE = 'pdf';

export function usePrintLightTheme() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get(PDF_EXPORT_QUERY_FLAG) === PDF_EXPORT_QUERY_VALUE) return;

    const root = document.documentElement;
    let restore: (() => void) | null = null;

    const apply = (printing: boolean) => {
      if (printing) {
        if (restore || !root.classList.contains('dark')) return;
        const colorScheme = root.style.colorScheme;
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
        restore = () => {
          root.classList.add('dark');
          root.style.colorScheme = colorScheme;
        };
        return;
      }
      restore?.();
      restore = null;
    };

    const media = window.matchMedia('print');
    const onMediaChange = (event: MediaQueryListEvent) => apply(event.matches);
    const onBefore = () => apply(true);
    const onAfter = () => apply(false);

    media.addEventListener('change', onMediaChange);
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', onAfter);

    return () => {
      media.removeEventListener('change', onMediaChange);
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint', onAfter);
      apply(false);
    };
  }, []);
}
