import { IsOptional, IsString, IsInt, IsIn, IsBoolean, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { RULE_ITEM_KINDS } from '@rpgforce-ai/shared';

export class RuleItemQueryDto {
  @IsOptional()
  @IsString()
  packId?: string;

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

  /** Single tag or multiple (AND). Sent as ?tag=... or repeated ?tag=... */
  @IsOptional()
  tag?: string | string[];

  // Matches the service ITEM cap so full catalogs load in one request (service still clamps per kind).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  // Query strings arrive as "false"/"true"; coerce to boolean.
  @IsOptional()
  @Transform(({ value }) => (value === 'false' ? false : value === 'true' ? true : value))
  @IsBoolean()
  includeRaw?: boolean;
}
