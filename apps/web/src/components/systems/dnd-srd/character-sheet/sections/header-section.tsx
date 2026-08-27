'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronRight, Minus, Plus } from 'lucide-react';
import { AiHint } from '../ui/ai-hint';
import {
  getSheetMulticlassPrerequisiteMisses,
  isSubclassOfClass,
  realClassEntries,
  setClassEntryLevel,
  SUBCLASS_UNLOCK_LEVEL,
  isCharacterBackgroundSelected,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import { ClassesManagerDialog } from './classes/classes-manager-dialog';
import { DndClassEmblem } from '../../art/class-emblems';
import { ClassLevelPanel } from './classes/class-level-panel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { RuleItemSelect, identityTriggerClassName } from '../ui/rule-item-select';
import type { CharacterFormData } from '../types';
import type { SheetLocks } from '../locks';
import type { PendingFlags } from '../pending-flags';
import { updateField } from '../helpers';
import { requiredFieldErrorBorder } from '../constants';

const identityLabelClass =
  'text-[10px] font-semibold uppercase tracking-widest text-muted-foreground';

const levelStepButtonClass =
  'flex w-6 shrink-0 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent';

// One definition for both level fields: the single-class stepper and the multiclass panel's trigger
// occupy the same slot, so they must be indistinguishable at rest.
const levelFieldBoxClass =
  'mt-1 flex h-9 w-full items-stretch overflow-hidden rounded-md border border-border bg-secondary/50';

/** A committed identity choice: same footprint as the select it replaces, minus the control. */
function LockedIdentityField({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: string | undefined;
}) {
  return (
    <div>
      <Label htmlFor={id} className={identityLabelClass}>
        {label}
      </Label>
      <div
        id={id}
        className="mt-1 flex min-h-9 w-full items-center rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm text-foreground"
        aria-label={label}
      >
        <span className="truncate">{value?.trim() || '—'}</span>
      </div>
    </div>
  );
}

interface HeaderSectionProps {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  classes: RuleItemResponse[];
  subclasses: RuleItemResponse[];
  backgrounds: RuleItemResponse[];
  races: RuleItemResponse[];
  classesLoading: boolean;
  subclassesLoading: boolean;
  backgroundsLoading: boolean;
  racesLoading: boolean;
  locks: SheetLocks;
  pendingFlags: PendingFlags;
}

export function HeaderSection({
  data,
  onChange,
  classes,
  subclasses,
  backgrounds,
  races,
  classesLoading,
  subclassesLoading,
  backgroundsLoading,
  racesLoading,
  locks,
  pendingFlags,
}: HeaderSectionProps) {
  // Name is text-only (no derived stat reads it) — keep keystrokes local and commit on blur so
  // typing doesn't re-render the whole sheet. Never resync while focused (don't clobber typing).
  const [nameInput, setNameInput] = useState<string>(() => data.name ?? '');
  const nameFocusedRef = useRef(false);
  useEffect(() => {
    if (!nameFocusedRef.current) setNameInput(data.name ?? '');
  }, [data.name]);

  const [classesOpen, setClassesOpen] = useState(false);
  const [classesOpenOnAdd, setClassesOpenOnAdd] = useState(false);
  const openClasses = (onAdd = false) => {
    setClassesOpenOnAdd(onAdd);
    setClassesOpen(true);
  };
  const classEntries = realClassEntries(data);
  const multiclassed = classEntries.length > 1;

  // Level moves ONLY through the steppers: ±1 lands a single, always-valid level, so there is no
  // intermediate value to defer. Typing was removed because it could pass through a level (e.g. "1"
  // on the way to "12") whose derivation PRUNES every choice above it, and going back up re-derives
  // empty slots instead of restoring the picks. This steps the ONE class a single-class sheet has;
  // with 2+ the total is derived and the whole field becomes ClassLevelPanel.
  const handleLevelStep = useCallback(
    (delta: number) => {
      const target = classEntries[0];
      if (!target) return;
      onChange(setClassEntryLevel(data, target.classRuleItemId, target.level + delta));
    },
    [data, onChange, classEntries]
  );

  // Only reachable by a sheet that LOADED in a broken state: any EDIT that breaks a requirement is
  // intercepted by `useMulticlassPrerequisiteGuard`, which asks and then removes the class. So this
  // stays a plain required-field flag, never an ambient badge the player cannot clear.
  const prerequisiteMisses = useMemo(
    () => getSheetMulticlassPrerequisiteMisses(data, classes),
    [data, classes]
  );

  const levelNum = Math.max(1, Math.min(20, Math.floor(Number(data.level)) || 1));
  const nameInvalid = pendingFlags.isFlagged('identity:name') && !nameInput.trim();
  const classInvalid =
    pendingFlags.isFlagged('identity:class') &&
    data.classRuleItemId == null &&
    !(data.className ?? '').trim();
  const prerequisiteInvalid =
    prerequisiteMisses.length > 0 && pendingFlags.isFlagged('identity:classes');

  const selectedClassItem = data.classRuleItemId
    ? (classes.find((c) => c.id === data.classRuleItemId) ?? null)
    : null;
  const subclassOptions = selectedClassItem
    ? subclasses.filter((s) => isSubclassOfClass(s, selectedClassItem))
    : [];
  const subclassUnlocked = (data.level ?? 1) >= SUBCLASS_UNLOCK_LEVEL;
  const subclassInvalid =
    pendingFlags.isFlagged('identity:subclass') &&
    subclassUnlocked &&
    subclassOptions.length > 0 &&
    data.subclassRuleItemId == null;
  const raceInvalid =
    pendingFlags.isFlagged('identity:race') &&
    data.raceRuleItemId == null &&
    !(data.race ?? '').trim();
  const backgroundInvalid =
    pendingFlags.isFlagged('identity:background') && !isCharacterBackgroundSelected(data);

  return (
    <div className="relative rounded-lg border border-border bg-card p-4">
      {/* Floating corner marker, like the section cards, so every AI "!" sits in the same place. */}
      <AiHint area="identity" className="absolute -right-2 -top-2 z-10 h-6 w-6 text-[13px]" />
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="char-name" className={identityLabelClass}>
            Character Name
          </Label>
          <Input
            id="char-name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onPointerDown={() => pendingFlags.dismiss('identity:name')}
            onFocus={() => {
              nameFocusedRef.current = true;
            }}
            onBlur={(e) => {
              nameFocusedRef.current = false;
              const trimmed = e.target.value.trim();
              if (trimmed !== nameInput) setNameInput(trimmed);
              if (trimmed !== data.name) {
                updateField(data, onChange, 'name', trimmed);
              }
            }}
            placeholder="Character name"
            className={cn(
              'mt-1 border-0 border-b border-border bg-transparent text-xl font-serif font-bold text-foreground placeholder:text-muted-foreground/40 rounded-none focus-visible:border-ring',
              nameInvalid && requiredFieldErrorBorder
            )}
          />
        </div>

        {/* Classes takes the width the two old cells had: it now carries the subclass too. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.9fr)_7.25rem_minmax(0,1fr)_minmax(0,1fr)]">
          {/* ONE control whether the character has one class or four: no mode switch, so class is
              always managed in the same place. Subclass lives inside, next to the level it belongs to. */}
          <div className="min-w-0">
            <Label className={identityLabelClass}>Classes</Label>
            <button
              type="button"
              onClick={() => openClasses()}
              onPointerDown={() => {
                pendingFlags.dismiss('identity:class');
                pendingFlags.dismiss('identity:subclass');
                pendingFlags.dismiss('identity:classes');
              }}
              className={cn(
                identityTriggerClassName,
                'cursor-pointer hover:border-primary',
                (classInvalid || subclassInvalid || prerequisiteInvalid) && requiredFieldErrorBorder
              )}
              aria-label="Manage classes"
            >
              {/* The subclass rides WITH its class, so a multiclass sheet keeps them paired and the
                  control stays one line: an extra line below drifted away from what it described. */}
              {/* Each class is anchored by its own emblem, which is what separates one from the
                  next. A `·` between them did that job with punctuation the reader has to parse,
                  and it also forced `proportional-nums` on the whole label, since this font leaves
                  a lone `1` ~2px of trailing air and pushed the dot off centre (measured). A flex
                  gap is digit-independent, so that workaround left with the dot. */}
              {classEntries.length === 0 ? (
                <span className="min-w-0 flex-1 truncate text-muted-foreground">Select</span>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  {classEntries.map((entry) => (
                    <span
                      key={entry.classRuleItemId}
                      className="flex min-w-0 shrink items-center gap-1.5"
                    >
                      <DndClassEmblem
                        classSlug={
                          classes.find((c) => c.id === entry.classRuleItemId)?.slug ?? null
                        }
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                      />
                      <span className="truncate">
                        {entry.className}
                        {multiclassed && <span className="tabular-nums"> {entry.level}</span>}
                        {entry.subclass && (
                          <span className="text-muted-foreground"> ({entry.subclass})</span>
                        )}
                      </span>
                    </span>
                  ))}
                </span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </div>
          <div className="min-w-0">
            <Label htmlFor="char-level" className={identityLabelClass}>
              Level
            </Label>
            {/* With one class the field IS the level, so it steps in place. With several the total
                is only their sum: every edit belongs to a class, so the whole field opens the panel
                instead of one arrow asking and the other guessing. */}
            {multiclassed ? (
              <ClassLevelPanel
                data={data}
                onChange={onChange}
                classes={classes}
                onManageClasses={() => openClasses(true)}
                className={levelFieldBoxClass}
              />
            ) : (
              <div className={levelFieldBoxClass}>
                <button
                  type="button"
                  onClick={() => handleLevelStep(-1)}
                  disabled={levelNum <= 1}
                  className={levelStepButtonClass}
                  aria-label="Decrease level"
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden />
                </button>
                <span
                  id="char-level"
                  className="flex min-w-0 flex-1 items-center justify-center text-sm font-semibold tabular-nums text-foreground"
                  aria-label="Level"
                  aria-live="polite"
                >
                  {levelNum}
                </span>
                <button
                  type="button"
                  onClick={() => handleLevelStep(1)}
                  disabled={levelNum >= 20}
                  className={levelStepButtonClass}
                  aria-label="Increase level"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}
          </div>
          {locks.race ? (
            <LockedIdentityField id="char-race-locked" label="Species" value={data.race} />
          ) : (
            <RuleItemSelect
              id="char-race"
              label="Species"
              placeholder="Select"
              value={data.raceRuleItemId}
              items={races}
              disabled={racesLoading}
              loading={racesLoading}
              invalid={raceInvalid}
              onAcknowledge={() => pendingFlags.dismiss('identity:race')}
              onSelect={(id, item) =>
                onChange({
                  ...data,
                  raceRuleItemId: id,
                  race: item?.name ?? '',
                })
              }
              aria-label="Species"
            />
          )}
          {locks.background ? (
            <LockedIdentityField id="char-bg-locked" label="Background" value={data.background} />
          ) : (
            <RuleItemSelect
              id="char-bg"
              label="Background"
              placeholder="Select"
              value={data.backgroundRuleItemId}
              items={backgrounds}
              disabled={backgroundsLoading}
              loading={backgroundsLoading}
              invalid={backgroundInvalid}
              onAcknowledge={() => pendingFlags.dismiss('identity:background')}
              onSelect={(id, item) =>
                onChange({
                  ...data,
                  backgroundRuleItemId: id,
                  background: item?.name ?? '',
                })
              }
              aria-label="Background"
            />
          )}
        </div>
      </div>

      <ClassesManagerDialog
        open={classesOpen}
        onOpenChange={setClassesOpen}
        data={data}
        onChange={onChange}
        classes={classes}
        subclasses={subclasses}
        openOnAdd={classesOpenOnAdd}
        classesLoading={classesLoading}
        subclassesLoading={subclassesLoading}
        locks={locks}
        prerequisiteMisses={prerequisiteMisses}
      />
    </div>
  );
}
