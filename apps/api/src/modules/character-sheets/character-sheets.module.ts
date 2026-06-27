import { Module } from '@nestjs/common';
import { CharacterSheetsController } from './character-sheets.controller';
import { CharacterSheetsService } from './character-sheets.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CharacterSheetsController],
  providers: [CharacterSheetsService],
})
export class CharacterSheetsModule {}
