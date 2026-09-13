import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { User } from '@rpgforce-ai/shared';
import { AUTH_THROTTLE, PASSWORD_RESET_THROTTLE } from '../../../shared/throttling/throttle-tiers';
import { setAuthCookies } from '../auth-cookies';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetService } from './password-reset.service';

@Controller('auth/password')
export class PasswordResetController {
  constructor(
    private readonly passwordReset: PasswordResetService,
    private readonly configService: ConfigService
  ) {}

  @Post('forgot')
  @Throttle(PASSWORD_RESET_THROTTLE)
  @HttpCode(HttpStatus.ACCEPTED)
  async forgot(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.passwordReset.request(dto.email);

    // Deliberately the same answer for an address with no account: anything else here would answer
    // the question "is this person registered?" to whoever asks.
    return { message: 'Se existir uma conta com esse email, o link já está a caminho' };
  }

  /** Spends the link and signs the user in, so nobody has to type the new password twice. */
  @Post('reset')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async reset(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<{ user: User }> {
    const session = await this.passwordReset.reset(dto.token, dto.newPassword);

    setAuthCookies(response, this.configService, session.accessToken, session.refreshToken);

    return { user: session.user };
  }
}
