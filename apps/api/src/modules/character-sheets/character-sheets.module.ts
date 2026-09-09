import { Module } from '@nestjs/common';
import { CharacterSheetsController } from './character-sheets.controller';
import { PublicSheetsController } from './public-sheets.controller';
import { CharacterSheetsService } from './character-sheets.service';
import { CharacterRecomputeService } from './character-recompute.service';
import { CharacterPreviewService } from './character-preview.service';
import { SheetFavoritesService } from './sheet-favorites.service';
import { AuthModule } from '../auth/auth.module';
import { GenerationModule } from '../generation/generation.module';

@Module({
  imports: [AuthModule, GenerationModule],
  controllers: [CharacterSheetsController, PublicSheetsController],
  providers: [
    CharacterSheetsService,
    CharacterRecomputeService,
    CharacterPreviewService,
    SheetFavoritesService,
  ],
  exports: [CharacterSheetsService, SheetFavoritesService],
})
export class CharacterSheetsModule {}
