import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetUsers, type TestApp } from '../../testing/create-test-app';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { hashRefreshToken, ROTATION_GRACE_SECONDS } from './refresh-token';

let testApp: TestApp;
let cleanup: RefreshTokenCleanupService;

const days = (n: number) => n * 24 * 60 * 60 * 1000;

const createUser = async (email: string): Promise<string> => {
  const user = await testApp.prisma.user.create({
    data: { email, username: email.split('@')[0], password: 'not-used-here' },
    select: { id: true },
  });

  return user.id;
};

const seedToken = async (
  userId: string,
  token: string,
  overrides: { expiresAt: Date; usedAt?: Date }
): Promise<void> => {
  await testApp.prisma.refreshToken.create({
    data: { tokenHash: hashRefreshToken(token), userId, ...overrides },
  });
};

beforeAll(async () => {
  testApp = await createTestApp();
  cleanup = testApp.app.get(RefreshTokenCleanupService);
});

afterAll(async () => {
  await testApp?.close();
});

beforeEach(async () => {
  await resetUsers(testApp.prisma);
});

describe('expired refresh token purge', () => {
  it('deletes expired tokens and keeps live ones', async () => {
    const userId = await createUser('purge@example.com');

    await seedToken(userId, 'dead', { expiresAt: new Date(Date.now() - days(1)) });
    await seedToken(userId, 'alive', { expiresAt: new Date(Date.now() + days(7)) });

    const purged = await cleanup.purgeExpired();

    expect(purged).toBe(1);
    const survivors = await testApp.prisma.refreshToken.findMany();
    expect(survivors).toHaveLength(1);
    expect(survivors[0].tokenHash).toBe(hashRefreshToken('alive'));
  });

  it('keeps a spent but unexpired token, which is what proves a reuse', async () => {
    const userId = await createUser('spent@example.com');

    await seedToken(userId, 'spent', {
      expiresAt: new Date(Date.now() + days(7)),
      usedAt: new Date(Date.now() - (ROTATION_GRACE_SECONDS + 60) * 1000),
    });

    expect(await cleanup.purgeExpired()).toBe(0);
    expect(await testApp.prisma.refreshToken.count()).toBe(1);
  });
});
