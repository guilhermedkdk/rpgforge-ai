import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { UserRole } from '@prisma/client';
import type { User } from '@rpgforce-ai/shared';
import { PrismaService } from '../../shared/prisma.service';
import { getAccessTokenExpiresIn, getRefreshTokenExpiresIn } from './auth.config';
import { usernameCandidate, usernameFromEmail } from '../users/username';
import { toSessionUser, USER_SESSION_SELECT } from './user-session';
import { hashRefreshToken, isWithinRotationGrace } from './refresh-token';
import { toProviderId } from './oauth/provider-enum';

/** Long enough for a page load plus the sheet's derivation, short enough to be uninteresting. */
const RENDER_TOKEN_TTL_SECONDS = 120;

/**
 * What `POST /auth/login` answers when the account exists but has no password.
 *
 * The response also names the providers that DO work. That admits the address is registered and how
 * it signs in, which `POST /auth/register` already half-admits with its 409. The alternative is
 * telling someone who signed up with Google that their credentials are invalid, forever, with no
 * hint of where to go: a support burden bought with very little secrecy.
 */
export const PASSWORD_SIGNIN_UNAVAILABLE = 'PASSWORD_SIGNIN_UNAVAILABLE';

/** A session handed to the caller: the user plus the token pair the controller turns into cookies. */
export interface IssuedSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async register(email: string, password: string): Promise<IssuedSession> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        username: await this.allocateUsername(usernameFromEmail(email)),
      },
      select: USER_SESSION_SELECT,
    });

    return this.issueSessionFor(user.id, user.role, toSessionUser(user));
  }

  async login(email: string, password: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: USER_SESSION_SELECT,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // A provider-only account: there is no hash to compare, and bcrypt.compare against null would
    // throw rather than return false.
    if (user.password === null) {
      throw new UnauthorizedException({
        message: PASSWORD_SIGNIN_UNAVAILABLE,
        providers: user.oauthAccounts.map((account) => toProviderId(account.provider)),
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueSessionFor(user.id, user.role, toSessionUser(user));
  }

  /**
   * Rotates a refresh token into a new session.
   *
   * Rotation is not a plain delete: the spent token is kept, stamped, and honoured for
   * `ROTATION_GRACE_SECONDS` so the other tabs that presented the same cookie in the same instant
   * are not thrown out. Presented after that window it can only be a copy someone else kept, so
   * every session of the user goes.
   */
  async refreshToken(refreshToken: string): Promise<IssuedSession> {
    const tokenHash = hashRefreshToken(refreshToken);
    const tokenRecord = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (tokenRecord.usedAt && !isWithinRotationGrace(tokenRecord.usedAt)) {
      await this.prisma.refreshToken.deleteMany({ where: { userId: tokenRecord.userId } });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: tokenRecord.userId },
      select: USER_SESSION_SELECT,
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const session = await this.issueSessionFor(user.id, user.role, toSessionUser(user));

    // Guarded on `usedAt: null` so the racing siblings cannot restamp it. The window has to run
    // from the first use, otherwise replaying a token would keep renewing its own licence.
    await this.prisma.refreshToken.updateMany({
      where: { id: tokenRecord.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    return session;
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { tokenHash: hashRefreshToken(refreshToken) },
    });

    return { message: 'Logged out successfully' };
  }

  /**
   * A fresh session for a user the caller has ALREADY authenticated.
   *
   * The OAuth callback is the caller: by the time it gets here the provider's ID token has been
   * verified, so there is no credential left to check. Nothing that skips authentication may call it.
   */
  async issueSession(userId: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SESSION_SELECT,
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.issueSessionFor(user.id, user.role, toSessionUser(user));
  }

  /**
   * Access token for a server-side render of the user's OWN page (the PDF export drives a headless
   * browser at the web app). Minted on the server and handed straight to that browser: it is never
   * returned to a client, and it expires in a couple of minutes. No refresh token is created.
   */
  async createRenderAccessToken(userId: string): Promise<string> {
    const user = await this.validateUser(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.jwtService.sign(
      { sub: userId, role: user.role },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: RENDER_TOKEN_TTL_SECONDS,
      }
    );
  }

  private async issueSessionFor(
    userId: string,
    role: UserRole,
    user: User
  ): Promise<IssuedSession> {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const jwtExpiresInSeconds = getAccessTokenExpiresIn(this.configService);
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const refreshExpiresInSeconds = getRefreshTokenExpiresIn(this.configService);

    // The role is a claim so the rate-limit guard can read it without touching the database.
    const payload = { sub: userId, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: jwtExpiresInSeconds,
    });

    // `jti` is what makes two refresh tokens different. Without it the payload, the secret and the
    // one-second resolution of `iat`/`exp` are all identical for the same user, so two rotations
    // inside the same second sign the SAME string and the second one collides on `tokenHash`. That
    // second is exactly when it happens: several tabs refreshing the instant the access token dies.
    const refreshToken = this.jwtService.sign(
      { ...payload, jti: randomUUID() },
      {
        secret: refreshSecret,
        expiresIn: refreshExpiresInSeconds,
      }
    );

    const expiresAt = new Date(Date.now() + refreshExpiresInSeconds * 1000);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: hashRefreshToken(refreshToken),
        userId,
        expiresAt,
      },
    });

    return { user, accessToken, refreshToken };
  }

  /**
   * The first free handle from that base. Racing registrations are still caught by the unique index;
   * this only keeps the common case from failing.
   */
  async allocateUsername(base: string): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = usernameCandidate(base, attempt);
      const taken = await this.prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    return `${base.slice(0, 12)}-${Date.now().toString(36)}`;
  }

  async validateUser(userId: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SESSION_SELECT,
    });

    return user ? toSessionUser(user) : null;
  }
}
