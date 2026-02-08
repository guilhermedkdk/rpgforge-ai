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
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { getAccessTokenExpiresIn, getRefreshTokenExpiresIn } from './auth.config';
import type { User } from '@rpgforce-ai/shared';

const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {}

  private getAccessTokenMaxAge(): number {
    return getAccessTokenExpiresIn(this.configService) * 1000; // maxAge em ms
  }

  private getRefreshTokenMaxAge(): number {
    return getRefreshTokenExpiresIn(this.configService) * 1000; // maxAge em ms
  }

  private setAuthCookies(response: Response, accessToken: string, refreshToken: string) {
    response.cookie('accessToken', accessToken, {
      ...BASE_COOKIE_OPTIONS,
      maxAge: this.getAccessTokenMaxAge(),
    });
    response.cookie('refreshToken', refreshToken, {
      ...BASE_COOKIE_OPTIONS,
      maxAge: this.getRefreshTokenMaxAge(),
    });
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.register(registerDto.email, registerDto.password);

    this.setAuthCookies(response, result.accessToken, result.refreshToken);

    // Retorna apenas user (tokens estão em cookies)
    return { user: result.user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(loginDto.email, loginDto.password);

    this.setAuthCookies(response, result.accessToken, result.refreshToken);

    // Retorna apenas user (tokens estão em cookies)
    return { user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    // Lê refresh token do cookie
    const refreshToken = request.cookies['refreshToken'];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const result = await this.authService.refreshToken(refreshToken);

    this.setAuthCookies(response, result.accessToken, result.refreshToken);

    // Retorna apenas user
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

    // Limpa cookies de autenticação
    response.clearCookie('accessToken', { path: '/' });
    response.clearCookie('refreshToken', { path: '/' });

    return { message: 'Logged out successfully' };
  }
}
