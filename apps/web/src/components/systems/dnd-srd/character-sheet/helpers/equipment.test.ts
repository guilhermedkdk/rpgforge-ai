import { describe, expect, it } from 'vitest';
import {
  formatEquipmentLine,
  HOLY_SYMBOL_PLACEHOLDER_LINE,
  MUSICAL_INSTRUMENT_PLACEHOLDER_LINE,
  parseEquipmentLine,
} from '@rpgforce-ai/shared';
import { mergeInventoryRows } from './equipment';

type Row = { line: string; index: number; scope: 'class' | 'background' };

/** Lines come from `formatEquipmentLine`, so a fixture has to be built the same way. */
const row = (
  quantity: number,
  name: string,
  index: number,
  scope: Row['scope'] = 'class'
): Row => ({ line: formatEquipmentLine(quantity, name), index, scope });

const read = (rows: ReturnType<typeof mergeInventoryRows>) =>
  rows.map((r) => {
    const { quantity, name } = parseEquipmentLine(r.line);
    return { name, quantity, indices: r.indices, index: r.index };
  });

describe('mergeInventoryRows', () => {
  it('adds up the same item granted by the class and by the background', () => {
    // A Rogue/Criminal: both bundles grant daggers and thieves' tools.
    const merged = read(
      mergeInventoryRows([
        row(2, 'Dagger', 0, 'class'),
        row(1, "Thieves' Tools", 1, 'class'),
        row(2, 'Dagger', 2, 'background'),
        row(1, "Thieves' Tools", 3, 'background'),
      ])
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ name: 'Dagger', quantity: 4, indices: [0, 2] });
    expect(merged[1]).toMatchObject({ name: "Thieves' Tools", quantity: 2, indices: [1, 3] });
  });

  it('adds a purchase onto the grant of the same item', () => {
    const merged = read(
      mergeInventoryRows([row(2, 'Pouch', 0, 'background'), row(2, 'Pouch', 1, 'class')])
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ name: 'Pouch', quantity: 4 });
  });

  it('points the stepper at the last line that granted the item', () => {
    const merged = read(mergeInventoryRows([row(1, 'Rope', 4), row(1, 'Rope', 9, 'background')]));

    // Decreasing spends the most recent grant before touching what the class gave.
    expect(merged[0].index).toBe(9);
    expect(merged[0].indices).toEqual([4, 9]);
  });

  it('keeps different items apart and preserves their order', () => {
    const merged = read(
      mergeInventoryRows([
        row(1, 'Leather Armor', 0),
        row(1, 'Shortsword', 1),
        row(1, 'Shortbow', 2),
      ])
    );

    expect(merged.map((r) => r.name)).toEqual(['Leather Armor', 'Shortsword', 'Shortbow']);
    expect(merged.every((r) => r.indices.length === 1)).toBe(true);
  });

  it('never merges a placeholder, because each one is a separate pending choice', () => {
    const merged = mergeInventoryRows([
      { line: HOLY_SYMBOL_PLACEHOLDER_LINE, index: 0, scope: 'class' },
      { line: HOLY_SYMBOL_PLACEHOLDER_LINE, index: 1, scope: 'background' },
      { line: MUSICAL_INSTRUMENT_PLACEHOLDER_LINE, index: 2, scope: 'class' },
      { line: MUSICAL_INSTRUMENT_PLACEHOLDER_LINE, index: 3, scope: 'background' },
    ]);

    expect(merged).toHaveLength(4);
    expect(merged.map((r) => r.indices)).toEqual([[0], [1], [2], [3]]);
  });

  it('matches on the name regardless of case', () => {
    const merged = read(mergeInventoryRows([row(1, 'Torch', 0), row(1, 'torch', 1)]));

    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(2);
  });
});
