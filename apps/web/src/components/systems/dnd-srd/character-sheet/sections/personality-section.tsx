'use client';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { DeferredTextarea } from '../ui/deferred-textarea';
import type { CharacterFormData } from '../types';
import { updateField } from '../helpers';

export interface PersonalitySectionProps {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
}

const textareaClassName = cn(
  'mt-1 min-h-[80px] w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground resize-none',
  'outline-none shadow-none focus:border-primary focus-visible:ring-0 focus-visible:ring-offset-0'
);

const FIELDS = [
  {
    id: 'char-personality',
    field: 'personality' as const,
    label: 'Personality Traits',
    placeholder: "Describe the character's personality...",
  },
  {
    id: 'char-ideals',
    field: 'ideals' as const,
    label: 'Ideals',
    placeholder: 'What drives the character...',
  },
  {
    id: 'char-bonds',
    field: 'bonds' as const,
    label: 'Bonds',
    placeholder: 'Important connections to people, places, or things...',
  },
  {
    id: 'char-flaws',
    field: 'flaws' as const,
    label: 'Flaws',
    placeholder: 'Character weaknesses or vices...',
  },
] as const;

export function PersonalitySection({ data, onChange }: PersonalitySectionProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      {FIELDS.map(({ id, field, label, placeholder }) => (
        <div key={field} className="flex flex-col gap-1">
          <Label
            htmlFor={id}
            className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
          >
            {label}
          </Label>
          <DeferredTextarea
            id={id}
            value={data[field]}
            onCommit={(value) => updateField(data, onChange, field, value)}
            placeholder={placeholder}
            rows={2}
            className={textareaClassName}
            aria-label={label}
            data-editable="true"
          />
        </div>
      ))}
    </div>
  );
}
