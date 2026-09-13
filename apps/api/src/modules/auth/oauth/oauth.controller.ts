import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { OAuthErrorCode, OAuthProviderId, User } from '@rpgforce-ai/shared';
import { isOAuthProviderId } from '@rpgforce-ai/shared';
import { AUTH_THROTTLE } from '../../../shared/throttling/throttle-tiers';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { AuthService } from '../auth.service';
import { setAuthCookies } from '../auth-cookies';
import { readAccessTokenClaims } from '../access-token';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { readFrontendUrl } from '../auth.config';
import { buildCallbackUrl, oauthCookieSecret } from './oauth.config';
import {
  clearPendingLink,
  clearTransaction,
  readPendingLink,
  readTransaction,
  safeRedirectPath,
  writePendingLink,
  writeTransaction,
  type OAuthIntent,
} from './oauth-transaction';
import { OAuthService } from './oauth.service';
import { OAuthProviderRegistry } from './providers/oauth-provider.registry';
import { ConfirmOAuthLinkDto } from './dto/confirm-oauth-link.dto';
import { ResetPasswordThroughProviderDto } from './dto/reset-password-through-provider.dto';

/** Where a signed-in user lands when the flow did not say otherwise. */
const DEFAULT_REDIRECT = '/sheets';

/** Where a failure is reported when the flow never said where it started, or cannot be read. */
const DEFAULT_ORIGIN = '/auth/login';

