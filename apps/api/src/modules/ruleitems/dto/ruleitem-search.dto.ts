import { IsOptional, IsString, IsInt, IsIn, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { RULE_ITEM_KINDS } from '@rpgforce-ai/shared';

export class RuleItemSearchDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsString()
  packId?: string;

  /** Single kind or multiple; always normalized to an array before hitting the service. */
  @IsOptional()
  @IsIn(RULE_ITEM_KINDS, { each: true })
  @Transform(({ value }) => (value == null || Array.isArray(value) ? value : [value]))
  kind?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
