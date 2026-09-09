import { describe, it, expect } from 'vitest';
import { createDefaultCharacterData } from '../character/character-factory';
import { applyCombatFromAttributes } from './derived-character-stats';
import type { CharacterFormData } from '../character/character-form-data';
import type { RuleItemResponse } from '../../../types/ruleitem';

// Exercises the exact shared function the backend `CharacterRecomputeService` runs on save. The
// feature flags that drive max HP live in different parts of a rule item (Dwarven Toughness is a race
// TRAIT, Draconic Resilience a SUBCLASS feature, Alert a FEAT), so a backend-only heuristic would
// miss them — the whole point of porting the derivation is that server and client share this code.

const ATTRS: Record<string, number> = {
  Strength: 10,
  Dexterity: 14, // +2
  Constitution: 16, // +3
  Intelligence: 10,
  Wisdom: 10,
  Charisma: 10,
};

// level 5 d10, CON +3: 13 + 4 * (ceil(11/2) + 3) = 13 + 4 * 9 = 49
const BASE_MAX_HP = 49;

function fighter(overrides: Partial<CharacterFormData> = {}): CharacterFormData {
  return {
    ...createDefaultCharacterData(),
    hitDice: '1d10',
    level: 5,
    attributes: { ...ATTRS },
    ...overrides,
  };
}

function featItem(id: string, name: string): RuleItemResponse {
  return {
    id,
    packId: 'pack',
    kind: 'FEAT',
    source: 'test',
    sourceKey: id,
    name,
    raw: {},
    tagKeys: [],
    createdAt: '',
    updatedAt: '',
  };
}

describe('applyCombatFromAttributes (backend authoritative recompute core)', () => {
  it('computes base maxHp / AC / initiative from level, hit die and effective mods', () => {
    const r = applyCombatFromAttributes(fighter());
    expect(r.maxHp).toBe(BASE_MAX_HP);
    expect(r.armorClass).toBe('12'); // 10 + Dex(+2)
    expect(r.initiative).toBe('2'); // Dex mod
  });

  it('adds +level max HP for Dwarven Toughness (a race TRAIT, not a class feature)', () => {
    const r = applyCombatFromAttributes(
      fighter({ featureDetails: [{ name: 'Dwarven Toughness', desc: '', source: 'race' }] })
    );
    expect(r.maxHp).toBe(BASE_MAX_HP + 5);
  });

  it('adds +level max HP for Draconic Resilience (a subclass feature)', () => {
    const r = applyCombatFromAttributes(
      fighter({ featureDetails: [{ name: 'Draconic Resilience', desc: '', source: 'subclass' }] })
    );
    expect(r.maxHp).toBe(BASE_MAX_HP + 5);
  });

  it('stacks Dwarven Toughness and Draconic Resilience additively (+1 HP/level each)', () => {
    const r = applyCombatFromAttributes(
      fighter({
        featureDetails: [
          { name: 'Dwarven Toughness', desc: '', source: 'race' },
          { name: 'Draconic Resilience', desc: '', source: 'subclass' },
        ],
      })
    );
    expect(r.maxHp).toBe(BASE_MAX_HP + 10);
  });

  it('adds the proficiency bonus to initiative for the Alert feat via an ASI feat gain', () => {
    const alert = featItem('feat-alert', 'Alert');
    const r = applyCombatFromAttributes(
      fighter({ abilityScoreImprovementByGain: [{ kind: 'feat', featId: 'feat-alert' }] }),
      [alert]
    );
    expect(r.initiative).toBe('5'); // Dex(+2) + proficiency bonus at level 5 (+3)
  });

  it('clamps a stored currentHp into [0, maxHp]', () => {
    const r = applyCombatFromAttributes(fighter({ currentHp: 999 }));
    expect(r.currentHp).toBe(r.maxHp);
  });

  it('fills currentHp to maxHp with { fillCurrentHpToMax } (creation starts at full health)', () => {
    // Without the flag a fresh character (currentHp 0 from the factory) would persist as 0/maxHp.
    const created = applyCombatFromAttributes(fighter({ currentHp: 0 }), [], {
      fillCurrentHpToMax: true,
    });
    expect(created.currentHp).toBe(BASE_MAX_HP);
  });

  it('preserves the stored currentHp by default (play tracks damage)', () => {
    const damaged = applyCombatFromAttributes(fighter({ currentHp: 20 }));
    expect(damaged.currentHp).toBe(20);
  });
});
