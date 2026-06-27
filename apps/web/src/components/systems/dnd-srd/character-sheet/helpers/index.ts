import type * as React from 'react';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';

export * from './armor';
export * from './equipment';
export * from './language';
export * from './proficiency';
export * from './skills';
export * from './weapons';

export function updateField<K extends keyof CharacterFormData>(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  key: K,
  value: CharacterFormData[K]
) {
  onChange({ ...data, [key]: value });
}

export function updateAttribute(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  attr: string,
  value: number
) {
  const prev = data.attributes?.[attr];
  const hasBackgroundBonuses =
    data.backgroundAbilityScoreIncrease != null &&
    Object.values(data.backgroundAbilityScoreIncrease).some((v) => (v ?? 0) > 0);
  onChange({
    ...data,
    attributes: { ...data.attributes, [attr]: value },
    ...(prev !== value && hasBackgroundBonuses ? { backgroundAbilityScoreIncrease: {} } : {}),
  });
}

export function getTextContent(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node == null) return '';
  if (Array.isArray(node)) return node.map(getTextContent).join('');
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const n = node as { props?: { children?: React.ReactNode } };
    return getTextContent(n.props?.children ?? '');
  }
  return '';
}
