import { describe, it, expect } from 'vitest';
import { createDefaultCharacterData } from '../character/character-factory';
import {
  getCharacterSheetSaveValidationErrors,
  type CharacterSheetSaveValidationContext,
} from '../validation/character-sheet-save-validation';
import { buildSpellLookupByParsedName, computeGrantedSpellPlacements } from './granted-spells';
import { mergeGrantedSpellPlacements } from './spells';
import type { CharacterFormData } from '../character/character-form-data';
import type { RuleItemResponse } from '../../../types/ruleitem';

// Granted spells are NOT persisted (`userPickedSpellsByLevel` strips them), so the server has to
// re-derive them before validating a save. When it did not, the editor and the API disagreed on how
// many spells were still pickable and a complete sheet was rejected with 400 — reproduced below with
// the real numbers of the reported case (Cleric 20 / Elf / Acolyte, whose 7 cantrip pool is fully
// consumed by 4 picks + 3 granted).

function spellItem(name: string, level: number): RuleItemResponse {
  return {
    id: `spell-${name.toLowerCase().replace(/\s+/g, '-')}`,
    packId: 'pack',
    kind: 'SPELL',
    source: 'test',
    sourceKey: name,
    name,
    normalized: { level },
    raw: {},
    tagKeys: ['spell:class:cleric'],
    createdAt: '',
    updatedAt: '',
  };
}

// The pack's full Cleric cantrip pool is exactly these 7 (verified against the ingested SRD).
const CLERIC_CANTRIPS = [
  'Guidance',
  'Light',
  'Mending',
  'Resistance',
  'Sacred Flame',
  'Spare the Dying',
  'Thaumaturgy',
];

const ALL_SPELLS: RuleItemResponse[] = [
  ...CLERIC_CANTRIPS.map((n) => spellItem(n, 0)),
  ...['Bless', 'Cure Wounds', 'Guiding Bolt', 'Healing Word'].map((n) => spellItem(n, 1)),
];

const CLERIC_CLASS: RuleItemResponse = {
  id: 'cls-cleric',
  packId: 'pack',
  kind: 'CLASS',
  source: 'test',
  sourceKey: 'cleric',
  name: 'Cleric',
  raw: {},
  tagKeys: [],
  createdAt: '',
  updatedAt: '',
};

// The pack ships a single generic "Magic Initiate" feat; the background grants it as
// "Magic Initiate (Cleric)" and the parenthetical is stripped when matching.
const MAGIC_INITIATE_FEAT: RuleItemResponse = {
  id: 'feat-magic-initiate',
  packId: 'pack',
  kind: 'FEAT',
  source: 'test',
  sourceKey: 'magic-initiate',
  name: 'Magic Initiate',
  raw: {},
  tagKeys: [],
  createdAt: '',
  updatedAt: '',
};

const CTX: CharacterSheetSaveValidationContext = {
  standardLanguageOptions: [],
  skillsList: [],
  feats: [MAGIC_INITIATE_FEAT],
  classes: [CLERIC_CLASS],
  subclasses: [],
  allSpells: ALL_SPELLS,
};

// Only the picks the player makes are persisted; everything else on level 0 is granted.
const PICKED_CANTRIPS = ['Light', 'Mending', 'Spare the Dying', 'Thaumaturgy'];

// Two Magic Initiate (Cleric) sources: the Acolyte origin feat plus one taken at an ASI.
// The second one holds a single cantrip because only one of the 7 was still free.
function clericLevel20(): CharacterFormData {
  return {
    ...createDefaultCharacterData(),
    name: 'CLERIC',
    level: 20,
    classRuleItemId: CLERIC_CLASS.id,
    featureDetails: [
      {
        name: 'Spellcasting',
        desc: '',
        source: 'class',
        tableData: [{ label: 'Cantrips', rows: [{ level: 1, value: '6' }] }],
      },
      { name: 'Magic Initiate (Cleric)', desc: '', source: 'background' },
    ],
    abilityScoreImprovementByGain: [{ kind: 'feat', featId: MAGIC_INITIATE_FEAT.id }],
    magicInitiateChoicesByGain: [
      {
        spellList: 'Cleric',
        spellcastingAbility: 'Wisdom',
        cantripNames: ['Guidance', 'Resistance'],
        spellName: 'Bless',
      },
      {
        spellList: 'Cleric',
        spellcastingAbility: 'Wisdom',
        cantripNames: ['Sacred Flame'],
        spellName: 'Cure Wounds',
      },
    ],
    spellsByLevel: { 0: PICKED_CANTRIPS.map((name) => ({ name })) },
  };
}

const lookup = buildSpellLookupByParsedName(ALL_SPELLS);

/** What the editor holds in memory: picks + every granted row merged in. */
function withGrantedSpells(data: CharacterFormData): CharacterFormData {
  return {
    ...data,
    spellsByLevel: mergeGrantedSpellPlacements(
      data.spellsByLevel,
      computeGrantedSpellPlacements(data, lookup)
    ),
  };
}

const spellErrors = (data: CharacterFormData): string[] =>
  getCharacterSheetSaveValidationErrors(data, CTX).filter(
    (e) => e.includes('truques') || e.includes('Magic Initiate')
  );

describe('computeGrantedSpellPlacements', () => {
  it('places the Magic Initiate cantrips and level-1 spell of every source', () => {
    const placements = computeGrantedSpellPlacements(clericLevel20(), lookup);
    expect(placements).toEqual([
      { name: 'Guidance', spellLevel: 0, grantSource: 'Magic Initiate' },
      { name: 'Resistance', spellLevel: 0, grantSource: 'Magic Initiate' },
      { name: 'Bless', spellLevel: 1, grantSource: 'Magic Initiate' },
      { name: 'Sacred Flame', spellLevel: 0, grantSource: 'Magic Initiate' },
      { name: 'Cure Wounds', spellLevel: 1, grantSource: 'Magic Initiate' },
    ]);
  });

  it('resolves names through markdown/table noise', () => {
    expect(lookup('**Sacred Flame**\nsome table prose')?.name).toBe('Sacred Flame');
    expect(lookup('Guidance (level 1)')?.name).toBe('Guidance');
  });
});

describe('save validation over the persisted round-trip', () => {
  it('accepts the sheet the editor considers complete', () => {
    expect(spellErrors(withGrantedSpells(clericLevel20()))).toEqual([]);
  });

  it('rejects it when granted spells are missing (the persisted shape, un-derived)', () => {
    // Exactly what the API used to validate: only the player's picks survive persistence.
    const errors = spellErrors(clericLevel20());
    expect(errors).toEqual([
      'Escolha os truques (cantrips) da classe na seção Spells (4/6).',
      'Conclua as escolhas em: “Magic Initiate”.',
    ]);
  });

  it('accepts it again once the server re-derives the granted spells', () => {
    // The server rebuilds the same working data the editor had, so both reach the same verdict.
    const restoredFromPersisted = withGrantedSpells(clericLevel20());
    expect(spellErrors(restoredFromPersisted)).toEqual(
      spellErrors(withGrantedSpells(clericLevel20()))
    );
    expect(spellErrors(restoredFromPersisted)).toEqual([]);
  });
});
