import { describe, it, expect } from 'vitest';
import { createDefaultCharacterData } from '../character/character-factory';
import {
  getCharacterSheetSaveValidationErrors,
  type CharacterSheetSaveValidationContext,
} from './character-sheet-save-validation';

// The SAME function the editor gates "Salvar" on and the backend rejects incomplete saves with.
const EMPTY_CTX: CharacterSheetSaveValidationContext = {
  standardLanguageOptions: [],
  skillsList: [],
  feats: [],
  classes: [],
  subclasses: [],
};

describe('getCharacterSheetSaveValidationErrors', () => {
  it('flags a blank character (name, class, species, background all missing)', () => {
    const errors = getCharacterSheetSaveValidationErrors(createDefaultCharacterData(), EMPTY_CTX);
    expect(errors).toContain('Informe o nome do personagem.');
    expect(errors.some((e) => e.includes('classe'))).toBe(true);
    expect(errors.some((e) => e.includes('espécie') || e.includes('species'))).toBe(true);
    expect(errors.some((e) => e.includes('antecedente'))).toBe(true);
  });

  it('clears the name error once a name is set', () => {
    const withName = { ...createDefaultCharacterData(), name: 'Aria' };
    const errors = getCharacterSheetSaveValidationErrors(withName, EMPTY_CTX);
    expect(errors).not.toContain('Informe o nome do personagem.');
  });
});
