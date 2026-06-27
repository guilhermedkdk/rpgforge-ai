'use client';

import * as React from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RuleItemResponse } from '@rpgforce-ai/shared';

interface SelectButtonConfig {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}

interface SpellAccordionRowProps {
  spell: RuleItemResponse;
  isExpanded: boolean;
  /** When true the row gets a primary tint and a checkmark badge. */
  isSelected?: boolean;
  onToggleExpand: (id: string) => void;
  /** When provided, a "Select spell" / "Clear selection" button is shown in the detail panel. */
  selectButton?: SelectButtonConfig;
}

/** Shared spell row used inside spell-picker panels and the spell-list view. */
export function SpellAccordionRow({
  spell,
  isExpanded,
  isSelected = false,
  onToggleExpand,
  selectButton,
}: SpellAccordionRowProps) {
  const n = (spell.normalized ?? {}) as Record<string, unknown>;
  const school = (n.school as { name?: string } | undefined)?.name;
  const castingTime = n.castingTime as string | undefined;
  const rangeText = n.rangeText as string | undefined;
  const duration = n.duration as string | undefined;
  const verbal = Boolean(n.verbal);
  const somatic = Boolean(n.somatic);
  const material = Boolean(n.material);
  const materialSpecified = n.materialSpecified as string | undefined;
  const concentration = Boolean(n.concentration);
  const ritual = Boolean(n.ritual);
  const spellDesc = (n.desc ?? spell.contentMd ?? '') as string;
  const higherLevel = n.higherLevel as string | undefined;
  const savingThrowAbility = n.savingThrowAbility as string | undefined;
  const damageRoll = (n.damageRoll as string | undefined)?.trim();
  const damageTypes = (n.damageTypes as string[] | undefined) ?? [];
  const components = [verbal ? 'V' : null, somatic ? 'S' : null, material ? 'M' : null]
    .filter(Boolean)
    .join(', ');

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggleExpand(spell.id)}
        className={cn(
          'cursor-pointer flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isSelected && 'bg-primary/5',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={cn(
              'text-sm font-medium',
              isSelected ? 'text-primary' : 'text-foreground',
            )}
          >
            {spell.name}
          </span>
          {school && (
            <span className="inline-flex items-center rounded border border-border/60 bg-muted/30 px-2 py-px text-[10px] font-medium text-muted-foreground">
              {school}
            </span>
          )}
          {concentration && (
            <span className="inline-flex items-center rounded border border-border/60 bg-muted/30 px-2 py-px text-[10px] font-medium text-muted-foreground">
              Concentration
            </span>
          )}
          {ritual && (
            <span className="inline-flex items-center rounded border border-border/60 bg-muted/30 px-2 py-px text-[10px] font-medium text-muted-foreground">
              Ritual
            </span>
          )}
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1.5">
          {isSelected && selectButton ? (
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-primary bg-primary text-primary-foreground"
              aria-hidden
            >
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
          ) : null}
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="space-y-2.5 bg-muted/10 px-4 pb-3 pt-1">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
            {castingTime && (
              <>
                <dt className="font-medium text-muted-foreground/70">Casting Time</dt>
                <dd className="capitalize text-foreground">{castingTime}</dd>
              </>
            )}
            {rangeText && (
              <>
                <dt className="font-medium text-muted-foreground/70">Range</dt>
                <dd className="text-foreground">{rangeText}</dd>
              </>
            )}
            {duration && (
              <>
                <dt className="font-medium text-muted-foreground/70">Duration</dt>
                <dd className="text-foreground">{duration}</dd>
              </>
            )}
            {components && (
              <>
                <dt className="font-medium text-muted-foreground/70">Components</dt>
                <dd className="text-foreground">
                  {components}
                  {material && materialSpecified ? ` (${materialSpecified})` : ''}
                </dd>
              </>
            )}
            {savingThrowAbility && (
              <>
                <dt className="font-medium text-muted-foreground/70">Saving Throw</dt>
                <dd className="text-foreground">{savingThrowAbility}</dd>
              </>
            )}
            {damageRoll && (
              <>
                <dt className="font-medium text-muted-foreground/70">Damage</dt>
                <dd className="text-foreground">
                  {damageRoll}
                  {damageTypes.length > 0 ? ` ${damageTypes.join(', ')}` : ''}
                </dd>
              </>
            )}
          </dl>

          {spellDesc ? (
            <div className="text-xs leading-relaxed text-muted-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{spellDesc}</ReactMarkdown>
            </div>
          ) : null}

          {higherLevel?.trim() ? (
            <div className="border-t border-border/40 pt-2 text-xs">
              <span className="font-semibold text-foreground">
                Using a Higher-Level Spell Slot.{' '}
              </span>
              <span className="text-muted-foreground">{higherLevel}</span>
            </div>
          ) : null}

          {selectButton && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectButton.onClick}
                disabled={selectButton.disabled}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs font-semibold transition-colors',
                  isSelected
                    ? 'cursor-pointer border-border bg-muted/40 text-muted-foreground hover:bg-muted/60'
                    : selectButton.disabled
                      ? 'cursor-not-allowed border-border/60 bg-muted/20 text-muted-foreground/50'
                      : 'cursor-pointer border-primary/70 bg-primary/5 text-primary hover:bg-primary/10',
                )}
              >
                {selectButton.label}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
