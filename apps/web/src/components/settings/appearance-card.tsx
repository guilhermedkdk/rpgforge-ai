'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * The palettes the previews are painted with.
 *
 * Hardcoded, and deliberately: the theme tokens follow the theme the page is ALREADY in, so a light
 * preview inside a dark page cannot be drawn with them (the light values live on bare `:root`, which
 * a nested element has no way to re-enter). Mirrors the tokens in globals.css; a preview is a picture
 * of a palette, so the values belong in the picture.
 */
interface Palette {
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
}

const PALETTES: Record<'light' | 'dark', Palette> = {
  light: { bg: '#ffffff', card: '#f8f8fa', border: '#e5e5e5', text: '#0a0a0a', muted: '#737373' },
  dark: { bg: '#0a0a0a', card: '#171717', border: '#2b2b2b', text: '#fafafa', muted: '#a1a1a1' },
};

const ACCENT = '#eb8656';

const OPTIONS = [
  { value: 'light', label: 'Claro', icon: Sun, palette: 'light' as const },
  { value: 'dark', label: 'Escuro', icon: Moon, palette: 'dark' as const },
  { value: 'system', label: 'Do sistema', icon: Monitor, palette: 'split' as const },
] as const;

/**
 * The same setting the header's toggle changes, spelled out. The toggle only flips between two
 * states, so "acompanhar o sistema" had no way of being chosen anywhere.
 *
 * Each option shows a MINIATURE of the interface it selects instead of an icon and a word: the thing
 * being chosen is a look, and a label cannot show a look. "Do sistema" is drawn split down the
 * middle, which is what "either one, depending" looks like.
 */
export const AppearanceCard = () => {
  const { theme, setTheme } = useTheme();
  // The stored theme is only known on the client; rendering it before mount mismatches the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif">
          <Sun className="h-4 w-4 text-primary-ink" aria-hidden="true" />
          Aparência
        </CardTitle>
        <CardDescription>Vale para este navegador.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Tema">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = mounted && theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(option.value)}
                className={cn(
                  'group flex cursor-pointer flex-col gap-2 rounded-lg border p-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-primary/50'
                )}
              >
                <ThemePreview variant={option.palette} />
                <span className="flex items-center gap-2 px-1 pb-0.5">
                  <Icon
                    className={cn(
                      'h-3.5 w-3.5',
                      selected ? 'text-primary-ink' : 'text-muted-foreground'
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      'text-sm font-medium',
                      selected ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {option.label}
                  </span>
                  {selected ? (
                    <Check className="ml-auto h-3.5 w-3.5 text-primary-ink" aria-hidden="true" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

/** A miniature of the app in that theme: a top bar, a heading line and two rows of content. */
const ThemePreview = ({ variant }: { variant: 'light' | 'dark' | 'split' }) => {
  if (variant === 'split') {
    return (
      <span
        className="relative flex h-20 overflow-hidden rounded-md"
        aria-hidden="true"
        style={{ boxShadow: `inset 0 0 0 1px ${PALETTES.dark.border}` }}
      >
        {/* Two halves of the same miniature, so the split reads as one screen in two moods. */}
        <span className="w-1/2 overflow-hidden">
          <Miniature palette={PALETTES.light} wide />
        </span>
        <span className="w-1/2 overflow-hidden">
          <Miniature palette={PALETTES.dark} wide align="right" />
        </span>
      </span>
    );
  }

  return (
    <span
      className="flex h-20 overflow-hidden rounded-md"
      aria-hidden="true"
      style={{ boxShadow: `inset 0 0 0 1px ${PALETTES[variant].border}` }}
    >
      <Miniature palette={PALETTES[variant]} />
    </span>
  );
};

const Miniature = ({
  palette,
  wide = false,
  align = 'left',
}: {
  palette: Palette;
  /** Renders at double width so a half-tile still shows a whole miniature, not a sliver. */
  wide?: boolean;
  align?: 'left' | 'right';
}) => (
  <span
    className={cn('flex h-full flex-col gap-1.5 p-2', wide ? 'w-[200%]' : 'w-full')}
    style={{
      background: palette.bg,
      marginLeft: wide && align === 'right' ? '-100%' : undefined,
    }}
  >
    <span className="flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT }} />
      <span className="h-1 w-6 rounded-full" style={{ background: palette.text, opacity: 0.8 }} />
    </span>
    <span className="h-1.5 w-10 rounded-full" style={{ background: palette.text, opacity: 0.7 }} />
    <span
      className="flex flex-1 flex-col gap-1 rounded p-1.5"
      style={{ background: palette.card, boxShadow: `inset 0 0 0 1px ${palette.border}` }}
    >
      <span className="h-1 w-full rounded-full" style={{ background: palette.muted }} />
      <span className="h-1 w-2/3 rounded-full" style={{ background: palette.muted }} />
    </span>
  </span>
);
