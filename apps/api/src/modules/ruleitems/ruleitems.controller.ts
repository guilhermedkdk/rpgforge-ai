import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { RuleitemsService } from './ruleitems.service';
import { RuleItemQueryDto } from './dto/ruleitem-query.dto';
import { RuleItemBatchDto } from './dto/ruleitem-batch.dto';
import { RuleItemSearchDto } from './dto/ruleitem-search.dto';

type RuleItemKind = import('@rpgforce-ai/shared').RuleItemKind;

const normalizeTags = (tag: string | string[] | undefined): string[] | undefined => {
  if (tag == null) return undefined;
  const tags = Array.isArray(tag) ? tag : [tag];
  return tags.length ? tags : undefined;
};

@Controller('rule-items')
export class RuleitemsController {
  constructor(private readonly ruleitemsService: RuleitemsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findMany(@Query() query: RuleItemQueryDto) {
    return this.ruleitemsService.findMany({
      packId: query.packId,
      type: query.type as RuleItemKind | undefined,
      q: query.q,
      level: query.level,
      class: query.class,
      tags: normalizeTags(query.tag),
      limit: query.limit,
      offset: query.offset,
      includeRaw: query.includeRaw,
    });
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  async findBatch(@Body() body: RuleItemBatchDto) {
    return this.ruleitemsService.findManyBatch(
      body.packId,
      body.queries.map((q) => ({
        key: q.key,
        type: q.type as RuleItemKind | undefined,
        q: q.q,
        level: q.level,
        class: q.class,
        tags: normalizeTags(q.tag),
        limit: q.limit,
        offset: q.offset,
        includeRaw: q.includeRaw,
      })),
    );
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  async search(@Body() body: RuleItemSearchDto) {
    return this.ruleitemsService.search({
      query: body.query,
      packId: body.packId,
      kind: body.kind as RuleItemKind[] | undefined,
      limit: body.limit,
    });
  }

  @Get(':idOrSlug')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('idOrSlug') idOrSlug: string,
    @Query('packId') packId?: string,
  ) {
    return this.ruleitemsService.findByIdOrSlug(idOrSlug, packId);
  }
}
