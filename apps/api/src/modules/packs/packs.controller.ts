import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { PacksService } from './packs.service';

@Controller('packs')
export class PacksController {
  constructor(private readonly packsService: PacksService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll() {
    return this.packsService.findAll();
  }

  @Get('legal')
  @HttpCode(HttpStatus.OK)
  async getLegalData() {
    return this.packsService.findLegalData();
  }

  @Get(':idOrSlug')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.packsService.findByIdOrSlug(idOrSlug);
  }
}
