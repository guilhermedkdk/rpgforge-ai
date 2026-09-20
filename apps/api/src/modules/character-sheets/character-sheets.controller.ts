import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CharacterSheetsService } from './character-sheets.service';
import type { User } from '@rpgforce-ai/shared';
import { SheetFavoritesService } from './sheet-favorites.service';
import { CreateCharacterSheetDto } from './dto/create-character-sheet.dto';
import { UpdateCharacterSheetDto } from './dto/update-character-sheet.dto';
import { SetSheetVisibilityDto } from './dto/set-sheet-visibility.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';

@Controller('character-sheets')
@UseGuards(JwtAuthGuard)
export class CharacterSheetsController {
  constructor(
    private readonly characterSheetsService: CharacterSheetsService,
    private readonly favorites: SheetFavoritesService
  ) {}

  // Before the ":id" routes: "favorites" would otherwise be read as a sheet id.
  @Get('favorites')
  @HttpCode(HttpStatus.OK)
  async listFavorites(@CurrentUser() user: User) {
    return this.characterSheetsService.listFavoritesFor(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: User, @Body() dto: CreateCharacterSheetDto) {
    return this.characterSheetsService.create(user.id, dto.packId, dto.data, dto.generationId);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentUser() user: User) {
    return this.characterSheetsService.findAllForUser(user.id);
  }

  @Get(':id/with-rules')
  @HttpCode(HttpStatus.OK)
  async getWithRules(@CurrentUser() user: User, @Param('id') id: string) {
    return this.characterSheetsService.findOneWithRules(user.id, id);
  }

  @Get(':id/ai-notes')
  @HttpCode(HttpStatus.OK)
  async getAiNotes(@CurrentUser() user: User, @Param('id') id: string) {
    return this.characterSheetsService.findAiNotes(user.id, id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.characterSheetsService.findOneForUser(user.id, id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateCharacterSheetDto
  ) {
    return this.characterSheetsService.updateForUser(user.id, id, dto.data);
  }

  @Patch(':id/visibility')
  @HttpCode(HttpStatus.OK)
  async setVisibility(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: SetSheetVisibilityDto
  ) {
    return this.characterSheetsService.setVisibility(user.id, id, dto.isPublic);
  }

  @Put(':id/favorite')
  @HttpCode(HttpStatus.OK)
  async favorite(@CurrentUser() user: User, @Param('id') id: string) {
    return this.favorites.add(user.id, id);
  }

  @Delete(':id/favorite')
  @HttpCode(HttpStatus.OK)
  async unfavorite(@CurrentUser() user: User, @Param('id') id: string) {
    return this.favorites.remove(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: User, @Param('id') id: string) {
    await this.characterSheetsService.removeForUser(user.id, id);
  }
}
