import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  applyCombatFromAttributes,
  applyDerivedToCharacterData,
  buildEquipmentRestorePatch,
  buildSpellLookupByParsedName,
  computeGrantedSpellPlacements,
  getCharacterSheetSaveValidationErrors,
  getDerivedFromRuleItems,
  getSkillsFromAbilities,
  mergeCharacterFormDataFromApi,
  mergeGrantedSpellPlacements,
  seedToolProficiencyChoicesFromPersisted,
  STANDARD_LANGUAGE_TAG,
  TOOL_CATEGORY_TAGS,
  type CharacterFormData,
  type CharacterSheetSaveValidationContext,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import { PrismaService } from '../../shared/prisma.service';
import { mapToRuleItemResponse } from '../ruleitems/ruleitems.service';
import { asId, RULE_ITEM_INCLUDE } from './rule-item-loading';

/**
 * Server-side guard on every save: runs the same shared read-path the web runs on load, validates
 * completeness with the same function the editor gates "Salvar" on, and recomputes the deterministic
 * combat block authoritatively, so combat can never diverge from the rules.
 *
 * Infra failures never block a save and fall back to the client data, still Zod-validated. Only a
 * genuine validation error rejects, with 400.
 */
@Injectable()
export class CharacterRecomputeService {
  private readonly logger = new Logger(CharacterRecomputeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rebuilds `data.equipment` (the TEXT) from the persisted `{ id, quantity }` items, with the same
   * shared restore the editor runs on load.
   *
   * Schema v1 persists only the structured list, so without this the server validates a sheet whose
   * equipment text is empty and every rule reading it is silently dead. Same trap as granted spells:
   * a field the editor fills at runtime and does not persist has to be rebuilt here too.
   */
  private async withEquipmentText(form: CharacterFormData): Promise<CharacterFormData> {
    const entries = form.equipmentPersistedItems ?? [];
    const ids = entries.map((e) => e.id).filter((id): id is string => Boolean(id));
    const nameById = new Map<string, string>();
    if (ids.length > 0) {
      const rows = await this.prisma.ruleItem.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      for (const row of rows) nameById.set(row.id, row.name);
    }
    const patch = buildEquipmentRestorePatch(form, (id) => nameById.get(id), {
      gold: form.equipmentGold ?? 0,
      goldBySource: form.equipmentGoldBySource,
      // The bundle choice is already committed in the persisted sheet; clearing it reads back as
      // "nothing chosen" and would reject the save it is meant to validate.
      preserveSelectionIndexes: true,
    });
    return patch ? { ...form, ...patch } : form;
  }

  private async deriveWorkingAndContext(
    packId: string,
    data: Record<string, unknown>,
    schemaVersion: number
  ): Promise<{
    working: CharacterFormData;
    feats: RuleItemResponse[];
    ctx: CharacterSheetSaveValidationContext;
  }> {
    const identity = (data.identity ?? {}) as Record<string, unknown>;
    const raceId = asId(identity.raceRuleItemId);
    const backgroundId = asId(identity.backgroundRuleItemId);
    const byIdWanted = [raceId, backgroundId].filter((x): x is string => x !== null);

    const [
      classRows,
      subclassRows,
      featRows,
      abilityRows,
      languageRows,
      toolRows,
      byIdRows,
      spellRows,
    ] = await Promise.all([
      this.prisma.ruleItem.findMany({
        where: { packId, kind: 'CLASS' },
        include: RULE_ITEM_INCLUDE,
      }),
      this.prisma.ruleItem.findMany({
        where: { packId, kind: 'SUBCLASS' },
        include: RULE_ITEM_INCLUDE,
      }),
      this.prisma.ruleItem.findMany({
        where: { packId, kind: 'FEAT' },
        include: RULE_ITEM_INCLUDE,
      }),
      this.prisma.ruleItem.findMany({
        where: { packId, kind: 'ABILITY' },
        include: RULE_ITEM_INCLUDE,
      }),
      this.prisma.ruleItem.findMany({
        where: {
          packId,
          kind: 'OTHER',
          tags: { some: { tag: { key: STANDARD_LANGUAGE_TAG } } },
        },
        include: RULE_ITEM_INCLUDE,
      }),
      this.prisma.ruleItem.findMany({
        where: { packId, tags: { some: { tag: { key: { in: TOOL_CATEGORY_TAGS } } } } },
        include: RULE_ITEM_INCLUDE,
      }),
      byIdWanted.length > 0
        ? this.prisma.ruleItem.findMany({
            where: { id: { in: byIdWanted } },
            include: RULE_ITEM_INCLUDE,
          })
        : Promise.resolve([]),
      // Full spell catalog: lets save-validation cap each "pick N spells" requirement at what the
      // pool actually offers, matching the editor (which passes the same list).
      this.prisma.ruleItem.findMany({
        where: { packId, kind: 'SPELL' },
        include: RULE_ITEM_INCLUDE,
      }),
    ]);

    const classes = classRows.map(mapToRuleItemResponse);
    const subclasses = subclassRows.map(mapToRuleItemResponse);
    const feats = featRows.map(mapToRuleItemResponse);
    const abilities = abilityRows.map(mapToRuleItemResponse);
    const standardLanguageOptions = languageRows.map(mapToRuleItemResponse);
    const byId = new Map<string, RuleItemResponse>(
      byIdRows.map((row) => [row.id, mapToRuleItemResponse(row)])
    );

    // Group tool items by category tag, mirroring the editor's toolItemsByCategory, so the shared
    // seeding can redistribute the persisted flat tools back into their "Choose N" slots.
    const toolItemsByCategory: Record<string, RuleItemResponse[]> = {};
    for (const row of toolRows) {
      const item = mapToRuleItemResponse(row);
      for (const tag of TOOL_CATEGORY_TAGS) {
        if (item.tagKeys.includes(tag)) (toolItemsByCategory[tag] ??= []).push(item);
      }
    }

    const raceItem = raceId ? (byId.get(raceId) ?? null) : null;
    const backgroundItem = backgroundId ? (byId.get(backgroundId) ?? null) : null;

    const skills = getSkillsFromAbilities(abilities);
    const allSkillOptions = skills.map((s) => ({ key: s.key, label: s.name }));
    const skillsList = skills.map((s) => ({ key: s.key, name: s.name }));

    const form = await this.withEquipmentText(mergeCharacterFormDataFromApi(data, schemaVersion));
    // Every class the sheet carries, in order; `classes[0]` is the initial class. Legacy sheets
    // yield a single entry synthesized from the singular identity fields.
    const classEntries = (form.classes ?? [])
      .map((entry) => ({
        classItem: classes.find((c) => c.id === entry.classRuleItemId) ?? null,
        subclassItem: entry.subclassRuleItemId
          ? (subclasses.find((s) => s.id === entry.subclassRuleItemId) ?? null)
          : null,
        level: entry.level,
      }))
      .filter((entry) => entry.classItem !== null);
    const derived = getDerivedFromRuleItems({
      classes: classEntries,
      raceItem,
      backgroundItem,
      feats,
      allSkillOptions,
    });
    const derivedForm = applyDerivedToCharacterData(form, derived, feats);
    // Redistribute the persisted flat tool proficiencies back into their "Choose N" slots — the SAME
    // seeding the editor runs on load — so a filled tool slot isn't seen as empty at save time.
    const seededPatch = seedToolProficiencyChoicesFromPersisted(derivedForm, toolItemsByCategory);
    const seeded = seededPatch ? { ...derivedForm, ...seededPatch } : derivedForm;

    // Auto-granted spells are never persisted (only the player's own picks are), so re-derive them
    // with the SAME shared function the editor's spells section runs. Without this the sheet the
    // server validates is missing every granted row, which inflates "how many can still be picked"
    // (cantrips, Magic Initiate) and rejects sheets the editor considers complete.
    const allSpells = spellRows.map(mapToRuleItemResponse);
    const working: CharacterFormData = {
      ...seeded,
      spellsByLevel: mergeGrantedSpellPlacements(
        seeded.spellsByLevel,
        computeGrantedSpellPlacements(
          seeded,
          buildSpellLookupByParsedName(allSpells),
          allSpells.length > 0
        )
      ),
    };

    const ctx: CharacterSheetSaveValidationContext = {
      standardLanguageOptions,
      skillsList,
      feats,
      classes,
      subclasses,
      allSpells,
    };
    return { working, feats, ctx };
  }

  /**
   * Validates the sheet (throws 400 when incomplete/illegal) and returns `data` with the deterministic
   * combat block overwritten. Infra failures fall back to the client-provided data (never block a save).
   */
  async validateAndRecompute(
    packId: string,
    data: Record<string, unknown>,
    schemaVersion: number
  ): Promise<Record<string, unknown>> {
    let derived: {
      working: CharacterFormData;
      feats: RuleItemResponse[];
      ctx: CharacterSheetSaveValidationContext;
    };
    try {
      derived = await this.deriveWorkingAndContext(packId, data, schemaVersion);
    } catch (err) {
      this.logger.error(
        `Save derivation failed for pack ${packId}; persisting client-provided data as-is`,
        err instanceof Error ? err.stack : String(err)
      );
      return data;
    }

    const { working, feats, ctx } = derived;

    const errors = getCharacterSheetSaveValidationErrors(working, ctx);
    if (errors.length > 0) {
      throw new BadRequestException(['Ficha incompleta ou inválida', ...errors]);
    }

    const withCombat = applyCombatFromAttributes(working, feats);
    const combat = { ...((data.combat as Record<string, unknown> | undefined) ?? {}) };
    combat.maxHp = withCombat.maxHp;
    combat.currentHp = withCombat.currentHp;
    combat.armorClass = withCombat.armorClass;
    combat.initiative = withCombat.initiative;

    return { ...data, combat };
  }
}
