import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import { readAccessTokenClaims, type AccessTokenClaims } from '../../modules/auth/access-token';

// Claims are read up to 3x per request (the skip check plus one tracker per bucket): verify once.
const CLAIMS_CACHE = Symbol('throttlerClaims');

type TrackedRequest = Request & { [CLAIMS_CACHE]?: AccessTokenClaims | null };

/**
 * Global throttler with an identity: authenticated traffic is counted per account instead of per IP
 * (so an office or a phone network never shares one bucket), and ADMIN accounts are exempt.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {
    super(options, storageService, reflector);
  }

  // ADMIN is never throttled: the owner has to keep exercising the live app.
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const { req } = this.getRequestResponse(context);
    return this.claimsOf(req as TrackedRequest)?.role === 'ADMIN';
  }

  protected async getTracker(req: TrackedRequest): Promise<string> {
    const claims = this.claimsOf(req);
    return claims ? `user:${claims.sub}` : `ip:${req.ip ?? 'unknown'}`;
  }

  private claimsOf(req: TrackedRequest): AccessTokenClaims | null {
    if (!(CLAIMS_CACHE in req)) {
      req[CLAIMS_CACHE] = readAccessTokenClaims(
        req,
        this.jwtService,
        this.configService.get<string>('JWT_SECRET')
      );
    }
    return req[CLAIMS_CACHE] ?? null;
  }
}
