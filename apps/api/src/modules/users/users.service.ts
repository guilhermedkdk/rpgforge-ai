import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { PublicProfileResponse } from '@rpgforce-ai/shared';
import { parseAvatarChoice, resolveAvatarUrl } from '@rpgforce-ai/shared';
import { toConnections } from '../auth/user-session';
import { PrismaService } from '../../shared/prisma.service';
import { CharacterSheetsService } from '../character-sheets/character-sheets.service';
import { normalizeUsername } from './username';
import { toPrismaProvider } from '../auth/oauth/provider-enum';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly characterSheets: CharacterSheetsService
  ) {}

  /**
   * A profile page. The same route serves the owner and a visitor: the owner sees their sheets and
   * their email, a visitor sees only what the owner published. Nothing here leaks the email or the
   * private sheet count to someone else.
   */
  async getProfile(username: string, viewerId?: string | null): Promise<PublicProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarId: true,
        oauthAccounts: {
          select: { provider: true, avatarUrl: true },
          orderBy: { createdAt: 'asc' },
        },
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Perfil não encontrado');

    const isSelf = viewerId === user.id;
    // The owner sees everything they own; a visitor sees only what was published.
    const [sheets, favorites] = await Promise.all([
      isSelf
        ? this.characterSheets.findAllForUser(user.id)
        : this.characterSheets.findPublicForUser(user.id),
      // Bookmarks are the owner's alone: what someone reads is their business.
      isSelf ? this.characterSheets.listFavoritesFor(user.id) : Promise.resolve([]),
    ]);

    return {
      username: user.username,
      displayName: user.displayName,
      avatarId: user.avatarId,
      avatarUrl: resolveAvatarUrl(user.avatarId, toConnections(user.oauthAccounts)),
      memberSince: user.createdAt.toISOString(),
      isSelf,
      email: isSelf ? user.email : null,
      sheetCount: sheets.length,
      sheets,
      favorites,
    };
  }

  async updateProfile(
    userId: string,
    changes: { displayName?: string; username?: string; avatarId?: string }
  ): Promise<{
    username: string;
    displayName: string | null;
    avatarId: string | null;
    avatarUrl: string | null;
  }> {
    const data: { displayName?: string | null; username?: string; avatarId?: string | null } = {};

    if (changes.avatarId !== undefined) {
      // The empty string is how the form says "back to the initials"; the DTO already rejected any
      // shape that is neither that, a gallery id, nor `provider:<id>`.
      const choice = parseAvatarChoice(changes.avatarId);

      // Pointing at a provider that is not linked would resolve to nothing, i.e. an avatar that
      // silently does not exist. Only the account itself can say which providers it has.
      if (choice.kind === 'provider') {
        const linked = await this.prisma.oAuthAccount.findUnique({
          where: { userId_provider: { userId, provider: toPrismaProvider(choice.provider) } },
          select: { avatarUrl: true },
        });
        if (!linked?.avatarUrl) {
          throw new BadRequestException('Essa conta não tem foto desse provedor');
        }
      }

      data.avatarId = changes.avatarId.length > 0 ? changes.avatarId : null;
    }

    if (changes.displayName !== undefined) {
      const trimmed = changes.displayName.trim();
      data.displayName = trimmed.length > 0 ? trimmed : null;
    }

    if (changes.username !== undefined) {
      // Normalised before the uniqueness check, or "Elias" and "elias" would look like two handles
      // and land on the same row.
      const username = normalizeUsername(changes.username);
      if (!username) throw new BadRequestException('Nome de usuário inválido');

      const taken = await this.prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (taken && taken.id !== userId) {
        throw new ConflictException('Esse nome de usuário já está em uso');
      }
      data.username = username;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        username: true,
        displayName: true,
        avatarId: true,
        oauthAccounts: { select: { provider: true, avatarUrl: true } },
      },
    });

    return {
      username: user.username,
      displayName: user.displayName,
      avatarId: user.avatarId,
      avatarUrl: resolveAvatarUrl(user.avatarId, toConnections(user.oauthAccounts)),
    };
  }

  /**
   * Sets the account's password, whether or not it had one.
   *
   * An account created through a provider has no password to prove ownership with, so there is
   * nothing to ask for: the session itself is the proof. Once a password exists the old one is
   * required again, which is what stops a borrowed session from locking the owner out.
   */
  async setPassword(userId: string, currentPassword: string | undefined, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (user.password !== null) {
      if (!currentPassword) throw new BadRequestException('Informe a senha atual');

      const matches = await bcrypt.compare(currentPassword, user.password);
      if (!matches) throw new UnauthorizedException('Senha atual incorreta');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password: await bcrypt.hash(newPassword, 10) },
      }),
      // Setting a password is also how someone locks out a session they no longer trust.
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
  }

  /**
   * Deletes the account. Sheets and generation runs cascade; the AI usage ledger keeps its rows.
   *
   * The password is the confirmation when there is one. When there is not, typing the handle is:
   * it is the same kind of deliberate act, and it is the only one a provider-only account can make.
   */
  async deleteAccount(
    userId: string,
    confirmation: { password?: string; confirmUsername?: string }
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true, username: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (user.password !== null) {
      const matches = await bcrypt.compare(confirmation.password ?? '', user.password);
      if (!matches) throw new UnauthorizedException('Senha incorreta');
    } else if (normalizeUsername(confirmation.confirmUsername ?? '') !== user.username) {
      throw new UnauthorizedException('O nome de usuário não confere');
    }

    await this.prisma.user.delete({ where: { id: userId } });
  }
}
