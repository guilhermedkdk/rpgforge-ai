import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma.service';

/**
 * Drops reset tokens that can no longer set a password.
 *
 * Spent ones go with the expired: unlike a rotated refresh token, a used reset token proves nothing
 * once its window has closed, so there is no reason to keep the row.
 */
@Injectable()
export class PasswordResetCleanupService {
  private readonly logger = new Logger(PasswordResetCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1PM)
  async purgeSpent(): Promise<number> {
    const { count } = await this.prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (count > 0) {
      this.logger.log(`Purged ${count} spent password reset token(s)`);
    }

    return count;
  }
}
