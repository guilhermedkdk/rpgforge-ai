'use client';

import * as React from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import { spellChipClass, spellDetailMarkdownClass } from './spell-utils';

/** Full spell stats + description (same content as the spell picker modal body). */
export function SpellRuleItemDetailBody({
  spell,
  showNameAndTags = false,
}: {
  spell: RuleItemResponse;
  showNameAndTags?: boolean;
}) {
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
  const desc = (n.desc ?? spell.contentMd ?? '') as string;
  const higherLevel = n.higherLevel as string | undefined;
  const savingThrowAbilityRaw = (n.savingThrowAbility as string | undefined) ?? '';
  const savingThrowAbility = savingThrowAbilityRaw
    ? `${savingThrowAbilityRaw.charAt(0).toUpperCase()}${savingThrowAbilityRaw.slice(1)}`
    : '';
  const damageRoll = (n.damageRoll as string | undefined)?.trim();
  const damageTypes = (n.damageTypes as string[] | undefined) ?? [];
  const components = [verbal ? 'V' : null, somatic ? 'S' : null, material ? 'M' : null]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-2.5">
      {showNameAndTags && (
        <div className="space-y-1.5">
          <div className="text-sm font-semibold text-foreground">{spell.name}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {school && <span className={spellChipClass}>{school}</span>}
            {concentration && <span className={spellChipClass}>Concentration</span>}
            {ritual && <span className={spellChipClass}>Ritual</span>}
          </div>
        </div>
      )}

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

      {desc ? (
        <div className={spellDetailMarkdownClass}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{desc}</ReactMarkdown>
        </div>
      ) : null}
      {higherLevel && higherLevel.trim() && (
        <div className="border-t border-border/40 pt-2 text-xs">
          <span className="font-semibold text-foreground">
            Using a Higher-Level Spell Slot.{` `}
          </span>
          <span className="text-muted-foreground">{higherLevel}</span>
        </div>
      )}
    </div>
  );
}

/** Spell row + expanded body — matches Mystic Arcanum picker (`feature-detail-dialog.tsx`). */
export function MysticArcanumStyleSpellRow({
  spell,
  isExpanded,
  onToggleExpanded,
  isRowSelected,
  footer,
}: {
  spell: RuleItemResponse;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  isRowSelected: boolean;
  footer: React.ReactNode;
}) {
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
        onClick={onToggleExpanded}
        className={cn(
          'cursor-pointer flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isRowSelected && 'bg-primary/5'
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={cn(
              'text-sm font-medium',
              isRowSelected ? 'text-primary' : 'text-foreground'
            )}
          >
            {spell.name}
          </span>
          {school && <span className={spellChipClass}>{school}</span>}
          {concentration && <span className={spellChipClass}>Concentration</span>}
          {ritual && <span className={spellChipClass}>Ritual</span>}
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1.5">
          {isRowSelected ? (
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
            <div className={spellDetailMarkdownClass}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{spellDesc}</ReactMarkdown>
            </div>
          ) : null}

          {higherLevel && higherLevel.trim() ? (
            <div className="border-t border-border/40 pt-2 text-xs">
              <span className="font-semibold text-foreground">
                Using a Higher-Level Spell Slot.{` `}
              </span>
              <span className="text-muted-foreground">{higherLevel}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">{footer}</div>
        </div>
      )}
    </div>
  );
}
