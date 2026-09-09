'use client';

import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Repeat2, Split, Trash2, TriangleAlert } from 'lucide-react';
import {
  addClassEntry,
  getClassHitDie,
  getCharacterAbilityScores,
  getClassPrimaryAbilities,
  averageHpPerLevel,
  getFlavorDesc,
  getMulticlassPrerequisites,
  isSubclassOfClass,
  MAX_CHARACTER_LEVEL,
  MULTICLASS_PREREQUISITE_SCORE,
  realClassEntries,
  removeClassEntry,
  setClassEntryLevel,
  setClassEntrySubclass,
  SUBCLASS_UNLOCK_LEVEL,
  totalClassLevel,
  type CharacterFormData,
  type MulticlassPrerequisiteMiss,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import { RuleItemSelect } from '../../ui/rule-item-select';
import { DndClassEmblem } from '../../../art/class-emblems';
import type { SheetLocks } from '../../locks';
import {
  abilityListText,
  requirementSentence,
  requirementText,
  unmetRequirementSentence,
} from './class-requirement';
import { RequirementBadge } from './requirement-badge';

const stepButtonClass =
  'flex w-7 shrink-0 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent';

const rowActionClass =
  'flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input bg-secondary/50 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const fieldLabelClass = 'text-[10px] font-semibold uppercase tracking-widest text-muted-foreground';

/** The card's "+N HP" reads the SAME formula the HP math applies, so the two can't drift. */
const hpPerLevelFromDie = (hitDie: string): number | null => {
  const faces = Number(hitDie.replace(/^d/i, ''));
  return Number.isFinite(faces) && faces > 0 ? averageHpPerLevel(faces) : null;
};

interface ClassesManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  classes: RuleItemResponse[];
  subclasses: RuleItemResponse[];
  classesLoading: boolean;
  subclassesLoading: boolean;
  /** Scrolls straight to the class grid, for the "Another class..." entry in the level menu. */
  openOnAdd?: boolean;
  locks: SheetLocks;
  /** Classes on the sheet that stopped meeting their prerequisite (from the header, computed once). */
  prerequisiteMisses: MulticlassPrerequisiteMiss[];
}

/**
 * Every class the character has levels in: per-class level, subclass and removal, plus the grid to
 * take a new one. ONE view, not two — the grid is always present, so picking the first class and
 * adding a fifth are the same gesture in the same place.
 */
