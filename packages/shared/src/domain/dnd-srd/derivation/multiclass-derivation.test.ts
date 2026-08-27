import { describe, it, expect } from 'vitest';
import { getDerivedFromRuleItems } from './derived-character-stats';
import type { RuleItemResponse } from '../../../types/ruleitem';

/**
 * The orchestrator running once per class. Fixtures mirror the real ingested shape: `hitPoints`,
 * `savingThrows`, a `_core-traits` feature holding the markdown table, `features[]` with
 * `gainedAt`, and the `multiclassing` block the ingestion writes.
 *
 * The numbers here were cross-checked against the real SRD rows in the database.
 */

const classItem = (input: {
  id: string;
  name: string;
  key: string;
  die: string;
  saves: string[];
  skills: string;
  weapons: string;
  armor: string;
  features?: Array<{ name: string; gainedAt: number[] }>;
  multiclassing?: Record<string, unknown>;
}): RuleItemResponse =>
  ({
    id: input.id,
    name: input.name,
    slug: input.key,
    sourceKey: input.key,
    kind: 'CLASS',
    tagKeys: [],
    normalized: {
      key: input.key,
      hitPoints: { hitDiceName: `1${input.die} per ${input.name} level` },
      savingThrows: input.saves.map((name) => ({ name })),
      features: [
        {
          key: `${input.key}_core-traits`,
          name: `Core ${input.name} Traits`,
          featureType: 'CORE',
          desc: [
            '|||',
            '|---|---|',
            `|Primary Ability|${input.saves[0]}|`,
            `|Hit Point Die|${input.die} per ${input.name} level|`,
            `|Skill Proficiencies|${input.skills}|`,
            `|Weapon Proficiencies|${input.weapons}|`,
            `|Armor Training|${input.armor}|`,
            '|Starting Equipment|Choose A or B: (A) Gear; or (B) 50 GP|',
          ].join('\n'),
        },
        ...(input.features ?? []).map((f) => ({
          key: `${input.key}_${f.name.toLowerCase().replace(/\s+/g, '-')}`,
          name: f.name,
          featureType: 'CLASS_LEVEL_FEATURE',
          desc: `${f.name} description.`,
          gainedAt: f.gainedAt.map((level) => ({ level, detail: '' })),
        })),
      ],
      ...(input.multiclassing ? { multiclassing: input.multiclassing } : {}),
    },
  }) as unknown as RuleItemResponse;

const FIGHTER = classItem({
  id: 'fighter',
  name: 'Fighter',
  key: 'srd-2024_fighter',
  die: 'D10',
  saves: ['Strength', 'Constitution'],
  skills: 'Choose 2: Acrobatics, Athletics, History, Insight, or Survival',
  weapons: 'Simple and Martial weapons',
  armor: 'Light, Medium, and Heavy armor and Shields',
  features: [
    { name: 'Second Wind', gainedAt: [1] },
    { name: 'Fighting Style', gainedAt: [1] },
    { name: 'Extra Attack', gainedAt: [5] },
    { name: 'Ability Score Improvement', gainedAt: [4, 6, 8, 12, 14, 16] },
  ],
  multiclassing: {
    primaryAbilities: { mode: 'any', abilities: ['Strength', 'Dexterity'] },
    grants: {
      weaponProficiencies: 'Martial weapons',
      armorTraining: 'Light and Medium armor and Shields',
    },
  },
});

const WIZARD = classItem({
  id: 'wizard',
  name: 'Wizard',
  key: 'srd-2024_wizard',
  die: 'D6',
  saves: ['Intelligence', 'Wisdom'],
  skills: 'Choose 2: Arcana, History, Investigation, Medicine, or Religion',
  weapons: 'Simple weapons',
  armor: 'None',
  features: [
    { name: 'Spellcasting', gainedAt: [1] },
    { name: 'Ability Score Improvement', gainedAt: [4, 8, 12, 16] },
  ],
  multiclassing: {
    primaryAbilities: { mode: 'all', abilities: ['Intelligence'] },
    grants: {},
  },
});

const ROGUE = classItem({
  id: 'rogue',
  name: 'Rogue',
  key: 'srd-2024_rogue',
  die: 'D8',
  saves: ['Dexterity', 'Intelligence'],
  skills: 'Choose 4: Acrobatics, Athletics, Deception, Insight, or Stealth',
  weapons: 'Simple weapons',
  armor: 'Light armor',
  features: [{ name: 'Sneak Attack', gainedAt: [1] }],
  multiclassing: {
    primaryAbilities: { mode: 'all', abilities: ['Dexterity'] },
    grants: {
      armorTraining: 'Light armor',
      toolProficiencies: "Thieves' Tools",
      skillChoice: { count: 1, from: 'class-list' },
    },
  },
});

