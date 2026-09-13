import {
  parseEquipmentLine,
  formatEquipmentLine,
  HOLY_SYMBOL_PLACEHOLDER_LINE,
  MUSICAL_INSTRUMENT_PLACEHOLDER_LINE,
  splitEquipmentBySource,
  optionTextToLines,
  isEquipmentLineGP,
  getClassOptionText,
  getBackgroundOptionText,
  type CharacterFormData,
  type EquipmentSource,
} from '@rpgforce-ai/shared';

/**
 * Builds the `{ equipment, equipmentSourceByLine }` pair from the three source groups.
 *
 * The map is written by whoever changes the text, never re-derived from it: matching a line back to
 * its bundle fails on a resolved placeholder, on gold, and on an item both bundles grant.
 */
function equipmentPatchFromGroups(groups: {
  classLines: string[];
  backgroundLines: string[];
  manualLines: string[];
}): { equipment: string; equipmentSourceByLine: EquipmentSource[] } {
  const lines = [...groups.classLines, ...groups.backgroundLines, ...groups.manualLines];
  return {
    equipment: lines.join('\n'),
    equipmentSourceByLine: [
      ...groups.classLines.map(() => 'class' as const),
      ...groups.backgroundLines.map(() => 'background' as const),
      ...groups.manualLines.map(() => 'manual' as const),
    ],
  };
}

/** Applies the same index operation to the source map, so it keeps describing the text. */
function sourceMapAfterIndexOp(
  data: CharacterFormData,
  lineCount: number,
  op: (map: EquipmentSource[]) => EquipmentSource[]
): EquipmentSource[] | undefined {
  const map = data.equipmentSourceByLine;
  if (!map || map.length !== lineCount) return undefined;
  return op([...map]);
}

/**
 * One row of the saved sheet's inventory. `indices` holds every equipment line the row stands for,
 * so removing it takes them all; `index` is the single line the stepper writes to.
 */
export type InventoryRow = {
  line: string;
  index: number;
  indices: number[];
  scope: 'class' | 'background';
};

/**
 * Collapses equipment lines into one row per item.
 *
 * The saved sheet is an inventory, so an item both the class and the background granted belongs on
 * one row. Creation keeps them apart because its bundle blocks are what the reader chooses between,
 * which is why this is a view concern and the persisted entries stay keyed by source.
 *
 * A placeholder never merges: it is a pending CHOICE resolved per source, and one picker cannot
 * answer for two.
 */
export function mergeInventoryRows(
  rows: Array<{ line: string; index: number; scope: 'class' | 'background' }>
): InventoryRow[] {
  const merged: InventoryRow[] = [];
  const byName = new Map<string, InventoryRow>();
  for (const row of rows) {
    const { quantity, name } = parseEquipmentLine(row.line);
    const key = name.trim().toLowerCase();
    const isChoice =
      key === HOLY_SYMBOL_PLACEHOLDER_LINE || key === MUSICAL_INSTRUMENT_PLACEHOLDER_LINE;
    const target = isChoice ? undefined : byName.get(key);
    if (!target) {
      const fresh: InventoryRow = { ...row, indices: [row.index] };
      merged.push(fresh);
      if (!isChoice) byName.set(key, fresh);
      continue;
    }
    target.line = formatEquipmentLine(parseEquipmentLine(target.line).quantity + quantity, name);
    target.indices.push(row.index);
    // The stepper writes to the LAST contributing line, so a decrease spends the most recent grant
    // before it touches what the class gave.
    target.index = row.index;
  }
  return merged;
}

type EquipmentSpendAdjustOptions = {
  /** When false (sheet view), removals / qty decreases do not lower `equipmentSpentGP`. Default true. */
  refundSpentGP?: boolean;
};

/**
 * Removes one or more equipment lines in a single pass. The saved sheet merges the rows for one item,
 * and that row can stand for a line from each bundle, so removal has to be one operation: repeating
 * a single-index version would feed it a stale `data` and shift the indices under itself.
 */
