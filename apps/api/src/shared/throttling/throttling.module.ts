import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './app-throttler.guard';
import { DEFAULT_THROTTLERS } from './throttle-tiers';

/**
 * Rate limiting, applied to every route (APP_GUARD). Storage is in-memory, so counters are per
 * instance: a multi-instance deploy needs the Redis throttler storage to share them.
 */
@Module({
  imports: [
    JwtModule.register({}),
    ThrottlerModule.forRoot({
      throttlers: DEFAULT_THROTTLERS,
      errorMessage: 'Too many requests. Slow down and try again shortly.',
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class ThrottlingModule {}
