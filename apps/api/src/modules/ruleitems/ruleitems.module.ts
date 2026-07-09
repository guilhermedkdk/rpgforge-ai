import { Module } from '@nestjs/common';
import { RuleitemsController } from './ruleitems.controller';
import { RuleitemsService } from './ruleitems.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';

@Module({
  imports: [EmbeddingsModule],
  controllers: [RuleitemsController],
  providers: [RuleitemsService],
  exports: [RuleitemsService],
})
export class RuleitemsModule {}
