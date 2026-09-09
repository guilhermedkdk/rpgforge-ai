import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getStorageToken, type ThrottlerStorage } from '@nestjs/throttler';
import { AppModule } from '../app.module';
import { configureApp } from '../app-setup';
import { PrismaService } from '../shared/prisma.service';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  close: () => Promise<void>;
}

// A counter that never counts. The guard, its trackers and the per-route limits all stay in the
// pipeline; only the tally that would reject is gone.
const countlessThrottlerStorage: ThrottlerStorage = {
  increment: async () => ({
    totalHits: 1,
    timeToExpire: 0,
    isBlocked: false,
    timeToBlockExpire: 0,
  }),
};

/**
 * The real application, wired the way the server wires it, with rate limiting off: every case
 * arrives from the same IP, so a suite that signs in a dozen times would fail on the eleventh.
 *
 * Disabled at the storage, not by overriding the guard, so the per-route `@Throttle` metadata that
 * actually matters still applies.
 */
export const createTestApp = async (): Promise<TestApp> => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getStorageToken())
    .useValue(countlessThrottlerStorage)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    close: async () => {
      await app.close();
    },
  };
};

/** Empties the account graph between cases. Sessions, sheets and the rest cascade from the user. */
export const resetUsers = async (prisma: PrismaService): Promise<void> => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
};
