import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { parseAvatarChoice, providerAvatarValue, type OAuthProviderId } from '@rpgforce-ai/shared';
import { PrismaService } from '../../../shared/prisma.service';
import { AuthService, type IssuedSession } from '../auth.service';
import { usernameFromEmail } from '../../users/username';
import { toPrismaProvider, toProviderId } from './provider-enum';
import type { OAuthPendingLink } from './oauth-transaction';
import type { OAuthProfile } from './providers/oauth-provider';

/**
 * What a verified provider identity resolves to.
 *
 * `link-required` is the interesting one: the address already belongs to a password account, and
 * linking silently would hand that account to whoever controls the provider identity. Since this app
 * does not verify e-mail addresses at registration, an account could have been created with someone
 * else's address in advance, so the password is the only thing that proves ownership here.
 */
export type SignInOutcome =
  | { kind: 'session'; userId: string }
  | { kind: 'link-required'; pending: OAuthPendingLink }
  | { kind: 'use-linked-provider'; provider: OAuthProviderId };

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService
  ) {}

  /** Resolves a verified profile to an account, creating one when the address is new. */
  async resolveSignIn(
    provider: OAuthProviderId,
    profile: OAuthProfile,
    redirect: string
  ): Promise<SignInOutcome> {
    const linked = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: toPrismaProvider(provider),
          providerAccountId: profile.providerAccountId,
        },
      },
      select: { userId: true },
    });

    if (linked) {
      await this.refreshInheritedProfile(linked.userId, provider, profile);
      return { kind: 'session', userId: linked.userId };
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: profile.email },
      select: { id: true, password: true },
    });

    if (!existing) {
      const userId = await this.createUserFrom(provider, profile);
      return { kind: 'session', userId };
    }

    if (existing.password !== null) {
      return {
        kind: 'link-required',
        pending: {
          provider,
          providerAccountId: profile.providerAccountId,
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
          redirect,
        },
      };
    }

    // No password, so there is no credential to ask for, and a matching address is not proof of
    // ownership. Send them in through a provider the account already has and let them add this one
    // from the settings page. That keeps ONE rule with no exception: a provider is only ever added
    // to an existing account by someone already authenticated to it.
    const alreadyLinked = await this.prisma.oAuthAccount.findFirst({
      where: { userId: existing.id },
      select: { provider: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!alreadyLinked) {
      // No password and no provider: nothing can sign into this account, so it should not exist.
      // Linking here would rescue it, at the cost of the exception this branch just removed.
      this.logger.error(`Account ${existing.id} has neither a password nor a linked provider`);
      throw new BadRequestException('Essa conta não pode ser acessada');
    }

    return { kind: 'use-linked-provider', provider: toProviderId(alreadyLinked.provider) };
  }

  /** Adds a provider to the signed-in account, from the connected-accounts card. */
  async linkToAccount(
    userId: string,
    provider: OAuthProviderId,
    profile: OAuthProfile
  ): Promise<void> {
    const prismaProvider = toPrismaProvider(provider);

    const claimed = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: prismaProvider,
          providerAccountId: profile.providerAccountId,
        },
      },
      select: { userId: true },
    });

    if (claimed) {
      if (claimed.userId === userId) return;
      throw new ConflictException('Essa conta já está vinculada a outro usuário');
    }

    const alreadyOnThisProvider = await this.prisma.oAuthAccount.findUnique({
      where: { userId_provider: { userId, provider: prismaProvider } },
      select: { id: true },
    });

    if (alreadyOnThisProvider) {
      throw new ConflictException('Sua conta já tem um provedor desse tipo vinculado');
    }

    await this.linkAccount(userId, provider, profile);
  }

  /**
   * Confirms a pending link with the account's password, then signs the user in.
   *
   * The provider identity comes from the signed pending-link cookie, never from the request body:
   * the browser cannot claim to be a Google account the callback did not verify.
   */
  async confirmPendingLink(pending: OAuthPendingLink, password: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: pending.email },
      select: { id: true, password: true },
    });

    if (!user?.password) {
      throw new UnauthorizedException('Não foi possível vincular essa conta');
    }

    const matches = await bcrypt.compare(password, user.password);
    if (!matches) {
      throw new UnauthorizedException('Senha incorreta');
    }

    await this.linkAccount(user.id, pending.provider, {
      providerAccountId: pending.providerAccountId,
      email: pending.email,
      emailVerified: true,
      name: pending.name,
      picture: pending.picture,
    });

    return this.auth.issueSession(user.id);
  }

  /**
   * Recovers a password account through a provider identity instead of through the password.
   *
   * The provider is the proof. `emailVerified` is checked before a pending link is ever written, so
   * holding that cookie means Google or Discord has confirmed this person controls the address,
   * which is exactly what a reset link by e-mail establishes. The old password is REPLACED and
   * every session dropped: nothing here ever confirmed it, and leaving it alive would leave whoever
   * set it a way back in. The link is written first, so a provider identity that turns out to be
   * claimed leaves the account untouched.
   */
  async resetPasswordThroughProvider(
    pending: OAuthPendingLink,
    newPassword: string
  ): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: pending.email },
      select: { id: true, password: true },
    });

    if (!user?.password) {
      throw new UnauthorizedException('Não foi possível recuperar essa conta');
    }

    await this.linkAccount(user.id, pending.provider, {
      providerAccountId: pending.providerAccountId,
      email: pending.email,
      emailVerified: true,
      name: pending.name,
      picture: pending.picture,
    });

    const hashed = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { password: hashed } }),
      this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      // A link already sitting in the inbox must not outlive the password it was asked for.
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    ]);

    return this.auth.issueSession(user.id);
  }

  /**
   * Removes a provider from an account.
   *
   * Refuses when it is the last way in: an account with no password and no provider left could not
   * be signed into again, and nothing in this app can restore it.
   */
  async unlink(userId: string, provider: OAuthProviderId): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        password: true,
        avatarId: true,
        oauthAccounts: {
          select: { provider: true, avatarUrl: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const prismaProvider = toPrismaProvider(provider);
    const linked = user.oauthAccounts.some((account) => account.provider === prismaProvider);
    if (!linked) throw new BadRequestException('Esse provedor não está vinculado');

    if (user.password === null && user.oauthAccounts.length <= 1) {
      throw new BadRequestException(
        'Crie uma senha antes de desvincular: esse é o seu único jeito de entrar'
      );
    }

    // The picture goes with the row it belonged to, so nothing here can strand another provider's.
    // Only the CHOICE may need moving, and only when it pointed at the provider being removed:
    // fall to another linked provider that has a picture, otherwise to the initials. A gallery pick
    // is untouched, because it was never about a provider.
    const choice = parseAvatarChoice(user.avatarId);
    const losesItsPicture = choice.kind === 'provider' && choice.provider === provider;

    const successor = user.oauthAccounts.find(
      (account) => account.provider !== prismaProvider && account.avatarUrl !== null
    );

    const nextAvatarId = successor ? providerAvatarValue(toProviderId(successor.provider)) : null;

    await this.prisma.$transaction([
      this.prisma.oAuthAccount.delete({
        where: { userId_provider: { userId, provider: prismaProvider } },
      }),
      ...(losesItsPicture
        ? [this.prisma.user.update({ where: { id: userId }, data: { avatarId: nextAvatarId } })]
        : []),
    ]);
  }

  private async createUserFrom(provider: OAuthProviderId, profile: OAuthProfile): Promise<string> {
    const user = await this.prisma.user.create({
      data: {
        email: profile.email,
        // No password: this account signs in through the provider until someone creates one.
        password: null,
        username: await this.auth.allocateUsername(usernameFromEmail(profile.email)),
        displayName: profile.name,
        // The account is born showing the picture of the provider that created it.
        avatarId: profile.picture ? providerAvatarValue(provider) : null,
        oauthAccounts: {
          create: {
            provider: toPrismaProvider(provider),
            providerAccountId: profile.providerAccountId,
            email: profile.email,
            avatarUrl: profile.picture,
          },
        },
      },
      select: { id: true },
    });

    return user.id;
  }

  private async linkAccount(
    userId: string,
    provider: OAuthProviderId,
    profile: OAuthProfile
  ): Promise<void> {
    await this.prisma.oAuthAccount.create({
      data: {
        userId,
        provider: toPrismaProvider(provider),
        providerAccountId: profile.providerAccountId,
        email: profile.email,
        avatarUrl: profile.picture,
      },
    });

    await this.refreshInheritedProfile(userId, provider, profile);
  }

  /**
   * Re-reads what the provider knows on every sign-in.
   *
   * The picture is always refreshed, since a stale URL at the provider eventually 404s. The display
   * name is only filled when empty, because overwriting it would undo a name the user chose here.
   */
  private async refreshInheritedProfile(
    userId: string,
    provider: OAuthProviderId,
    profile: OAuthProfile
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, avatarId: true },
    });

    // Only fills the choice when the account has none. Signing in through a second provider must not
    // silently swap the face of someone who already picked one.
    const adoptsPicture = !user?.avatarId && !!profile.picture;

    await this.prisma.$transaction([
      this.prisma.oAuthAccount.update({
        where: { userId_provider: { userId, provider: toPrismaProvider(provider) } },
        data: { email: profile.email, avatarUrl: profile.picture },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(user?.displayName ? {} : { displayName: profile.name }),
          ...(adoptsPicture ? { avatarId: providerAvatarValue(provider) } : {}),
        },
      }),
    ]);
  }
}
