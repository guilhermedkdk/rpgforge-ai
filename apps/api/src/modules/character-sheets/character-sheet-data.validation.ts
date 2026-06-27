import { BadRequestException } from '@nestjs/common';
import {
  persistedCharacterDataSchema,
  type PersistedCharacterData,
} from '@rpgforce-ai/shared';

/**
 * Validates the persisted sheet `data` JSON against the shared schema (v1).
 */
export function validateCharacterSheetData(
  data: Record<string, unknown>,
): PersistedCharacterData {
  const result = persistedCharacterDataSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 10)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new BadRequestException(['Invalid character sheet data', ...issues]);
  }
  return result.data;
}
