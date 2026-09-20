import { Controller, Get, HttpCode, HttpStatus, Param, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { CharacterSheetsService } from './character-sheets.service';
import { readAccessTokenClaims } from '../auth/access-token';

/**
 * Published sheets, readable by anyone. A SEPARATE controller on its own path prefix, because the
 * owner's one carries a class-level `JwtAuthGuard`: a public route living under it would either need
 * the guard punched through per handler, or would be shadowed by its `:id` route.
 */
@Controller('public/sheets')
export class PublicSheetsController {
  constructor(
    private readonly characterSheetsService: CharacterSheetsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @Req() request: Request,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
    @Query('packId') packId?: string,
    @Query('sort') sort?: string
  ) {
    // The feed is open; the token is read only to fill in "did I bookmark this?". An anonymous
    // visitor costs no extra query (the helper returns null and the lookup is skipped).
    const claims = readAccessTokenClaims(
      request,
      this.jwtService,
      this.configService.get<string>('JWT_SECRET')
    );
    return this.characterSheetsService.listPublic({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      q,
      packId,
      sort: sort === 'popular' ? 'popular' : 'recent',
      viewerId: claims?.sub,
    });
  }

  @Get(':id/with-rules')
  @HttpCode(HttpStatus.OK)
  async getWithRules(@Param('id') id: string, @Req() request: Request) {
    const claims = readAccessTokenClaims(
      request,
      this.jwtService,
      this.configService.get<string>('JWT_SECRET')
    );
    return this.characterSheetsService.findPublicWithRules(id, claims?.sub);
  }
}
