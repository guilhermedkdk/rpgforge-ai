import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterSheetsModule } from '../character-sheets/character-sheets.module';
import { ExportsController } from './exports.controller';
import { SheetPdfService } from './sheet-pdf.service';

/**
 * Exporting a sheet. The PDF is produced by a headless browser over the app's own sheet page, so
 * the file is the sheet itself: the alternative (generating a document) is a reconstruction that
 * drifts from it. See the print block in the web's `styles/globals.css` for what shapes the page.
 */
@Module({
  imports: [AuthModule, CharacterSheetsModule],
  controllers: [ExportsController],
  providers: [SheetPdfService],
})
export class ExportsModule {}
