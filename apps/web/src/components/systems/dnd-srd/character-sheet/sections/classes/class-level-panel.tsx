'use client';

import { Minus, Plus } from 'lucide-react';
import {
  MAX_CHARACTER_LEVEL,
  realClassEntries,
  setClassEntryLevel,
  totalClassLevel,
  type CharacterFormData,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { DndClassEmblem } from '../../../art/class-emblems';

// A stepper is a real DropdownMenuItem, not a button inside the menu: Radix swallows Tab inside menu
// content, so a plain button here is reachable by mouse only. As an item it joins the
// arrow-key ring and gets the menu's own focus treatment; `p-0` drops the item padding that would
// otherwise stretch the row.
const stepItemClass =
  'flex h-full w-6 shrink-0 cursor-pointer items-center justify-center rounded-none p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[disabled]:opacity-30';

interface ClassLevelPanelProps {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  classes: RuleItemResponse[];
  onManageClasses: () => void;
  /** The level field's box styling, shared with the single-class stepper it replaces. */
  className: string;
}

/**
 * The level field once the character has two or more classes: the total is then DERIVED from the
 * classes, so it is a read-out and every edit belongs to one class. `−`, `+` and the number all open
 * this one panel instead of two controls with different rules, one of which had to guess (it stepped
 * whichever class was added last, and at level 1 that silently removed the class, bypassing the
 * confirmation the Classes dialog has for exactly that). The panel stays open, so distributing
 * levels while building is one click plus one per level.
 */
export function ClassLevelPanel({
  data,
  onChange,
  classes,
  onManageClasses,
  className,
}: ClassLevelPanelProps) {
  const entries = realClassEntries(data);
  const total = totalClassLevel(entries);
  const atCap = total >= MAX_CHARACTER_LEVEL;

  if (entries.length < 2) return null;

  const slugOf = (classRuleItemId: string) =>
    classes.find((c) => c.id === classRuleItemId)?.slug ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          id="char-level"
          className={cn(className, 'cursor-pointer transition-colors hover:border-primary')}
          aria-label={`Level ${total}. Set the level of each class`}
        >
          <span className="flex w-6 shrink-0 items-center justify-center text-muted-foreground">
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span
            className="flex min-w-0 flex-1 items-center justify-center text-sm font-semibold tabular-nums text-foreground"
            aria-live="polite"
          >
            {total}
          </span>
          <span className="flex w-6 shrink-0 items-center justify-center text-muted-foreground">
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
        {/* No total in here: the trigger this panel opens from IS the total, one line above it. */}
        <ul className="space-y-1">
          {entries.map((entry) => (
            <li key={entry.classRuleItemId} className="flex items-center gap-2 px-1">
              <DndClassEmblem
                classSlug={slugOf(entry.classRuleItemId)}
                className="h-4 w-4 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1 truncate text-sm">{entry.className}</span>
              <div className="flex h-7 shrink-0 items-stretch overflow-hidden rounded-md border border-input bg-secondary/50">
                {/* preventDefault keeps the panel open, which is the point of it: distributing
                    levels is many steps, and a menu closing after each one is the old menu. */}
                <DropdownMenuItem
                  // Never reaches 0: dropping a class is destructive and lives in the Classes
                  // dialog, which confirms it and says what goes with it.
                  disabled={entry.level <= 1}
                  onSelect={(event) => {
                    event.preventDefault();
                    onChange(setClassEntryLevel(data, entry.classRuleItemId, entry.level - 1));
                  }}
                  className={stepItemClass}
                  aria-label={`Decrease ${entry.className} level`}
                >
                  <Minus className="h-3 w-3" aria-hidden />
                </DropdownMenuItem>
                <span className="flex w-7 items-center justify-center text-sm font-semibold tabular-nums">
                  {entry.level}
                </span>
                <DropdownMenuItem
                  disabled={atCap}
                  onSelect={(event) => {
                    event.preventDefault();
                    onChange(setClassEntryLevel(data, entry.classRuleItemId, entry.level + 1));
                  }}
                  className={stepItemClass}
                  aria-label={`Increase ${entry.className} level`}
                >
                  <Plus className="h-3 w-3" aria-hidden />
                </DropdownMenuItem>
              </div>
            </li>
          ))}
        </ul>
        {atCap && (
          <p className="mt-2 px-1 text-2xs leading-snug text-muted-foreground">
            Level {MAX_CHARACTER_LEVEL} is the cap: lower a class to raise another.
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onManageClasses} className="font-medium text-primary-ink">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add another class
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
