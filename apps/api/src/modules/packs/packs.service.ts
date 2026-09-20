import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import type { PackResponse, RuleItemKind } from '@rpgforce-ai/shared';
import { isUuid } from '../../shared/utils/is-uuid';

const mapToPackResponse = (pack: {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string | null;
  systemName: string;
  externalKey: string | null;
  apiVersionHint: string | null;
  publisherName: string | null;
  permalink: string | null;
  licenseType: string;
  licenseUrl: string | null;
  attributionText: string;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PackResponse => ({
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
});

@Injectable()
export class PacksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PackResponse[]> {
    const [packs, counts] = await Promise.all([
      this.prisma.pack.findMany({ orderBy: { name: 'asc' } }),
      this.itemCountsByPack(),
    ]);
    return packs.map((pack) => ({
      ...mapToPackResponse(pack),
      itemCounts: counts.get(pack.id) ?? {},
    }));
  }

  async findByIdOrSlug(idOrSlug: string): Promise<PackResponse> {
    const pack = await this.prisma.pack.findFirst({
      where: isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
    });

    if (!pack) {
      throw new NotFoundException(`Pack not found: ${idOrSlug}`);
    }

    const counts = await this.itemCountsByPack(pack.id);
    return { ...mapToPackResponse(pack), itemCounts: counts.get(pack.id) ?? {} };
  }

  // What each pack's catalogue holds, so the library index can say so before anything is opened.
  private async itemCountsByPack(packId?: string) {
    const groups = await this.prisma.ruleItem.groupBy({
      by: ['packId', 'kind'],
      where: packId ? { packId } : undefined,
      _count: { _all: true },
    });
    const byPack = new Map<string, Partial<Record<RuleItemKind, number>>>();
    for (const group of groups) {
      const counts = byPack.get(group.packId) ?? {};
      counts[group.kind] = group._count._all;
      byPack.set(group.packId, counts);
    }
    return byPack;
  }

  async findLegalData(): Promise<
    Array<
      Pick<PackResponse, 'id' | 'slug' | 'name' | 'licenseType' | 'licenseUrl' | 'attributionText'>
    >
  > {
    const packs = await this.prisma.pack.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        licenseType: true,
        licenseUrl: true,
        attributionText: true,
      },
    });

    return packs.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      licenseType: p.licenseType as PackResponse['licenseType'],
      licenseUrl: p.licenseUrl ?? undefined,
      attributionText: p.attributionText,
    }));
  }
}
