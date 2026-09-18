'use client';

import { useState } from 'react';
import { Shield, ListChecks, Check } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  computeSavingThrowRows,
  computeSkillRows,
  getBonusClassSkillBudgetExemptKeys,
  getClassSkillBudgets,
} from '@rpgforce-ai/shared';
import { useCharacterComputed } from '../context';
import { Section } from '../ui/section';
import {
  featureSelectionCheckboxClass,
  featureSelectionRowClass,
} from '../features/feature-detail/shared/feature-option-row';
import { toggleMulticlassClassSkill, updateClassSkillSelection } from '../helpers';
import { needsChoiceHighlight } from '../constants';
import type { CharacterFormData } from '../types';
import type { PendingFlags } from '../pending-flags';

const SKILL_BONUS_TRAIT_NAMES = new Set(['keen senses', 'skillful']);

function getSkillBonusSourceLabel(key: string, data: CharacterFormData): string | null {
  for (const [traitName, sel] of Object.entries(data.raceTraitSelections ?? {})) {
    if (SKILL_BONUS_TRAIT_NAMES.has(traitName.trim().toLowerCase()) && sel === key) {
      return `Selected by ${traitName}.`;
    }
  }
  if (data.primalKnowledgeSkillKey === key) return 'Selected by Primal Knowledge.';
  if ((data.skilledProficiencyChoices ?? []).includes('skill:' + key))
    return 'Selected by Skilled feat.';
  return null;
}

interface SavesSkillsSectionProps {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  /** Committed class-skill budget: the picker collapses to a static title. */
  locked?: boolean;
  pendingFlags: PendingFlags;
}

