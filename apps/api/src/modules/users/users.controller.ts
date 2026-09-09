import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import type { User } from '@rpgforce-ai/shared';
import { readAccessTokenClaims } from '../auth/access-token';
import { clearAuthCookies, setAuthCookies } from '../auth/auth-cookies';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  /**
   * Changing the password drops every refresh token of the account, which is the point: it is how
   * someone locks out a session they no longer trust. That would take THIS session down with the
   * rest, so the caller, already proven by the guard and by the current password, is handed a fresh
   * pair on the way out.
   */
  @Post('me/password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.users.setPassword(user.id, dto.currentPassword, dto.newPassword);

    const session = await this.authService.issueSession(user.id);
    setAuthCookies(response, this.configService, session.accessToken, session.refreshToken);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(
    @CurrentUser() user: User,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.users.deleteAccount(user.id, dto);
    clearAuthCookies(response);
  }

  /**
   * A profile is public, so this route has no guard. It still READS the token when one is there:
   * the owner opening their own profile gets their sheets and their email, a visitor does not.
   */
  @Get(':username')
  @HttpCode(HttpStatus.OK)
  async getProfile(@Param('username') username: string, @Req() request: Request) {
    const claims = readAccessTokenClaims(
      request,
      this.jwtService,
      this.configService.get<string>('JWT_SECRET')
    );
    return this.users.getProfile(username, claims?.sub);
  }
}