@Controller('auth/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly registry: OAuthProviderRegistry,
    private readonly oauth: OAuthService,
    private readonly auth: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  private transactionSecret(): string {
    return oauthCookieSecret(this.configService, 'transaction');
  }

  private pendingLinkSecret(): string {
    return oauthCookieSecret(this.configService, 'pending-link');
  }

  /** A path on the web app, absolute so it can be used as a redirect Location. */
  private webUrl(path: string): string {
    return `${readFrontendUrl(this.configService)}${path}`;
  }

  /**
   * Sends a failure back to the page that started the flow, with the code in the query.
   *
   * That page is the only one that can do anything useful with it: on `/auth/login` it is the form's
   * subtitle, and on a page that opened the sign-in dialog it reopens the dialog with the message,
   * instead of stranding the person on a login screen away from what they were doing.
   */
  private failureUrl(origin: string, code: OAuthErrorCode, provider?: OAuthProviderId): string {
    const separator = origin.includes('?') ? '&' : '?';
    const query = provider ? `error=${code}&provider=${provider}` : `error=${code}`;
    return this.webUrl(`${origin}${separator}${query}`);
  }

  /**
   * Which providers this deployment can actually offer.
   *
   * The web app asks before drawing any button: a provider with no credentials configured must not
   * be advertised, or the button leads straight to a 404.
   */
  @Get('providers')
  @HttpCode(HttpStatus.OK)
  listProviders(): { providers: OAuthProviderId[] } {
    return { providers: this.registry.enabledProviders() };
  }

  /** The identity waiting to be linked, so the confirmation screen can name the account. */
  @Get('pending-link')
  @HttpCode(HttpStatus.OK)
  pendingLink(@Req() request: Request): { provider: OAuthProviderId; email: string } {
    const pending = readPendingLink(request, this.jwtService, this.pendingLinkSecret());
    if (!pending) throw new NotFoundException('Nenhuma vinculação pendente');

    return { provider: pending.provider, email: pending.email };
  }

  /** Confirms a pending link with the account's password, and signs the user in. */
  @Post('link')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async confirmLink(
    @Req() request: Request,
    @Body() dto: ConfirmOAuthLinkDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<{ user: User; redirect: string }> {
    const pending = readPendingLink(request, this.jwtService, this.pendingLinkSecret());
    if (!pending) {
      throw new UnauthorizedException('A vinculação expirou. Comece de novo.');
    }

    const session = await this.oauth.confirmPendingLink(pending, dto.password);

    clearPendingLink(response);
    setAuthCookies(response, this.configService, session.accessToken, session.refreshToken);

    return { user: session.user, redirect: safeRedirectPath(pending.redirect, DEFAULT_REDIRECT) };
  }

  /**
   * Recovers the account behind a pending link by setting a new password, no old one required.
   *
   * This is the "forgot my password" exit from the link screen: the provider has already verified
   * the address, so there is nothing left for the old password to prove.
   */
  @Post('link/reset-password')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async resetPasswordThroughProvider(
    @Req() request: Request,
    @Body() dto: ResetPasswordThroughProviderDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<{ user: User; redirect: string }> {
    const pending = readPendingLink(request, this.jwtService, this.pendingLinkSecret());
    if (!pending) {
      throw new UnauthorizedException('A vinculação expirou. Comece de novo.');
    }

    const session = await this.oauth.resetPasswordThroughProvider(pending, dto.newPassword);

    clearPendingLink(response);
    setAuthCookies(response, this.configService, session.accessToken, session.refreshToken);

    return { user: session.user, redirect: safeRedirectPath(pending.redirect, DEFAULT_REDIRECT) };
  }

  /**
   * Starts the flow.
   *
   * Declared AFTER the fixed paths above: Nest matches in declaration order, so a `:provider`
   * parameter placed first would swallow `providers` and `pending-link`.
   */
  @Get(':provider')
  @Throttle(AUTH_THROTTLE)
  async start(
    @Param('provider') providerParam: string,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    const provider = this.requireProvider(providerParam);
    const adapter = this.registry.get(provider);
    if (!adapter) throw new NotFoundException('Provedor não configurado');

    // `intent=link` only means anything for someone already signed in; anyone else just signs in.
    const claims = readAccessTokenClaims(
      request,
      this.jwtService,
      this.configService.get<string>('JWT_SECRET')
    );
    const linkingUserId = request.query.intent === 'link' ? (claims?.sub ?? null) : null;
    const intent: OAuthIntent = linkingUserId ? 'link' : 'login';

    const callbackUrl = buildCallbackUrl(this.configService, provider);
    const authorization = await adapter.createAuthorizationRequest(callbackUrl);

    writeTransaction(response, this.jwtService, this.transactionSecret(), {
      provider,
      intent,
      state: authorization.state,
      nonce: authorization.nonce,
      codeVerifier: authorization.codeVerifier,
      redirect: safeRedirectPath(
        request.query.redirect,
        linkingUserId ? '/settings' : DEFAULT_REDIRECT
      ),
      origin: safeRedirectPath(request.query.from, linkingUserId ? '/settings' : DEFAULT_ORIGIN),
      ...(linkingUserId ? { userId: linkingUserId } : {}),
    });

    response.redirect(authorization.url);
  }

  /**
   * Where the provider sends the browser back.
   *
   * It always answers with a redirect, never with JSON: the browser arrives here by navigation, so
   * every outcome including a failure has to end on a page the person can read.
   */
  @Get(':provider/callback')
  @Throttle(AUTH_THROTTLE)
  async callback(
    @Param('provider') providerParam: string,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    const transaction = readTransaction(request, this.jwtService, this.transactionSecret());
    clearTransaction(response);

    if (
      !isOAuthProviderId(providerParam) ||
      !transaction ||
      transaction.provider !== providerParam
    ) {
      // No transaction means no origin either: the login page is the only place left to report to.
      response.redirect(this.failureUrl(DEFAULT_ORIGIN, 'invalid_state'));
      return;
    }

    // The provider reports a refused consent screen as a parameter, not as an error response.
    if (typeof request.query.error === 'string') {
      const denied = request.query.error === 'access_denied';
      response.redirect(
        this.failureUrl(transaction.origin, denied ? 'access_denied' : 'provider_error')
      );
      return;
    }

    const adapter = this.registry.get(providerParam);
    if (!adapter) {
      response.redirect(this.failureUrl(transaction.origin, 'provider_error'));
      return;
    }

    const callbackUrl = buildCallbackUrl(this.configService, providerParam);

    try {
      const profile = await adapter.exchangeCode({
        callbackUrl,
        currentUrl: new URL(`${callbackUrl}${this.queryString(request)}`),
        state: transaction.state,
        nonce: transaction.nonce,
        codeVerifier: transaction.codeVerifier,
      });

      // An address the provider itself has not verified proves nothing about who owns it, and this
      // flow uses the address to decide which local account the person is.
      if (!profile.emailVerified) {
        response.redirect(this.failureUrl(transaction.origin, 'email_unverified'));
        return;
      }

      if (transaction.intent === 'link' && transaction.userId) {
        await this.oauth.linkToAccount(transaction.userId, providerParam, profile);
        response.redirect(this.webUrl(safeRedirectPath(transaction.redirect, '/settings')));
        return;
      }

      const outcome = await this.oauth.resolveSignIn(
        providerParam,
        profile,
        safeRedirectPath(transaction.redirect, DEFAULT_REDIRECT)
      );

      if (outcome.kind === 'use-linked-provider') {
        response.redirect(
          this.failureUrl(transaction.origin, 'use_linked_provider', outcome.provider)
        );
        return;
      }

      if (outcome.kind === 'link-required') {
        writePendingLink(response, this.jwtService, this.pendingLinkSecret(), outcome.pending);
        response.redirect(this.webUrl('/auth/link'));
        return;
      }

      const session = await this.auth.issueSession(outcome.userId);
      setAuthCookies(response, this.configService, session.accessToken, session.refreshToken);
      response.redirect(this.webUrl(safeRedirectPath(transaction.redirect, DEFAULT_REDIRECT)));
    } catch (error) {
      // Only `linkToAccount` raises this, and only for a provider account that belongs elsewhere.
      if (error instanceof ConflictException) {
        response.redirect(this.failureUrl(transaction.origin, 'already_linked'));
        return;
      }

      // The provider's own message can carry the code and the client id; it stays in the log.
      this.logger.warn(`OAuth callback failed for ${providerParam}: ${String(error)}`);
      response.redirect(this.failureUrl(transaction.origin, 'provider_error'));
    }
  }

  /** Removes a provider from the signed-in account. */
  @Delete(':provider')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlink(@CurrentUser() user: User, @Param('provider') providerParam: string): Promise<void> {
    await this.oauth.unlink(user.id, this.requireProvider(providerParam));
  }

  private requireProvider(value: string): OAuthProviderId {
    if (!isOAuthProviderId(value)) throw new BadRequestException('Provedor desconhecido');
    return value;
  }

  /** The callback's own query string, rebuilt for the library's response validation. */
  private queryString(request: Request): string {
    const index = request.originalUrl.indexOf('?');
    return index === -1 ? '' : request.originalUrl.slice(index);
  }
}
