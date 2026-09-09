import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/prisma.service';

/**
 * Drops refresh tokens that can no longer authenticate anyone.
 *
 * Without this the table only grows, and every dead row is still a session secret sitting in a
 * backup. Only EXPIRED rows go: a spent-but-unexpired token is what lets `refreshToken` tell a
 * stolen token apart from an unknown one, so deleting those early would blind the reuse check.
 */
@Injectable()
export class RefreshTokenCleanupService {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (count > 0) {
      this.logger.log(`Purged ${count} expired refresh token(s)`);
    }

    return count;
  }
}
