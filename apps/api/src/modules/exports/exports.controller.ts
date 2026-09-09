import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@rpgforce-ai/shared';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { EXPORT_THROTTLE } from '../../shared/throttling/throttle-tiers';
import { ExportSheetPdfDto } from './dto/export-sheet-pdf.dto';
import { SheetPdfService } from './sheet-pdf.service';

@Controller('character-sheets')
@UseGuards(JwtAuthGuard)
export class ExportsController {
  constructor(private readonly sheetPdf: SheetPdfService) {}

  @Post(':id/export/pdf')
  @Throttle(EXPORT_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async exportPdf(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ExportSheetPdfDto,
    @Res() response: Response
  ) {
    const { fileName, pdf } = await this.sheetPdf.renderSheetPdf(user.id, id, dto.theme);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    response.setHeader('Content-Length', pdf.length);
    response.end(pdf);
  }
}
