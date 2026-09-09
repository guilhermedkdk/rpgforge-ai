'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSheetMulticlassPrerequisiteMisses,
  planMulticlassPrerequisiteRemovals,
  realClassEntries,
  removeClassEntry,
  type CharacterFormData,
  type MulticlassPrerequisiteMiss,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';

/**
 * How long the sheet must sit unchanged before the combination is judged.
 *
 * One click writes several times: the edit, then reconcilers and the derivation. A level decrement is
 * still legal at the instant it lands, so judging each write made cancelling restore the very edit it
 * was meant to undo.
 */
const SETTLE_MS = 80;

/** One class about to leave the sheet, carrying what the dialog needs to show it. */
export interface MulticlassRemoval {
  classRuleItemId: string;
  className: string;
  level: number;
  /** Pack slug, for the class emblem. */
  slug: string | null;
}

/** The pending decision: what broke, and which classes leave if the player confirms. */
export interface MulticlassPrerequisiteBreach {
  miss: MulticlassPrerequisiteMiss;
  /** True when the class that fails is the initial one, which cannot itself be dropped. */
  failingClassIsInitial: boolean;
  removals: MulticlassRemoval[];
}

export interface MulticlassPrerequisiteGuard {
  breach: MulticlassPrerequisiteBreach | null;
  /** Apply the edit and drop the classes it invalidated. */
  confirm: () => void;
  /** Undo the edit: the sheet goes back to the last state that met every requirement. */
  cancel: () => void;
}

/**
 * A multiclass requirement can only be broken on purpose: any edit that breaks one asks first, and
 * confirming removes the class that can no longer be paid for.
 *
 * It reacts to the DERIVED result instead of predicting it, so it covers every edit without knowing
 * any of them; the cost is that the edit lands before the dialog opens, and cancelling restores the
 * snapshot. A sheet that LOADS already illegal never opens this dialog, since there is no edit to
 * undo.
 */
export function useMulticlassPrerequisiteGuard(input: {
  data: CharacterFormData;
  classes: RuleItemResponse[];
  onChange: (data: CharacterFormData) => void;
}): MulticlassPrerequisiteGuard {
  const { data, classes, onChange } = input;

  // The last SETTLED state that met every requirement, which is what cancelling restores. Null until
  // the sheet has been legal once, so a sheet loaded in a broken state is left alone.
  const lastLegalRef = useRef<CharacterFormData | null>(null);
  const [breach, setBreach] = useState<MulticlassPrerequisiteBreach | null>(null);
  const breachRef = useRef(breach);
  breachRef.current = breach;

  useEffect(() => {
    if (classes.length === 0) return;
    const timer = setTimeout(() => {
      const misses = getSheetMulticlassPrerequisiteMisses(data, classes);
      if (misses.length === 0) {
        lastLegalRef.current = data;
        if (breachRef.current) setBreach(null);
        return;
      }
      // Already asking, or the sheet arrived broken: nothing to confirm either way.
      if (breachRef.current || lastLegalRef.current == null) return;

      const initialEntry = realClassEntries(data)[0];
      const initialName = classes.find((c) => c.id === initialEntry?.classRuleItemId)?.name;
      setBreach({
        miss: misses[0],
        failingClassIsInitial: misses[0].className === initialName,
        removals: planMulticlassPrerequisiteRemovals(data, classes).map((entry) => ({
          classRuleItemId: entry.classRuleItemId,
          className: entry.className,
          level: entry.level,
          slug: classes.find((c) => c.id === entry.classRuleItemId)?.slug ?? null,
        })),
      });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [data, classes]);

  const confirm = useCallback(() => {
    const pending = breachRef.current;
    setBreach(null);
    if (!pending) return;
    onChange(
      pending.removals.reduce((acc, entry) => removeClassEntry(acc, entry.classRuleItemId), data)
    );
  }, [data, onChange]);

  const cancel = useCallback(() => {
    const restore = lastLegalRef.current;
    setBreach(null);
    if (restore) onChange(restore);
  }, [onChange]);

  return { breach, confirm, cancel };
}