export function ClassesManagerDialog({
  open,
  onOpenChange,
  data,
  onChange,
  classes,
  subclasses,
  classesLoading,
  subclassesLoading,
  openOnAdd = false,
  locks,
  prerequisiteMisses,
}: ClassesManagerDialogProps) {
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmRemoveId(null);
    if (openOnAdd && gridEl) gridEl.scrollIntoView({ block: 'nearest' });
  }, [open, openOnAdd, gridEl]);

  const entries = realClassEntries(data);
  const total = totalClassLevel(entries);
  const remaining = MAX_CHARACTER_LEVEL - total;

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const currentClassItems = entries
    .map((e) => classById.get(e.classRuleItemId))
    .filter((c): c is RuleItemResponse => Boolean(c));

  // "A score of at least 13" means the score ON THE SHEET, so the background increase, ASI gains,
  // Epic Boon and the rest all count toward it, not just the raw array from creation.
  const abilityScores = useMemo(() => getCharacterAbilityScores(data), [data]);

  // Every class in the pack with its prerequisite resolved: the ones already taken are marked
  // rather than hidden, so the grid reads as "where can I go from here".
  const classOptions = useMemo(
    () =>
      classes
        .filter((c) => !(c.raw as { subclass_of?: unknown })?.subclass_of)
        .map((classItem) => {
          const primary = getClassPrimaryAbilities(classItem);
          return {
            classItem,
            check: getMulticlassPrerequisites({
              attributes: abilityScores,
              currentClassItems,
              newClassItem: classItem,
            }),
            hitDie: getClassHitDie(classItem),
            primary: (primary?.abilities ?? []).join(primary?.mode === 'any' ? ' or ' : ' and '),
            // The plain-language line the old class dropdown showed on hover. Someone who has never
            // played needs "what IS this class" before any number on the card means anything.
            flavor: getFlavorDesc(classItem),
            onSheet: entries.some((e) => e.classRuleItemId === classItem.id),
          };
        }),
    [classes, entries, currentClassItems, abilityScores]
  );

  // What the classes already on the sheet demand of ANY new one. A card only names a requirement
  // once it is UNMET, so for a player who meets it the rule is invisible: this states it up front.
  const currentRequirements = useMemo(
    () =>
      currentClassItems
        .map((classItem) => {
          const primary = getClassPrimaryAbilities(classItem);
          const abilities = primary?.abilities ?? [];
          const meets = (ability: string) =>
            (abilityScores[ability] ?? 0) >= MULTICLASS_PREREQUISITE_SCORE;
          return {
            className: classItem.name,
            abilityText: abilityListText(abilities, primary?.mode === 'any'),
            met: primary?.mode === 'any' ? abilities.some(meets) : abilities.every(meets),
          };
        })
        .filter((requirement) => requirement.abilityText.length > 0),
    [currentClassItems, abilityScores]
  );

  const initialClassName =
    (entries[0] && (classById.get(entries[0].classRuleItemId)?.name ?? entries[0].className)) ?? '';

  const handleAdd = (classItem: RuleItemResponse) =>
    onChange(
      addClassEntry(data, {
        classRuleItemId: classItem.id,
        className: classItem.name,
        subclassRuleItemId: null,
        subclass: '',
        level: 1,
      })
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wide enough for a 3-column class grid: 12 classes in two columns wrapped every reason. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl lg:max-w-4xl">
        <DialogTitle className="pr-8">Classes</DialogTitle>
        <DialogDescription asChild>
          <p className="text-sm text-muted-foreground">
            {entries.length === 0
              ? 'Pick the class you start with. It becomes your initial class: the only one that grants saving throws, the full starting proficiencies and the starting equipment. You can add others later to multiclass.'
              : 'Each class has its own level and subclass. Only the initial one grants saving throws, the full starting proficiencies and the starting equipment.'}
          </p>
        </DialogDescription>

        <div className="flex flex-col gap-4">
          {entries.length > 0 && (
            <div className="flex flex-col gap-2">
              {/* The rule itself is in the dialog description; each row's badge says which side of
                  it that class is on, so the section only needs its label. */}
              <p className={fieldLabelClass}>
                {entries.length === 1 ? 'Your class' : 'Your classes'}
              </p>
              {entries.map((entry, index) => {
                const classItem = classById.get(entry.classRuleItemId) ?? null;
                const subclassOptions = classItem
                  ? subclasses.filter((s) => isSubclassOfClass(s, classItem))
                  : [];
                const subclassUnlocked = entry.level >= SUBCLASS_UNLOCK_LEVEL;
                const subclassLocked = locks.subclassByClass[entry.classRuleItemId] ?? false;
                const identityLocked = locks.classIdentityByClass[entry.classRuleItemId] ?? false;
                // Matched by name because that is what the miss carries: the SRD checks both sides,
                // so the class that FAILS is the one to mark, not the one that was added last.
                const prerequisiteMiss = prerequisiteMisses.find(
                  (m) => m.className === (classItem?.name ?? entry.className)
                );

                // The warning REPLACES the row instead of stacking below it: an extra block pushed
                // every following class down and the row it referred to scrolled out of view.
                if (confirmRemoveId === entry.classRuleItemId) {
                  return (
                    <div
                      key={entry.classRuleItemId}
                      // A confirmation, not an error: the surface stays a card and the red is spent
                      // on the icon and the button that actually destroys.
                      // min-h-28 (112px) is the measured height of the class row this replaces, and
                      // it is a FLOOR: the card only swaps in without the list jumping while the
                      // content stays under it. Stacking the actions (bottom right, matching the
                      // multiclass confirmation dialog) spends 32px of button plus the gap on the
                      // vertical axis, which is the whole budget: hence gap-2 and a single sentence.
                      // Adding a second line here puts the card over 112px and the list jumps.
                      className="flex min-h-28 flex-col gap-2 rounded-md border border-destructive/35 bg-card p-3"
                    >
                      {/* Bare h-4 w-4 in a semantic colour, like every other icon on the sheet.
                          Grouped WITH the text so it aligns to the first line: as a direct child of
                          the row it floated free of the sentence it belongs to.
                          No `flex-1`: in this column it would grow VERTICALLY and stretch the gap
                          down to the actions. */}
                      <div className="flex min-w-0 items-start gap-2.5">
                        <TriangleAlert
                          className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                          aria-hidden
                        />
                        {/* Capped measure: the actions used to take the right half of the row and
                            gave the sentence its width for free. Stacked under it, the text would
                            otherwise run the full card, and this dialog is up to 896px wide. */}
                        <div className="min-w-0 max-w-2xl text-sm leading-relaxed">
                          <p>
                            Remove <strong className="font-semibold">{entry.className}</strong>? Its
                            levels and everything they granted go with it: features, spells,
                            proficiencies and any choice you made for this class.
                          </p>
                        </div>
                      </div>
                      {/* Bottom right, destructive last: same footer position as the multiclass
                          confirmation dialog, which asks the same question. */}
                      <div className="mt-auto flex shrink-0 items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmRemoveId(null)}
                        >
                          Keep it
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            onChange(removeClassEntry(data, entry.classRuleItemId));
                            setConfirmRemoveId(null);
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={entry.classRuleItemId}
                    className={cn(
                      'rounded-md border bg-card p-3',
                      prerequisiteMiss ? 'border-destructive/35' : 'border-border'
                    )}
                  >
                    <div className="mb-2.5 flex items-center gap-2">
                      {/* Which role this class plays, stated instead of implied by row order. */}
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                          index === 0
                            ? 'border-primary/45 bg-primary/10 text-primary'
                            : 'border-border bg-secondary/60 text-muted-foreground'
                        )}
                      >
                        {index === 0 ? 'Initial class' : 'Multiclass'}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {index === 0
                          ? 'saving throws, full proficiencies, starting equipment'
                          : 'reduced proficiencies, no starting equipment'}
                      </span>
                    </div>

                    <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1.1fr)_auto]">
                      <div className="min-w-0">
                        <Label className={fieldLabelClass}>Class</Label>
                        <div className="mt-1 flex h-9 items-center gap-2 rounded-md border border-input bg-secondary/50 px-3 text-sm">
                          <DndClassEmblem
                            classSlug={classItem?.slug ?? null}
                            className="h-4.5 w-4.5 shrink-0 text-muted-foreground"
                          />
                          <span className="truncate font-medium">
                            {classItem?.name ?? entry.className}
                          </span>
                        </div>
                      </div>

                      <div>
                        <Label className={fieldLabelClass}>Level</Label>
                        <div className="mt-1 flex h-9 items-stretch overflow-hidden rounded-md border border-input bg-secondary/50">
                          <button
                            type="button"
                            onClick={() =>
                              onChange(
                                setClassEntryLevel(data, entry.classRuleItemId, entry.level - 1)
                              )
                            }
                            disabled={entry.level <= 1}
                            className={stepButtonClass}
                            aria-label={`Decrease ${entry.className} level`}
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <span
                            className="flex min-w-0 flex-1 items-center justify-center text-sm font-semibold tabular-nums"
                            aria-live="polite"
                          >
                            {entry.level}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onChange(
                                setClassEntryLevel(data, entry.classRuleItemId, entry.level + 1)
                              )
                            }
                            disabled={remaining <= 0}
                            className={stepButtonClass}
                            aria-label={`Increase ${entry.className} level`}
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      </div>

                      <div className="min-w-0">
                        {subclassLocked ? (
                          <>
                            <Label className={fieldLabelClass}>Subclass</Label>
                            <div className="mt-1 flex h-9 items-center rounded-md border border-input bg-secondary/50 px-3 text-sm">
                              <span className="truncate">{entry.subclass || '·'}</span>
                            </div>
                          </>
                        ) : (
                          <RuleItemSelect
                            id={`class-subclass-${entry.classRuleItemId}`}
                            label="Subclass"
                            placeholder={
                              subclassUnlocked
                                ? 'Select'
                                : `Level ${SUBCLASS_UNLOCK_LEVEL} in this class`
                            }
                            value={entry.subclassRuleItemId}
                            items={subclassOptions}
                            disabled={
                              subclassesLoading || !subclassUnlocked || subclassOptions.length === 0
                            }
                            loading={subclassesLoading}
                            onSelect={(id, item) =>
                              onChange(
                                setClassEntrySubclass(data, entry.classRuleItemId, {
                                  subclassRuleItemId: id,
                                  subclass: item?.name ?? '',
                                })
                              )
                            }
                            aria-label={`${entry.className} subclass`}
                          />
                        )}
                      </div>

                      {/* Exactly ONE action per row. With a single class there is nothing to remove
                          — the only sensible move is swapping it — so the icon says "change"; with
                          several, removing one is a real deletion and it warns first. */}
                      <div className="flex">
                        {!identityLocked &&
                          (entries.length === 1 ? (
                            <button
                              type="button"
                              onClick={() =>
                                onChange(removeClassEntry(data, entry.classRuleItemId))
                              }
                              className={cn(rowActionClass, 'hover:border-primary')}
                              aria-label={`Change ${entry.className} for another class`}
                            >
                              <Repeat2 className="h-4 w-4" aria-hidden />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveId(entry.classRuleItemId)}
                              className={cn(
                                rowActionClass,
                                'hover:border-destructive hover:text-destructive'
                              )}
                              aria-label={`Remove ${entry.className}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          ))}
                      </div>
                    </div>

                    {prerequisiteMiss && (
                      <div className="mt-2.5 flex flex-col items-start gap-1.5 border-t border-destructive/25 pt-2.5">
                        {/* The same pill the picker states this rule in, then what to do about it:
                            as a plain red sentence, a broken requirement on the sheet read as a
                            different rule from the one the class cards enforce. */}
                        <RequirementBadge tone="unmet">
                          {unmetRequirementSentence(prerequisiteMiss)}
                        </RequirementBadge>
                        <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
                          A multiclass keeps its requirement for as long as you have it. Raise the
                          ability again (an Ability Score Improvement you lost by lowering a level
                          has to be chosen again) or remove the class. The sheet will not save
                          before that.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div ref={setGridEl} className="flex flex-col gap-2">
            {entries.length === 0 ? (
              <p className={fieldLabelClass}>Choose your class</p>
            ) : (
              // Named, framed and tinted. The grid used to sit under a bare "Add a class" label
              // with a lone sentence about 13, and nothing on screen said that taking one of those
              // cards IS multiclassing, nor what it costs.
              <div className="rounded-md border border-dashed border-primary/35 bg-primary/5 p-3">
                <div className="flex items-center gap-2">
                  <Split className="h-4 w-4 shrink-0 rotate-90 text-primary" aria-hidden />
                  <p className="text-sm font-semibold">Add another class (multiclass)</p>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Taking one of the classes below is multiclassing:{' '}
                  <span className="font-medium text-foreground">{initialClassName}</span> stays your
                  initial class and the new one starts at level 1, with its own features and
                  subclass. Your character level becomes the sum of them, and a class taken this way
                  grants reduced proficiencies and no starting equipment.
                </p>

                <div className="mt-2.5 border-t border-primary/20 pt-2.5">
                  <p className={fieldLabelClass}>What it requires</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    A score of {MULTICLASS_PREREQUISITE_SCORE} in the primary ability of the new
                    class, which every card states, and in the primary ability of the classes you
                    already have:
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {currentRequirements.map((requirement) => (
                      <li key={requirement.className}>
                        <RequirementBadge tone={requirement.met ? 'met' : 'unmet'}>
                          {requirementSentence(requirement.className, requirement.abilityText)}
                        </RequirementBadge>
                      </li>
                    ))}
                  </ul>
                  {/* Otherwise every card greys out at level 20 with no reason given. */}
                  {remaining <= 0 && (
                    <p className="mt-2 text-xs leading-relaxed text-destructive/90">
                      You are at level {MAX_CHARACTER_LEVEL}, the cap: lower a class before taking
                      another.
                    </p>
                  )}
                </div>
              </div>
            )}

            {classesLoading ? (
              <LoadingState />
            ) : (
              // auto-rows-fr: a two-line requirement must not make its neighbours shorter.
              <div className="grid auto-rows-fr gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {classOptions.map(({ classItem, check, hitDie, primary, flavor, onSheet }) => {
                  const selectable = check.ok && !onSheet && remaining > 0;
                  const miss = check.missing[0];
                  const hpPerLevel = hpPerLevelFromDie(hitDie);
                  return (
                    <button
                      key={classItem.id}
                      type="button"
                      disabled={!selectable}
                      onClick={() => handleAdd(classItem)}
                      className={cn(
                        // Neutral at rest: highlighting every selectable class made the grid shout.
                        // What is NOT selectable says so in its own line, which is signal enough.
                        'flex flex-col items-stretch gap-2 rounded-md border border-border bg-card p-3 text-left transition-colors',
                        selectable
                          ? 'cursor-pointer hover:border-primary/60 hover:bg-muted'
                          : 'cursor-not-allowed opacity-70'
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <DndClassEmblem
                          classSlug={classItem.slug ?? null}
                          className="h-5 w-5 shrink-0 text-muted-foreground"
                        />
                        <span className="truncate text-sm font-semibold">{classItem.name}</span>
                      </span>

                      {flavor && (
                        <span className="line-clamp-3 text-[11.5px] leading-snug text-muted-foreground">
                          {flavor}
                        </span>
                      )}

                      {/* Labelled rows: "d8 · Charisma" alone reads as jargon with no anchor. */}
                      <span className="flex flex-col gap-1 text-[11.5px]">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-muted-foreground">Primary ability</span>
                          <span className="text-right font-medium">{primary || '·'}</span>
                        </span>
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-muted-foreground">Health per level</span>
                          <span className="text-right font-medium tabular-nums">
                            {hpPerLevel ? `+${hpPerLevel} HP` : '·'}
                            {hitDie && (
                              <span className="ml-1 font-normal text-muted-foreground">
                                ({hitDie})
                              </span>
                            )}
                          </span>
                        </span>
                      </span>

                      {/* Same pill as the requirements above, on its own line: the state used to
                          share the name's line, which forced STR/DEX abbreviations to fit and made
                          the same rule look like two. `mt-auto` pins it to the bottom, so a card
                          with a shorter flavour text does not float its badge mid-air. */}
                      {(onSheet || miss) && (
                        <RequirementBadge tone={onSheet ? 'neutral' : 'unmet'} className="mt-auto">
                          {onSheet ? 'On your sheet' : requirementText(miss!, classItem.name)}
                        </RequirementBadge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
