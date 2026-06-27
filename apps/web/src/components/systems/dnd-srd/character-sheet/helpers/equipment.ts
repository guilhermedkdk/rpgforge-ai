import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  parseEquipmentLine,
  formatEquipmentLine,
  splitEquipmentBySource,
  optionTextToLines,
  isEquipmentLineGP,
} from '@/lib/dnd-srd/equipment-utils';

export function getWeaponNamesFromEquipment(
  equipment: string | undefined,
  weaponsList: { name: string }[]
): string[] {
  const lines = (equipment ?? '').split(/\n/).map((s) => s.trim()).filter(Boolean);
  const weaponNames = new Set(weaponsList.map((w) => w.name));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const { name } = parseEquipmentLine(line);
    if (weaponNames.has(name) && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

export function getArmorItemsFromEquipment<T extends { id: string; name: string }>(
  equipment: string | undefined,
  armorsList: T[]
): T[] {
  const lines = (equipment ?? '').split(/\n/).map((s) => s.trim()).filter(Boolean);
  const armorByName = new Map(armorsList.map((a) => [a.name, a]));
  const seen = new Set<string>();
  const result: T[] = [];
  for (const line of lines) {
    const { name } = parseEquipmentLine(line);
    const armor = armorByName.get(name);
    if (armor && !seen.has(armor.id)) {
      seen.add(armor.id);
      result.push(armor);
    }
  }
  return result;
}

type EquipmentSpendAdjustOptions = {
  /** When false (sheet view), removals / qty decreases do not lower `equipmentSpentGP`. Default true. */
  refundSpentGP?: boolean;
};

export function removeEquipmentItem(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  index: number,
  options?: EquipmentSpendAdjustOptions
) {
  const refundSpentGP = options?.refundSpentGP !== false;
  const lines = (data.equipment ?? '').split(/\n/).map((s) => s.trim()).filter(Boolean);
  const line = lines[index];
  const purchasedEquipment = data.purchasedEquipment ?? [];
  const idx = purchasedEquipment.findIndex((p) => p.line === line);
  let equipmentSpentGP = data.equipmentSpentGP ?? 0;
  let nextPurchased = purchasedEquipment;
  if (idx >= 0) {
    const { costGP } = purchasedEquipment[idx];
    if (refundSpentGP) equipmentSpentGP = Math.max(0, equipmentSpentGP - costGP);
    nextPurchased = purchasedEquipment.filter((_, i) => i !== idx);
  }
  const nextLines = lines.filter((_, i) => i !== index);
  onChange({ ...data, equipment: nextLines.join('\n'), equipmentSpentGP, purchasedEquipment: nextPurchased });
}

export function changeEquipmentQuantity(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  index: number,
  delta: number,
  options?: EquipmentSpendAdjustOptions
) {
  const refundSpentGP = options?.refundSpentGP !== false;
  const lines = (data.equipment ?? '').split(/\n/).map((s) => s.trim()).filter(Boolean);
  const line = lines[index];
  const { quantity, name } = parseEquipmentLine(line);
  const newQty = quantity + delta;
  const purchasedEquipment = data.purchasedEquipment ?? [];
  const purchasedIdx = purchasedEquipment.findIndex((p) => p.line === line);
  let equipmentSpentGP = data.equipmentSpentGP ?? 0;
  let nextPurchased = purchasedEquipment;
  if (purchasedIdx >= 0) {
    const { costGP } = purchasedEquipment[purchasedIdx];
    const costPerUnit = quantity > 0 ? costGP / quantity : 0;
    if (delta < 0) {
      const refundAmount = costPerUnit * Math.min(-delta, quantity);
      if (refundSpentGP) equipmentSpentGP = Math.max(0, equipmentSpentGP - refundAmount);
      if (newQty < 1) {
        nextPurchased = purchasedEquipment.filter((_, i) => i !== purchasedIdx);
      } else {
        const newCostGP = costGP - refundAmount;
        nextPurchased = purchasedEquipment.map((p, i) =>
          i === purchasedIdx ? { line: formatEquipmentLine(newQty, name), costGP: newCostGP } : p
        );
      }
    } else if (delta > 0) {
      const chargeAmount = costPerUnit * delta;
      equipmentSpentGP += chargeAmount;
      nextPurchased = purchasedEquipment.map((p, i) =>
        i === purchasedIdx
          ? { line: formatEquipmentLine(newQty, name), costGP: costGP + chargeAmount }
          : p
      );
    }
  }
  const nextLines = [...lines];
  if (newQty < 1) nextLines.splice(index, 1);
  else nextLines[index] = formatEquipmentLine(newQty, name);
  onChange({ ...data, equipment: nextLines.join('\n'), equipmentSpentGP, purchasedEquipment: nextPurchased });
}

export const getClassOptionText = (data: CharacterFormData): string | null =>
  data.startingEquipmentSelectedIndex != null &&
  data.startingEquipmentOptions?.options?.[data.startingEquipmentSelectedIndex]
    ? data.startingEquipmentOptions.options[data.startingEquipmentSelectedIndex].text
    : null;

export const getBackgroundOptionText = (data: CharacterFormData): string | null =>
  data.backgroundEquipmentSelectedIndex != null &&
  data.backgroundEquipmentOptions?.options?.[data.backgroundEquipmentSelectedIndex]
    ? data.backgroundEquipmentOptions.options[data.backgroundEquipmentSelectedIndex].text
    : null;

export function addEquipmentItem(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  name: string,
  quantity: number,
  costGP?: number,
  totalCostGP?: number
) {
  const qty = Math.max(1, quantity);
  const nameLower = name.trim().toLowerCase();
  const { classLines, backgroundLines, manualLines } = splitEquipmentBySource(
    data.equipment ?? '',
    getClassOptionText(data),
    getBackgroundOptionText(data)
  );

  const matchIndicesForName = (lines: string[]): number[] => {
    const out: number[] = [];
    lines.forEach((l, i) => {
      if (isEquipmentLineGP(l)) return;
      const { name: lineName } = parseEquipmentLine(l);
      if (lineName.toLowerCase() === nameLower) out.push(i);
    });
    return out;
  };

  const sumQtyAtIndices = (lines: string[], indices: number[]): number =>
    indices.reduce((acc, i) => acc + parseEquipmentLine(lines[i]).quantity, 0);

  const rebuildLinesSingleMerged = (lines: string[], matchIndices: number[], newLine: string): string[] => {
    if (matchIndices.length === 0) return lines;
    const minIdx = Math.min(...matchIndices);
    const matchSet = new Set(matchIndices);
    const out: string[] = [];
    let inserted = false;
    for (let i = 0; i < lines.length; i++) {
      if (matchSet.has(i)) {
        if (i === minIdx && !inserted) { out.push(newLine); inserted = true; }
      } else {
        out.push(lines[i]);
      }
    }
    return out;
  };

  const manualMatches = matchIndicesForName(manualLines);

  const totalCost = totalCostGP !== undefined ? totalCostGP : (costGP ?? 0) * qty;
  let equipmentSpentGP = data.equipmentSpentGP ?? 0;
  let nextPurchasedEquipment = [...(data.purchasedEquipment ?? [])];

  const collectRemovedLineStrings = (lines: string[], indices: number[]): string[] =>
    indices.map((i) => lines[i]);

  const applyPurchasedAfterMerge = (removedLineStrings: string[], newLine: string) => {
    const removed = new Set(removedLineStrings);
    let absorbedSum = 0;
    for (const p of nextPurchasedEquipment) {
      if (removed.has(p.line)) absorbedSum += p.costGP;
    }
    nextPurchasedEquipment = nextPurchasedEquipment.filter((p) => !removed.has(p.line));
    const purchaseTotal = absorbedSum + totalCost;
    if (purchaseTotal > 0) {
      equipmentSpentGP += totalCost;
      nextPurchasedEquipment = [...nextPurchasedEquipment, { line: newLine, costGP: purchaseTotal }];
    }
  };

  const nextClassLines = classLines.slice();
  const nextBackgroundLines = backgroundLines.slice();
  let nextManualLines = manualLines.slice();

  if (manualMatches.length > 0) {
    const fromManual = sumQtyAtIndices(manualLines, manualMatches);
    const newQty = fromManual + qty;
    const canonicalName = parseEquipmentLine(manualLines[manualMatches[0]]).name;
    const newLine = formatEquipmentLine(newQty, canonicalName);
    const removed = collectRemovedLineStrings(manualLines, manualMatches);
    nextManualLines = rebuildLinesSingleMerged(manualLines, manualMatches, newLine);
    applyPurchasedAfterMerge(removed, newLine);
  } else {
    const line = formatEquipmentLine(qty, name);
    nextManualLines = [...manualLines, line];
    if (totalCost > 0) {
      equipmentSpentGP += totalCost;
      nextPurchasedEquipment = [...nextPurchasedEquipment, { line, costGP: totalCost }];
    }
  }

  const parts: string[] = [];
  if (nextClassLines.length) parts.push(nextClassLines.join('\n'));
  if (nextBackgroundLines.length) parts.push(nextBackgroundLines.join('\n'));
  if (nextManualLines.length) parts.push(nextManualLines.join('\n'));
  onChange({ ...data, equipment: parts.join('\n'), equipmentSpentGP, purchasedEquipment: nextPurchasedEquipment });
}

export function applyClassEquipmentChoice(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  optionIndex: number,
  optionText: string
) {
  const { backgroundLines } = splitEquipmentBySource(
    data.equipment ?? '', getClassOptionText(data), getBackgroundOptionText(data)
  );
  const classLines = optionTextToLines(optionText);
  const parts = [classLines.join('\n')];
  if (backgroundLines.length) parts.push(backgroundLines.join('\n'));
  onChange({ ...data, equipment: parts.join('\n'), equipmentSpentGP: 0, purchasedEquipment: [], startingEquipmentSelectedIndex: optionIndex });
}

export function applyBackgroundEquipmentChoice(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  optionIndex: number,
  optionText: string
) {
  const { classLines } = splitEquipmentBySource(
    data.equipment ?? '', getClassOptionText(data), getBackgroundOptionText(data)
  );
  const backgroundLines = optionTextToLines(optionText);
  const parts: string[] = [];
  if (classLines.length) parts.push(classLines.join('\n'));
  parts.push(backgroundLines.join('\n'));
  onChange({ ...data, equipment: parts.join('\n'), equipmentSpentGP: 0, purchasedEquipment: [], backgroundEquipmentSelectedIndex: optionIndex });
}

export function removeClassEquipmentSet(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void
) {
  const classText = getClassOptionText(data);
  if (!classText) {
    onChange({ ...data, startingEquipmentSelectedIndex: null });
    return;
  }
  const { backgroundLines } = splitEquipmentBySource(
    data.equipment ?? '', classText, getBackgroundOptionText(data)
  );
  const parts: string[] = [];
  if (backgroundLines.length) parts.push(backgroundLines.join('\n'));
  onChange({ ...data, equipment: parts.join('\n'), equipmentSpentGP: 0, purchasedEquipment: [], startingEquipmentSelectedIndex: null });
}

export function removeBackgroundEquipmentSet(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void
) {
  const backgroundText = getBackgroundOptionText(data);
  if (!backgroundText) {
    onChange({ ...data, backgroundEquipmentSelectedIndex: null });
    return;
  }
  const { classLines } = splitEquipmentBySource(
    data.equipment ?? '', getClassOptionText(data), backgroundText
  );
  const parts: string[] = [];
  if (classLines.length) parts.push(classLines.join('\n'));
  onChange({ ...data, equipment: parts.join('\n'), equipmentSpentGP: 0, purchasedEquipment: [], backgroundEquipmentSelectedIndex: null });
}
