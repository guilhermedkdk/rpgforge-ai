'use client';

import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SettingsSection {
  id: string;
  label: string;
  icon: LucideIcon;
}

/** The sticky header covers the top of the viewport, so it does not count as "on screen". */
const HEADER_HEIGHT = 64;

/**
 * Sticky index of the page's sections, desktop only. The active one is whichever fills most of the
 * screen, since this page is barely taller than the viewport and cheaper rules lie on it.
 *
 * A click pins its target, because two sections can scroll to the very same position and geometry
 * cannot tell them apart. Cleared on wheel/touch/keys, never on `scroll`, which the click fires.
 */
export const SettingsNav = ({ sections }: { sections: SettingsSection[] }) => {
  const [active, setActive] = useState(sections[0]?.id ?? '');
  const pinnedRef = useRef<string | null>(null);

  useEffect(() => {
    let frame = 0;

    const resolve = () => {
      frame = 0;
      const top = HEADER_HEIGHT;
      const bottom = window.innerHeight;
      let best = sections[0]?.id ?? '';
      let bestVisible = -1;
      for (const section of sections) {
        const node = document.getElementById(section.id);
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        const visible = Math.min(rect.bottom, bottom) - Math.max(rect.top, top);
        // Strictly greater, so a tie keeps the earlier section instead of flickering between them.
        if (visible > bestVisible) {
          bestVisible = visible;
          best = section.id;
        }
      }
      setActive(pinnedRef.current ?? best);
    };

    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(resolve);
    };

    // Real scroll INTENT releases the pin; the smooth scroll a click triggers must not.
    const release = () => {
      pinnedRef.current = null;
      onScroll();
    };

    resolve();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchmove', release, { passive: true });
    window.addEventListener('keydown', release);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchmove', release);
      window.removeEventListener('keydown', release);
    };
  }, [sections]);

  return (
    <nav aria-label="Seções das configurações" className="sticky top-20 flex flex-col gap-1">
      {sections.map((section) => {
        const Icon = section.icon;
        const isActive = active === section.id;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={() => {
              pinnedRef.current = section.id;
              setActive(section.id);
            }}
            aria-current={isActive ? 'true' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {section.label}
          </a>
        );
      })}
    </nav>
  );
};
