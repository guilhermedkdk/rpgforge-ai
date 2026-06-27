import {
  IsOptional,
  IsString,
  IsInt,
  IsIn,
  IsBoolean,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RULE_ITEM_KINDS } from '@rpgforce-ai/shared';

/** One named query in a batch; mirrors the params of `GET /rule-items`. */
export class RuleItemBatchQueryDto {
  @IsString()
  key!: string;

  @IsOptional()
  @IsString()
  @IsIn(RULE_ITEM_KINDS)
  type?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  level?: number;

  @IsOptional()
  @IsString()
  class?: string;

  @IsOptional()
  tag?: string | string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsBoolean()
  includeRaw?: boolean;
}

export class RuleItemBatchDto {
  @IsOptional()
  @IsString()
  packId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RuleItemBatchQueryDto)
  queries!: RuleItemBatchQueryDto[];
}
