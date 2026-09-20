'use client';

import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Shows or hides the AI's hint markers across a SAVED sheet the wizard produced. It is the only
 * thing that dismisses them, so a justification read months ago can still be read again. The
 * wizard's review has no eye: there the markers simply stay up until the sheet is saved.
 */
export const AiNotesToggle = ({
  visible,
  loading = false,
  onToggle,
}: {
  visible: boolean;
  loading?: boolean;
  onToggle: () => void;
}) => {
  const label = visible ? 'Ocultar os comentários da IA' : 'Mostrar os comentários da IA';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={visible}
          onClick={onToggle}
          className={cn(visible && 'bg-primary/10 text-primary-ink hover:bg-primary/15')}
        >
          {loading ? (
            <Spinner size="sm" />
          ) : visible ? (
            <Eye className="h-4 w-4" aria-hidden="true" />
          ) : (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
};
