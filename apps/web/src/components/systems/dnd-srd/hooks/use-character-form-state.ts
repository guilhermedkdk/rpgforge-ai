'use client';

import { useCallback, useRef, useState } from 'react';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import { createDefaultCharacterData, type CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  applyCombatFromAttributes,
  reconcileDependentSelections,
} from '@/lib/dnd-srd/derived-character-stats';
import { reconcileFeatPrerequisites } from '@/lib/dnd-srd/feat-prerequisites';
import { SESSION_EDITABLE_FIELDS } from '@/components/systems/dnd-srd/character-sheet/constants';

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
  'fightingStyleFeatId',
]);

type CharacterFormMode = 'editor' | 'session';

/**
 * Owns the character form state shared by the editor and the session viewer.
 * `mode` decides how onChange patches are applied:
 * - 'editor': full edits, recomputing combat stats only when an affecting field changed;
 * - 'session': only SESSION_EDITABLE_FIELDS are accepted from the sheet UI.
 */
export const useCharacterFormState = (
  mode: CharacterFormMode,
  initial?: CharacterFormData | (() => CharacterFormData),
) => {
  const [data, setData] = useState<CharacterFormData>(initial ?? createDefaultCharacterData);

  // Ref keeps the latest feats list accessible inside stale setData callbacks
  // without needing to re-create handleChange whenever feats load/change.
  const featsRef = useRef<RuleItemResponse[]>([]);

  /** setData wrapper that recomputes combat stats unless the updater bails with `prev`. */
  const recalc = useCallback((updater: (prev: CharacterFormData) => CharacterFormData) => {
    setData((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      return applyCombatFromAttributes(next, featsRef.current);
    });
  }, []);

  const handleChange = useCallback(
    (nextData: CharacterFormData) => {
      if (mode === 'session') {
        setData((prev) => {
          const patch: Partial<CharacterFormData> = {};
          for (const key of SESSION_EDITABLE_FIELDS) {
            if (nextData[key] !== prev[key]) {
              (patch as Record<string, unknown>)[key] = nextData[key];
            }
          }
          const changedKeys = Object.keys(patch);
          if (changedKeys.length === 0) return prev;
          const merged = { ...prev, ...patch };
          // Text/wallet/death-save edits don't affect combat stats — skip the recompute (same result).
          if (changedKeys.every((k) => !COMBAT_AFFECTING_KEYS.has(k))) return merged;
          return applyCombatFromAttributes(merged, featsRef.current);
        });
        return;
      }
      setData((prev) => {
        // Central re-validation of selections that reference dynamic state. Feat prerequisites are
        // checked here too (not only in the guarded derivation) so an attribute edit — which never
        // re-runs the derivation — still drops a feat that no longer qualifies. Both are no-ops when
        // nothing is stale.
        const reconciled = reconcileDependentSelections(
          reconcileFeatPrerequisites(nextData, featsRef.current),
        );
        const changedKeys = (Object.keys(reconciled) as (keyof CharacterFormData)[]).filter(
          (k) => reconciled[k] !== prev[k],
        );
        if (changedKeys.length > 0 && changedKeys.every((k) => !COMBAT_AFFECTING_KEYS.has(k))) {
          return reconciled;
        }
        return applyCombatFromAttributes(reconciled, featsRef.current);
      });
    },
    [mode],
  );

  return { data, setData, featsRef, recalc, handleChange };
};
