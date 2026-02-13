import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import type { PackResponse } from '@rpgforce-ai/shared';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const mapToPackResponse = (pack: {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string | null;
  systemName: string;
  licenseType: string;
  licenseUrl: string | null;
  attributionText: string;
  createdAt: Date;
  updatedAt: Date;
}): PackResponse => ({
  id: pack.id,
  slug: pack.slug,
  name: pack.name,
  version: pack.version,
  description: pack.description ?? undefined,
  systemName: pack.systemName,
  licenseType: pack.licenseType as PackResponse['licenseType'],
  licenseUrl: pack.licenseUrl ?? undefined,
  attributionText: pack.attributionText,
  createdAt: pack.createdAt.toISOString(),
  updatedAt: pack.updatedAt.toISOString(),
});

@Injectable()
export class PacksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PackResponse[]> {
    const packs = await this.prisma.pack.findMany({
      orderBy: { name: 'asc' },
    });
    return packs.map(mapToPackResponse);
  }

  async findByIdOrSlug(idOrSlug: string): Promise<PackResponse> {
    const isUuid = UUID_REGEX.test(idOrSlug);

    const pack = await this.prisma.pack.findFirst({
      where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
    });

    if (!pack) {
      throw new NotFoundException(`Pack not found: ${idOrSlug}`);
    }

    return mapToPackResponse(pack);
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
