'use client';

import { getCommonLanguageItem, getKnownLanguageNamesExcept, MAX_STANDARD_LANGUAGES_TOTAL, normalizeStandardLanguageNames, stripToolItemPriceSuffix, THIEVES_CANT_DISPLAY_NAME, type CharacterFormData, type RuleItemResponse } from '@rpgforce-ai/shared';
import { RequirementAlert, SelectionSection } from '../shared/selection';
import { FeatureOptionRow } from '../shared/feature-option-row';

const langNorm = (s: string) => s.trim().toLowerCase();

export function ThievesCantLanguagePickerBlock({
  data,
  onChange,
  standardLanguageOptions,
}: {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  standardLanguageOptions: RuleItemResponse[];
  variant?: 'embedded' | 'footer';
}) {
  const normalizedStandard = normalizeStandardLanguageNames(
    data.standardLanguageNames,
    standardLanguageOptions,
  );
  const standardLanguagesComplete = normalizedStandard.length >= MAX_STANDARD_LANGUAGES_TOTAL;
  const knownElsewhere = getKnownLanguageNamesExcept(data, 'thievesCant', standardLanguageOptions);
  const commonItem = getCommonLanguageItem(standardLanguageOptions);
  const restSorted = [...standardLanguageOptions]
    .filter((o) => o.id !== commonItem?.id)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const orderedLangOptions = commonItem ? [commonItem, ...restSorted] : restSorted;
  const extraRaw = data.thievesCantExtraLanguageName ?? null;
  const extraTrimmed =
    extraRaw != null && String(extraRaw).trim() !== '' ? String(extraRaw).trim() : null;

  return (
    <SelectionSection>
      {orderedLangOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No standard languages are available in this compendium.
        </p>
      ) : !standardLanguagesComplete ? (
        <RequirementAlert
          detail={
            <ul className="mt-1 list-disc pl-4 text-destructive/90">
              <li>
                Choose your standard languages in{' '}
                <span className="font-medium">Languages &amp; Proficiencies</span> before selecting
                your additional language for {THIEVES_CANT_DISPLAY_NAME} here.
              </li>
            </ul>
          }
        />
      ) : (
        <div
          className="max-h-64 space-y-2 overflow-y-auto pb-2 pr-1"
          role="list"
          aria-label={`Additional language for ${THIEVES_CANT_DISPLAY_NAME}`}
        >
          {orderedLangOptions.map((item) => {
            const displayName = stripToolItemPriceSuffix(item.name);
            const isCommon = commonItem != null && item.id === commonItem.id;
            const selected = extraTrimmed != null && langNorm(extraTrimmed) === langNorm(item.name);
            const canSelectMore = extraTrimmed == null;
            const isKnownElsewhere = knownElsewhere.has(langNorm(item.name));
            const disabled = !selected && (!canSelectMore || isCommon || isKnownElsewhere);
            return (
              <FeatureOptionRow
                key={item.id}
                selected={selected || isKnownElsewhere || isCommon}
                disabled={disabled}
                mark="check"
                onClick={() => {
                  if (disabled) return;
                  if (selected) {
                    onChange({ ...data, thievesCantExtraLanguageName: null });
                  } else {
                    onChange({ ...data, thievesCantExtraLanguageName: item.name.trim() });
                  }
                }}
              >
                <span className="truncate text-xs font-medium text-foreground">{displayName}</span>
              </FeatureOptionRow>
            );
          })}
        </div>
      )}
    </SelectionSection>
  );
}
