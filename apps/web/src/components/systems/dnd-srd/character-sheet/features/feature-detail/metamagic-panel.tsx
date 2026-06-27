'use client';

import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import type { FeatureDetail } from './types';
import { OptionListSelectionPanel } from './option-list-selection-panel';

interface MetamagicPanelProps {
  feat: FeatureDetail;
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
}

export function MetamagicPanel({ feat, data, onChange }: MetamagicPanelProps) {
  const options = feat.options ?? [];
  if (options.length === 0) return null;

  // Metamagic grants 2 options per gain (level 3 = 2, level 10 = 4, ...).
  const maxSelections = (feat.gainCount ?? 1) * 2;

  return (
    <OptionListSelectionPanel
      options={options}
      selectedKeys={data.metamagicOptionKeys ?? []}
      maxSelections={maxSelections}
      onSelectionChange={(next) => onChange({ ...data, metamagicOptionKeys: next })}
    />
  );
}
