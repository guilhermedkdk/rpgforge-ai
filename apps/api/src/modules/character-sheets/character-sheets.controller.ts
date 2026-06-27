import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CharacterSheetsService } from './character-sheets.service';
import { CreateCharacterSheetDto } from './dto/create-character-sheet.dto';
import { UpdateCharacterSheetDto } from './dto/update-character-sheet.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';

type RequestUser = { id: string; email: string; createdAt: Date };

@Controller('character-sheets')
@UseGuards(JwtAuthGuard)
export class CharacterSheetsController {
  constructor(private readonly characterSheetsService: CharacterSheetsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCharacterSheetDto,
  ) {
    return this.characterSheetsService.create(user.id, dto.packId, dto.data);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentUser() user: RequestUser) {
    return this.characterSheetsService.findAllForUser(user.id);
  }

  @Get(':id/with-rules')
  @HttpCode(HttpStatus.OK)
  async getWithRules(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.characterSheetsService.findOneWithRules(user.id, id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.characterSheetsService.findOneForUser(user.id, id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCharacterSheetDto,
  ) {
    return this.characterSheetsService.updateForUser(user.id, id, dto.data);
  }
}
