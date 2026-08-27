import { Module } from '@nestjs/common';
import { CharacterSheetsController } from './character-sheets.controller';
import { CharacterSheetsService } from './character-sheets.service';
import { CharacterRecomputeService } from './character-recompute.service';
import { CharacterPreviewService } from './character-preview.service';
import { AuthModule } from '../auth/auth.module';
import { GenerationModule } from '../generation/generation.module';

@Module({
  imports: [AuthModule, GenerationModule],
  controllers: [CharacterSheetsController],
  providers: [CharacterSheetsService, CharacterRecomputeService, CharacterPreviewService],
})
export class CharacterSheetsModule {}