const derive = (classes: Array<{ item: RuleItemResponse; level: number }>) =>
  getDerivedFromRuleItems({
    classes: classes.map((c) => ({ classItem: c.item, subclassItem: null, level: c.level })),
    raceItem: null,
    backgroundItem: null,
    feats: [],
    allSkillOptions: [],
  });

const profLines = (proficiencies: string) => proficiencies.split('\n').filter(Boolean);

describe('getDerivedFromRuleItems: multiclass', () => {
  it('collects one hit die entry per class, in class order', () => {
    const d = derive([
      { item: FIGHTER, level: 3 },
      { item: WIZARD, level: 5 },
    ]);
    expect(d.hitDicePool).toEqual([
      { dieMax: 10, levels: 3 },
      { dieMax: 6, levels: 5 },
    ]);
    expect(d.totalLevel).toBe(8);
    // The scalar keeps the INITIAL class's notation; the pool is the full picture.
    expect(d.hitDice).toBe('1d10');
  });

  it('grants saving throws from the INITIAL class only', () => {
    const d = derive([
      { item: FIGHTER, level: 3 },
      { item: WIZARD, level: 5 },
    ]);
    const proficient = Object.entries(d.savingThrows)
      .filter(([, v]) => v)
      .map(([k]) => k);
    expect(proficient.sort()).toEqual(['Constitution', 'Strength']);

    // Reversing the order moves the saves to the other class.
    const reversed = derive([
      { item: WIZARD, level: 5 },
      { item: FIGHTER, level: 3 },
    ]);
    expect(
      Object.entries(reversed.savingThrows)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .sort(),
    ).toEqual(['Intelligence', 'Wisdom']);
  });

  it('gives the initial class its full proficiencies and later classes only their subset', () => {
    const d = derive([
      { item: WIZARD, level: 5 },
      { item: ROGUE, level: 2 },
    ]);
    // Same-label lines merge into one, so both classes' armor lands on a single "Armor Training".
    const line = (label: string) =>
      profLines(d.proficiencies).find((l) => l.startsWith(`${label}:`)) ?? '';

    expect(line('Weapon Proficiencies')).toBe('Weapon Proficiencies: Simple weapons');
    // Wizard's "None" plus the Rogue MULTICLASS grant, never the Rogue's full starting set.
    expect(line('Armor Training')).toContain('Light armor');
    expect(line('Armor Training')).not.toContain('Medium');
    expect(line('Tool Proficiencies')).toContain("Thieves' Tools");
    // The Rogue joins with ONE skill pick, not the four it grants as an initial class.
    expect(line('Skills')).toContain('Choose 1:');
    expect(line('Skills')).not.toContain('Choose 4:');
  });

  it('offers starting equipment from the initial class only', () => {
    const d = derive([
      { item: FIGHTER, level: 3 },
      { item: WIZARD, level: 5 },
    ]);
    // One bundle list, not two concatenated.
    expect(d.startingEquipmentOptions?.options).toHaveLength(2);
  });

  it('keeps a per-class skill menu so the budgets cannot be pooled', () => {
    const d = derive([
      { item: WIZARD, level: 5 },
      { item: ROGUE, level: 2 },
    ]);
    expect(d.classSkillOptions.chooseN).toBe(2); // the Wizard's own budget
    expect(d.classSkillOptionsByClass['wizard'].chooseN).toBe(2);
    expect(d.classSkillOptionsByClass['rogue'].chooseN).toBe(1); // multiclass grant
  });

  it('filters each class feature by ITS OWN level, not the character level', () => {
    // Fighter 3 / Wizard 5 = character level 8, but Extra Attack needs Fighter 5.
    const d = derive([
      { item: FIGHTER, level: 3 },
      { item: WIZARD, level: 5 },
    ]);
    const names = d.featureDetails.map((f) => f.name);
    expect(names).toContain('Second Wind');
    expect(names).not.toContain('Extra Attack');

    const fighterFive = derive([
      { item: FIGHTER, level: 5 },
      { item: WIZARD, level: 3 },
    ]);
    expect(fighterFive.featureDetails.map((f) => f.name)).toContain('Extra Attack');
  });

  it('tags every class feature with the class that granted it', () => {
    const d = derive([
      { item: FIGHTER, level: 3 },
      { item: WIZARD, level: 5 },
    ]);
    const secondWind = d.featureDetails.find((f) => f.name === 'Second Wind');
    const spellcasting = d.featureDetails.find((f) => f.name === 'Spellcasting');
    expect(secondWind?.sourceClassId).toBe('fighter');
    expect(secondWind?.sourceClassLevel).toBe(3);
    expect(spellcasting?.sourceClassId).toBe('wizard');
    expect(spellcasting?.sourceClassLevel).toBe(5);
  });

  it('keeps both classes Ability Score Improvement rows separate', () => {
    // Fighter 8 grants 3 ASIs (4/6/8); Wizard 8 grants 2 (4/8). Collapsing them loses half.
    const d = derive([
      { item: FIGHTER, level: 8 },
      { item: WIZARD, level: 8 },
    ]);
    const asi = d.featureDetails.filter((f) => f.name === 'Ability Score Improvement');
    expect(asi).toHaveLength(2);
    expect(asi.reduce((sum, f) => sum + (f.gainCount ?? 0), 0)).toBe(5);
  });

  // `applyDerivedToCharacterData` sizes the ASI array from the derived gain count. Reading only the
  // first ASI feature (`.find().gainCount`) truncated it, so the second class's gain was dropped on
  // EVERY load, manual sheets included: a Fighter 4 / Wizard 4 kept one of its two increases.
  it('keeps one ASI slot per gain across classes', async () => {
    const { applyDerivedToCharacterData } = await import('./derived-character-stats');
    const { createDefaultCharacterData } = await import('../character/character-factory');

    const derived = derive([
      { item: FIGHTER, level: 4 },
      { item: WIZARD, level: 4 },
    ]);
    const data = {
      ...createDefaultCharacterData(),
      level: 8,
      abilityScoreImprovementByGain: [
        { kind: 'increase_scores' as const, byAbility: { Strength: 2 } },
        { kind: 'increase_scores' as const, byAbility: { Intelligence: 2 } },
      ],
    };

    // One slot per gain: Fighter 4 grants one, Wizard 4 grants one. It read 1 before the fix.
    const applied = applyDerivedToCharacterData(data, derived, []);
    expect(applied.abilityScoreImprovementByGain).toHaveLength(2);

    const asiFeatures = derived.featureDetails.filter(
      (f) => f.name.trim().toLowerCase() === 'ability score improvement',
    );
    expect(asiFeatures).toHaveLength(2);
    expect(asiFeatures.reduce((sum, f) => sum + (f.gainCount ?? 0), 0)).toBe(2);
  });

  // The slots live in ONE character-wide array, so each class needs to know where its own window
  // starts. Without the offset every Ability Score Improvement panel wrote from index 0 and a
  // Fighter 4 / Wizard 4 / Cleric 4 shared a single choice between its three improvements.
  it('gives each class its own window in the by-gain array', () => {
    const d = derive([
      { item: FIGHTER, level: 8 },
      { item: WIZARD, level: 8 },
    ]);
    const asi = d.featureDetails.filter((f) => f.name === 'Ability Score Improvement');
    expect(asi.map((f) => [f.sourceClassId, f.gainSlotOffset, f.gainCount])).toEqual([
      ['fighter', 0, 3],
      ['wizard', 3, 2],
    ]);
  });

  it('reports an Ability Score Improvement as pending per class, not per character', async () => {
    const { isAbilityScoreImprovementInstanceResolved } = await import('./ability-progression');
    const derived = derive([
      { item: FIGHTER, level: 4 },
      { item: WIZARD, level: 4 },
    ]);
    const [fighterAsi, wizardAsi] = derived.featureDetails.filter(
      (f) => f.name === 'Ability Score Improvement',
    );
    // Only the Wizard's slot is filled.
    const data = {
      featureDetails: derived.featureDetails,
      abilityScoreImprovementByGain: [
        null,
        { kind: 'increase_scores' as const, byAbility: { Intelligence: 2 } },
      ],
    };
    expect(isAbilityScoreImprovementInstanceResolved(data, fighterAsi)).toBe(false);
    expect(isAbilityScoreImprovementInstanceResolved(data, wizardAsi)).toBe(true);
  });

  it('leaves a single-class derivation unchanged', () => {
    const d = derive([{ item: FIGHTER, level: 5 }]);
    expect(d.hitDicePool).toEqual([{ dieMax: 10, levels: 5 }]);
    expect(d.hitDice).toBe('1d10');
    expect(d.totalLevel).toBe(5);
    expect(
      Object.entries(d.savingThrows)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .sort(),
    ).toEqual(['Constitution', 'Strength']);
    expect(profLines(d.proficiencies)).toContain('Weapon Proficiencies: Simple and Martial weapons');
    expect(d.classSkillOptions.chooseN).toBe(2);
    expect(d.featureDetails.map((f) => f.name)).toContain('Extra Attack');
  });
});