export function removeEquipmentItems(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  indices: number[],
  options?: EquipmentSpendAdjustOptions
) {
  const refundSpentGP = options?.refundSpentGP !== false;
  const doomed = new Set(indices);
  const lines = (data.equipment ?? '')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  let equipmentSpentGP = data.equipmentSpentGP ?? 0;
  let nextPurchased = data.purchasedEquipment ?? [];
  for (const index of indices) {
    const idx = nextPurchased.findIndex((p) => p.line === lines[index]);
    if (idx < 0) continue;
    if (refundSpentGP) equipmentSpentGP = Math.max(0, equipmentSpentGP - nextPurchased[idx].costGP);
    nextPurchased = nextPurchased.filter((_, i) => i !== idx);
  }

  const nextSourceByLine = sourceMapAfterIndexOp(data, lines.length, (map) =>
    map.filter((_, i) => !doomed.has(i))
  );
  onChange({
    ...data,
    equipment: lines.filter((_, i) => !doomed.has(i)).join('\n'),
    ...(nextSourceByLine ? { equipmentSourceByLine: nextSourceByLine } : {}),
    equipmentSpentGP,
    purchasedEquipment: nextPurchased,
  });
}

export function changeEquipmentQuantity(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  index: number,
  delta: number,
  options?: EquipmentSpendAdjustOptions
) {
  const refundSpentGP = options?.refundSpentGP !== false;
  const lines = (data.equipment ?? '')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
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
  onChange({
    ...data,
    equipment: nextLines.join('\n'),
    equipmentSpentGP,
    purchasedEquipment: nextPurchased,
  });
}

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

  const rebuildLinesSingleMerged = (
    lines: string[],
    matchIndices: number[],
    newLine: string
  ): string[] => {
    if (matchIndices.length === 0) return lines;
    const minIdx = Math.min(...matchIndices);
    const matchSet = new Set(matchIndices);
    const out: string[] = [];
    let inserted = false;
    for (let i = 0; i < lines.length; i++) {
      if (matchSet.has(i)) {
        if (i === minIdx && !inserted) {
          out.push(newLine);
          inserted = true;
        }
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
      nextPurchasedEquipment = [
        ...nextPurchasedEquipment,
        { line: newLine, costGP: purchaseTotal },
      ];
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

  onChange({
    ...data,
    ...equipmentPatchFromGroups({
      classLines: nextClassLines,
      backgroundLines: nextBackgroundLines,
      manualLines: nextManualLines,
    }),
    equipmentSpentGP,
    purchasedEquipment: nextPurchasedEquipment,
  });
}

export function applyClassEquipmentChoice(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  optionIndex: number,
  optionText: string
) {
  const { backgroundLines } = splitEquipmentBySource(
    data.equipment ?? '',
    getClassOptionText(data),
    getBackgroundOptionText(data),
    data.equipmentSourceByLine
  );
  const classLines = optionTextToLines(optionText);
  onChange({
    ...data,
    ...equipmentPatchFromGroups({ classLines, backgroundLines, manualLines: [] }),
    equipmentSpentGP: 0,
    purchasedEquipment: [],
    startingEquipmentSelectedIndex: optionIndex,
  });
}

export function applyBackgroundEquipmentChoice(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  optionIndex: number,
  optionText: string
) {
  const { classLines } = splitEquipmentBySource(
    data.equipment ?? '',
    getClassOptionText(data),
    getBackgroundOptionText(data),
    data.equipmentSourceByLine
  );
  const backgroundLines = optionTextToLines(optionText);
  onChange({
    ...data,
    ...equipmentPatchFromGroups({ classLines, backgroundLines, manualLines: [] }),
    equipmentSpentGP: 0,
    purchasedEquipment: [],
    backgroundEquipmentSelectedIndex: optionIndex,
  });
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
    data.equipment ?? '',
    classText,
    getBackgroundOptionText(data),
    data.equipmentSourceByLine
  );
  onChange({
    ...data,
    ...equipmentPatchFromGroups({ classLines: [], backgroundLines, manualLines: [] }),
    equipmentSpentGP: 0,
    purchasedEquipment: [],
    startingEquipmentSelectedIndex: null,
  });
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
    data.equipment ?? '',
    getClassOptionText(data),
    backgroundText,
    data.equipmentSourceByLine
  );
  onChange({
    ...data,
    ...equipmentPatchFromGroups({ classLines, backgroundLines: [], manualLines: [] }),
    equipmentSpentGP: 0,
    purchasedEquipment: [],
    backgroundEquipmentSelectedIndex: null,
  });
}
