import {
  areStandardLanguagesComplete,
  getPendingToolProficiencyChoices,
  isBaseAbilityAllocationComplete,
  isClassSkillSelectionComplete,
  type CharacterFormData,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import type { SheetMode } from './types';

/**
 * Which creation-time allocations render locked on a saved sheet. Progression and play state (level,
 * spells, features, combat, equipment, personality) is never locked and so has no flag here.
 */
export interface SheetLocks {
  /** Mirrors `classIdentityByClass` for the initial class. */
  className: boolean;
  /** Mirrors `subclassByClass` for the initial class. */
  subclass: boolean;
  /** Per class: swapping which class this slot IS (a creation choice). Keyed by class rule item id. */
  classIdentityByClass: Record<string, boolean>;
  /** Per class: its subclass, once picked. An unpicked one stays open at that class's level 3. */
  subclassByClass: Record<string, boolean>;
  race: boolean;
  background: boolean;
  /** Base distribution + background bonus points. ASI gains stay editable (progression). */
  abilityScores: boolean;
  /** The "choose N class skills" budget. Feature-granted skills stay editable (progression). */
  skills: boolean;
  languages: boolean;
  tools: boolean;
}

const NO_LOCKS: SheetLocks = {
  className: false,
  subclass: false,
  classIdentityByClass: {},
  subclassByClass: {},
  race: false,
  background: false,
  abilityScores: false,
  skills: false,
  languages: false,
  tools: false,
};

/**
 * Locks what is already COMMITTED, never what is merely required: an allocation with nothing in it
 * stays editable so it can still be completed. That one rule covers three real cases at once — a
 * sheet saved below level 3 that reaches the subclass level, a sheet predating a validation rule, and
 * anything a new level grants — without any per-case plumbing.
 */
export const buildSheetLocks = (
  mode: SheetMode,
  data: CharacterFormData,
  ctx: { skillsList: Array<{ key: string }>; standardLanguageOptions: RuleItemResponse[] }
): SheetLocks => {
  if (mode !== 'play') return NO_LOCKS;
  const classIdentityByClass: Record<string, boolean> = {};
  const subclassByClass: Record<string, boolean> = {};
  for (const entry of data.classes ?? []) {
    if (!entry.classRuleItemId) continue;
    classIdentityByClass[entry.classRuleItemId] = true;
    subclassByClass[entry.classRuleItemId] = entry.subclassRuleItemId != null;
  }
  return {
    className: data.classRuleItemId != null,
    subclass: data.subclassRuleItemId != null,
    classIdentityByClass,
    subclassByClass,
    race: data.raceRuleItemId != null,
    background: data.backgroundRuleItemId != null || (data.background ?? '').trim() !== '',
    abilityScores: isBaseAbilityAllocationComplete(data),
    skills: isClassSkillSelectionComplete(data, ctx.skillsList),
    languages: areStandardLanguagesComplete(data, ctx.standardLanguageOptions),
    tools: getPendingToolProficiencyChoices(data).length === 0,
  };
};
