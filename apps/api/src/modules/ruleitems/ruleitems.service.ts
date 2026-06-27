import { Injectable, NotFoundException } from '@nestjs/common';
import { RuleItemKind as PrismaRuleItemKind } from '@prisma/client';
import { PrismaService } from '../../shared/prisma.service';
import type {
  RuleItemResponse,
  RuleItemListParams,
  RuleItemListResult,
  RuleItemKind,
} from '@rpgforce-ai/shared';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mapToRuleItemResponse(item: {
  id: string;
  packId: string;
  kind: string;
  source: string;
  sourceKey: string;
  sourceUrl: string | null;
  sourceVersion: string | null;
  name: string;
  slug: string | null;
  contentMd: string | null;
  raw?: unknown;
  normalized: unknown;
  createdAt: Date;
  updatedAt: Date;
  tags: { tag: { key: string } }[];
}): RuleItemResponse {
  return {
    id: item.id,
    packId: item.packId,
    kind: item.kind as RuleItemKind,
    source: item.source,
    sourceKey: item.sourceKey,
    sourceUrl: item.sourceUrl ?? undefined,
    sourceVersion: item.sourceVersion ?? undefined,
    name: item.name,
    slug: item.slug ?? undefined,
    contentMd: item.contentMd ?? undefined,
    raw: (item.raw as Record<string, unknown>) ?? {},
    normalized: (item.normalized as Record<string, unknown>) ?? undefined,
    tagKeys: item.tags.map((t) => t.tag.key),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

@Injectable()
export class RuleitemsService {
  constructor(private readonly prisma: PrismaService) {}

  async findManyBatch(
    packId: string | undefined,
    queries: Array<RuleItemListParams & { key: string }>,
  ): Promise<import('@rpgforce-ai/shared').RuleItemBatchResult> {
    const entries = await Promise.all(
      queries.map(async ({ key, ...params }) => {
        const result = await this.findMany({ ...params, packId });
        return [key, result] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  async findMany(params: RuleItemListParams): Promise<RuleItemListResult> {
    const {
      packId,
      type,
      q,
      level,
      class: classFilter,
      tag,
      tags,
      limit = 50,
      offset = 0,
      includeRaw = true,
    } = params;

    const tagList = tags?.length ? tags : tag ? [tag] : undefined;

    const where: {
      packId?: string;
      kind?: RuleItemKind;
      name?: { contains: string; mode: 'insensitive' };
      tags?: { some: { tag: { key: string } } };
      AND?: Array<{ tags: { some: { tag: { key: string } } } }>;
      normalized?: unknown;
    } = {};

    if (packId) where.packId = packId;
    if (type) where.kind = type;
    if (q?.trim()) where.name = { contains: q.trim(), mode: 'insensitive' };
    if (tagList?.length) {
      where.AND = tagList.map((tagKey) => ({
        tags: { some: { tag: { key: tagKey } } },
      }));
    }

    if (level != null && type === 'SPELL') {
      where.normalized = { path: ['level'], equals: level };
    }
    if (classFilter) {
      const classWhere: {
        kind: PrismaRuleItemKind;
        name: { contains: string; mode: 'insensitive' };
        packId?: string;
      } = {
        kind: PrismaRuleItemKind.CLASS,
        name: { contains: classFilter, mode: 'insensitive' },
      };
      if (packId) classWhere.packId = packId;
      const classItems = await this.prisma.ruleItem.findMany({
        where: classWhere,
        select: { id: true },
      });
      const classIds = classItems.map((c) => c.id);
      const fromIds = await this.prisma.ruleItemRelation.findMany({
        where: { toId: { in: classIds }, type: 'SPELL_AVAILABLE_TO_CLASS' },
        select: { fromId: true },
      });
      const spellIds = fromIds.map((r) => r.fromId);
      if (spellIds.length > 0) {
        (where as { id?: { in: string[] } }).id = { in: spellIds };
      }
    }

    // Full pack spell lists (no class filter) need a higher cap than generic lists.
    // ITEM catalogs can be large; the default 500 cap was truncating alphabetical tail (e.g. Crowbar, Quiver).
    const maxTake =
      type === 'SPELL' && !classFilter ? 3000 : type === PrismaRuleItemKind.ITEM ? 10000 : 500;
    const [items, total] = await Promise.all([
      this.prisma.ruleItem.findMany({
        where,
        // Skip the large `raw` column when the caller only needs `normalized`.
        select: {
          id: true,
          packId: true,
          kind: true,
          source: true,
          sourceKey: true,
          sourceUrl: true,
          sourceVersion: true,
          name: true,
          slug: true,
          contentMd: true,
          normalized: true,
          raw: includeRaw,
          createdAt: true,
          updatedAt: true,
          tags: { select: { tag: { select: { key: true } } } },
        },
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
        take: Math.min(limit, maxTake),
        skip: offset,
      }),
      this.prisma.ruleItem.count({ where }),
    ]);

    return {
      items: items.map((item) =>
        mapToRuleItemResponse({
          ...item,
          tags: item.tags.map((t) => ({ tag: { key: t.tag.key } })),
        })
      ),
      total,
    };
  }

  async findByIdOrSlug(idOrSlug: string, packId?: string): Promise<RuleItemResponse> {
    const isUuid = UUID_REGEX.test(idOrSlug);
    const item = await this.prisma.ruleItem.findFirst({
      where: isUuid ? { id: idOrSlug } : { slug: idOrSlug, ...(packId ? { packId } : {}) },
      include: { tags: { include: { tag: true } } },
    });

    if (!item) {
      throw new NotFoundException(`Rule item not found: ${idOrSlug}`);
    }

    return mapToRuleItemResponse({
      ...item,
      tags: item.tags.map((t) => ({ tag: { key: t.tag.key } })),
    });
  }
}
