import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  applyDerivedToCharacterData,
  computeEffectiveArmorClass,
  getDerivedFromRuleItems,
  getSkillsFromAbilities,
  mergeCharacterFormDataFromApi,
  type CharacterSheetPreview,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import { PrismaService } from '../../shared/prisma.service';
import { mapToRuleItemResponse } from '../ruleitems/ruleitems.service';
import { asId, RULE_ITEM_INCLUDE } from './rule-item-loading';

// Same AND-matched tag set the editor's `armors` catalog is sliced with (library-config.ts), so the
// list resolves equipped armor exactly like the sheet does.
const ARMOR_ITEM_TAGS = ['item:category:armor', 'item:armor:yes', 'item:magic:no'];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export interface SheetPreviewInput {
  id: string;
  data: Prisma.JsonValue;
  schemaVersion: number;
}

/**
 * Builds the character digests shown on the sheets list. The AC in particular CANNOT be read from
 * the persisted `combat.armorClass` (that field holds only the unarmored 10 + Dex base), so every
 * sheet is run through the SAME shared derivation + `computeEffectiveArmorClass` the sheet itself
 * uses. Catalogs are fetched once per pack for the whole batch, not per sheet.
 */
@Injectable()
export class CharacterPreviewService {
  private readonly logger = new Logger(CharacterPreviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  async buildPreviews(
    packId: string,
    sheets: SheetPreviewInput[]
  ): Promise<Map<string, CharacterSheetPreview>> {
    const out = new Map<string, CharacterSheetPreview>();
    if (sheets.length === 0) return out;

    const identityOf = (data: Prisma.JsonValue) => {
      const identity = asRecord(asRecord(data)?.identity);
      // `identity.classes` is absent on single-class sheets; synthesize it from the mirrors.
      const rawClasses = Array.isArray(identity?.classes) ? identity.classes : [];
      const classes = rawClasses
        .map((entry) => {
          const rec = asRecord(entry);
          return {
            classId: asId(rec?.classRuleItemId),
            subclassId: asId(rec?.subclassRuleItemId),
            level: typeof rec?.level === 'number' ? rec.level : 1,
          };
        })
        .filter(
          (c): c is { classId: string; subclassId: string | null; level: number } =>
            c.classId !== null
        );
      const classId = asId(identity?.classRuleItemId);
      const subclassId = asId(identity?.subclassRuleItemId);
      const level = typeof identity?.level === 'number' ? identity.level : null;
      return {
        level,
        classId,
        subclassId,
        raceId: asId(identity?.raceRuleItemId),
        backgroundId: asId(identity?.backgroundRuleItemId),
        classes:
          classes.length > 0
            ? classes
            : classId
              ? [{ classId, subclassId, level: level ?? 1 }]
              : [],
      };
    };

    const identities = sheets.map((s) => identityOf(s.data));
    const referencedIds = [
      ...new Set(
        identities.flatMap((i) =>
          [
            i.classId,
            i.subclassId,
            i.raceId,
            i.backgroundId,
            ...i.classes.flatMap((c) => [c.classId, c.subclassId]),
          ].filter((id): id is string => id !== null)
        )
      ),
    ];

    // Fallback: names/level/HP always resolve; only the AC needs the derivation below.
    const persistedFallback = (input: SheetPreviewInput): CharacterSheetPreview => {
      const combat = asRecord(asRecord(input.data)?.combat);
      const ac = typeof combat?.armorClass === 'string' ? combat.armorClass.trim() : '';
      const i = identityOf(input.data);
      return {
        level: i.level,
        className: null,
        classSlug: null,
        subclassName: null,
        classes: i.classes.map((c) => ({
          name: null,
          slug: null,
          subclassName: null,
          level: c.level,
        })),
        raceName: null,
        raceSlug: null,
        backgroundName: null,
        maxHp: typeof combat?.maxHp === 'number' ? combat.maxHp : null,
        armorClass: ac || null,
      };
    };

    let items: Map<string, RuleItemResponse>;
    let feats: RuleItemResponse[];
    let armors: RuleItemResponse[];
    let allSkillOptions: { key: string; label: string }[];
    try {
      const [byIdRows, featRows, abilityRows, armorRows] = await Promise.all([
        referencedIds.length > 0
          ? this.prisma.ruleItem.findMany({
              where: { id: { in: referencedIds } },
              include: RULE_ITEM_INCLUDE,
            })
          : Promise.resolve([]),
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
            kind: 'ITEM',
            AND: ARMOR_ITEM_TAGS.map((key) => ({ tags: { some: { tag: { key } } } })),
          },
          include: RULE_ITEM_INCLUDE,
        }),
      ]);

      items = new Map(byIdRows.map((row) => [row.id, mapToRuleItemResponse(row)]));
      feats = featRows.map(mapToRuleItemResponse);
      armors = armorRows.map(mapToRuleItemResponse);
      allSkillOptions = getSkillsFromAbilities(abilityRows.map(mapToRuleItemResponse)).map((s) => ({
        key: s.key,
        label: s.name,
      }));
    } catch (err) {
      this.logger.error(
        `Preview catalog load failed for pack ${packId}; falling back to persisted values`,
        err instanceof Error ? err.stack : String(err)
      );
      for (const sheet of sheets) out.set(sheet.id, persistedFallback(sheet));
      return out;
    }

    for (const [index, sheet] of sheets.entries()) {
      const ident = identities[index];
      const classItem = ident.classId ? (items.get(ident.classId) ?? null) : null;
      const subclassItem = ident.subclassId ? (items.get(ident.subclassId) ?? null) : null;
      const raceItem = ident.raceId ? (items.get(ident.raceId) ?? null) : null;
      const backgroundItem = ident.backgroundId ? (items.get(ident.backgroundId) ?? null) : null;

      const base: CharacterSheetPreview = {
        ...persistedFallback(sheet),
        className: classItem?.name ?? null,
        classSlug: classItem?.slug ?? null,
        subclassName: subclassItem?.name ?? null,
        classes: ident.classes.map((c) => {
          const item = items.get(c.classId) ?? null;
          const sub = c.subclassId ? (items.get(c.subclassId) ?? null) : null;
          return {
            name: item?.name ?? null,
            slug: item?.slug ?? null,
            subclassName: sub?.name ?? null,
            level: c.level,
          };
        }),
        raceName: raceItem?.name ?? null,
        raceSlug: raceItem?.slug ?? null,
        backgroundName: backgroundItem?.name ?? null,
      };

      try {
        const form = mergeCharacterFormDataFromApi(asRecord(sheet.data) ?? {}, sheet.schemaVersion);
        const derived = getDerivedFromRuleItems({
          classes: ident.classes
            .map((c) => ({
              classItem: items.get(c.classId) ?? null,
              subclassItem: c.subclassId ? (items.get(c.subclassId) ?? null) : null,
              level: c.level,
            }))
            .filter((c) => c.classItem !== null),
          raceItem,
          backgroundItem,
          feats,
          allSkillOptions,
        });
        const working = applyDerivedToCharacterData(form, derived, feats);
        const armorClass = computeEffectiveArmorClass({
          data: working,
          featureDetails: working.featureDetails ?? [],
          feats,
          armors,
        });
        out.set(sheet.id, { ...base, armorClass: String(armorClass) });
      } catch (err) {
        // One unreadable sheet must not break the whole list: keep its persisted (base) AC.
        this.logger.warn(
          `Preview AC derivation failed for sheet ${sheet.id}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        out.set(sheet.id, base);
      }
    }

    return out;
  }
}
