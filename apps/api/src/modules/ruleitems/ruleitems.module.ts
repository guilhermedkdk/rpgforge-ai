import { Module } from '@nestjs/common';
import { RuleitemsController } from './ruleitems.controller';
import { RuleitemsService } from './ruleitems.service';

@Module({
  controllers: [RuleitemsController],
  providers: [RuleitemsService],
  exports: [RuleitemsService],
})
export class RuleitemsModule {}
