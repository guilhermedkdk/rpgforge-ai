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
 * One click writes several times: the edit lands, then reconcilers and the derivation run as
 * effects. Judging each of those writes is wrong in BOTH directions. A `−` on a class level is still
 * legal at the instant it lands (the ASI that pays for the multiclass is only pruned once the
 * derivation runs), so promoting it to "last legal state" made cancelling restore the very edit it
 * was meant to undo. Waiting for the burst to settle is imperceptible and always looks at a state
 * the player could actually see.
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
 * A multiclass requirement can only be broken on purpose.
 *
 * The add-class picker gates the moment a class is taken, but an ability can fall below 13
 * afterwards, and lowering a class level is the common way: it prunes the ASI gain that raised it.
 * Any edit that breaks a requirement therefore asks first, and confirming removes the class that can
 * no longer be paid for, so the sheet is never left in a state it refuses to save.
 *
 * It reacts to the DERIVED result instead of predicting it: the pruning lives in the shared
 * derivation, and a second copy of that rule here would be one more thing to keep in step. That also
 * makes it cover every edit (level, ASI, background bonus, a dropped feat) without knowing any of
 * them. The cost is that the edit lands before the dialog opens; cancelling restores the snapshot.
 *
 * A sheet that LOADS already illegal never opens this dialog (there is no edit to undo). That case
 * falls back to the red `identity:classes` field and the explanation on the Classes row.
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
