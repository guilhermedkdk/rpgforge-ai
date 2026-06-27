import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma.service';
import type { CharacterSheetWithRulesResponse, PackResponse } from '@rpgforce-ai/shared';
import { mapToRuleItemResponse } from '../ruleitems/ruleitems.service';
import { validateCharacterSheetData } from './character-sheet-data.validation';

const STANDARD_LANGUAGE_TAG = 'language:rarity:standard';
const TOOL_CATEGORY_TAGS = [
  'item:category:gaming-set',
  'item:category:musical-instrument',
  'item:category:artisan',
  'item:category:tools',
];

function extractRuleItemIds(data: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const d = data as Record<string, unknown>;

  const addIfString = (v: unknown): void => {
    if (typeof v === 'string' && v.trim()) ids.add(v.trim());
  };

  const identity = d?.identity as Record<string, unknown> | undefined;
  addIfString(identity?.raceRuleItemId);
  addIfString(identity?.classRuleItemId);
  addIfString(identity?.backgroundRuleItemId);

  const combat = d?.combat as Record<string, unknown> | undefined;
  addIfString(combat?.equippedArmorId);
  addIfString(combat?.equippedShieldId);

  const equipment = d?.equipment as Record<string, unknown> | undefined;
  if (Array.isArray(equipment?.items)) {
    for (const item of equipment.items as Record<string, unknown>[]) {
      addIfString(item?.id);
    }
  }

  // featureChoices ids (feats, Weapon Mastery weapons) aren't resolved here: feats are bulk-loaded
  // in findOneWithRules and the viewer fetches the weapon catalog client-side.
  return [...ids];
}

function sheetNameFromData(data: Record<string, unknown>): string {
  const identity = data.identity;
  if (identity !== null && typeof identity === 'object' && !Array.isArray(identity)) {
    const n = (identity as Record<string, unknown>).name;
    if (typeof n === 'string') return n;
  }
  return '';
}

@Injectable()
export class CharacterSheetsService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(row: {
    id: string;
    userId: string;
    packId: string;
    name: string;
    data: Prisma.JsonValue;
    schemaVersion: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      userId: row.userId,
      packId: row.packId,
      name: row.name,
      data: row.data as Record<string, unknown>,
      schemaVersion: row.schemaVersion,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async create(userId: string, packId: string, data: Record<string, unknown>) {
    const pack = await this.prisma.pack.findUnique({ where: { id: packId } });
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }

    const validated = validateCharacterSheetData(data);
    const name = sheetNameFromData(data);
    const row = await this.prisma.characterSheet.create({
      data: {
        userId,
        packId,
        name,
        data: data as Prisma.InputJsonValue,
        schemaVersion: validated.schemaVersion,
      },
    });
    return this.toResponse(row);
  }

  async findAllForUser(userId: string) {
    const rows = await this.prisma.characterSheet.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        packId: true,
        name: true,
        schemaVersion: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      packId: r.packId,
      name: r.name,
      schemaVersion: r.schemaVersion,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async findOneForUser(userId: string, id: string) {
    const row = await this.prisma.characterSheet.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Character sheet not found');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not have access to this character sheet');
    }
    return this.toResponse(row);
  }

  async findOneWithRules(
    userId: string,
    id: string,
  ): Promise<CharacterSheetWithRulesResponse> {
    const row = await this.prisma.characterSheet.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Character sheet not found');
    if (row.userId !== userId) throw new ForbiddenException('You do not have access to this character sheet');

    const referencedIds = extractRuleItemIds(row.data as Record<string, unknown>);

    const includeWithTags = { tags: { include: { tag: true } } } as const;

    const [referencedItems, allFeats, abilityItems, languageItems, toolItems, pack] = await Promise.all([
      referencedIds.length > 0
        ? this.prisma.ruleItem.findMany({ where: { id: { in: referencedIds } }, include: includeWithTags })
        : Promise.resolve([]),
      // The full feat catalog: the viewer resolves derived feats referenced by name (background
      // origin feats, Eldritch Invocations' Lessons of the First Ones, Magic Initiate), not just
      // feats referenced by id — so it needs every feat, like the editor's rule library.
      this.prisma.ruleItem.findMany({
        where: { packId: row.packId, kind: 'FEAT' },
        include: includeWithTags,
      }),
      this.prisma.ruleItem.findMany({
        where: { packId: row.packId, kind: 'ABILITY' },
        include: includeWithTags,
      }),
      this.prisma.ruleItem.findMany({
        where: { packId: row.packId, kind: 'OTHER', tags: { some: { tag: { key: STANDARD_LANGUAGE_TAG } } } },
        include: includeWithTags,
      }),
      this.prisma.ruleItem.findMany({
        where: {
          packId: row.packId,
          tags: { some: { tag: { key: { in: TOOL_CATEGORY_TAGS } } } },
        },
        include: includeWithTags,
      }),
      this.prisma.pack.findUnique({ where: { id: row.packId } }),
    ]);

    if (!pack) throw new NotFoundException('Pack not found');

    const packResponse: PackResponse = {
      id: pack.id,
      slug: pack.slug,
      name: pack.name,
      version: pack.version,
      description: pack.description ?? undefined,
      systemName: pack.systemName,
      externalKey: pack.externalKey ?? undefined,
      apiVersionHint: pack.apiVersionHint ?? undefined,
      publisherName: pack.publisherName ?? undefined,
      permalink: pack.permalink ?? undefined,
      licenseType: pack.licenseType as PackResponse['licenseType'],
      licenseUrl: pack.licenseUrl ?? undefined,
      attributionText: pack.attributionText,
      isEnabled: pack.isEnabled,
      createdAt: pack.createdAt.toISOString(),
      updatedAt: pack.updatedAt.toISOString(),
    };

    const itemsById = new Map(referencedItems.map((i) => [i.id, i]));
    for (const feat of allFeats) if (!itemsById.has(feat.id)) itemsById.set(feat.id, feat);
    const allReferencedItems = [...itemsById.values()];

    return {
      sheet: this.toResponse(row),
      pack: packResponse,
      ruleItems: Object.fromEntries(allReferencedItems.map((i) => [i.id, mapToRuleItemResponse(i)])),
      abilities: abilityItems.map(mapToRuleItemResponse),
      languages: languageItems.map(mapToRuleItemResponse),
      toolItems: toolItems.map(mapToRuleItemResponse),
    };
  }

  async updateForUser(
    userId: string,
    id: string,
    data: Record<string, unknown>,
  ) {
    const row = await this.prisma.characterSheet.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Character sheet not found');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not have access to this character sheet');
    }

    const validated = validateCharacterSheetData(data);
    const name = sheetNameFromData(data);
    const updated = await this.prisma.characterSheet.update({
      where: { id },
      data: {
        name,
        data: data as Prisma.InputJsonValue,
        schemaVersion: validated.schemaVersion,
      },
    });
    return this.toResponse(updated);
  }
}
