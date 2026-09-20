import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma.service';
import {
  STANDARD_LANGUAGE_TAG,
  TOOL_CATEGORY_TAGS,
  type CharacterSheetSummary,
  type CharacterSheetWithRulesResponse,
  type PackResponse,
  type PublicSheetListResponse,
  type PublicSheetSort,
  type PublicSheetSummary,
  type PublicSheetWithRulesResponse,
  type SheetAiNotesResponse,
} from '@rpgforce-ai/shared';
import { mapToRuleItemResponse } from '../ruleitems/ruleitems.service';
import { validateCharacterSheetData } from './character-sheet-data.validation';
import { CharacterRecomputeService } from './character-recompute.service';
import { GenerationRunService } from '../generation/generation-run.service';
import { CharacterPreviewService, type SheetPreviewInput } from './character-preview.service';
import { SheetFavoritesService } from './sheet-favorites.service';
import {
  PUBLIC_SHEET_SELECT,
  SHEET_OWNER_SELECT,
  toSheetOwner,
  type SheetOwnerRow,
} from './public-sheet-select';

function extractRuleItemIds(data: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const d = data as Record<string, unknown>;

  const addIfString = (v: unknown): void => {
    if (typeof v === 'string' && v.trim()) ids.add(v.trim());
  };

  const identity = d?.identity as Record<string, unknown> | undefined;
  addIfString(identity?.raceRuleItemId);
  addIfString(identity?.classRuleItemId);
  addIfString(identity?.subclassRuleItemId);
  addIfString(identity?.backgroundRuleItemId);
  // Every class of a multiclass sheet, or the preload would resolve only the initial one.
  if (Array.isArray(identity?.classes)) {
    for (const entry of identity.classes as Record<string, unknown>[]) {
      addIfString(entry?.classRuleItemId);
      addIfString(entry?.subclassRuleItemId);
    }
  }

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly recompute: CharacterRecomputeService,
    private readonly previews: CharacterPreviewService,
    private readonly favorites: SheetFavoritesService,
    private readonly generationRuns: GenerationRunService
  ) {}

  private toResponse(row: {
    id: string;
    userId: string;
    packId: string;
    name: string;
    data: Prisma.JsonValue;
    schemaVersion: number;
    isPublic: boolean;
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
      isPublic: row.isPublic,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async create(
    userId: string,
    packId: string,
    data: Record<string, unknown>,
    generationId?: string
  ) {
    const pack = await this.prisma.pack.findUnique({ where: { id: packId } });
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }

    const validated = validateCharacterSheetData(data);
    const stored = await this.recompute.validateAndRecompute(packId, data, validated.schemaVersion);
    const name = sheetNameFromData(stored);
    const row = await this.prisma.characterSheet.create({
      data: {
        userId,
        packId,
        name,
        data: stored as Prisma.InputJsonValue,
        schemaVersion: validated.schemaVersion,
      },
    });
    // The AI interaction is only persisted once its draft becomes a real sheet; never blocks the save.
    await this.generationRuns.linkToSheet({ generationId, userId, characterSheetId: row.id });
    return this.toResponse(row);
  }

  async findAllForUser(userId: string): Promise<CharacterSheetSummary[]> {
    const rows = await this.prisma.characterSheet.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        packId: true,
        name: true,
        schemaVersion: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
        data: true,
      },
    });

    const previewById = await this.previewsByPack(rows);

    return rows.map((r) => ({
      id: r.id,
      packId: r.packId,
      name: r.name,
      schemaVersion: r.schemaVersion,
      isPublic: r.isPublic,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      preview: previewById.get(r.id),
    }));
  }

  /**
   * Publishing is a separate write from saving the sheet: it never touches `data`, so it cannot run
   * the recompute or trip the save validation. An incomplete sheet can be published and stay so.
   */
  async setVisibility(userId: string, id: string, isPublic: boolean) {
    const row = await this.prisma.characterSheet.findUnique({
      where: { id },
      select: { id: true, userId: true, isPublic: true, publishedAt: true },
    });
    if (!row) throw new NotFoundException('Character sheet not found');
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not have access to this character sheet');
    }

    const updated = await this.prisma.characterSheet.update({
      where: { id },
      data: {
        isPublic,
        // Re-publishing moves the sheet back to the top of the feed, which is what the act means.
        publishedAt: isPublic ? new Date() : null,
      },
      select: { id: true, isPublic: true, publishedAt: true },
    });
    return {
      id: updated.id,
      isPublic: updated.isPublic,
      publishedAt: updated.publishedAt?.toISOString() ?? null,
    };
  }

  /** The explore feed: every published sheet, newest publication first. */
  async listPublic(params: {
    limit?: number;
    offset?: number;
    q?: string;
    packId?: string;
    sort?: PublicSheetSort;
    /** Present only when the request carried a valid token; the feed itself is open. */
    viewerId?: string | null;
  }): Promise<PublicSheetListResponse> {
    const limit = Math.min(Math.max(params.limit ?? 24, 1), 60);
    const offset = Math.max(params.offset ?? 0, 0);
    const q = params.q?.trim();

    // The text filter also bounds the chip counts; the pack filter must not, or selecting a system
    // would zero every other chip.
    const matching: Prisma.CharacterSheetWhereInput = {
      isPublic: true,
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };
    const where: Prisma.CharacterSheetWhereInput = {
      ...matching,
      ...(params.packId ? { packId: params.packId } : {}),
    };

    // A feed with no bookmarks anywhere would otherwise come back in an arbitrary order, so the
    // publication date stays the tiebreaker.
    const orderBy: Prisma.CharacterSheetOrderByWithRelationInput[] =
      params.sort === 'popular'
        ? [{ favorites: { _count: 'desc' } }, { publishedAt: 'desc' }]
        : [{ publishedAt: 'desc' }];

    const [rows, total, packGroups] = await Promise.all([
      this.prisma.characterSheet.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        select: PUBLIC_SHEET_SELECT,
      }),
      this.prisma.characterSheet.count({ where }),
      this.prisma.characterSheet.groupBy({
        by: ['packId'],
        where: matching,
        _count: { _all: true },
      }),
    ]);

    const items = await this.toPublicSummaries(rows, params.viewerId);
    return {
      items,
      total,
      packCounts: packGroups.map((group) => ({ packId: group.packId, count: group._count._all })),
    };
  }

  /** The sheets this person bookmarked, in the same shape the explore feed uses. */
  async listFavoritesFor(userId: string): Promise<PublicSheetSummary[]> {
    const rows = await this.favorites.listFor(userId);
    return this.toPublicSummaries(rows, userId);
  }

  // Rows -> public summaries, with the previews, the bookmark counts and the viewer's own state
  // resolved in one batch each rather than per sheet.
  private async toPublicSummaries(
    rows: Array<{
      id: string;
      packId: string;
      name: string;
      schemaVersion: number;
      isPublic: boolean;
      publishedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      data: Prisma.JsonValue;
      user: SheetOwnerRow;
    }>,
    viewerId?: string | null
  ): Promise<PublicSheetSummary[]> {
    const ids = rows.map((r) => r.id);
    const [previewById, favoriteCounts, favoritedIds] = await Promise.all([
      this.previewsByPack(rows),
      this.favorites.countsFor(ids),
      this.favorites.favoritedIdsAmong(viewerId, ids),
    ]);

    return rows.map((r) => ({
      id: r.id,
      packId: r.packId,
      name: r.name,
      schemaVersion: r.schemaVersion,
      isPublic: r.isPublic,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      publishedAt: (r.publishedAt ?? r.updatedAt).toISOString(),
      owner: toSheetOwner(r.user),
      preview: previewById.get(r.id),
      favoriteCount: favoriteCounts.get(r.id) ?? 0,
      isFavorited: favoritedIds.has(r.id),
    }));
  }

  /** What a visitor sees on someone's profile: that user's published sheets only. */
  async findPublicForUser(userId: string): Promise<CharacterSheetSummary[]> {
    const rows = await this.prisma.characterSheet.findMany({
      where: { userId, isPublic: true },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        packId: true,
        name: true,
        schemaVersion: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
        data: true,
      },
    });
    const previewById = await this.previewsByPack(rows);
    return rows.map((r) => ({
      id: r.id,
      packId: r.packId,
      name: r.name,
      schemaVersion: r.schemaVersion,
      isPublic: r.isPublic,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      preview: previewById.get(r.id),
    }));
  }

  // One preview batch per pack: the catalogs are per-pack, so they load once instead of once per sheet.
  private async previewsByPack(
    rows: Array<{ id: string; packId: string; data: Prisma.JsonValue; schemaVersion: number }>
  ) {
    const byPack = new Map<string, SheetPreviewInput[]>();
    for (const row of rows) {
      const list = byPack.get(row.packId) ?? [];
      list.push({ id: row.id, data: row.data, schemaVersion: row.schemaVersion });
      byPack.set(row.packId, list);
    }
    const maps = await Promise.all(
      [...byPack.entries()].map(([packId, sheets]) => this.previews.buildPreviews(packId, sheets))
    );
    return new Map(maps.flatMap((m) => [...m.entries()]));
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

  async findOneWithRules(userId: string, id: string): Promise<CharacterSheetWithRulesResponse> {
    const row = await this.prisma.characterSheet.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Character sheet not found');
    if (row.userId !== userId)
      throw new ForbiddenException('You do not have access to this character sheet');

    const [loaded, hasAiNotes] = await Promise.all([
      this.loadWithRules(row),
      this.generationRuns.existsForSheet(row.id),
    ]);
    return { ...loaded, hasAiNotes };
  }

  /** The AI's justifications for a sheet the caller owns; fetched only when the sheet asks for them. */
  async findAiNotes(userId: string, id: string): Promise<SheetAiNotesResponse> {
    const row = await this.prisma.characterSheet.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!row) throw new NotFoundException('Character sheet not found');
    if (row.userId !== userId)
      throw new ForbiddenException('You do not have access to this character sheet');

    return this.generationRuns.findNotesForSheet(id);
  }

  /**
   * The same payload the owner gets, for anyone. An unpublished sheet answers 404, never 403: a
   * private sheet must not be distinguishable from one that does not exist.
   */
  async findPublicWithRules(
    id: string,
    /** Present only when the request carried a valid token; the route itself is open. */
    viewerId?: string | null
  ): Promise<PublicSheetWithRulesResponse> {
    const row = await this.prisma.characterSheet.findUnique({
      where: { id },
      include: { user: { select: SHEET_OWNER_SELECT } },
    });
    if (!row || !row.isPublic) throw new NotFoundException('Character sheet not found');

    const [loaded, counts, favorited] = await Promise.all([
      this.loadWithRules(row),
      this.favorites.countsFor([row.id]),
      this.favorites.favoritedIdsAmong(viewerId, [row.id]),
    ]);
    return {
      ...loaded,
      owner: toSheetOwner(row.user),
      favoriteCount: counts.get(row.id) ?? 0,
      isFavorited: favorited.has(row.id),
    };
  }

  private async loadWithRules(row: {
    id: string;
    userId: string;
    packId: string;
    name: string;
    data: Prisma.JsonValue;
    schemaVersion: number;
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<CharacterSheetWithRulesResponse> {
    const referencedIds = extractRuleItemIds(row.data as Record<string, unknown>);

    const includeWithTags = { tags: { include: { tag: true } } } as const;

    const [referencedItems, allFeats, abilityItems, languageItems, toolItems, pack] =
      await Promise.all([
        referencedIds.length > 0
          ? this.prisma.ruleItem.findMany({
              where: { id: { in: referencedIds } },
              include: includeWithTags,
            })
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
          where: {
            packId: row.packId,
            kind: 'OTHER',
            tags: { some: { tag: { key: STANDARD_LANGUAGE_TAG } } },
          },
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
      ruleItems: Object.fromEntries(
        allReferencedItems.map((i) => [i.id, mapToRuleItemResponse(i)])
      ),
      abilities: abilityItems.map(mapToRuleItemResponse),
      languages: languageItems.map(mapToRuleItemResponse),
      toolItems: toolItems.map(mapToRuleItemResponse),
    };
  }

  async updateForUser(userId: string, id: string, data: Record<string, unknown>) {
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
    const stored = await this.recompute.validateAndRecompute(
      row.packId,
      data,
      validated.schemaVersion
    );
    const name = sheetNameFromData(stored);
    const updated = await this.prisma.characterSheet.update({
      where: { id },
      data: {
        name,
        data: stored as Prisma.InputJsonValue,
        schemaVersion: validated.schemaVersion,
      },
    });
    return this.toResponse(updated);
  }

  async removeForUser(userId: string, id: string) {
    const row = await this.prisma.characterSheet.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!row) {
      throw new NotFoundException('Character sheet not found');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not have access to this character sheet');
    }

    await this.prisma.characterSheet.delete({ where: { id } });
  }
}
