'use client';

import { SelectionSection } from './feature-detail-primitives';
import { FeatureOptionRow } from './feature-selection-row';

type SkillChoiceFromListBlockProps =
  | {
      selectionMode?: 'single';
      entries: Array<{ key: string; label: string }>;
      selectedKey: string | null;
      proficientMap: Record<string, boolean>;
      backgroundSkillKeys: string[];
      /** `null` = deselect current option (same gesture as Expertise). */
      onPick: (key: string | null) => void;
      /** When `e`, selected row shows E in the box (expertise). Default: check icon. */
      mark?: 'check' | 'e';
      /** Render the list only, without the `SelectionSection` divider/spacing wrapper. */
      bare?: boolean;
    }
  | {
      selectionMode: 'multi';
      entries: Array<{ key: string; label: string }>;
      selectedIds: string[];
      /** Skills/tools already proficient — row disabled, not counted toward maxSelections. */
      lockedIds?: string[];
      maxSelections: number;
      onChangeIds: (ids: string[]) => void;
      /** Render the list only, without the `SelectionSection` divider/spacing wrapper. */
      bare?: boolean;
    };

/**
 * Reusable skill / option list — same row + left checkbox pattern as class skills
 * in `abilities/saves-skills-column.tsx`.
 */
export function SkillChoiceFromListBlock(props: SkillChoiceFromListBlockProps) {
  const { entries } = props;
  if (entries.length === 0) return null;

  const isMulti = props.selectionMode === 'multi';
  const listAriaLabel = isMulti ? 'Choose options' : 'Choose one option';

  const list = (
    <div
      className="max-h-64 space-y-2 overflow-y-auto pb-2 pr-1"
      role="list"
      aria-label={listAriaLabel}
    >
        {entries.map(({ key, label }) => {
          if (isMulti) {
            const lockedSet = new Set(props.lockedIds ?? []);
            const isLocked = lockedSet.has(key);
            const isChosen = props.selectedIds.includes(key);
            const atCap =
              props.maxSelections > 0 && props.selectedIds.length >= props.maxSelections;
            const disabled = isLocked || (!isChosen && atCap);
            return (
              <FeatureOptionRow
                key={key}
                selected={isChosen || isLocked}
                disabled={disabled}
                mark="check"
                onClick={() => {
                  if (disabled) return;
                  if (isChosen) {
                    props.onChangeIds(props.selectedIds.filter((id) => id !== key));
                    return;
                  }
                  props.onChangeIds([...props.selectedIds, key]);
                }}
              >
                <span className="truncate text-xs font-medium text-foreground">{label}</span>
              </FeatureOptionRow>
            );
          }

          const { selectedKey, proficientMap, backgroundSkillKeys, onPick, mark = 'check' } = props;
          const alreadyProficient =
            proficientMap[key] === true || backgroundSkillKeys.includes(key);
          const isSelected = selectedKey === key;
          const atCap = selectedKey !== null;
          const disabled = !isSelected && (alreadyProficient || atCap);
          return (
            <FeatureOptionRow
              key={key}
              selected={isSelected || alreadyProficient}
              disabled={disabled}
              mark={mark}
              onClick={() => {
                if (disabled) return;
                if (isSelected) {
                  onPick(null);
                  return;
                }
                onPick(key);
              }}
            >
              <span className="truncate text-xs font-medium text-foreground">{label}</span>
            </FeatureOptionRow>
          );
        })}
    </div>
  );

  if (props.bare) return list;
  return <SelectionSection>{list}</SelectionSection>;
}