export function SavesSkillsSection({
  data,
  onChange,
  locked = false,
  pendingFlags,
}: SavesSkillsSectionProps) {
  const { proficiencyBonus, featureDetails, skillsList, abilitiesLoading } = useCharacterComputed();

  const [classSkillsOpen, setClassSkillsOpen] = useState(false);

  // Same shared math the PDF export renders, so a printed sheet can't disagree with this one.
  const savingThrowRows = computeSavingThrowRows({ data, featureDetails, proficiencyBonus });
  const skillRows = computeSkillRows({ data, proficiencyBonus, skillsList });

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:h-full">
      <div className="flex min-w-0 w-full items-center justify-center gap-3 rounded-lg border border-border bg-card p-3">
        <span className="text-2xl font-bold leading-none text-foreground">
          {proficiencyBonus != null ? `+${proficiencyBonus}` : ''}
        </span>
        <span className="text-3xs font-semibold uppercase tracking-widest text-muted-foreground">
          Proficiency Bonus
        </span>
      </div>

      <Section
        title="Saving Throws"
        icon={<Shield className="h-4 w-4" />}
        className="min-w-0 w-full"
      >
        <div className="space-y-2" role="list" aria-label="Saving throws">
          {savingThrowRows.map(({ attribute: attr, proficient, modifier }) => {
            const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
            return (
              <div key={attr} className="flex items-center gap-2" role="listitem">
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background text-3xs',
                    proficient
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'text-muted-foreground/50'
                  )}
                  aria-hidden
                >
                  {proficient ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
                </span>
                <span className="flex flex-1 items-center justify-between text-sm text-foreground">
                  <span>{attr}</span>
                  <span className="font-mono text-xs text-muted-foreground">{modStr}</span>
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        icon={null}
        aiHintArea="skills"
        title={(() => {
          const hasClassSelected = data.classRuleItemId != null;
          const classOptions = data.classSkillOptions ?? {
            keys: [],
            chooseN: null,
          };
          const optionKeysRaw =
            classOptions.keys.length > 0 ? classOptions.keys : skillsList.map((s) => s.key);
          const optionKeys = [...new Set(optionKeysRaw)];
          const hasClassSkillChoice = hasClassSelected && optionKeys.length > 0;
          const backgroundSkillKeys = data.backgroundSkillKeys ?? [];
          const budgetExemptKeys = getBonusClassSkillBudgetExemptKeys(data);
          const proficientMap = data.skillProficiencies ?? {};
          const chooseN = classOptions.chooseN ?? optionKeys.length;
          const selectedCount = optionKeys.filter(
            (k) =>
              proficientMap[k] && !backgroundSkillKeys.includes(k) && !budgetExemptKeys.includes(k)
          ).length;
          // Each class owes its own picks from its own list; a single flat budget cannot say that.
          const budgets = getClassSkillBudgets(data, skillsList);
          const perClass = budgets.length > 1;
          const needsClassSkillChoices = perClass
            ? budgets.some((b) => b.selectedKeys.length < b.chooseN)
            : selectedCount < chooseN;
          const skillKeyToName = new Map(skillsList.map((s) => [s.key, s.name]));
          const getSkillName = (key: string) =>
            skillKeyToName.get(key) ??
            key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          if (!hasClassSkillChoice || locked) {
            return (
              <div className="flex items-center gap-1">
                <span className="text-primary-ink">
                  <ListChecks className="h-4 w-4" />
                </span>
                <span className="inline-flex items-center font-serif text-sm font-semibold uppercase tracking-wider leading-tight text-muted-foreground rounded-md border border-transparent pt-1.5 pb-1 px-1">
                  Skills
                </span>
              </div>
            );
          }
          return (
            <div className="flex items-center gap-1">
              <span className="text-primary-ink">
                <ListChecks className="h-4 w-4" />
              </span>
              <DropdownMenu
                open={classSkillsOpen}
                onOpenChange={(open) => {
                  setClassSkillsOpen(open);
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'font-serif text-sm font-semibold uppercase tracking-wider leading-tight cursor-pointer transition-colors rounded-md border pt-1.5 pb-1 px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      needsClassSkillChoices
                        ? needsChoiceHighlight(pendingFlags.isFlagged('skills:class'))
                        : 'border-transparent bg-transparent text-muted-foreground hover:text-foreground'
                    )}
                    aria-label="Class Skills"
                    onPointerDown={() => pendingFlags.dismiss('skills:class')}
                  >
                    Skills
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  side="right"
                  className="min-w-[280px] max-w-[320px] p-0"
                  sideOffset={6}
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <div className="p-3">
                    <p className="mb-2 text-sm font-medium text-foreground">Class Skills</p>

                    {/* One budget per class: a Wizard 1 / Bard 1 owes 2 from the Wizard list AND
                        1 from anywhere, which a single merged list cannot express. */}
                    {perClass ? (
                      <TooltipProvider delayDuration={300} skipDelayDuration={0}>
                        {/* pr-2: several budgets make this list long enough to scroll, and the rows
                            run edge to edge, so without it they sit under the scrollbar. */}
                        <div className="max-h-72 space-y-3 overflow-y-auto pr-2">
                          {budgets.map((budget) => {
                            const full = budget.selectedKeys.length >= budget.chooseN;
                            return (
                              <div key={budget.classRuleItemId}>
                                <p className="mb-1.5 flex items-baseline justify-between gap-2 text-2xs">
                                  <span className="font-semibold text-foreground">
                                    {budget.className}
                                  </span>
                                  <span className="tabular-nums text-muted-foreground">
                                    {budget.selectedKeys.length}/{budget.chooseN}
                                  </span>
                                </p>
                                <ul className="space-y-1" role="list">
                                  {budget.optionKeys.map((key) => {
                                    const proficient = proficientMap[key] === true;
                                    const isBackground = backgroundSkillKeys.includes(key);
                                    const mine = budget.selectedKeys.includes(key);
                                    // Taken by another budget or granted elsewhere: not this one's.
                                    const takenElsewhere = proficient && !mine;
                                    const blocked =
                                      isBackground || takenElsewhere || (full && !mine);
                                    return (
                                      <li key={key} role="listitem">
                                        <button
                                          type="button"
                                          disabled={blocked}
                                          onClick={() =>
                                            toggleMulticlassClassSkill(data, onChange, key, !mine)
                                          }
                                          className={featureSelectionRowClass(blocked)}
                                          aria-pressed={mine}
                                          aria-label={`${mine ? 'Uncheck' : 'Check'} ${getSkillName(key)} for ${budget.className}`}
                                        >
                                          <span
                                            className={featureSelectionCheckboxClass(proficient)}
                                            aria-hidden
                                          >
                                            {proficient ? (
                                              <Check className="h-3 w-3" strokeWidth={2.5} />
                                            ) : null}
                                          </span>
                                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                                            {getSkillName(key)}
                                          </span>
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      </TooltipProvider>
                    ) : (
                      <>
                        <p className="mb-3 text-xs text-muted-foreground">
                          {chooseN != null
                            ? `Choose ${chooseN} from the list below. Those marked by the background cannot be changed.`
                            : 'Choose from the list below. Background skills are already marked.'}
                        </p>
                        <TooltipProvider delayDuration={300} skipDelayDuration={0}>
                          <ul
                            className="max-h-64 space-y-2 overflow-y-auto"
                            role="list"
                            aria-label="Skills to choose"
                          >
                            {optionKeys.map((key) => {
                              const proficient = proficientMap[key] === true;
                              const isBackground = backgroundSkillKeys.includes(key);
                              const bonusSourceLabel = !isBackground
                                ? getSkillBonusSourceLabel(key, data)
                                : null;
                              const checkbox = (
                                <span
                                  className={featureSelectionCheckboxClass(proficient)}
                                  aria-hidden
                                >
                                  {proficient ? (
                                    <Check className="h-3 w-3" strokeWidth={2.5} />
                                  ) : null}
                                </span>
                              );
                              const label = (
                                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                                  {getSkillName(key)}
                                </span>
                              );
                              if (isBackground || bonusSourceLabel) {
                                const tooltipText = isBackground
                                  ? 'Automatically selected by background.'
                                  : bonusSourceLabel!;
                                return (
                                  <Tooltip key={key}>
                                    <TooltipTrigger asChild>
                                      <li
                                        className={featureSelectionRowClass(true)}
                                        role="listitem"
                                        aria-disabled="true"
                                        aria-label={`${getSkillName(key)} (locked: ${tooltipText})`}
                                      >
                                        {checkbox}
                                        {label}
                                      </li>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="left"
                                      className="max-w-[240px] text-center"
                                    >
                                      {tooltipText}
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              }
                              const maxReached =
                                chooseN != null && selectedCount >= chooseN && !proficient;
                              return (
                                <li key={key} role="listitem">
                                  <button
                                    type="button"
                                    disabled={maxReached}
                                    onClick={() =>
                                      updateClassSkillSelection(
                                        data,
                                        onChange,
                                        key,
                                        !proficient,
                                        optionKeys,
                                        chooseN,
                                        backgroundSkillKeys
                                      )
                                    }
                                    className={featureSelectionRowClass(maxReached)}
                                    aria-label={`${proficient ? 'Uncheck' : 'Check'} ${getSkillName(key)}`}
                                    aria-pressed={proficient}
                                    aria-disabled={maxReached}
                                  >
                                    {checkbox}
                                    {label}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </TooltipProvider>
                      </>
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })()}
        className="min-w-0 w-full"
      >
        {abilitiesLoading ? (
          <LoadingState inline />
        ) : skillsList.length === 0 ? (
          <div
            className="rounded-md border border-border bg-muted/40 px-2 py-2"
            role="list"
            aria-label="Skills"
          >
            <p className="text-xs text-muted-foreground">Determined by class and background.</p>
          </div>
        ) : (
          <div className="space-y-2" role="list" aria-label="Skills">
            {skillRows.map((skill) => {
              const { proficient, expertise: hasExpertise, modifier } = skill;
              const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
              return (
                <div key={skill.key} className="flex items-center gap-2" role="listitem">
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background text-3xs',
                      hasExpertise
                        ? 'bg-primary border-primary text-primary-foreground'
                        : proficient
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'text-muted-foreground/50'
                    )}
                    aria-hidden
                  >
                    {hasExpertise ? (
                      'E'
                    ) : proficient ? (
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    ) : null}
                  </span>
                  <span className="flex flex-1 items-center justify-between text-sm text-foreground">
                    <span className="flex items-center gap-1.5">
                      <span>{skill.name}</span>
                      <span className="text-3xs uppercase text-muted-foreground">
                        ({skill.abilityKey})
                      </span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{modStr}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
