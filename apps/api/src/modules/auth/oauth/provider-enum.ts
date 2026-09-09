import { OAuthProvider } from '@prisma/client';
import type { OAuthProviderId } from '@rpgforce-ai/shared';

const TO_PRISMA: Record<OAuthProviderId, OAuthProvider> = {
  google: OAuthProvider.GOOGLE,
  discord: OAuthProvider.DISCORD,
};

const TO_ID: Record<OAuthProvider, OAuthProviderId> = {
  [OAuthProvider.GOOGLE]: 'google',
  [OAuthProvider.DISCORD]: 'discord',
};

/** The contract in shared is lowercase, the column is an enum. This is the only place both meet. */
export const toPrismaProvider = (id: OAuthProviderId): OAuthProvider => TO_PRISMA[id];

export const toProviderId = (provider: OAuthProvider): OAuthProviderId => TO_ID[provider];
