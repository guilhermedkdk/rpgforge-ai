import { Module } from '@nestjs/common';
import { AiUsageService } from './ai-usage.service';

/** The paid-call ledger. Imported by every module that talks to a paid AI provider. */
@Module({
  providers: [AiUsageService],
  exports: [AiUsageService],
})
export class AiUsageModule {}
