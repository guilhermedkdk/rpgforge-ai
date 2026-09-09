import { Module } from '@nestjs/common';
import { AiUsageModule } from '../ai-usage/ai-usage.module';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { LlmService } from './llm.service';
import { GenerationRunStore } from './generation-run.store';
import { GenerationRunService } from './generation-run.service';
import { PACK_GENERATION_ADAPTERS } from './pack-generation.adapter';
import { DndSrdGenerationAdapter } from './packs/dnd-srd/dnd-srd-generation.adapter';
import { RuleitemsModule } from '../ruleitems/ruleitems.module';

@Module({
  imports: [RuleitemsModule, AiUsageModule],
  controllers: [GenerationController],
  providers: [
    GenerationService,
    LlmService,
    GenerationRunStore,
    GenerationRunService,
    DndSrdGenerationAdapter,
    {
      // One entry per supported system. A new pack is a new adapter listed here, nothing else.
      provide: PACK_GENERATION_ADAPTERS,
      useFactory: (dndSrd: DndSrdGenerationAdapter) => [dndSrd],
      inject: [DndSrdGenerationAdapter],
    },
  ],
  // The sheet save is what links a run to its sheet, so it needs the run service.
  exports: [GenerationRunService],
})
export class GenerationModule {}
