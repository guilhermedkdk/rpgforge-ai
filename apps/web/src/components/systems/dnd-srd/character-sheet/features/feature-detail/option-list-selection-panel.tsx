'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type FeatureDetail, markdownOptionBodyClass } from './types';
import {
  FEATURE_DETAIL_OPTION_BODY_RULE_SINGLE,
  SelectionSection,
} from './feature-detail-primitives';
import { FeatureOptionRow } from './feature-selection-row';

type FeatureDetailOption = NonNullable<FeatureDetail['options']>[number];

interface OptionListSelectionPanelProps {
  options: FeatureDetailOption[];
  selectedKeys: string[];
  /** Hard cap on how many options can be selected. */
  maxSelections: number;
  onSelectionChange: (nextKeys: string[]) => void;
  /** Per-option gate beyond the count limit (e.g. Eldritch Invocation prerequisites). */
  isOptionEnabled?: (option: FeatureDetailOption) => boolean;
  /** Show the option's prerequisite line (Eldritch Invocations). */
  showPrerequisite?: boolean;
}

/**
 * Generic "pick up to N from a list" selector for feature options (Metamagic,
 * Eldritch Invocations, and any future option-list feature). The caller owns the
 * persisted field — it passes the current keys and receives the next ones.
 */
export function OptionListSelectionPanel({
  options,
  selectedKeys,
  maxSelections,
  onSelectionChange,
  isOptionEnabled,
  showPrerequisite = false,
}: OptionListSelectionPanelProps) {
  const canSelectMore = selectedKeys.length < maxSelections;

  const toggle = (key: string, isSelected: boolean, disabled: boolean) => {
    if (disabled) return;
    if (isSelected) {
      onSelectionChange(selectedKeys.filter((k) => k !== key));
      return;
    }
    if (selectedKeys.includes(key) || selectedKeys.length >= maxSelections) return;
    onSelectionChange([...selectedKeys, key]);
  };

  return (
    <SelectionSection>
      <div className="max-h-80 space-y-2 overflow-y-auto pb-2 pr-1">
        {options.map((option) => {
          const isSelected = selectedKeys.includes(option.key);
          const prereqOk = isOptionEnabled ? isOptionEnabled(option) : true;
          const disabled = !isSelected && (!canSelectMore || !prereqOk);
          const cost = option.cost?.trim() || null;
          const prereq = option.prerequisite?.trim() || null;
          const bodyLines = option.desc?.trim() || '';
          return (
            <FeatureOptionRow
              key={option.key}
              selected={isSelected}
              disabled={disabled}
              alignTop
              mark="check"
              onClick={() => toggle(option.key, isSelected, disabled)}
            >
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground">{option.label}</span>
                {showPrerequisite && prereq ? (
                  <span className="text-xs text-muted-foreground">
                    <span className="font-medium">Prerequisite:</span> {prereq}
                  </span>
                ) : null}
                {cost ? (
                  <span className="text-xs text-muted-foreground">
                    <span className="font-medium">Cost:</span> {cost}
                  </span>
                ) : null}
                {bodyLines ? (
                  <div className={FEATURE_DETAIL_OPTION_BODY_RULE_SINGLE}>
                    <div className={markdownOptionBodyClass}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyLines}</ReactMarkdown>
                    </div>
                  </div>
                ) : null}
              </div>
            </FeatureOptionRow>
          );
        })}
      </div>
    </SelectionSection>
  );
}
