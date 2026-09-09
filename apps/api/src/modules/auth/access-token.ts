import type { Request } from 'express';
import type { JwtService } from '@nestjs/jwt';
import type { UserRole } from '@prisma/client';

/** What an access token carries. `role` rides along so a guard can tier a request with no DB hit. */
export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
}

const BEARER_PREFIX = 'Bearer ';

/** The two places an access token can arrive: the httpOnly cookie the web sets, or a bearer header. */
export const extractAccessToken = (request: Request): string | null => {
  const cookieToken = request?.cookies?.accessToken;
  if (cookieToken) return cookieToken;

  const header = request?.headers?.authorization;
  if (header?.startsWith(BEARER_PREFIX)) return header.slice(BEARER_PREFIX.length);

  return null;
};

/** Verified claims, or null when the request carries no usable access token. */
export const readAccessTokenClaims = (
  request: Request,
  jwtService: JwtService,
  secret: string | undefined
): AccessTokenClaims | null => {
  const token = extractAccessToken(request);
  if (!token || !secret) return null;

  try {
    return jwtService.verify<AccessTokenClaims>(token, { secret });
  } catch {
    // An expired or forged token is just anonymous traffic here; auth rejects it later on its own.
    return null;
  }
};
