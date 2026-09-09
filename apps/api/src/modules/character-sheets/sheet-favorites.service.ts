import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';

/**
 * Bookmarked sheets.
 *
 * A favourite points at someone ELSE's character, so it is only allowed on a sheet the person can
 * actually see: a published one, or their own. And it is never enforced only on the way in — the
 * lists below re-check visibility on the way out, because a sheet can be unpublished after the fact
 * and a bookmark must not become a back door to a private character.
 */
@Injectable()
export class SheetFavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent: favouriting twice is the same as once (the row's key is the pair). */
  async add(userId: string, sheetId: string) {
    const sheet = await this.prisma.characterSheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, isPublic: true },
    });
    // 404 rather than 403 on a private sheet: whether it exists is not public.
    if (!sheet || (!sheet.isPublic && sheet.userId !== userId)) {
      throw new NotFoundException('Character sheet not found');
    }

    await this.prisma.sheetFavorite.upsert({
      where: { userId_characterSheetId: { userId, characterSheetId: sheetId } },
      create: { userId, characterSheetId: sheetId },
      update: {},
    });
    return { id: sheetId, isFavorited: true, favoriteCount: await this.countFor(sheetId) };
  }

  async remove(userId: string, sheetId: string) {
    await this.prisma.sheetFavorite.deleteMany({
      where: { userId, characterSheetId: sheetId },
    });
    return { id: sheetId, isFavorited: false, favoriteCount: await this.countFor(sheetId) };
  }

  private countFor(sheetId: string): Promise<number> {
    return this.prisma.sheetFavorite.count({ where: { characterSheetId: sheetId } });
  }

  /** Which of these sheets the viewer bookmarked. Empty set for an anonymous request. */
  async favoritedIdsAmong(userId: string | null | undefined, sheetIds: string[]) {
    if (!userId || sheetIds.length === 0) return new Set<string>();
    const rows = await this.prisma.sheetFavorite.findMany({
      where: { userId, characterSheetId: { in: sheetIds } },
      select: { characterSheetId: true },
    });
    return new Set(rows.map((r) => r.characterSheetId));
  }

  /** How many people bookmarked each of these sheets. */
  async countsFor(sheetIds: string[]) {
    if (sheetIds.length === 0) return new Map<string, number>();
    const rows = await this.prisma.sheetFavorite.groupBy({
      by: ['characterSheetId'],
      where: { characterSheetId: { in: sheetIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.characterSheetId, r._count._all]));
  }

  /**
   * The sheets a person bookmarked, newest first.
   *
   * Filtered to what is STILL visible to them, so a character whose author went private disappears
   * from the list instead of 404-ing when clicked.
   */
  async listFor(userId: string, limit = 60) {
    const rows = await this.prisma.sheetFavorite.findMany({
      where: {
        userId,
        characterSheet: { OR: [{ isPublic: true }, { userId }] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        characterSheet: {
          select: {
            id: true,
            packId: true,
            name: true,
            schemaVersion: true,
            isPublic: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
            data: true,
            user: { select: { username: true, displayName: true } },
          },
        },
      },
    });
    return rows.map((r) => r.characterSheet);
  }
}
