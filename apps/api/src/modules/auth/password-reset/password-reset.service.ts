import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../shared/prisma.service';
import { MailService } from '../../../shared/mail/mail.service';
import { readFrontendUrl } from '../auth.config';
import { AuthService, type IssuedSession } from '../auth.service';
import { buildPasswordResetEmail } from './password-reset-email';
import { createResetToken, hashResetToken, RESET_TOKEN_TTL_SECONDS } from './password-reset-token';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Sends a reset link, if that address has an account.
   *
   * Returns nothing either way, and the controller answers the same in both cases: a response that
   * differed would turn this route into a way to ask whether someone is registered here. An account
   * with no password is served too, since setting a first one is exactly what someone locked out of
   * their provider needs.
   */
  async request(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) return;

    const token = createResetToken();

    await this.prisma.$transaction([
      // One live link at a time. Asking again is the normal reaction to a mail that has not arrived
      // yet, and every link left behind is another 30-minute window into the account.
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      this.prisma.passwordResetToken.create({
        data: {
          tokenHash: hashResetToken(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_SECONDS * 1000),
        },
      }),
    ]);

    const resetUrl = `${readFrontendUrl(this.configService)}/auth/reset-password?token=${token}`;

    await this.mail.send(buildPasswordResetEmail(user.email, resetUrl));
  }

  /**
   * Spends a reset token on a new password and signs the user in.
   *
   * The token is the only credential, so it has to be consumed before anything is written: the
   * stamp is a guarded update, and losing that race means the link was already spent by a parallel
   * request rather than that it was invalid.
   */
  async reset(token: string, newPassword: string): Promise<IssuedSession> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!record || record.usedAt !== null || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Esse link expirou ou já foi usado');
    }

    const claimed = await this.prisma.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    if (claimed.count === 0) {
      throw new UnauthorizedException('Esse link expirou ou já foi usado');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: await bcrypt.hash(newPassword, 10) },
      }),
      // Whoever knew the old password loses every session with it, which is the point of the flow
      // for an account someone else got into.
      this.prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
    ]);

    return this.auth.issueSession(record.userId);
  }
}
