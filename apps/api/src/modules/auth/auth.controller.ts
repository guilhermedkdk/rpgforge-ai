import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { clearAuthCookies, setAuthCookies } from './auth-cookies';
import { AUTH_THROTTLE } from '../../shared/throttling/throttle-tiers';
import type { User } from '@rpgforce-ai/shared';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {}

  @Post('register')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.register(registerDto.email, registerDto.password);

    setAuthCookies(response, this.configService, result.accessToken, result.refreshToken);

    return { user: result.user };
  }

  @Post('login')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(loginDto.email, loginDto.password);

    setAuthCookies(response, this.configService, result.accessToken, result.refreshToken);

    return { user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies['refreshToken'];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const result = await this.authService.refreshToken(refreshToken);

    setAuthCookies(response, this.configService, result.accessToken, result.refreshToken);

    return { user: result.user };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMe(@CurrentUser() user: User) {
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies['refreshToken'];

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    clearAuthCookies(response);

    return { message: 'Logged out successfully' };
  }
}
