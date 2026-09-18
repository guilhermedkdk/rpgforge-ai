'use client';

import type { ReactNode } from 'react';
import { Globe, Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * How loud a chip is. `neutral` is the resting state (saved, private): a read-out nobody has to act
 * on must not compete with the sheet. `primary` marks the notable state, `attention` the one the
 * player still owes something to.
 */
type ChipTone = 'neutral' | 'primary' | 'attention';

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: 'border-border bg-muted/50 text-muted-foreground',
  primary: 'border-primary/40 bg-primary/10 text-primary-ink',
  attention: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

/**
 * The sheet header's read-out chip. One shape for every state it reports, so "publicada" and
 * "não salvo" read as the same kind of information instead of two unrelated mechanisms.
 */
export const SheetChip = ({
  tone = 'neutral',
  icon,
  children,
  title,
}: {
  tone?: ChipTone;
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
}) => (
  <span
    title={title}
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
      TONE_CLASS[tone]
    )}
  >
    {icon}
    {children}
  </span>
);

/**
 * Whether the sheet is published, and the control that changes it: the chip reports the setting, so
 * it is where someone reaches for it. Without `onToggle` it stays a read-out.
 *
 * The tooltip names the action before the click, since this is one click from public to private.
 */
export const SheetVisibilityChip = ({
  isPublic,
  onToggle,
  busy = false,
}: {
  isPublic: boolean;
  onToggle?: () => void;
  busy?: boolean;
}) => {
  const chip = isPublic ? (
    <SheetChip tone="primary" icon={<Globe className="h-3 w-3" aria-hidden="true" />}>
      Pública
    </SheetChip>
  ) : (
    <SheetChip icon={<Lock className="h-3 w-3" aria-hidden="true" />} title="Só você vê esta ficha">
      Privada
    </SheetChip>
  );

  if (!onToggle) return chip;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          aria-label={isPublic ? 'Tornar esta ficha privada' : 'Publicar esta ficha'}
          className="cursor-pointer rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {chip}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isPublic ? 'Clique para tornar privada' : 'Clique para publicar'}
      </TooltipContent>
    </Tooltip>
  );
};
