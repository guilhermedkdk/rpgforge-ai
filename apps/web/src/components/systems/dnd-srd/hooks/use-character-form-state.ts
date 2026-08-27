'use client';

import { useCallback, useRef, useState } from 'react';
import {
  createDefaultCharacterData,
  applyCombatFromAttributes,
  reconcileDependentSelections,
  reconcileFeatPrerequisites,
  type RuleItemResponse,
  type CharacterFormData,
} from '@rpgforce-ai/shared';
import type { SheetMode } from '../character-sheet/types';

// Fields that affect combat stats (AC, HP, initiative). Changes to any of these
// require running applyCombatFromAttributes. Text-only fields (personality, name,
// notes, etc.) are excluded so each keystroke skips the expensive recomputation.
const COMBAT_AFFECTING_KEYS: ReadonlySet<string> = new Set([
  'attributes',
  'level',
  'hitDice',
  'classRuleItemId',
  'raceRuleItemId',
  'backgroundRuleItemId',
  'featureDetails',
  'abilityScoreImprovementByGain',
  'backgroundAbilityScoreIncrease',
  'backgroundAbilityScoreOption',
  'abilityScoreMethod',
  'grapplerAbilityScore',
  'epicBoonFeatId',
  'epicBoonAbilityScore',
  'versatileFeatId',
  'currentHp',
  'raceTraitSelections',
  'equippedArmorId',
  'equippedShieldId',
  'fightingStyleByClass',
]);

/**
 * Owns the character form state shared by the creation editor and the saved-sheet page.
 *
 * There is exactly ONE write path (`handleChange` === `applyDerived`): what a saved sheet may not
 * change is decided by the sheet UI (see `character-sheet/locks.ts`), never by dropping patches here.
 * A field filter used to live in this hook, and every derived write it silently swallowed turned into
 * a front/back divergence (granted spells never landed, so "already on the sheet" checks read a
 * smaller sheet than the editor's).
 */
export const useCharacterFormState = (
  initial?: CharacterFormData | (() => CharacterFormData),
  mode: SheetMode = 'creation'
) => {
  const [data, setData] = useState<CharacterFormData>(initial ?? createDefaultCharacterData);

  // Ref keeps the latest feats list accessible inside stale setData callbacks
  // without needing to re-create handleChange whenever feats load/change.
  const featsRef = useRef<RuleItemResponse[]>([]);

  // Creation always keeps currentHp at full (a new character starts at max health); play preserves
  // the stored currentHp so damage/healing sticks. Same single write path, one flag.
  const fillCurrentHpToMax = mode === 'creation';

  /** setData wrapper that recomputes combat stats unless the updater bails with `prev`. */
  const recalc = useCallback(
    (updater: (prev: CharacterFormData) => CharacterFormData) => {
      setData((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        return applyCombatFromAttributes(next, featsRef.current, { fillCurrentHpToMax });
      });
    },
    [fillCurrentHpToMax]
  );

  const handleChange = useCallback(
    (nextData: CharacterFormData) => {
      setData((prev) => {
        // Central re-validation of selections that reference dynamic state. Feat prerequisites are
        // checked here too (not only in the guarded derivation) so an attribute edit — which never
        // re-runs the derivation — still drops a feat that no longer qualifies. Both are no-ops when
        // nothing is stale.
        const reconciled = reconcileDependentSelections(
          reconcileFeatPrerequisites(nextData, featsRef.current)
        );
        const changedKeys = (Object.keys(reconciled) as (keyof CharacterFormData)[]).filter(
          (k) => reconciled[k] !== prev[k]
        );
        if (changedKeys.length > 0 && changedKeys.every((k) => !COMBAT_AFFECTING_KEYS.has(k))) {
          return reconciled;
        }
        return applyCombatFromAttributes(reconciled, featsRef.current, { fillCurrentHpToMax });
      });
    },
    [fillCurrentHpToMax]
  );

  return { data, setData, featsRef, recalc, handleChange };
};
